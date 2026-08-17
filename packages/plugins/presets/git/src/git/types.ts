/** Single-letter status shown in the tree (collapsed from porcelain XY). */
export type ChangeCode = "M" | "A" | "D" | "R" | "U";

export interface ChangeEntry {
	/** Repo-root-relative path (forward slashes). For renames this is the new path. */
	path: string;
	/** Original path for renames. */
	origPath?: string;
	code: ChangeCode;
	/** True when the change is (at least partly) staged in the index. */
	staged: boolean;
}

/** A computed "this turn's changes" result for the turn card (persisted per cwd). */
export interface TurnChangeDelta {
	entries: ChangeEntry[];
	additions: number;
	deletions: number;
}

/** Which ref namespace the graph draws: local branches or remote-tracking branches. */
export type GraphScope = "local" | "remote";

/** A selectable branch in the top switcher (`null` branch = all branches in scope). */
export interface BranchRef {
	/** Short name, e.g. "main" (local) or "origin/main" (remote). */
	name: string;
	/** The commit the ref points at. */
	head: string;
}

/** Current top-switcher selection: a scope plus a specific branch, or all of the scope. */
export interface GraphSelection {
	scope: GraphScope;
	/** A specific ref name, or `null` for all branches in the scope. */
	branch: string | null;
}

/** One commit parsed from `git log`, the unit the graph renders. */
export interface CommitNode {
	hash: string;
	/** Parent hashes ([] for the root commit, 1 normal, 2+ a merge). */
	parents: string[];
	/** Ref names decorating this commit, e.g. ["HEAD", "main", "origin/main", "tag: v1"]. */
	refs: string[];
	authorName: string;
	authorEmail: string;
	/** Author date, unix seconds. */
	timestamp: number;
	subject: string;
	body: string;
}
