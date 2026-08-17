/** Plain view types for batch-tasks (no host store imports). */

export type BatchTaskStatus = "pending" | "running" | "completed" | "failed" | "paused";

export interface BatchTaskViewItem {
	id: string;
	name: string;
	status: BatchTaskStatus;
	/** Pre-resolved status / waiting label. */
	statusLabel: string;
	/** Relative time label; null shows not-run text. */
	timeLabel: string | null;
	error?: string;
	sessionPath?: string;
	isQueued: boolean;
}

export interface BatchProjectCountsView {
	failed: number;
	running: number;
	completed: number;
	paused: number;
	neverExecuted: number;
	total: number;
}

export interface BatchTaskTone {
	bg: string;
	dot: string;
	ring: string;
	text: string;
}

export interface BatchTaskCardLabels {
	goToSession: string;
	cancelWait: string;
	run: string;
	resume: string;
	retry: string;
	rerun: string;
	delete: string;
	notRun: string;
}

export interface BatchTaskGridLabels {
	searchPlaceholder: string;
	clear: string;
	noMatch: (query: string) => string;
	noTasks: string;
	expandMore: (n: number) => string;
	collapse: string;
}

export interface BatchTaskProjectHeaderLabels {
	matchCount: (filtered: number, total: number) => string;
	taskCount: (n: number) => string;
	completedOf: (completed: number, total: number) => string;
	runningSuffix: (n: number) => string;
	pausedSuffix: (n: number) => string;
	resetFailedHint: (n: number) => string;
	failedReset: (n: number) => string;
}

export interface BatchTaskProjectActionsLabels {
	stop: string;
	start: string;
	allDone: string;
	allDoneOrFailed: (n: number) => string;
	reset: string;
	editProject: string;
	deleteProject: string;
}

export interface BatchProjectGroupLabels {
	badge: string;
}

export interface BatchTasksPageLabels {
	title: string;
	subtitle: string;
	newProject: string;
	emptyTitle: string;
	emptyDesc: string;
	emptyAction: string;
	statsTotal: string;
	statsRunning: string;
	statsCompleted: string;
	statsFailed: string;
}

export interface BatchTasksPageStatsView {
	total: number;
	running: number;
	completed: number;
	failed: number;
}

export interface BatchTaskCardCallbacks {
	delete: (taskId: string) => void;
	goToSession: (taskId: string) => void;
	resume: (taskId: string) => void;
	retry: (taskId: string) => void;
	run: (taskId: string) => void;
	stop: (taskId: string) => void;
}

export interface BatchTaskProjectBlockCallbacks {
	batchReset: () => void;
	batchStart: () => void;
	batchStop: () => void;
	deleteProject: () => void;
	editProject: () => void;
	resetFailed: () => void;
	deleteTask: (taskId: string) => void;
	goToSession: (taskId: string) => void;
	resume: (taskId: string) => void;
	retry: (taskId: string) => void;
	run: (taskId: string) => void;
	stop: (taskId: string) => void;
}
