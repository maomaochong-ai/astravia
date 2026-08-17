/**
 * Skill command expansion.
 *
 * Extracted from AgentSession to keep the facade thin. These are pure-ish
 * functions: they read skills from disk, but all dependencies are passed in
 * explicitly.
 */

import { readFileSync } from "node:fs";
import { stripFrontmatter } from "../../utils/frontmatter.js";
import type { ResourceLoader } from "../resource-loader.js";
import type { PromptResourceRef } from "./types.js";

/** Parsed skill block from a user message */
export interface ParsedSkillBlock {
	name: string;
	location: string;
	content: string;
	userMessage: string | undefined;
}

/**
 * Parse a skill block from message text.
 * Returns null if the text doesn't contain a skill block.
 */
export function parseSkillBlock(text: string): ParsedSkillBlock | null {
	const match = text.match(/^<skill name="([^"]+)" location="([^"]+)">\n([\s\S]*?)\n<\/skill>(?:\n\n([\s\S]+))?$/);
	if (!match) return null;
	return {
		name: match[1],
		location: match[2],
		content: match[3],
		userMessage: match[4]?.trim() || undefined,
	};
}

/** Result of expanding a skill command. */
export interface SkillExpansionResult {
	text: string;
	skillInjection?: string;
	promptRef?: PromptResourceRef;
}

/** Dependencies required to expand skill commands. */
export interface SkillExpansionDeps {
	resourceLoader: ResourceLoader;
	/** Emit an error (typically via the extension runner). Best-effort. */
	emitError?: (error: { extensionPath: string; event: string; error: string }) => void;
}

/**
 * Expand a skill command (/skill:name args) to its full content.
 * Returns the expanded text, or the original text if not a skill command or not found.
 * Emits errors via deps.emitError if file read fails.
 */
function expandPromptResource(
	text: string,
	promptRef: PromptResourceRef,
	deps: SkillExpansionDeps,
	options: { structured: boolean; legacyArgs?: string },
): SkillExpansionResult {
	const { resourceLoader } = deps;
	const name = promptRef.name.trim();
	const allSkills = resourceLoader.getSkills().skills;
	const skill = allSkills.find((s) => s.name === name);
	if (!skill) {
		console.info("[skills] expand miss", { kind: promptRef.kind, name });
		return options.structured ? { text, promptRef } : { text }; // Missing structured refs are normal (e.g. uninstalled).
	}

	try {
		const content = readFileSync(skill.filePath, "utf-8");
		const body = stripFrontmatter(content).trim();

		// Inject the expanded block as a hidden custom message. Legacy commands keep
		// their shorthand in text; structured callers provide clean user text and
		// persist the reference in custom-message details.
		const skillBlock = `<skill name="${skill.name}" location="${skill.filePath}">\nReferences are relative to ${skill.baseDir}.\n\n${body}\n</skill>`;
		console.info("[skills] expand", {
			kind: "skill",
			name: skill.name,
			source: skill.source,
			path: skill.filePath,
			hasArgs: Boolean(options.legacyArgs),
		});
		return { text, skillInjection: skillBlock, promptRef };
	} catch (err) {
		const error = err instanceof Error ? err.message : String(err);
		console.info("[skills] expand error", {
			kind: "skill",
			name: skill.name,
			path: skill.filePath,
			error,
		});
		deps.emitError?.({
			extensionPath: skill.filePath,
			event: "skill_expansion",
			error,
		});
		return options.structured ? { text, promptRef } : { text }; // Keep structured metadata, skip unavailable content.
	}
}

/** Expand a structured top-level Skill reference when the resource is available. */
export function expandSkillReference(
	text: string,
	promptRef: PromptResourceRef,
	deps: SkillExpansionDeps,
): SkillExpansionResult {
	const name = promptRef.name.trim();
	if (!name) throw new Error("Prompt resource name must not be empty");
	return expandPromptResource(text, { ...promptRef, name }, deps, { structured: true });
}

export function expandSkillCommand(text: string, deps: SkillExpansionDeps): SkillExpansionResult {
	if (!text.startsWith("/skill:")) return { text };

	const rest = text.slice("/skill:".length);
	const sepMatch = rest.match(/[\s]/);
	const name = sepMatch ? rest.slice(0, sepMatch.index) : rest;
	const args = sepMatch ? rest.slice(sepMatch.index!).trim() : "";
	return expandPromptResource(text, { kind: "skill", name }, deps, { structured: false, legacyArgs: args });
}
