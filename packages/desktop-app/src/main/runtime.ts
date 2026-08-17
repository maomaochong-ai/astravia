import { join } from "node:path";
import { AuthStorage, getAgentDir, ModelRegistry } from "@astravia/coding-agent";
import { RuntimeHost } from "../../../runtime-core/src/index.js";
import { getBuiltinSkillPaths } from "./builtin-skills.js";
import { readDesktopConfig } from "./config/desktop-config-store.js";
import { getDesktopUserQuestionBroker } from "./conversations/user-question-broker.js";
import { getAppLogger } from "./logger.js";
import { getDesktopModelCredentialStore } from "./models/model-credential-store.js";
import { readModelsConfigSync } from "./models/model-settings-service.js";
import { getAvailableLinuxBubblewrapPath, getAvailableMacosSandboxExecPath } from "./sandbox/capability.js";
import { resolveWindowsSandboxHostBinary } from "./sandbox/windows-binary-resolver.js";

// 进程级共享 RuntimeHost：session IPC、定时任务 (scheduler) 与批量任务
// (batch-tasks) 必须复用同一实例，否则任一模块 createSession 后没 dispose
// 时，其它模块再次 open 同一 sessionPath 会在同进程里撞 SessionLockError，
// 导致点击跳转走向 Welcome 页（见定时任务历史跳转 bug）。
let sharedRuntime: RuntimeHost | null = null;
let sharedModelRegistry: ModelRegistry | null = null;
const runtimeLog = getAppLogger("runtime");

/**
 * 进程级共享 ModelRegistry：所有 session 共用，避免每次 createSession 都重新
 * 解析 models.json 与凭据。
 */
export function getOrCreateSharedModelRegistry(): ModelRegistry {
	if (sharedModelRegistry) return sharedModelRegistry;
	const agentDir = getAgentDir();
	const authStorage = AuthStorage.create(join(agentDir, "auth.json"));
	const modelsPath = join(agentDir, "models.json");
	try {
		getDesktopModelCredentialStore().syncToAuthStorage(authStorage, readModelsConfigSync().providers);
	} catch (error) {
		runtimeLog.warn("加载模型加密凭据失败:", error);
	}
	const registry = new ModelRegistry(authStorage, modelsPath);
	sharedModelRegistry = registry;
	return registry;
}

/** Return the shared RuntimeHost if one has been created, otherwise null. */
export function peekSharedRuntime(): RuntimeHost | null {
	return sharedRuntime;
}

export function getSharedRuntime(): RuntimeHost {
	if (!sharedRuntime) {
		sharedRuntime = new RuntimeHost({
			additionalSkillPaths: getBuiltinSkillPaths(),
			getDefaultExecutionMode: async () => {
				const config = await readDesktopConfig();
				return config.defaultExecutionMode;
			},
			sandboxHostPath: resolveWindowsSandboxHostBinary()?.path,
			linuxBubblewrapPath: getAvailableLinuxBubblewrapPath(),
			macosSandboxExecPath: getAvailableMacosSandboxExecPath(),
			// 共享 ModelRegistry：所有 session 复用同一份，避免重复加载 models.json。
			modelRegistry: getOrCreateSharedModelRegistry(),
			userQuestionHandler: getDesktopUserQuestionBroker().handle,
		});
	}
	return sharedRuntime;
}

export async function disposeSharedRuntime(): Promise<void> {
	if (!sharedRuntime) return;
	const runtime = sharedRuntime;
	sharedRuntime = null;
	await runtime.disposeAllSessions();
}
