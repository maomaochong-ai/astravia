import type { ProjectInfo, SessionHistoryInfo } from "../../../../runtime-core/src/index.js";
import { allowProjectRoot } from "../filesystem/filesystem-service.js";
import { getSharedRuntime } from "../runtime.js";
import { getDesktopConversationService } from "./desktop-conversation-service.js";

export async function listRuntimeSessionProjects(): Promise<ProjectInfo[]> {
	const projects = await getSharedRuntime().listProjects();
	for (const project of projects) allowProjectRoot(project.cwd);
	return projects;
}

export function listSessionHistory(cwd: string): Promise<SessionHistoryInfo[]> {
	return getDesktopConversationService().listSessions(cwd);
}
