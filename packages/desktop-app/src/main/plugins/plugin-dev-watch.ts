import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, type FSWatcher, watch } from "node:fs";
import { join } from "node:path";
import type { InstalledPlugin } from "../../preload/api-types/plugins.js";
import { getAppLogger } from "../logger.js";
import { getSharedRuntime } from "../runtime.js";
import {
	buildAgentPluginRuntimeConfig,
	clearPluginDevLink,
	refreshPluginDevLink,
	setPluginDevLink,
	setPluginDevLinkStatus,
} from "./plugin-store.js";

/**
 * 插件 dev 热更新管理器（插件工作台方案 B）。
 *
 * 每个开启热更新的插件持有：一个常驻 `vite build --watch` 子进程（托管 Node，
 * ADR-0011 已把托管 node 前置进 PATH）+ dist / plugin.json 文件监听。
 *
 * 触发刷新的信号（任一即可，debounce 合并）：
 * 1. vite 标准输出匹配「built in …ms」——**主信号**（fs.watch 在部分 FS/编辑器
 *    下会丢事件或半截写盘时就触发，导致偶发必须手点「重载」）
 * 2. dist 顶层变更（兜底）
 * 3. 工程 `plugin.json` 变更（权限/commands/agent 路径等无需等 rebuild）
 *
 * 刷新：plugin-store.refreshPluginDevLink（bump reload token + broadcast）→
 * 渲染进程整表重载；并 reconfigureAgentPlugins。
 */

const log = getAppLogger("plugin");

/** 等 vite 一轮写盘完整落地；略加长以降低半截 dist 被 import 的概率。 */
const DEBOUNCE_MS = 700;
/** dist 尚未生成（首次构建前）/ 被删除时的重挂间隔。 */
const DIST_RETRY_MS = 1000;
/** SIGTERM 后未退出的 SIGKILL 兜底。 */
const KILL_GRACE_MS = 3000;

/** vite build --watch 成功收尾（stdout/stderr 都可能出现，视版本而定）。 */
const VITE_BUILD_OK = /built in\s+[\d.+\s]*m?s|✓\s*built/i;
/** vite 编译失败且进程不退出。 */
const VITE_BUILD_FAIL = /error during build|build failed/i;

interface DevWatchEntry {
	projectDir: string;
	child: ChildProcess | null;
	watcher: FSWatcher | null;
	manifestWatcher: FSWatcher | null;
	debounceTimer: NodeJS.Timeout | null;
	retryTimer: NodeJS.Timeout | null;
	stopped: boolean;
}

const entries = new Map<string, DevWatchEntry>();

function refreshAgentPlugins(): void {
	try {
		getSharedRuntime().reconfigureAgentPlugins(buildAgentPluginRuntimeConfig());
	} catch (err) {
		log.warn("dev-watch: refresh agent plugins failed", err);
	}
}

/**
 * 关掉 dist / manifest 监听与全部定时器（子进程死亡 / stop 时调用）。
 * 子进程已死后若 watcher 仍存活，后续 dist 事件会经 refreshPluginDevLink
 * 把 error 态静默洗回 running（面板误报健康）——必须一并拆除。
 */
function teardownWatch(entry: DevWatchEntry): void {
	if (entry.debounceTimer) {
		clearTimeout(entry.debounceTimer);
		entry.debounceTimer = null;
	}
	if (entry.retryTimer) {
		clearTimeout(entry.retryTimer);
		entry.retryTimer = null;
	}
	for (const key of ["watcher", "manifestWatcher"] as const) {
		const w = entry[key];
		if (w) {
			try {
				w.close();
			} catch {
				// already closed
			}
			entry[key] = null;
		}
	}
}

