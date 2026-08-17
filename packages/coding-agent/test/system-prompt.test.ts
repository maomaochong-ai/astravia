import { describe, expect, test } from "vitest";
import { ASTRAVIA_CLI_GUIDANCE, buildSystemPrompt } from "../src/core/system-prompt.js";

describe("ASTRAVIA_CLI_GUIDANCE", () => {
	test("explains progressive discovery of Desktop capabilities via astravia action", () => {
		expect(ASTRAVIA_CLI_GUIDANCE).toContain(
			"use `astravia action` both to learn what Desktop can do and to operate it",
		);
		expect(ASTRAVIA_CLI_GUIDANCE).toContain("Discovery is progressive");
		expect(ASTRAVIA_CLI_GUIDANCE).toContain("authoritative inventory is always `astravia action search`");
		expect(ASTRAVIA_CLI_GUIDANCE).toContain("Do not expect CLI help to list every parameter");
	});
});

describe("buildSystemPrompt", () => {
	describe("empty tools", () => {
		test("shows (none) for empty tools list", () => {
			const prompt = buildSystemPrompt({
				selectedTools: [],
				contextFiles: [],
				skills: [],
			});

			expect(prompt).toContain("Available tools:\n(none)");
		});

		test("shows file paths guideline even with no tools", () => {
			const prompt = buildSystemPrompt({
				selectedTools: [],
				contextFiles: [],
				skills: [],
			});

			expect(prompt).toContain("MANDATORY file-link format");
		});
	});

	describe("default tools", () => {
		test("includes all default tools", () => {
			const prompt = buildSystemPrompt({
				contextFiles: [],
				skills: [],
			});

			expect(prompt).toContain("- read:");
			expect(prompt).toContain("- bash:");
			expect(prompt).toContain("- edit:");
			expect(prompt).toContain("- write:");
		});

		test("includes foreground vs background guideline when bash is selected", () => {
			const prompt = buildSystemPrompt({
				selectedTools: ["bash", "read"],
				contextFiles: [],
				skills: [],
			});

			expect(prompt).toContain("run_in_background: true");
			expect(prompt).toContain("auto-promote");
		});
	});

	describe("scenario gating of UI rendering guidelines", () => {
		test("cli scenario omits file-link badge, deliverables block, and URL link guidelines", () => {
			const prompt = buildSystemPrompt({
				selectedTools: ["read", "bash", "edit", "write"],
				contextFiles: [],
				skills: [],
				scenario: "cli",
			});

			expect(prompt).not.toContain("MANDATORY file-link format");
			expect(prompt).not.toContain("deliverables block");
			expect(prompt).not.toContain("Render web URLs");
		});

		test("desktop scenarios keep rendering guidelines", () => {
			for (const scenario of ["conversation", "project", "batch", "automation", "im-claw"] as const) {
				const prompt = buildSystemPrompt({
					selectedTools: ["read", "bash", "edit", "write"],
					contextFiles: [],
					skills: [],
					scenario,
				});

				expect(prompt).toContain("MANDATORY file-link format");
				expect(prompt).toContain("deliverables block");
			}
		});

		test("unset scenario keeps rendering guidelines (legacy SDK behavior)", () => {
			const prompt = buildSystemPrompt({
				selectedTools: ["read", "bash"],
				contextFiles: [],
				skills: [],
			});

			expect(prompt).toContain("MANDATORY file-link format");
		});
	});

	describe("context files", () => {
		test("prepends AGENTS.md scoping rules when context files exist", () => {
			const prompt = buildSystemPrompt({
				selectedTools: ["read"],
				contextFiles: [{ path: "AGENTS.md", content: "Use bun." }],
				skills: [],
			});

			expect(prompt).toContain("Scoping rules:");
			expect(prompt).toContain("more deeply nested files take precedence");
			expect(prompt).toContain("## AGENTS.md");
		});

		test("no scoping rules without context files", () => {
			const prompt = buildSystemPrompt({
				selectedTools: ["read"],
				contextFiles: [],
				skills: [],
			});

			expect(prompt).not.toContain("Scoping rules:");
		});
	});

	describe("plugin tools", () => {
		const agentPlugins = {
			toolContributions: [
				{
					pluginId: "fiction",
					id: "write-chapter-file",
					name: "novel_write_chapter_file",
					description: "Write a generated novel chapter to a project file",
					parameters: {},
					handlerId: "writeChapterFile",
				},
			],
		};

		test("includes plugin tool descriptions in the default prompt", () => {
			const prompt = buildSystemPrompt({
				selectedTools: ["novel_write_chapter_file"],
				contextFiles: [],
				skills: [],
				agentPlugins,
			});

			expect(prompt).toContain("- novel_write_chapter_file: Write a generated novel chapter to a project file");
		});

		test("keeps plugin tool descriptions when a custom system prompt is used", () => {
			const prompt = buildSystemPrompt({
				customPrompt: "You are a fiction writing assistant.",
				selectedTools: ["novel_write_chapter_file"],
				contextFiles: [],
				skills: [],
				agentPlugins,
			});

			expect(prompt).toContain("You are a fiction writing assistant.");
			expect(prompt).toContain("Available tools:\n- novel_write_chapter_file:");
		});
	});
});
