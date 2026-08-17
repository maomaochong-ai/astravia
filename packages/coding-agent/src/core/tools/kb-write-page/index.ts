import { join } from "node:path";
import { type Static, Type } from "@sinclair/typebox";
import { knowledgeRoot, wikiDir } from "../../knowledge/store.js";
import { type KbWriteSession, writeKnowledgePage } from "../../knowledge/writer.js";
import type { CodingAgentTool } from "../../session/tool-scope.js";
import { loadToolDescription } from "../description.js";
import { toolCallDescriptionSchema } from "../tool-call-description.js";

const kbWritePageSchema = Type.Object({
	description: toolCallDescriptionSchema,
	path: Type.String({
		description:
			'Target wiki page path relative to wiki/, e.g. "产品/计费.md". Organize the tree by topic/semantics, not by raw source layout. Updating an existing page with a new path moves it.',
	}),
	source: Type.String({
		description: "Source grouping name (the raws/<source>/ folder this page derives from).",
	}),
	source_path: Type.String({
		description: 'Original raw file path relative to raws/, e.g. "手册/api.md".',
	}),
	source_hash: Type.String({
		description: "Content hash of the source raw file (the page's primary identity).",
	}),
	tags: Type.Array(Type.String(), {
		maxItems: 5,
		description:
			"Flat string tags, at most 5. Reuse existing tags from kb_list_available_tags when semantically close; " +
			"Chinese for concepts/domains/topics, keep only proper nouns/tech stack in their original form (kubernetes, oauth). " +
			"Coarse, reusable dimensions only (domain/topic/doc-type); no version numbers, function names, one-off proper nouns, " +
			"or info already in title/summary.",
	}),
	title: Type.String({ description: "Page title." }),
	summary: Type.String({ description: "One-line summary, surfaced in indexes navigation." }),
	body: Type.String({
		description: "Page body markdown (without frontmatter). Cross-page links go here as [[page-id]].",
	}),
	id: Type.Optional(
		Type.String({
			description:
				"Existing page id to update in place (preserves id + created_at). Provide this when reprocessing a changed source; the poller resolves it. Omit to create a new page.",
		}),
	),
});

export type KbWritePageInput = Static<typeof kbWritePageSchema>;

export interface KbWritePageDetails {
	action: "create" | "update";
	id: string;
	/** wiki 页相对 wiki/ 的路径。 */
	path: string;
	/** wiki 页的绝对路径，可直接交给 read 工具。 */
	absolutePath: string;
	movedFrom?: string;
}

/**
 * 知识库唯一写页入口。守封闭 frontmatter schema、分配稳定 id、按 source_hash/id
 * upsert，并刷新 tags.json / manifest.json 缓存。
 * @param root 知识库根目录，默认 ~/.astravia/knowledges。
 * @param session 加工轮的共享写页会话。传入则走轮级共享 PageIndex + 串行提交
 *   （避免每写一页全量 scan 的 O(N²)，并保证多并发批之间写页互斥安全）；
 *   省略则每次现扫一次（加工轮外的通用 session / UI 用）。
 */
export function createKbWritePageTool(
	root?: string,
	session?: KbWriteSession,
): CodingAgentTool<typeof kbWritePageSchema> {
	const fallbackDescription =
		"Write (create or update) a wiki page in the knowledge base. Enforces the closed frontmatter schema, " +
		"assigns a stable id, upserts by id or source_hash, and refreshes the tags/manifest caches.";
	const description = loadToolDescription("kb-write-page", fallbackDescription);

	return {
		name: "kb_write_page",
		label: "KB Write Page",
		scope_use: ["kb-processing"],
		requires: ["knowledge"],
		category: "kb-write",
		description,
		parameters: kbWritePageSchema,
		execute: async (_toolCallId, params) => {
			const resolvedRoot = knowledgeRoot(root);
			const now = new Date().toISOString();
			const result = session
				? await session.write(params, now)
				: await writeKnowledgePage(resolvedRoot, params, now);
			const absolutePath = join(wikiDir(resolvedRoot), result.path);
			const details: KbWritePageDetails = {
				action: result.action,
				id: result.id,
				path: result.path,
				absolutePath,
				movedFrom: result.movedFrom,
			};
			const moved = result.movedFrom ? ` (moved from ${result.movedFrom})` : "";
			return {
				content: [
					{
						type: "text",
						text: `kb_write_page ${result.action} ok — id=${result.id}, path=${absolutePath}${moved}`,
					},
				],
				details,
			};
		},
	};
}

export const kbWritePageTool = createKbWritePageTool();
