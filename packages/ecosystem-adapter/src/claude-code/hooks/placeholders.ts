import { dirname } from "node:path";

export interface ClaudePathContext {
	pluginRoot?: string;
	pluginData?: string;
	projectDir?: string;
}

/**
 * Expand Claude path placeholders in command/args before spawning.
 * Does not perform shell expansion; only `${CLAUDE_*}` / `$CLAUDE_*` tokens known to the profile.
 */
/** Claude path tokens use `$` + `{NAME}` form; keep as plain strings for replaceAll. */
const CLAUDE_PLUGIN_ROOT = ["$", "{CLAUDE_PLUGIN_ROOT}"].join("");
const CLAUDE_PLUGIN_DATA = ["$", "{CLAUDE_PLUGIN_DATA}"].join("");
const CLAUDE_PROJECT_DIR = ["$", "{CLAUDE_PROJECT_DIR}"].join("");

export function expandClaudePlaceholders(value: string, context: ClaudePathContext): string {
	let result = value;
	if (context.pluginRoot !== undefined) {
		result = result.replaceAll(CLAUDE_PLUGIN_ROOT, context.pluginRoot);
		result = result.replaceAll("$CLAUDE_PLUGIN_ROOT", context.pluginRoot);
	}
	if (context.pluginData !== undefined) {
		result = result.replaceAll(CLAUDE_PLUGIN_DATA, context.pluginData);
		result = result.replaceAll("$CLAUDE_PLUGIN_DATA", context.pluginData);
	}
	if (context.projectDir !== undefined) {
		result = result.replaceAll(CLAUDE_PROJECT_DIR, context.projectDir);
		result = result.replaceAll("$CLAUDE_PROJECT_DIR", context.projectDir);
	}
	return result;
}

export function inferPluginRootFromHooksPath(hooksPath: string): string | undefined {
	const normalized = hooksPath.replace(/\\/g, "/");
	if (normalized.endsWith("/hooks/hooks.json")) {
		return dirname(dirname(hooksPath));
	}
	return undefined;
}

export function hasUnresolvedClaudePlaceholder(value: string): boolean {
	return /\$\{CLAUDE_(PLUGIN_ROOT|PLUGIN_DATA|PROJECT_DIR)\}|\$CLAUDE_(PLUGIN_ROOT|PLUGIN_DATA|PROJECT_DIR)\b/.test(
		value,
	);
}
