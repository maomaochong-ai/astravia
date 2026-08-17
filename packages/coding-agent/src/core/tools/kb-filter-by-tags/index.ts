import { join } from "node:path";
import { type Static, Type } from "@sinclair/typebox";
import { queryByTags } from "../../knowledge/query.js";
import { knowledgeRoot, wikiDir } from "../../knowledge/store.js";
import type { CodingAgentTool } from "../../session/tool-scope.js";
import { loadToolDescription } from "../description.js";
import { toolCallDescriptionSchema } from "../tool-call-description.js";

const kbFilterByTagsSchema = Type.Object({
	description: toolCallDescriptionSchema,
	all: Type.Optional(
		Type.Array(Type.String(), {
			description: "Intersection: page must contain ALL of these tags.",
		}),
	),
	any: Type.Optional(
		Type.Array(Type.String(), {
			description: "Union: page must contain AT LEAST ONE of these tags.",
		}),
	),
	none: Type.Optional(
		Type.Array(Type.String(), {
			description: "Complement: page must contain NONE of these tags.",
		}),
	),
});

export type KbFilterByTagsInput = Static<typeof kbFilterByTagsSchema>;

export interface KbFilterByTagsDetails {
	count: number;
	pages: Array<{ id: string; path: string; absolutePath: string; title: string; summary: string; tags: string[] }>;
}

/**
 * 按标签交/并/补过滤知识库 wiki 页。检索捷径，非必经路（也可走 indexes 或渐进探索）。
 * @param root 知识库根目录，默认 ~/.astravia/knowledges。
 */
export function createKbFilterByTagsTool(root?: string): CodingAgentTool<typeof kbFilterByTagsSchema> {
	const fallbackDescription =
		"Filter knowledge base wiki pages by tags using set algebra (all=AND, any=OR, none=NOT). " +
		"A retrieval shortcut. Call kb_list_available_tags first if unsure which tags exist.";
	const description = loadToolDescription("kb-filter-by-tags", fallbackDescription);

	return {
		name: "kb_filter_by_tags",
		label: "KB Filter by Tags",
		scope_use: ["im-claw", "conversation", "project", "automation", "kb-processing", "cli"],
		requires: ["knowledge"],
		category: "kb-read",
		description,
		parameters: kbFilterByTagsSchema,
		execute: async (_toolCallId, params) => {
			const resolvedRoot = knowledgeRoot(root);
			const base = wikiDir(resolvedRoot);
			const pages = await queryByTags(resolvedRoot, params);
			const enriched = pages.map((p) => ({ ...p, absolutePath: join(base, p.path) }));
			const details: KbFilterByTagsDetails = { count: enriched.length, pages: enriched };
			if (enriched.length === 0) {
				const emptyHint =
					" Tags are only a shortcut — do NOT conclude the knowledge base lacks the answer yet. Keep exploring: " +
					"call kb_list_available_tags to see the real tag vocabulary and retry with different tags; read the curated " +
					"maps under indexes/; grep the full text of wiki/; browse the wiki/ tree and follow [[page-id]] links. " +
					"Only give up after these avenues come up empty.";
				return {
					content: [{ type: "text", text: `kb_filter_by_tags matched 0 pages.${emptyHint}` }],
					details,
				};
			}
			const listing = enriched.map((p) => `- [${p.id}] ${p.absolutePath} — ${p.title}: ${p.summary}`).join("\n");
			const matchedHint =
				"\n\nIf these pages don't actually answer the question, keep exploring rather than settling: read indexes/, " +
				"grep wiki/ full text, retry with other tags (kb_list_available_tags), or follow [[page-id]] links from the pages above.";
			return {
				content: [
					{
						type: "text",
						text: `kb_filter_by_tags matched ${enriched.length} page(s):\n${listing}${matchedHint}`,
					},
				],
				details,
			};
		},
	};
}

export const kbFilterByTagsTool = createKbFilterByTagsTool();
