/**
 * 知识库后台惰性加工轮询器。
 *
 * 每 N 分钟（设置可配）跑一轮：工程侧算 raws diff + 处理 moved/孤儿标记，
 * 若有 added/changed/待回收孤儿，则起一个加工 agent 会话（落在
 * processing_records 特殊项目，可在 sidebar 回看），完成后工程侧 n+1 回收孤儿。
 *
 * 攒批：不追求实时，整批变更交给一个会话；同一时刻只跑一轮。
 */

import { randomUUID } from "node:crypto";
import { mkdir, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type AgentSession,
	type AgentSessionEvent,
	createAgentSession,
	createKbWritePageTool,
	createLimiter,
	knowledge,
	SessionManager,
	type ToolDefinition,
} from "@astravia/coding-agent";
import { BrowserWindow } from "electron";
import { AsyncTask, SimpleIntervalJob, ToadScheduler } from "toad-scheduler";
import {
	recordKnowledgeBaseProcessingResult,
	recordKnowledgeBaseProcessingRound,
	recordKnowledgeBaseProcessingUsage,
	recordKnowledgeBaseSnapshot,
} from "../app-monitor/app-monitor-service.js";
import { KB_PROCESSING_CWD, KB_PROCESSING_SESSION_DIR, readDesktopConfig } from "../ipc/fs.js";
import { getAppLogger } from "../logger.js";
import { getOrCreateSharedModelRegistry } from "../runtime.js";
import { beginRound, endRound, unlockRaws } from "./raws-lock.js";

/** 加工中状态：广播给渲染层（顶栏「正在建立索引…」徽标）。 */
export const KB_PROCESSING_CHANGED_CHANNEL = "astravia:kb:processing-changed";
/** 文件加工态可能已变（每批加工完缓存重建后）：渲染层据此重取文件列表状态。 */
export const KB_STATUSES_CHANGED_CHANNEL = "astravia:kb:statuses-changed";
let processing = false;

export function isKnowledgeProcessing(): boolean {
	return processing;
}

function broadcast(channel: string, payload?: unknown): void {
	for (const win of BrowserWindow.getAllWindows()) {
		if (!win.isDestroyed()) win.webContents.send(channel, payload);
	}
}

function setProcessing(next: boolean): void {
	if (processing === next) return;
	processing = next;
	broadcast(KB_PROCESSING_CHANGED_CHANNEL, next);
}

// 每批加工完触发的「重建索引 + 广播状态变更」。合并去重：重建进行中再来的请求只置标志，
// 当前重建结束后若有挂起再补跑一次——把同时完成的多个批的请求收敛成最多一次额外重建，
// 串行执行避免并发批同时写 manifest.json 竞态。仅在加工轮内调用（同一时刻只跑一轮）。
let cacheRebuildRunning = false;
let cacheRebuildPending = false;

async function refreshCachesAndNotify(root: string): Promise<void> {
	if (cacheRebuildRunning) {
		cacheRebuildPending = true;
		return;
	}
	cacheRebuildRunning = true;
	try {
		do {
			cacheRebuildPending = false;
			logDamagedPages(await knowledge.rebuildAllCaches(root));
			broadcast(KB_STATUSES_CHANGED_CHANNEL);
		} while (cacheRebuildPending);
	} catch (err) {
		log.warn(`interim cache rebuild failed: ${err instanceof Error ? err.message : String(err)}`);
	} finally {
		cacheRebuildRunning = false;
	}
}

const log = getAppLogger("kb-poller");

/** 上报重建时被排除的坏页（frontmatter 非法/缺失）——否则其源文件永远静默显示未加工。 */
function logDamagedPages(result: knowledge.RebuildResult): void {
	if (result.damaged.length === 0) return;
	log.warn(
		`知识库有 ${result.damaged.length} 个 wiki 页 frontmatter 非法/缺失，已被排除出缓存（其源文件会显示未加工）：`,
	);
	for (const d of result.damaged) log.warn(`  损坏页 ${d.path} — ${d.message}`);
}

const scheduler = new ToadScheduler();
const JOB_ID = "kb-poller";
let scheduled = false;
let running = false;

