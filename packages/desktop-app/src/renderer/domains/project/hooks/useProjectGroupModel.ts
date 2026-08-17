import { DEFAULT_VISIBLE_SESSIONS } from "@astravia/theme-ui/project";
import { pathBasename } from "@shared/lib/utils";
import type { Project, ProjectType, SessionInfo } from "@shared/store/atoms";
import {
	projectContextMenuAtom,
	renamingSessionPathAtom,
	runningSessionPathsAtom,
	scheduledSessionPathsAtom,
	sessionContextMenuAtom,
	sessionDisplayLabel,
} from "@shared/store/atoms";
import { useAtom, useAtomValue } from "jotai";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { relativeTime } from "../components/sidebar/projects/relativeTime";

export interface ProjectGroupSessionView {
	key: string;
	path: string;
	label: string;
	timeLabel: string;
	active: boolean;
	renaming: boolean;
	running: boolean;
	scheduled: boolean;
	session: SessionInfo;
}

interface UseProjectGroupModelArgs {
	activeSessionPath: string;
	isActive?: boolean;
	isExpanded: boolean;
	onCollapse: (cwd: string) => void;
	onExpand: (cwd: string) => void;
	onNavigateProject: (cwd: string) => void;
	onNewSession: (cwd: string) => void;
	onRenameSession: (cwd: string, sessionPath: string, name: string) => void;
	onSelectSession: (cwd: string, sessionPath: string) => void;
	project: Project;
	sessions: SessionInfo[];
}

export function useProjectGroupModel({
	activeSessionPath,
	isActive = false,
	isExpanded,
	onCollapse,
	onExpand,
	onNavigateProject,
	onNewSession,
	onRenameSession,
	onSelectSession,
	project,
	sessions,
}: UseProjectGroupModelArgs) {
	const { t, i18n } = useTranslation("project");
	const sortedSessions = useMemo(() => [...sessions].sort((a, b) => b.modifiedAt - a.modifiedAt), [sessions]);
	const [, setContextMenu] = useAtom(sessionContextMenuAtom);
	const [, setProjectContextMenu] = useAtom(projectContextMenuAtom);
	const [renamingSessionPath, setRenamingSessionPath] = useAtom(renamingSessionPathAtom);
	const [showAllSessions, setShowAllSessions] = useState(false);
	const revealedActiveSessionRef = useRef<string | null>(null);
	const runningSessionPaths = useAtomValue(runningSessionPathsAtom);
	const scheduledSessionPaths = useAtomValue(scheduledSessionPathsAtom);
	const scheduledBasenames = useMemo(() => {
		const basenames = new Set<string>();
		for (const path of scheduledSessionPaths) basenames.add(path.slice(path.lastIndexOf("/") + 1));
		return basenames;
	}, [scheduledSessionPaths]);
	const projectHasRunning = useMemo(
		() => sessions.some((session) => runningSessionPaths.has(session.path)),
		[sessions, runningSessionPaths],
	);

	useEffect(() => {
		if (!isExpanded) setShowAllSessions(false);
	}, [isExpanded]);

	useEffect(() => {
		if (!activeSessionPath) {
			revealedActiveSessionRef.current = null;
			return;
		}
		if (revealedActiveSessionRef.current === activeSessionPath) return;
		const activeIndex = sortedSessions.findIndex((session) => session.path === activeSessionPath);
		if (activeIndex < 0) return;
		revealedActiveSessionRef.current = activeSessionPath;
		if (activeIndex >= DEFAULT_VISIBLE_SESSIONS) setShowAllSessions(true);
	}, [activeSessionPath, sortedSessions]);

	const hasMoreSessions = sortedSessions.length > DEFAULT_VISIBLE_SESSIONS;
	const visibleSessions = showAllSessions ? sortedSessions : sortedSessions.slice(0, DEFAULT_VISIBLE_SESSIONS);
	const hiddenCount = sortedSessions.length - DEFAULT_VISIBLE_SESSIONS;
	const displayName = project.name ?? pathBasename(project.cwd);
	const projectType = project.type;
	const projectBadge = getProjectBadge(project, projectType, t);

	// t 在 changeLanguage 后可能保持同一引用；读 i18n.language 强制语言切换时重算 timeLabel。
	const sessionViews: ProjectGroupSessionView[] = useMemo(() => {
		void i18n.language;
		return visibleSessions.map((session) => {
			const isSessionActive = activeSessionPath === session.path;
			const isRunning = runningSessionPaths.has(session.path);
			const isSchedule =
				scheduledSessionPaths.has(session.path) ||
				scheduledBasenames.has(session.path.slice(session.path.lastIndexOf("/") + 1));
			return {
				key: session.path,
				path: session.path,
				label: sessionDisplayLabel(session),
				timeLabel: relativeTime(session.modifiedAt, t),
				active: isSessionActive,
				renaming: renamingSessionPath === session.path,
				running: isRunning,
				scheduled: isSchedule,
				session,
			};
		});
	}, [
		activeSessionPath,
		i18n.language,
		renamingSessionPath,
		runningSessionPaths,
		scheduledBasenames,
		scheduledSessionPaths,
		t,
		visibleSessions,
	]);

	return {
		displayName,
		expanded: isExpanded,
		hasMoreSessions,
		hasRunning: projectHasRunning,
		hiddenCount,
		isActive,
		newSessionTitle: t("sidebar.nav.newSession"),
		noSessionsLabel: t("sidebar.projects.noSessions"),
		project,
		projectBadge,
		projectType,
		sessionViews,
		showAllSessions,
		showMoreLabels: {
			collapse: t("sidebar.projects.collapseSessions"),
			expand: t("sidebar.projects.expandMore", { count: hiddenCount }),
		},
		actions: {
			collapse: () => onCollapse(project.cwd),
			expand: () => onExpand(project.cwd),
			navigateProject: () => onNavigateProject(project.cwd),
			newSession: () => onNewSession(project.cwd),
			openProjectContextMenu: (event: React.MouseEvent) => {
				event.preventDefault();
				setProjectContextMenu({ x: event.clientX, y: event.clientY, project });
			},
			openSessionContextMenu: (event: React.MouseEvent, session: SessionInfo) => {
				event.preventDefault();
				setContextMenu({ x: event.clientX, y: event.clientY, session });
			},
			renameDone: () => setRenamingSessionPath(null),
			renameSession: (sessionPath: string, name: string) => onRenameSession(project.cwd, sessionPath, name),
			selectSession: (sessionPath: string) => onSelectSession(project.cwd, sessionPath),
			toggleShowAll: () => setShowAllSessions((value) => !value),
		},
	};
}

function getProjectBadge(
	_project: Project,
	projectType: ProjectType,
	t: (key: "detail.typeBatch") => string,
): string | undefined {
	if (projectType === "normal") return undefined;
	return t("detail.typeBatch");
}
