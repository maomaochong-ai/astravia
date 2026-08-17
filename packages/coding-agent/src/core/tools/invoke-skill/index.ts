import { type Static, Type } from "@sinclair/typebox";
import { readFileSync } from "fs";
import { stripFrontmatter } from "../../../utils/frontmatter.js";
import type { CodingAgentTool } from "../../session/tool-scope.js";
import type { Skill } from "../../skills.js";
import { loadToolDescription } from "../description.js";
import { toolCallDescriptionSchema } from "../tool-call-description.js";

const invokeSkillSchema = Type.Object({
	description: toolCallDescriptionSchema,
	name: Type.String({
		description: 'The exact skill name from <available_skills> (e.g., "pdf", "docx", "xlsx")',
	}),
	args: Type.Optional(
		Type.String({
			description: "Optional arguments to pass to the skill",
		}),
	),
});

export type InvokeSkillToolInput = Static<typeof invokeSkillSchema>;

export interface InvokeSkillToolDetails {
	skillName: string;
	skillLocation: string;
}

export interface InvokeSkillToolOptions {
	/** Function to resolve available skills at execution time */
	getSkills: () => Skill[];
}

export function createInvokeSkillTool(options: InvokeSkillToolOptions): CodingAgentTool<typeof invokeSkillSchema> {
	const fallbackDescription =
		"Invoke a skill by name. Use this tool when the user's request matches a skill in <available_skills>.";
	const description = loadToolDescription("invoke-skill", fallbackDescription);

	return {
		name: "invoke_skill",
		label: "invoke_skill",
		scope_use: ["im-claw", "conversation", "project", "batch", "automation", "kb-processing", "cli"],
		category: "agent-control",
		description,
		parameters: invokeSkillSchema,
		execute: async (_toolCallId: string, { name, args }: { name: string; args?: string }) => {
			const skills = options.getSkills();
			const skill = skills.find((s) => s.name === name);

			if (!skill) {
				const availableNames = skills.filter((s) => !s.disableModelInvocation).map((s) => s.name);
				console.info("[skills] invoke miss", { name, available: availableNames.length });
				return {
					content: [
						{
							type: "text" as const,
							text: `Error: Skill "${name}" not found. Available skills: ${availableNames.join(", ") || "(none)"}`,
						},
					],
					details: { skillName: name, skillLocation: "" },
				};
			}

			try {
				const rawContent = readFileSync(skill.filePath, "utf-8");
				const body = stripFrontmatter(rawContent).trim();

				const lines: string[] = [
					`<skill name="${skill.name}" location="${skill.filePath}">`,
					"",
					`SKILL_DIR="${skill.baseDir}"`,
					"ALL relative paths (scripts/, references/, Samples/, assets/, etc.) in this skill MUST be resolved against SKILL_DIR using absolute paths.",
					'For example: bash "$SKILL_DIR/scripts/run.sh" — do NOT cd into SKILL_DIR.',
					"NEVER guess or fabricate paths. NEVER use find/locate/mdfind to search for skill files.",
					"",
					"CRITICAL: The skill directory is READ-ONLY. NEVER write, create, or modify any files inside SKILL_DIR.",
					"NEVER cd into SKILL_DIR. Stay in the user's working directory (cwd) at all times.",
					"All output files and artifacts MUST be written to cwd, NOT into the skill directory.",
					"",
					body,
					`</skill>`,
				];

				if (args) {
					lines.push("", `User arguments: ${args}`);
				}

				console.info("[skills] invoke", {
					name: skill.name,
					source: skill.source,
					path: skill.filePath,
					hasArgs: Boolean(args),
				});
				return {
					content: [{ type: "text" as const, text: lines.join("\n") }],
					details: { skillName: skill.name, skillLocation: skill.filePath },
				};
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				console.info("[skills] invoke error", { name, path: skill.filePath, error: message });
				return {
					content: [
						{
							type: "text" as const,
							text: `Error reading skill "${name}" from ${skill.filePath}: ${message}`,
						},
					],
					details: { skillName: name, skillLocation: skill.filePath },
				};
			}
		},
	};
}
