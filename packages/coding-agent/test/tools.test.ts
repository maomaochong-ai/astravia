import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bashTool, createBashTool } from "../src/core/tools/bash/index.js";
import { createEditTool, editTool } from "../src/core/tools/edit/index.js";
import { findTool } from "../src/core/tools/find/index.js";
import { grepTool } from "../src/core/tools/grep/index.js";
import { lsTool } from "../src/core/tools/ls/index.js";
import { readTool } from "../src/core/tools/read/index.js";
import { treeTool } from "../src/core/tools/tree/index.js";
import { createWriteTool, writeTool } from "../src/core/tools/write/index.js";
import * as shellModule from "../src/utils/shell.js";

// Helper to extract text from content blocks
function getTextOutput(result: any): string {
	return (
		result.content
			?.filter((c: any) => c.type === "text")
			.map((c: any) => c.text)
			.join("\n") || ""
	);
}

describe("Coding Agent Tools", () => {
	let testDir: string;

	beforeEach(() => {
		// Create a unique temporary directory for each test
		testDir = join(tmpdir(), `coding-agent-test-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });
	});

	afterEach(() => {
		// Clean up test directory
		rmSync(testDir, { recursive: true, force: true });
	});

	describe("read tool", () => {
		it("should read file contents that fit within limits", async () => {
			const testFile = join(testDir, "test.txt");
			const content = "Hello, world!\nLine 2\nLine 3";
			writeFileSync(testFile, content);

			const result = await readTool.execute("test-call-1", { path: testFile });

			// 每行带锚点前缀 `line:hash→content`
			const output = getTextOutput(result);
			const lines = output.split("\n");
			expect(lines).toHaveLength(3);
			expect(lines[0]).toMatch(/^1:[0-9a-z]{4}→Hello, world!$/);
			expect(lines[1]).toMatch(/^2:[0-9a-z]{4}→Line 2$/);
			expect(lines[2]).toMatch(/^3:[0-9a-z]{4}→Line 3$/);
			// No truncation message since file fits within limits
			expect(output).not.toContain("Use offset=");
			expect(result.details).toBeUndefined();
		});

		it("should read GB18030 text when the file is not valid UTF-8", async () => {
			const testFile = join(testDir, "gb18030.txt");
			writeFileSync(testFile, Buffer.from([0xd6, 0xd0, 0xce, 0xc4, 0xb2, 0xe2, 0xca, 0xd4]));

			const result = await readTool.execute("test-call-gb18030", { path: testFile });

			expect(getTextOutput(result)).toMatch(/^1:[0-9a-z]{4}→中文测试$/);
		});

		it("should handle non-existent files", async () => {
			const testFile = join(testDir, "nonexistent.txt");

			await expect(readTool.execute("test-call-2", { path: testFile })).rejects.toThrow(/ENOENT|not found/i);
		});

		it("should truncate files exceeding line limit", async () => {
			const testFile = join(testDir, "large.txt");
			const lines = Array.from({ length: 2500 }, (_, i) => `Line ${i + 1}`);
			writeFileSync(testFile, lines.join("\n"));

			const result = await readTool.execute("test-call-3", { path: testFile });
			const output = getTextOutput(result);

			expect(output).toContain("Line 1");
			expect(output).toContain("Line 2000");
			expect(output).not.toContain("Line 2001");
			expect(output).toContain("[Showing lines 1-2000 of 2500. Use offset=2001 to continue.]");
		});

		it("should truncate when byte limit exceeded", async () => {
			const testFile = join(testDir, "large-bytes.txt");
			// Create file that exceeds 50KB byte limit but has fewer than 2000 lines
			const lines = Array.from({ length: 500 }, (_, i) => `Line ${i + 1}: ${"x".repeat(200)}`);
			writeFileSync(testFile, lines.join("\n"));

			const result = await readTool.execute("test-call-4", { path: testFile });
			const output = getTextOutput(result);

			expect(output).toContain("Line 1:");
			// Should show byte limit message
			expect(output).toMatch(/\[Showing lines 1-\d+ of 500 \(.* limit\)\. Use offset=\d+ to continue\.\]/);
		});

		it("should handle offset parameter", async () => {
			const testFile = join(testDir, "offset-test.txt");
			const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`);
			writeFileSync(testFile, lines.join("\n"));

			const result = await readTool.execute("test-call-5", { path: testFile, offset: 51 });
			const output = getTextOutput(result);

			expect(output).not.toContain("Line 50");
			expect(output).toContain("Line 51");
			expect(output).toContain("Line 100");
			// No truncation message since file fits within limits
			expect(output).not.toContain("Use offset=");
		});

		it("should handle limit parameter", async () => {
			const testFile = join(testDir, "limit-test.txt");
			const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`);
			writeFileSync(testFile, lines.join("\n"));

			const result = await readTool.execute("test-call-6", { path: testFile, limit: 10 });
			const output = getTextOutput(result);

			expect(output).toContain("Line 1");
			expect(output).toContain("Line 10");
			expect(output).not.toContain("Line 11");
			expect(output).toContain("[90 more lines in file. Use offset=11 to continue.]");
		});

		it("should handle offset + limit together", async () => {
			const testFile = join(testDir, "offset-limit-test.txt");
			const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`);
			writeFileSync(testFile, lines.join("\n"));

			const result = await readTool.execute("test-call-7", {
				path: testFile,
				offset: 41,
				limit: 20,
			});
			const output = getTextOutput(result);

			expect(output).not.toContain("Line 40");
			expect(output).toContain("Line 41");
			expect(output).toContain("Line 60");
			expect(output).not.toContain("Line 61");
			expect(output).toContain("[40 more lines in file. Use offset=61 to continue.]");
		});

		it("should show error when offset is beyond file length", async () => {
			const testFile = join(testDir, "short.txt");
			writeFileSync(testFile, "Line 1\nLine 2\nLine 3");

			await expect(readTool.execute("test-call-8", { path: testFile, offset: 100 })).rejects.toThrow(
				/Offset 100 is beyond end of file \(3 lines total\)/,
			);
		});

		it("should include truncation details when truncated", async () => {
			const testFile = join(testDir, "large-file.txt");
			const lines = Array.from({ length: 2500 }, (_, i) => `Line ${i + 1}`);
			writeFileSync(testFile, lines.join("\n"));

			const result = await readTool.execute("test-call-9", { path: testFile });

			expect(result.details).toBeDefined();
			expect(result.details?.truncation).toBeDefined();
			expect(result.details?.truncation?.truncated).toBe(true);
			expect(result.details?.truncation?.truncatedBy).toBe("lines");
			expect(result.details?.truncation?.totalLines).toBe(2500);
			expect(result.details?.truncation?.outputLines).toBe(2000);
		});

		it("should detect image MIME type from file magic (not extension)", async () => {
			const png1x1Base64 =
				"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2Z0AAAAASUVORK5CYII=";
			const pngBuffer = Buffer.from(png1x1Base64, "base64");

			const testFile = join(testDir, "image.txt");
			writeFileSync(testFile, pngBuffer);

			const result = await readTool.execute("test-call-img-1", { path: testFile });

			expect(result.content[0]?.type).toBe("text");
			expect(getTextOutput(result)).toContain("Read image file [image/png]");

			const imageBlock = result.content.find(
				(c): c is { type: "image"; mimeType: string; data: string } => c.type === "image",
			);
			expect(imageBlock).toBeDefined();
			expect(imageBlock?.mimeType).toBe("image/png");
			expect(typeof imageBlock?.data).toBe("string");
			expect((imageBlock?.data ?? "").length).toBeGreaterThan(0);
		});

		it("should treat files with image extension but non-image content as text", async () => {
			const testFile = join(testDir, "not-an-image.png");
			writeFileSync(testFile, "definitely not a png");

			const result = await readTool.execute("test-call-img-2", { path: testFile });
			const output = getTextOutput(result);

			expect(output).toContain("definitely not a png");
			expect(result.content.some((c: any) => c.type === "image")).toBe(false);
		});

		it("should not return raw bytes for binary document files", async () => {
			const docxLikeFile = join(testDir, "spec.docx");
			// ZIP header bytes (DOCX container format)
			writeFileSync(docxLikeFile, Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]));

			const result = await readTool.execute("test-call-binary-docx", { path: docxLikeFile });
			const output = getTextOutput(result);

			expect(output).toContain("Binary file detected");
			expect(output).toContain(".docx");
			expect(output).toContain("not shown to avoid context pollution");
			expect(output).toContain("DOCX/Word extraction tool/skill");
		});
	});

	describe("write tool", () => {
		it("should write file contents", async () => {
			const testFile = join(testDir, "write-test.txt");
			const content = "Test content";

			const result = await writeTool.execute("test-call-3", { path: testFile, content });

			expect(getTextOutput(result)).toContain("Successfully wrote");
			expect(getTextOutput(result)).toContain(testFile);
			expect(result.details).toBeUndefined();
		});

		it("should create parent directories", async () => {
			const testFile = join(testDir, "nested", "dir", "test.txt");
			const content = "Nested content";

			const result = await writeTool.execute("test-call-4", { path: testFile, content });

			expect(getTextOutput(result)).toContain("Successfully wrote");
		});

		it("should write content verbatim without rewriting path-like literals", async () => {
			writeFileSync(join(testDir, "招标文件-发布稿.docx"), "docx");
			const write = createWriteTool(testDir);
			const target = join(testDir, "script.js");

			await write.execute("test-call-write-path-fix", {
				path: target,
				content: 'const filePath = "招标文件 - 发布稿.docx";\n',
			});

			const written = readFileSync(target, "utf-8");
			expect(written).toContain('const filePath = "招标文件 - 发布稿.docx";');
		});
	});

	describe("edit tool", () => {
		it("should replace text in file", async () => {
			const testFile = join(testDir, "edit-test.txt");
			const originalContent = "Hello, world!";
			writeFileSync(testFile, originalContent);

			const result = await editTool.execute("test-call-5", {
				path: testFile,
				oldText: "world",
				newText: "testing",
			});

			expect(getTextOutput(result)).toContain("Successfully replaced");
			expect(result.details).toBeDefined();
			expect(result.details.diff).toBeDefined();
			expect(typeof result.details.diff).toBe("string");
			expect(result.details.diff).toContain("testing");
		});

		it("should fail if text not found", async () => {
			const testFile = join(testDir, "edit-test.txt");
			const originalContent = "Hello, world!";
			writeFileSync(testFile, originalContent);

			await expect(
				editTool.execute("test-call-6", {
					path: testFile,
					oldText: "nonexistent",
					newText: "testing",
				}),
			).rejects.toThrow(/Could not find the exact text/);
		});

		it("should fail if text appears multiple times", async () => {
			const testFile = join(testDir, "edit-test.txt");
			const originalContent = "foo foo foo";
			writeFileSync(testFile, originalContent);

			await expect(
				editTool.execute("test-call-7", {
					path: testFile,
					oldText: "foo",
					newText: "bar",
				}),
			).rejects.toThrow(/Found 3 occurrences/);
		});

		it("should write replacement text verbatim without rewriting path-like literals", async () => {
			writeFileSync(join(testDir, "招标文件-发布稿.docx"), "docx");
			const edit = createEditTool(testDir);
			const testFile = join(testDir, "edit-path-literal.js");
			writeFileSync(testFile, 'const filePath = "placeholder.docx";\n');

			await edit.execute("test-call-edit-path-fix", {
				path: testFile,
				oldText: '"placeholder.docx"',
				newText: '"招标文件 - 发布稿.docx"',
			});

			const updated = readFileSync(testFile, "utf-8");
			expect(updated).toContain('const filePath = "招标文件 - 发布稿.docx";');
		});
	});

	describe("bash tool", () => {
		it("should execute simple commands", async () => {
			const result = await bashTool.execute("test-call-8", { command: "echo 'test output'" });

			expect(getTextOutput(result)).toContain("test output");
			expect(result.details).toBeUndefined();
		});

		it("should handle command errors", async () => {
			await expect(bashTool.execute("test-call-9", { command: "exit 1" })).rejects.toThrow(
				/(Command failed|code 1)/,
			);
		});

		it("should respect timeout", async () => {
			await expect(bashTool.execute("test-call-10", { command: "sleep 5", timeout: 1 })).rejects.toThrow(
				/timed out/i,
			);
		});

		it("should throw error when cwd does not exist", async () => {
			const nonexistentCwd = "/this/directory/definitely/does/not/exist/12345";

			const bashToolWithBadCwd = createBashTool(nonexistentCwd);

			await expect(bashToolWithBadCwd.execute("test-call-11", { command: "echo test" })).rejects.toThrow(
				/Working directory does not exist/,
			);
		});

		it("should handle process spawn errors", async () => {
			vi.spyOn(shellModule, "getShellConfig").mockReturnValueOnce({
				shell: "/nonexistent-shell-path-xyz123",
				args: ["-c"],
			});

			const bashWithBadShell = createBashTool(testDir);

			await expect(bashWithBadShell.execute("test-call-12", { command: "echo test" })).rejects.toThrow(/ENOENT/);
		});

		it("should prepend command prefix when configured", async () => {
			const bashWithPrefix = createBashTool(testDir, {
				commandPrefix: "export TEST_VAR=hello",
			});

			const result = await bashWithPrefix.execute("test-prefix-1", { command: "echo $TEST_VAR" });
			expect(getTextOutput(result).trim()).toBe("hello");
		});

		it("should include output from both prefix and command", async () => {
			const bashWithPrefix = createBashTool(testDir, {
				commandPrefix: "echo prefix-output",
			});

			const result = await bashWithPrefix.execute("test-prefix-2", { command: "echo command-output" });
			expect(getTextOutput(result).trim()).toBe("prefix-output\ncommand-output");
		});

		it("should work without command prefix", async () => {
			const bashWithoutPrefix = createBashTool(testDir, {});

			const result = await bashWithoutPrefix.execute("test-prefix-3", { command: "echo no-prefix" });
			expect(getTextOutput(result).trim()).toBe("no-prefix");
		});

		it("should compose shell command prefixes in execution order", () => {
			const command = shellModule.prependCommandPrefixes("echo command", ["echo default", "echo user"]);

			expect(command).toBe("echo default\necho user\necho command");
		});

		it("should autocorrect quoted file paths with injected spaces around hyphens", async () => {
			const filename = "招标文件-发布稿.txt";
			writeFileSync(join(testDir, filename), "ok-path");
			const bash = createBashTool(testDir);

			const result = await bash.execute("test-bash-path-fix-1", {
				command: 'cat "招标文件 - 发布稿.txt"',
			});

			expect(getTextOutput(result)).toContain("ok-path");
			expect(result.details?.pathCorrections).toEqual([
				{
					original: "招标文件 - 发布稿.txt",
					corrected: "招标文件-发布稿.txt",
				},
			]);
		});

		it("should reject shell file-discovery commands in favor of built-in tools", async () => {
			await expect(bashTool.execute("test-bash-guard-1", { command: "tree ." })).rejects.toThrow(
				/use built-in tools \(`dir_tree`, `find`, `ls`\)/i,
			);
		});
	});

	describe("grep tool", () => {
		it("should include filename when searching a single file", async () => {
			const testFile = join(testDir, "example.txt");
			writeFileSync(testFile, "first line\nmatch line\nlast line");

			const result = await grepTool.execute("test-call-11", {
				pattern: "match",
				path: testFile,
			});

			const output = getTextOutput(result);
			// 行号后带锚点哈希：`path:line:hash: content`
			expect(output).toMatch(/example\.txt:2:[0-9a-z]{4}: match line/);
		});

		it("should respect global limit and include context lines", async () => {
			const testFile = join(testDir, "context.txt");
			const content = ["before", "match one", "after", "middle", "match two", "after two"].join("\n");
			writeFileSync(testFile, content);

			const result = await grepTool.execute("test-call-12", {
				pattern: "match",
				path: testFile,
				limit: 1,
				context: 1,
			});

			const output = getTextOutput(result);
			expect(output).toMatch(/context\.txt-1:[0-9a-z]{4}- before/);
			expect(output).toMatch(/context\.txt:2:[0-9a-z]{4}: match one/);
			expect(output).toMatch(/context\.txt-3:[0-9a-z]{4}- after/);
			expect(output).toContain("[1 matches limit reached. Use limit=2 for more, or refine pattern]");
			// Ensure second match is not present
			expect(output).not.toContain("match two");
		});
	});

	describe("find tool", () => {
		it("should include hidden files that are not gitignored", async () => {
			const hiddenDir = join(testDir, ".secret");
			mkdirSync(hiddenDir);
			writeFileSync(join(hiddenDir, "hidden.txt"), "hidden");
			writeFileSync(join(testDir, "visible.txt"), "visible");

			const result = await findTool.execute("test-call-13", {
				pattern: "**/*.txt",
				path: testDir,
			});

			const outputLines = getTextOutput(result)
				.split("\n")
				.map((line) => line.trim())
				.filter(Boolean);

			expect(outputLines).toContain("visible.txt");
			expect(outputLines).toContain(".secret/hidden.txt");
		});

		it("should respect .gitignore", async () => {
			writeFileSync(join(testDir, ".gitignore"), "ignored.txt\n");
			writeFileSync(join(testDir, "ignored.txt"), "ignored");
			writeFileSync(join(testDir, "kept.txt"), "kept");

			const result = await findTool.execute("test-call-14", {
				pattern: "**/*.txt",
				path: testDir,
			});

			const output = getTextOutput(result);
			expect(output).toContain("kept.txt");
			expect(output).not.toContain("ignored.txt");
		});
	});

	describe("ls tool", () => {
		it("should list dotfiles and directories", async () => {
			writeFileSync(join(testDir, ".hidden-file"), "secret");
			mkdirSync(join(testDir, ".hidden-dir"));

			const result = await lsTool.execute("test-call-15", { path: testDir });
			const output = getTextOutput(result);

			expect(output).toContain(".hidden-file");
			expect(output).toContain(".hidden-dir/");
		});
	});

	describe("dir_tree tool", () => {
		it("should expose dir_tree as tool name", () => {
			expect(treeTool.name).toBe("dir_tree");
		});

		it("should render [D]/[F] nodes with directory counts", async () => {
			mkdirSync(join(testDir, "src", "core"), { recursive: true });
			writeFileSync(join(testDir, "src", "core", "index.ts"), "export {};\n");
			writeFileSync(join(testDir, "README.md"), "# Test\n");

			const result = await treeTool.execute("test-call-tree-1", {
				path: testDir,
				maxDepth: 5,
			});
			const output = getTextOutput(result);

			expect(output).toContain("[D]");
			expect(output).toContain("[F]");
			expect(output).toContain("(d:");
			expect(output).toContain("src");
			expect(output).toContain("README.md");
		});

		it("should support directory-only mode", async () => {
			mkdirSync(join(testDir, "packages", "a"), { recursive: true });
			writeFileSync(join(testDir, "packages", "a", "file.ts"), "const x = 1;\n");

			const result = await treeTool.execute("test-call-tree-2", {
				path: testDir,
				includeFiles: false,
				maxDepth: 5,
			});
			const output = getTextOutput(result);

			expect(output).toContain("[D]");
			expect(output).not.toContain("[F]");
			expect(output).toContain("packages");
		});
	});
});