function spawnViteWatch(id: string, entry: DevWatchEntry): void {
	const viteBin = join(entry.projectDir, "node_modules", "vite", "bin", "vite.js");
	if (!existsSync(viteBin)) {
		setPluginDevLinkStatus(id, "error", `vite not found: ${viteBin}`);
		return;
	}
	let child: ChildProcess;
	try {
		// 裸 "node"：RuntimeManager.applyEnv() 已把托管 node 前置进 process.env.PATH。
		// ASTRAVIA_PLUGIN_DEV_WATCH=1 让 @astravia-org/plugin-vite 跳过每次增量重打 zip。
		child = spawn("node", [viteBin, "build", "--watch"], {
			cwd: entry.projectDir,
			env: { ...process.env, ASTRAVIA_PLUGIN_DEV_WATCH: "1" },
			stdio: ["ignore", "pipe", "pipe"],
			windowsHide: true,
		});
	} catch (err) {
		setPluginDevLinkStatus(id, "error", err instanceof Error ? err.message : String(err));
		return;
	}
	entry.child = child;
	let stderrTail = "";

	const onViteLog = (chunk: Buffer, from: "stdout" | "stderr"): void => {
		const text = chunk.toString();
		if (from === "stderr") {
			stderrTail = `${stderrTail}${text}`.slice(-2000);
		}
		if (entry.stopped) return;
		// 构建成功：以 vite 日志为准触发热更（比 fs.watch 稳）。
		if (VITE_BUILD_OK.test(text)) {
			scheduleRefresh(id, entry);
			return;
		}
		// vite build --watch 编译失败时进程不退出、也不写 dist。
		// 不置 error 会永久卡在 starting。后续成功构建会经 refresh 恢复 running。
		if (from === "stderr" && VITE_BUILD_FAIL.test(text)) {
			setPluginDevLinkStatus(id, "error", stderrTail.trim());
		}
	};

	child.stdout?.on("data", (chunk: Buffer) => onViteLog(chunk, "stdout"));
	child.stderr?.on("data", (chunk: Buffer) => onViteLog(chunk, "stderr"));
	child.on("error", (err) => {
		entry.child = null;
		if (entry.stopped) return;
		// spawn ENOENT 等异步失败：watcher 可能已挂上，必须拆掉，
		// 否则外部手动构建触发的 dist 事件会把 error 洗回 running。
		teardownWatch(entry);
		setPluginDevLinkStatus(id, "error", `vite watch failed to start: ${err.message}`);
	});
	child.on("exit", (code, signal) => {
		entry.child = null;
		if (entry.stopped) return;
		teardownWatch(entry);
		setPluginDevLinkStatus(
			id,
			"error",
			`vite watch exited (code ${code}, signal ${signal})${stderrTail ? `\n${stderrTail}` : ""}`,
		);
	});
}

/** debounce 后重读 dev 快照并广播（等 vite 一轮写盘完整落地）。 */
function scheduleRefresh(id: string, entry: DevWatchEntry): void {
	if (entry.stopped) return;
	if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
	entry.debounceTimer = setTimeout(() => {
		entry.debounceTimer = null;
		if (entry.stopped) return;
		try {
			refreshPluginDevLink(id);
			refreshAgentPlugins();
			log.info(`dev-watch: refreshed ${id}`);
		} catch (err) {
			log.warn(`dev-watch: reload failed for ${id}`, err);
			setPluginDevLinkStatus(id, "error", err instanceof Error ? err.message : String(err));
		}
	}, DEBOUNCE_MS);
}