/**
 * 当前正在跑的加工轮的可中止句柄。aborted 一旦置位：已起的批立即中止当前 session、
 * 队列里还没起的批直接跳过、不再重建索引。sessions 是本轮所有活动加工会话（并发批）。
 */
interface RoundToken {
	aborted: boolean;
	sessions: Set<AgentSession>;
}
let currentRound: RoundToken | undefined;
let roundDone: Promise<void> | undefined;

/**
 * 立即中止正在进行的加工轮（若有）：对所有活动会话调 abort()，并等待该轮真正收尾
 * （running 归位、缓存对账完成）。无轮在跑则立即返回。用于关闭知识库开关、清空 wiki 等
 * 需要「马上停下后台加工」的场景。
 */
export async function abortKnowledgeRound(): Promise<void> {
	const round = currentRound;
	if (!round) return;
	round.aborted = true;
	log.info("aborting in-flight knowledge round");
	for (const session of round.sessions) {
		try {
			await session.abort();
		} catch (err) {
			log.warn(`abort kb session failed: ${err instanceof Error ? err.message : String(err)}`);
		}
	}
	await roundDone?.catch(() => {});
}

/** 单批最多文件数（纯上下文边界）。 */
const KB_MAX_FILES_PER_BATCH = 20;
/** 单批最多字节数：约束一批里 OCR/大文件的总量；超此值的单文件独占一批。 */
const KB_MAX_BYTES_PER_BATCH = 8 * 1024 * 1024;

async function applyProcessingModel(
	session: AgentSession,
	modelKey: string | undefined,
	reasoningLevel?: string,
): Promise<void> {
	if (!modelKey) return;
	const slash = modelKey.indexOf("/");
	if (slash <= 0) return;
	const provider = modelKey.slice(0, slash);
	const modelId = modelKey.slice(slash + 1);
	// 解析失败必须抛出、不能静默：否则会话会退回默认模型或无模型，用户在设置里切换模型
	// 「像没切一样」，最终以难懂的 "No model selected" 收场。抛出的错会冒泡到 scan-now，
	// 在设置页以「整理失败」明示原因（模型未找到 / 无 API key）。
	const model = session.modelRegistry.find(provider, modelId);
	if (!model) {
		throw new Error(`知识库加工模型未找到：${modelKey}（请在知识库设置里重新选择加工模型）`);
	}
	await session.setModel(model);
	// setModel 会按新模型重新夹取思考档位，故档位必须在其后应用。
	if (reasoningLevel) session.setThinkingLevel(reasoningLevel);
}

function waitForCompletion(session: AgentSession, prompt: string): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		let settled = false;
		const finish = (fn: () => void) => {
			if (settled) return;
			settled = true;
			unsubscribe();
			fn();
		};
		const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
			if (event.type === "agent_end") finish(resolve);
		});
		// prompt() 在本轮（含被 abort() 中止）收尾时 settle：也据此 resolve，兜底 abort
		// 路径下 agent_end 可能不触发的情况，避免 waitForCompletion 永久挂起。
		session.prompt(prompt).then(
			() => finish(resolve),
			(err) => finish(() => reject(err)),
		);
	});
}

async function countKnowledgeBaseDirs(root: string): Promise<number> {
	try {
		const entries = await readdir(knowledge.rawsDir(root), { withFileTypes: true });
		return entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith(".")).length;
	} catch {
		return 0;
	}
}

let snapshotRunning = false;
let snapshotPending = false;

export async function recordKnowledgeBaseCurrentSnapshot(): Promise<void> {
	const root = knowledge.knowledgeRoot();
	try {
		await knowledge.ensureKnowledgeDirs(root);
		const [kbCount, raws, wiki] = await Promise.all([
			countKnowledgeBaseDirs(root),
			knowledge.scanRaws(root),
			knowledge.scanWikiPages(root),
		]);
		recordKnowledgeBaseSnapshot({
			kbCount,
			totalSourceFiles: raws.length,
			wikiPageCount: wiki.pages.length,
		});
	} catch (err) {
		log.warn(`record knowledge snapshot failed: ${err instanceof Error ? err.message : String(err)}`);
	}
}

