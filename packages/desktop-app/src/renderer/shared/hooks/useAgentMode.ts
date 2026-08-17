import { type AgentMode, agentModeAtom } from "@shared/store/atoms";
import { useAtom } from "jotai";
import { useCallback, useEffect } from "react";

/**
 * 工作模式（agent_mode 轴，纯全局态，见 ADR-0046）。
 * - 初始化：从主进程 desktop-config 水合。
 * - 同步：订阅主进程 agent-mode-changed 广播（多窗口一致）。
 * - 切换：乐观即时切本窗口，再写主进程（持久化 + 推 pending 给活跃 session + 广播回环幂等）。
 */
export function useAgentMode(): {
	agentMode: AgentMode;
	setAgentMode: (mode: AgentMode) => Promise<void>;
} {
	const [agentMode, setAgentModeAtom] = useAtom(agentModeAtom);

	useEffect(() => {
		let disposed = false;
		void window.astravia.config.get().then((config) => {
			if (disposed) return;
			if (config.agentMode === "coding" || config.agentMode === "work") {
				setAgentModeAtom(config.agentMode);
			}
		});
		const unsubscribe = window.astravia.session.onAgentModeChanged((mode) => {
			setAgentModeAtom(mode);
		});
		return () => {
			disposed = true;
			unsubscribe();
		};
	}, [setAgentModeAtom]);

	const setAgentMode = useCallback(
		async (mode: AgentMode): Promise<void> => {
			if (mode === agentMode) return;
			setAgentModeAtom(mode);
			await window.astravia.session.setGlobalAgentMode(mode);
		},
		[agentMode, setAgentModeAtom],
	);

	return { agentMode, setAgentMode };
}
