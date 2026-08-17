import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@astravia/coding-agent";
import { atomicWriteJSON } from "@astravia/toolkit/atomic-write";
import { ipcMain } from "electron";
import {
	listPresetProviders,
	refreshPresetCatalog,
	refreshPresetModels,
	startPresetModelsAutoSync,
} from "../models/presets/sync.js";

function getSettingsPath(): string {
	return join(getAgentDir(), "settings.json");
}

export function readSettings(): Record<string, unknown> {
	const path = getSettingsPath();
	if (!existsSync(path)) return {};
	try {
		return JSON.parse(readFileSync(path, "utf-8"));
	} catch {
		return {};
	}
}

export function writeSettings(settings: Record<string, unknown>): void {
	atomicWriteJSON(getSettingsPath(), settings);
}

/**
 * 清掉历史版本在 settings.json 里留下的服务端登录残留。
 * 本版本没有登录，也不连任何服务端；留着这些键只会让旧凭据在盘上继续存在。
 */
function scrubLegacyServerSettings(): void {
	const settings = readSettings();
	const legacyKeys = ["serverUrl", "serverToken", "serverRefreshToken"];
	if (!legacyKeys.some((key) => key in settings)) return;
	for (const key of legacyKeys) {
		delete settings[key];
	}
	writeSettings(settings);
}

export function registerSettingsIpc(): () => void {
	scrubLegacyServerSettings();

	// 预设服务商目录内置在客户端(见 ADR-0050);模型清单取自 models.dev 公共目录,免 key 可见。
	ipcMain.handle("astravia:models:list-presets", async () => {
		return listPresetProviders();
	});

	// 手动刷新某预设服务商的模型列表:只拉不写,由渲染层连同 key 一起落盘。
	ipcMain.handle("astravia:models:refresh-preset-models", async (_event, providerId: unknown, apiKey: unknown) => {
		if (typeof providerId !== "string" || !providerId.trim()) {
			return { models: [], error: { code: "unknown-provider", params: { provider: String(providerId) } } };
		}
		return refreshPresetModels(providerId.trim(), typeof apiKey === "string" ? apiKey : undefined);
	});

	// 手动刷新公共目录:清掉失败冷却强制重拉,错误原样回给渲染层。
	ipcMain.handle("astravia:models:refresh-preset-catalog", async () => {
		return refreshPresetCatalog();
	});

	// 启动时同步一次已启用预设服务商的模型列表,之后每 12 小时一次。
	// 即便用户从不打开设置页,ModelSelector 也能拿到上游最新模型。失败静默(保留本地快照)。
	const stopPresetAutoSync = startPresetModelsAutoSync();

	return () => {
		stopPresetAutoSync();
		ipcMain.removeHandler("astravia:models:list-presets");
		ipcMain.removeHandler("astravia:models:refresh-preset-catalog");
		ipcMain.removeHandler("astravia:models:refresh-preset-models");
	};
}
