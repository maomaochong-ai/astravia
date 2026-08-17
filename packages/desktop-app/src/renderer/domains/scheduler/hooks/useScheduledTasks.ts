import { type ScheduledTask, scheduledTasksAtom } from "@shared/store/atoms";
import { useAtom } from "jotai";
import { useCallback, useEffect } from "react";
import { CRON_PRESETS } from "./CRON_PRESETS";

export { CRON_PRESETS };

export function useScheduledTasks() {
	const [tasks, setTasks] = useAtom(scheduledTasksAtom);

	const refreshTasks = useCallback(async () => {
		const loaded = await window.astravia.scheduler.getTasks();
		setTasks(loaded);
	}, [setTasks]);

	useEffect(() => {
		return window.astravia.scheduler.onTaskEvent((event) => {
			if (event.type === "tasks.changed") {
				void refreshTasks();
			}
		});
	}, [refreshTasks]);

	const createTask = useCallback(
		async (data: Omit<ScheduledTask, "id" | "createdAt" | "updatedAt" | "lastRunAt" | "lastRunStatus">) => {
			const task = await window.astravia.scheduler.createTask(data);
			setTasks((prev) => [...prev, task]);

			return task;
		},
		[setTasks],
	);

	const updateTask = useCallback(
		async (id: string, patch: Partial<ScheduledTask>) => {
			await window.astravia.scheduler.updateTask(id, patch);
			const updated = tasks.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: Date.now() } : t));
			setTasks(updated);
		},
		[tasks, setTasks],
	);

	const deleteTask = useCallback(
		async (id: string) => {
			await window.astravia.scheduler.deleteTask(id);
			const remaining = tasks.filter((t) => t.id !== id);
			setTasks(remaining);
		},
		[tasks, setTasks],
	);

	const toggleTask = useCallback(
		async (id: string) => {
			await window.astravia.scheduler.toggleTask(id);
			setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, enabled: !t.enabled, updatedAt: Date.now() } : t)));
		},
		[setTasks],
	);

	const runNow = useCallback(async (id: string) => {
		await window.astravia.scheduler.runTaskNow(id);
	}, []);

	const abortTask = useCallback(async (id: string) => {
		await window.astravia.scheduler.abortTask(id);
	}, []);

	const getTask = useCallback((id: string) => tasks.find((t) => t.id === id), [tasks]);

	return {
		tasks,
		createTask,
		updateTask,
		deleteTask,
		toggleTask,
		runNow,
		abortTask,
		getTask,
		refreshTasks,
		CRON_PRESETS,
	};
}