function attachDistWatcher(id: string, entry: DevWatchEntry, viaRetry = false): void {
	if (entry.stopped) return;
	entry.retryTimer = null;
	const distDir = join(entry.projectDir, "dist");
	if (!existsSync(distDir)) {
		entry.retryTimer = setTimeout(() => attachDistWatcher(id, entry, true), DIST_RETRY_MS);
		return;
	}
	let watcher: FSWatcher;
	try {
		// 只挂 dist 顶层（跨平台：Linux 不支持 recursive）。remoteEntry.js /
		// mf-manifest.json / style.css 都在顶层；与 vite 日志双保险。
		watcher = watch(distDir, () => scheduleRefresh(id, entry));
	} catch {
		entry.retryTimer = setTimeout(() => attachDistWatcher(id, entry, true), DIST_RETRY_MS);
		return;
	}
	watcher.on("error", () => {
		// dist 被删除/句柄失效：关掉重挂。
		try {
			watcher.close();
		} catch {
			// already closed
		}
		if (entry.watcher === watcher) entry.watcher = null;
		if (!entry.stopped && !entry.retryTimer) {
			entry.retryTimer = setTimeout(() => attachDistWatcher(id, entry, true), DIST_RETRY_MS);
		}
	});
	entry.watcher = watcher;
	// 重试路径挂上 = dist 是启动后才出现的（首轮构建）。若首轮写盘恰好在两次
	// 轮询之间完成，watcher 挂上后不会再有事件——主动补一次 refresh，否则
	// 状态永远停在 starting 且渲染进程停留在 404 的首次加载结果。
	if (viaRetry) scheduleRefresh(id, entry);
}

/** 监听 plugin.json：改 permissions/agent/styles 等不必等 vite 再写 dist。 */
function attachManifestWatcher(id: string, entry: DevWatchEntry): void {
	if (entry.stopped) return;
	const manifestFile = join(entry.projectDir, "plugin.json");
	if (!existsSync(manifestFile)) return;
	try {
		const watcher = watch(manifestFile, () => scheduleRefresh(id, entry));
		watcher.on("error", () => {
			try {
				watcher.close();
			} catch {
				// already closed
			}
			if (entry.manifestWatcher === watcher) entry.manifestWatcher = null;
		});
		entry.manifestWatcher = watcher;
	} catch (err) {
		log.warn(`dev-watch: cannot watch plugin.json for ${id}`, err);
	}
}

/**
 * 开启热更新：建立 dev 链接（校验插件已安装、工程 plugin.json 匹配）→
 * 拉起 vite watch → 挂 dist / manifest 监听。已开启时先停旧的再重启（幂等）。
 */
export function startPluginDevWatch(id: string, projectDir: string): InstalledPlugin {
	stopPluginDevWatch(id);
	const plugin = setPluginDevLink(id, projectDir);
	const resolvedDir = plugin.devWatch?.projectDir ?? projectDir;
	const entry: DevWatchEntry = {
		projectDir: resolvedDir,
		child: null,
		watcher: null,
		manifestWatcher: null,
		debounceTimer: null,
		retryTimer: null,
		stopped: false,
	};
	entries.set(id, entry);
	spawnViteWatch(id, entry);
	if (entry.child) {
		attachDistWatcher(id, entry);
		attachManifestWatcher(id, entry);
	}
	log.info(`dev-watch: started for ${id} at ${resolvedDir}`);
	return plugin;
}

/** 关闭热更新：停子进程与监听，断开 dev 链接（资源回落安装目录）。 */
export function stopPluginDevWatch(id: string): void {
	const entry = entries.get(id);
	if (entry) {
		entry.stopped = true;
		teardownWatch(entry);
		const child = entry.child;
		if (child && !child.killed) {
			try {
				child.kill();
			} catch {
				// already gone
			}
			const killTimer = setTimeout(() => {
				try {
					child.kill("SIGKILL");
				} catch {
					// already gone
				}
			}, KILL_GRACE_MS);
			killTimer.unref?.();
			child.once("exit", () => clearTimeout(killTimer));
		}
		entries.delete(id);
		log.info(`dev-watch: stopped for ${id}`);
	}
	clearPluginDevLink(id);
}

/** App 退出前统一收尾（main.ts before-quit），避免 vite watch 孤儿进程。 */
export function stopAllPluginDevWatches(): void {
	for (const id of Array.from(entries.keys())) {
		stopPluginDevWatch(id);
	}
}