describe("edit tool fuzzy matching", () => {
	let testDir: string;

	beforeEach(() => {
		testDir = join(tmpdir(), `coding-agent-fuzzy-test-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	it("should match text with trailing whitespace stripped", async () => {
		const testFile = join(testDir, "trailing-ws.txt");
		// File has trailing spaces on lines
		writeFileSync(testFile, "line one   \nline two  \nline three\n");

		// oldText without trailing whitespace should still match
		const result = await editTool.execute("test-fuzzy-1", {
			path: testFile,
			oldText: "line one\nline two\n",
			newText: "replaced\n",
		});

		expect(getTextOutput(result)).toContain("Successfully replaced");
		const content = readFileSync(testFile, "utf-8");
		expect(content).toBe("replaced\nline three\n");
	});

	it("should match smart single quotes to ASCII quotes", async () => {
		const testFile = join(testDir, "smart-quotes.txt");
		// File has smart/curly single quotes (U+2018, U+2019)
		writeFileSync(testFile, "console.log(\u2018hello\u2019);\n");

		// oldText with ASCII quotes should match
		const result = await editTool.execute("test-fuzzy-2", {
			path: testFile,
			oldText: "console.log('hello');",
			newText: "console.log('world');",
		});

		expect(getTextOutput(result)).toContain("Successfully replaced");
		const content = readFileSync(testFile, "utf-8");
		expect(content).toContain("world");
	});

	it("should match smart double quotes to ASCII quotes", async () => {
		const testFile = join(testDir, "smart-double-quotes.txt");
		// File has smart/curly double quotes (U+201C, U+201D)
		writeFileSync(testFile, "const msg = \u201CHello World\u201D;\n");

		// oldText with ASCII quotes should match
		const result = await editTool.execute("test-fuzzy-3", {
			path: testFile,
			oldText: 'const msg = "Hello World";',
			newText: 'const msg = "Goodbye";',
		});

		expect(getTextOutput(result)).toContain("Successfully replaced");
		const content = readFileSync(testFile, "utf-8");
		expect(content).toContain("Goodbye");
	});

	it("should match Unicode dashes to ASCII hyphen", async () => {
		const testFile = join(testDir, "unicode-dashes.txt");
		// File has en-dash (U+2013) and em-dash (U+2014)
		writeFileSync(testFile, "range: 1\u20135\nbreak\u2014here\n");

		// oldText with ASCII hyphens should match
		const result = await editTool.execute("test-fuzzy-4", {
			path: testFile,
			oldText: "range: 1-5\nbreak-here",
			newText: "range: 10-50\nbreak--here",
		});

		expect(getTextOutput(result)).toContain("Successfully replaced");
		const content = readFileSync(testFile, "utf-8");
		expect(content).toContain("10-50");
	});

	it("should match non-breaking space to regular space", async () => {
		const testFile = join(testDir, "nbsp.txt");
		// File has non-breaking space (U+00A0)
		writeFileSync(testFile, "hello\u00A0world\n");

		// oldText with regular space should match
		const result = await editTool.execute("test-fuzzy-5", {
			path: testFile,
			oldText: "hello world",
			newText: "hello universe",
		});

		expect(getTextOutput(result)).toContain("Successfully replaced");
		const content = readFileSync(testFile, "utf-8");
		expect(content).toContain("universe");
	});

	it("should prefer exact match over fuzzy match", async () => {
		const testFile = join(testDir, "exact-preferred.txt");
		// File has both exact and fuzzy-matchable content
		writeFileSync(testFile, "const x = 'exact';\nconst y = 'other';\n");

		const result = await editTool.execute("test-fuzzy-6", {
			path: testFile,
			oldText: "const x = 'exact';",
			newText: "const x = 'changed';",
		});

		expect(getTextOutput(result)).toContain("Successfully replaced");
		const content = readFileSync(testFile, "utf-8");
		expect(content).toBe("const x = 'changed';\nconst y = 'other';\n");
	});

	it("should still fail when text is not found even with fuzzy matching", async () => {
		const testFile = join(testDir, "no-match.txt");
		writeFileSync(testFile, "completely different content\n");

		await expect(
			editTool.execute("test-fuzzy-7", {
				path: testFile,
				oldText: "this does not exist",
				newText: "replacement",
			}),
		).rejects.toThrow(/Could not find the exact text/);
	});

	it("should detect duplicates after fuzzy normalization", async () => {
		const testFile = join(testDir, "fuzzy-dups.txt");
		// Two lines that are identical after trailing whitespace is stripped
		writeFileSync(testFile, "hello world   \nhello world\n");

		await expect(
			editTool.execute("test-fuzzy-8", {
				path: testFile,
				oldText: "hello world",
				newText: "replaced",
			}),
		).rejects.toThrow(/Found 2 occurrences/);
	});
});

describe("edit tool CRLF handling", () => {
	let testDir: string;

	beforeEach(() => {
		testDir = join(tmpdir(), `coding-agent-crlf-test-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	it("should match LF oldText against CRLF file content", async () => {
		const testFile = join(testDir, "crlf-test.txt");

		writeFileSync(testFile, "line one\r\nline two\r\nline three\r\n");

		const result = await editTool.execute("test-crlf-1", {
			path: testFile,
			oldText: "line two\n",
			newText: "replaced line\n",
		});

		expect(getTextOutput(result)).toContain("Successfully replaced");
	});

	it("should preserve CRLF line endings after edit", async () => {
		const testFile = join(testDir, "crlf-preserve.txt");
		writeFileSync(testFile, "first\r\nsecond\r\nthird\r\n");

		await editTool.execute("test-crlf-2", {
			path: testFile,
			oldText: "second\n",
			newText: "REPLACED\n",
		});

		const content = readFileSync(testFile, "utf-8");
		expect(content).toBe("first\r\nREPLACED\r\nthird\r\n");
	});

	it("should preserve LF line endings for LF files", async () => {
		const testFile = join(testDir, "lf-preserve.txt");
		writeFileSync(testFile, "first\nsecond\nthird\n");

		await editTool.execute("test-lf-1", {
			path: testFile,
			oldText: "second\n",
			newText: "REPLACED\n",
		});

		const content = readFileSync(testFile, "utf-8");
		expect(content).toBe("first\nREPLACED\nthird\n");
	});

	it("should detect duplicates across CRLF/LF variants", async () => {
		const testFile = join(testDir, "mixed-endings.txt");

		writeFileSync(testFile, "hello\r\nworld\r\n---\r\nhello\nworld\n");

		await expect(
			editTool.execute("test-crlf-dup", {
				path: testFile,
				oldText: "hello\nworld\n",
				newText: "replaced\n",
			}),
		).rejects.toThrow(/Found 2 occurrences/);
	});

	it("should preserve UTF-8 BOM after edit", async () => {
		const testFile = join(testDir, "bom-test.txt");
		writeFileSync(testFile, "\uFEFFfirst\r\nsecond\r\nthird\r\n");

		await editTool.execute("test-bom", {
			path: testFile,
			oldText: "second\n",
			newText: "REPLACED\n",
		});

		const content = readFileSync(testFile, "utf-8");
		expect(content).toBe("\uFEFFfirst\r\nREPLACED\r\nthird\r\n");
	});
});
