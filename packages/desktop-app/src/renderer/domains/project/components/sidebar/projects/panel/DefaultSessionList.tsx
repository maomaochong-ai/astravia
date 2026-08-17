import type { DefaultConversationFilter, SessionInfo } from "@shared/store/atoms";
import { DefaultSessionListView, DefaultSessionRowView } from "@astravia/theme-ui/project";
import { memo } from "react";
import { useDefaultSessionListModel } from "../../../../hooks/useDefaultSessionListModel";

interface DefaultSessionListProps {
	activeSessionPath: string;
	className?: string;
	cwd: string;
	filter: DefaultConversationFilter;
	loading: boolean;
	onBeforeSelect: () => boolean | Promise<void>;
	onNewSession?: () => void;
	onRenameSession: (cwd: string, sessionPath: string, name: string) => void;
	onSelectSession: (cwd: string, sessionPath: string) => void;
	scrollParent: HTMLElement | null;
	sessions: SessionInfo[];
}

export const DefaultSessionList = memo(function DefaultSessionList(
	props: DefaultSessionListProps,
): JSX.Element {
	const model = useDefaultSessionListModel(props);

	return (
		<DefaultSessionListView
			className={props.className}
			hasMore={model.hasMore}
			labels={model.labels}
			loading={props.loading}
			onEmptyAction={model.actions.emptyAction}
			onToggleShowAll={model.actions.toggleShowAll}
			scrollParent={props.scrollParent}
			sessions={model.sessions}
			showAll={model.showAll}
			totalCount={model.totalCount}
			visibleSessions={model.visibleSessions}
			renderSession={(item) => (
				<DefaultSessionRowView
					key={item.key}
					active={item.active}
					contextMenuEnabled={model.contextMenuEnabled}
					label={item.label}
					onBeforeSelect={props.onBeforeSelect}
					renaming={item.renaming}
					running={item.running}
					scheduled={item.scheduled}
					timeLabel={item.timeLabel}
					onOpenContextMenu={(event) => model.actions.openContextMenu(event, item.session)}
					onRename={(name) => model.actions.rename(item.path, name)}
					onRenameDone={model.actions.renameDone}
					onSelect={() => model.actions.select(item.path)}
				/>
			)}
		/>
	);
});