export function scheduleKnowledgeBaseCurrentSnapshot(): void {
	if (snapshotRunning) {
		snapshotPending = true;
		return;
	}
	snapshotRunning = true;
	void (async () => {
		try {
			do {
				snapshotPending = false;
				await recordKnowledgeBaseCurrentSnapshot();
			} while (snapshotPending);
		} finally {
			snapshotRunning = false;
		}
	})();
}

async function countProcessedFiles(root: string, attempted: knowledge.AttemptedFile[]): Promise<number> {
	if (attempted.length === 0) return 0;
	const { pages } = await knowledge.scanWikiPages(root);
	const presentByPath = new Map(
		pages
			.filter((p) => p.frontmatter.orphaned_at == null)
			.map((p) => [p.frontmatter.source_path, p.frontmatter.source_hash]),
	);
	return attempted.filter((file) => presentByPath.get(file.source_path) === file.source_hash).length;
}

function countQuarantinedAttempted(after: knowledge.FailuresRecord, attempted: knowledge.AttemptedFile[]): number {
	const attemptedPaths = new Set(attempted.map((file) => file.source_path));
	let count = 0;
	for (const [path, entry] of Object.entries(after.entries)) {
		if (!attemptedPaths.has(path) || !entry.quarantined) continue;
		count += 1;
	}
	return count;
}

function scheduleKnowledgeBaseProcessingOutcome(root: string, attempted: knowledge.AttemptedFile[]): void {
	if (attempted.length === 0) return;
	void (async () => {
		try {
			const [filesProcessed, failuresAfter] = await Promise.all([
				countProcessedFiles(root, attempted),
				knowledge.readFailures(root),
			]);
			recordKnowledgeBaseProcessingResult(filesProcessed, countQuarantinedAttempted(failuresAfter, attempted));
		} catch (err) {
			log.warn(`record knowledge processing outcome failed: ${err instanceof Error ? err.message : String(err)}`);
		}
	})();
}

