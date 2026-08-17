import type { Project, SessionInfo } from "@shared/store/atoms";
import { ProjectGroupView, SessionRowView } from "@astravia/theme-ui/project";
import { memo } from "react";
import { useProjectGroupModel } from "../../../hooks/useProjectGroupModel";

interface ProjectGroupProps {
	project: Project;
	scrollParent: HTMLElement | null;
	sessions: SessionInfo[];
	sessionsLoading: boolean;
	isExpanded: boolean;
	isActive?: boolean;
	activeSessionPath: string;
	onExpand: (cwd: string) => void;
	onCollapse: (cwd: string) => void;
	onNavigateProject: (cwd: string) => void;
	onNewSession: (cwd: string) => void;
	onProjectInteract: () => boolean | Promise<void>;
	onSelectSession: (cwd: string, sessionPath: string) => void;
	onRenameSession: (cwd: string, sessionPath: string, name: string) => void;
}

export const ProjectGroup = memo(function ProjectGroup(props: ProjectGroupProps): JSX.Element {
	const model = useProjectGroupModel(props);

	return (
		<ProjectGroupView
			onProjectInteract={props.onProjectInteract}
			projectRow={{
				badge: model.projectBadge,
				displayName: model.displayName,
				expanded: model.expanded,
				hasRunning: model.hasRunning,
				isActive: model.isActive,
				newSessionTitle: model.newSessionTitle,
				onCollapse: model.actions.collapse,
				onExpand: model.actions.expand,
				onNavigateProject: model.actions.navigateProject,
				onNewSession: model.actions.newSession,
				onOpenContextMenu: model.actions.openProjectContextMenu,
				projectCwd: model.project.cwd,
				projectType: model.projectType,
			}}
			emptySessions={
				<p className="px-2.5 py-1.5 pl-[36px] text-[12px] text-muted-foreground">
					{model.noSessionsLabel}
				</p>
			}
			sessions={{
				expanded: model.expanded,
				hasMore: model.hasMoreSessions,
				loading: props.sessionsLoading,
				labels: model.showMoreLabels,
				onToggleShowAll: model.actions.toggleShowAll,
				scrollParent: props.scrollParent,
				sessions: model.sessionViews,
				showAll: model.showAllSessions,
				renderSession: (session) => (
					<SessionRowView
						key={session.key}
						active={session.active}
						label={session.label}
						renaming={session.renaming}
						running={session.running}
						scheduled={session.scheduled}
						timeLabel={session.timeLabel}
						onBeforeSelect={props.onProjectInteract}
						onOpenContextMenu={(event) =>
							model.actions.openSessionContextMenu(event, session.session)
						}
						onRename={(name) => model.actions.renameSession(session.path, name)}
						onRenameDone={model.actions.renameDone}
						onSelect={() => model.actions.selectSession(session.path)}
					/>
				),
			}}
		/>
	);
});