function readFiniteNumber(record: Record<string, unknown>, key: string): number {
	const value = record[key];
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function recordUsageFromMessage(message: unknown): void {
	if (typeof message !== "object" || message === null || !("usage" in message)) return;
	const usage = (message as { usage?: unknown }).usage;
	if (typeof usage !== "object" || usage === null) return;
	const usageRecord = usage as Record<string, unknown>;
	const cost = usageRecord.cost;
	const costRecord = typeof cost === "object" && cost !== null ? (cost as Record<string, unknown>) : {};
	recordKnowledgeBaseProcessingUsage({
		inputTokens: readFiniteNumber(usageRecord, "input"),
		outputTokens: readFiniteNumber(usageRecord, "output"),
		cacheReadTokens: readFiniteNumber(usageRecord, "cacheRead"),
		cacheWriteTokens: readFiniteNumber(usageRecord, "cacheWrite"),
		costTotal: readFiniteNumber(costRecord, "total"),
	});
}

/**
 * 跑一个加工批：起一个 agent 会话处理子 diff（只含本批的 added/changed）。
 * kb_write_page 注入轮级共享写页会话（共享 PageIndex + 串行提交），保证并发批写页安全。
 */
async function runProcessingBatch(
	batch: knowledge.RawsDiff,
	root: string,
	tmpDir: string,
	writeSession: knowledge.KbWriteSession,
	modelKey: string | undefined,
	reasoningLevel: string | undefined,
	round: RoundToken,
): Promise<void> {
	if (round.aborted) return;
	const { session } = await createAgentSession({
		cwd: KB_PROCESSING_CWD,
		sessionManager: SessionManager.create(KB_PROCESSING_CWD, KB_PROCESSING_SESSION_DIR),
		// 复用进程级共享 ModelRegistry：它已加载 models.json（自定义 provider/模型）与远程模型，
		// 与主对话一致。否则加工会话会新建一个不含 modelsPath 的 registry，find() 解析不到
		// 用户在知识库设置里选的自定义模型 → 静默回退 / "No model selected"。
		modelRegistry: getOrCreateSharedModelRegistry(),
		// 场景驱动激活：core/doc/kb-read 等由 kb-processing 场景的 scope_use 自动激活。
		scenario: "kb-processing",
		// 仅 kb_write_page 需注入轮级共享写页会话（覆盖注册表里无 session 的默认版本）。
		customTools: [createKbWritePageTool(undefined, writeSession) as unknown as ToolDefinition],
		appendSystemPrompt: knowledge.KB_PROCESSING_GUIDE,
		enableBackgroundTasks: false,
		env: { TMPDIR: tmpDir, TEMP: tmpDir, TMP: tmpDir },
	});
	// 把本批文件预填为锁定待办（一文件一项），强制 agent 逐个有序处理、逐个标记完成：
	// 锁定后不可新建/跳过/乱序，且未全部完成不允许结束（continuation 强制）；待办作为
	// session 快照持久化，不受上下文压缩影响——杜绝长任务里漏处理或重复处理同一文件。
	const rawsBase = knowledge.rawsDir(root);
	const todoItems = [
		...batch.added.map((a) => `新建 wiki 页：${join(rawsBase, a.raw.source_path)}`),
		...batch.changed.map((c) => `更新 wiki 页（id=${c.id}）：${join(rawsBase, c.source_path)}`),
	];
	if (todoItems.length > 0) {
		session.todoStore.createMany(todoItems);
		session.todoStore.lock("host");
	}
	// 注册为本轮活动会话，使 abortKnowledgeRound() 能即时中止它。
	round.sessions.add(session);
	const unsubscribeUsage = session.subscribe((event: AgentSessionEvent) => {
		if (event.type === "message_end") recordUsageFromMessage(event.message);
	});
	try {
		if (round.aborted) return;
		await applyProcessingModel(session, modelKey, reasoningLevel);
		await waitForCompletion(session, knowledge.buildProcessingPrompt(batch, root, tmpDir));
	} finally {
		unsubscribeUsage();
		round.sessions.delete(session);
		session.dispose();
	}
}

/** 跑一轮加工。返回是否因无变更而跳过。 */
export async function runKnowledgeRound(
	modelKey?: string,
	agentConcurrency = 3,
	reasoningLevel?: string,
): Promise<{ skipped: boolean; reason?: "no-model" }> {
	// 必须显式配置加工模型，绝不回退默认模型：未选模型时整轮跳过。
	if (!modelKey || modelKey.indexOf("/") <= 0) {
		log.info("no processing model configured, skipping round");
		return { skipped: true, reason: "no-model" };
	}
	if (running) {
		log.info("previous round still running, skipping this tick");
		return { skipped: true };
	}
	running = true;
	const round: RoundToken = { aborted: false, sessions: new Set() };
	currentRound = round;
	let markRoundDone!: () => void;
	roundDone = new Promise<void>((resolve) => {
		markRoundDone = resolve;
	});
	try {
		const root = knowledge.knowledgeRoot();
		await knowledge.ensureKnowledgeDirs(root);
		const now = new Date().toISOString();
		const prepared = await knowledge.prepareRound(root, now);

		if (knowledge.isEmptyDiff(prepared.diff) && prepared.toReap.length === 0) {
			log.info("no raws changes, nothing to process");
			scheduleKnowledgeBaseCurrentSnapshot();
			return { skipped: true };
		}
		recordKnowledgeBaseProcessingRound();
		// 确有工程/LLM 工作 → 广播「加工中」，渲染层顶栏出「正在建立索引…」徽标。
		setProcessing(true);
		log.info(
			`processing round: +${prepared.diff.added.length} ~${prepared.diff.changed.length} ` +
				`moved=${prepared.diff.moved.length} del=${prepared.diff.deleted.length} reap=${prepared.toReap.length}`,
		);

		// 只有 added/changed 需要 LLM 读原文写 wiki 页。moved（纯元数据）、deleted（标孤儿）、
		// 孤儿回收都是工程侧动作（prepareRound/finalizeRound 处理），不起 LLM、不耗 token。
		if (knowledge.diffNeedsProcessing(prepared.diff)) {
			// 每轮一个 OS tmp 私有目录：注入 TMPDIR/TEMP/TMP 让工具子进程的临时文件
			// 落到这里，并在 prompt 中指引 agent 把中间产物写进来，避免污染 raws/。
			const tmpDir = join(tmpdir(), `astravia-kb-${randomUUID()}`);
			await mkdir(tmpDir, { recursive: true });

			// 加工期间把 raws/ 整树锁成只读（OS 强制），绝对杜绝 agent 往 raws 写入。
			// 走 beginRound/endRound（互斥），与 UI 特权写串行，UI 写仍可在轮次中穿插。
			await beginRound(root);
			try {
				// 轮级共享写页会话：扫一次 wiki/ 建内存 PageIndex + 串行提交，供所有并发批共享，
				// 既消除「每写一页全量 scan」的 O(N²)，又保证并发批写页互斥安全。
				const writeSession = await knowledge.createKbWriteSession(root);
				// 切批：纯上下文边界，按 source_path 聚簇 + 文件数/字节双预算。续跑靠 hash-diff，无需游标。
				const batches = await knowledge.planProcessingBatches(prepared.diff, root, {
					maxFilesPerBatch: KB_MAX_FILES_PER_BATCH,
					maxBytesPerBatch: KB_MAX_BYTES_PER_BATCH,
				});
				log.info(`processing in ${batches.length} batch(es), agent concurrency=${agentConcurrency}`);
				const limit = createLimiter(agentConcurrency);
				await Promise.all(
					batches.map((batch) =>
						limit.run(async () => {
							if (round.aborted) return;
							await runProcessingBatch(batch, root, tmpDir, writeSession, modelKey, reasoningLevel, round);
							// 本批加工完即重建索引 + 广播：让侧边栏文件状态与 indexes 同步推进（每批 ~20 文件
							// 粒度），避免「UI 显示已就绪但索引还没建」的不一致。被中止则不再重建（维护操作会自己重建）。
							if (round.aborted) return;
							await refreshCachesAndNotify(root);
						}),
					),
				);
			} finally {
				await endRound(root);
				await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
			}
		} else {
			log.info("engineering-only round (moved/deleted/orphan reap), skipping LLM");
		}

		// 工程侧收尾：物理删除上一轮孤儿（不经 agent）+ 据 frontmatter 重建缓存（本轮权威重建）。
		await knowledge.finalizeRound(root, prepared.toReap);
		// 止损对账：仅在本轮正常完成（非中止）时统计成败——按「wiki 是否真出现该文件的 hash」
		// 判定，连续失败达阈值的文件被隔离，下一轮不再自动重加工，杜绝同样几个文件无限重跑。
		// 被用户中止的轮次不计失败，避免误隔离。
		if (!round.aborted) {
			const attempted = knowledge.attemptedFiles(prepared.diff);
			await knowledge.reconcileRoundFailures(root, attempted, now);
			scheduleKnowledgeBaseProcessingOutcome(root, attempted);
		}
		scheduleKnowledgeBaseCurrentSnapshot();
		// 收尾后再广播一次：反映孤儿回收/moved 等工程侧变更，让 UI 做最终对账。
		broadcast(KB_STATUSES_CHANGED_CHANNEL);
		log.info("processing round complete");
		return { skipped: false };
	} finally {
		setProcessing(false);
		running = false;
		currentRound = undefined;
		markRoundDone();
		roundDone = undefined;
	}
}

/**
 * 在「同一时刻只跑一轮」互斥锁下执行一段知识库维护（清空 wiki / 删除指定 wiki 页等）。
 * 复用 `running`：维护期间任何定时 tick 自动跳过；若正有一轮在跑则拒绝（让用户稍后再试），
 * 杜绝与加工轮的写 wiki / 重建缓存竞态。收尾广播一次状态变更，让侧边栏文件态与索引重新对账。
 */
export async function runKnowledgeMaintenance<T>(fn: (root: string) => Promise<T>): Promise<T> {
	// 维护操作（清空 wiki / 删除指定页）优先：若有加工轮在跑，立即中止并等它收尾，再独占执行。
	await abortKnowledgeRound();
	if (running) throw new Error("知识库正在整理中，请稍后再试");
	running = true;
	try {
		const root = knowledge.knowledgeRoot();
		await knowledge.ensureKnowledgeDirs(root);
		return await fn(root);
	} finally {
		running = false;
		broadcast(KB_STATUSES_CHANGED_CHANNEL);
	}
}

/**
 * 重试加工失败（已隔离）的文件：清除全部失败/隔离记录（解除隔离），再立即起一轮加工。
 * 清除走维护互斥（会中止在跑的轮并独占执行），随后的加工轮按常规调度。
 */
export async function retryFailedKnowledge(
	modelKey?: string,
	agentConcurrency = 3,
	reasoningLevel?: string,
): Promise<{ skipped: boolean; reason?: "no-model" }> {
	await runKnowledgeMaintenance(async (root) => {
		const failures = await knowledge.readFailures(root);
		await knowledge.writeFailures(root, knowledge.clearFailures(failures));
	});
	return runKnowledgeRound(modelKey, agentConcurrency, reasoningLevel);
}

function unschedule(): void {
	if (scheduled) {
		scheduler.removeById(JOB_ID);
		scheduled = false;
	}
}

/** 据当前配置（重新）调度轮询器。配置变化或启动时调用。 */
export async function reloadKnowledgePoller(): Promise<void> {
	unschedule();
	// 自愈：清除上次进程崩溃可能残留的 raws 只读锁。
	// 仅当无加工轮进行时才清——进行中那一轮的锁是「活动锁」不是残留，
	// 误清会丢掉防 agent 污染 raws 的 OS 兜底（如用户正加工时保存了知识库设置）。
	if (!running) await unlockRaws().catch(() => {});
	const config = await readDesktopConfig();
	const kb = config.knowledgeBase;
	// 总开关：关闭时置 env 标志，coding-agent 据此对 agent 屏蔽知识库检索工具。
	process.env.ASTRAVIA_KNOWLEDGE_DISABLED = kb?.enabled === false ? "1" : "";
	if (!kb?.enabled) {
		// 关闭知识库总开关：立即中止正在进行的加工轮，杜绝后台继续读原文/写 wiki。
		await abortKnowledgeRound();
		await unlockRaws().catch(() => {});
		log.info("knowledge base disabled");
		return;
	}
	// 启动/改设置时自愈一次：据 frontmatter 重建缓存，覆盖缓存缺失/损坏/手改场景，
	// 用户无需任何手动「重建」操作。无 LLM、O(N)、隐形。加工轮进行中则跳过避免竞态。
	if (!running) {
		const root = knowledge.knowledgeRoot();
		await knowledge.ensureKnowledgeDirs(root);
		await knowledge
			.rebuildAllCaches(root)
			.then(logDamagedPages)
			.catch((err) => log.warn(`self-heal rebuild failed: ${err instanceof Error ? err.message : String(err)}`));
	}
	// OCR 并发经环境变量传给 coding-agent 的全局 OCR 闸（惰性初始化，首次 OCR 调用时读取）。
	// 改 ocrConcurrency 后需重启 app 才生效。手动「马上整理」也读它，故不论是否自动都先设好。
	process.env.ASTRAVIA_KB_OCR_CONCURRENCY = String(kb.ocrConcurrency ?? 1);
	const minutes = kb.pollIntervalMinutes ?? 5;
	// 0/未设视作「永不自动加工」：保持知识库启用（检索工具、手动整理仍可用），仅不调度后台轮询。
	if (minutes <= 0) {
		log.info("knowledge auto-processing disabled (manual scan only)");
		return;
	}
	const modelKey = kb.processingModelKey;
	// 未配置加工模型则不调度自动整理（绝不回退默认模型）。检索/手动操作不受影响。
	if (!modelKey || modelKey.indexOf("/") <= 0) {
		log.info("knowledge auto-processing disabled (no processing model configured)");
		return;
	}
	const agentConcurrency = kb.agentConcurrency ?? 3;
	const reasoningLevel = kb.processingModelReasoningLevel;
	const task = new AsyncTask(
		JOB_ID,
		async () => {
			await runKnowledgeRound(modelKey, agentConcurrency, reasoningLevel);
		},
		(err: Error) => log.error(`knowledge round failed: ${err.message}`),
	);
	scheduler.addSimpleIntervalJob(new SimpleIntervalJob({ minutes, runImmediately: false }, task, { id: JOB_ID }));
	scheduled = true;
	log.info(`knowledge poller scheduled every ${minutes} min`);
}

export function stopKnowledgePoller(): void {
	unschedule();
	scheduler.stop();
}
