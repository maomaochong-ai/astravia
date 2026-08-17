import { type Static, Type } from "@sinclair/typebox";
import { listAvailableTags } from "../../knowledge/query.js";
import { knowledgeRoot } from "../../knowledge/store.js";
import type { CodingAgentTool } from "../../session/tool-scope.js";
import { loadToolDescription } from "../description.js";
import { toolCallDescriptionSchema } from "../tool-call-description.js";

const kbListTagsSchema = Type.Object({
	description: toolCallDescriptionSchema,
});

export type KbListTagsInput = Static<typeof kbListTagsSchema>;

export interface KbListTagsDetails {
	tags: Array<{ tag: string; count: number }>;
}

/**
 * 列出知识库里所有可用标签及各自页数。供 agent 在 kb_filter_by_tags 之前了解有哪些标签。
 * @param root 知识库根目录，默认 ~/.astravia/knowledges。
 */
export function createKbListTagsTool(root?: string): CodingAgentTool<typeof kbListTagsSchema> {
	const fallbackDescription =
		"List all tags available in the knowledge base, with the page count for each. " +
		"Call this before kb_filter_by_tags when you don't know which tags exist.";
	const description = loadToolDescription("kb-list-tags", fallbackDescription);

	return {
		name: "kb_list_available_tags",
		label: "KB List Tags",
		scope_use: ["im-claw", "conversation", "project", "automation", "kb-processing", "cli"],
		requires: ["knowledge"],
		category: "kb-read",
		description,
		parameters: kbListTagsSchema,
		execute: async () => {
			const resolvedRoot = knowledgeRoot(root);
			const tags = await listAvailableTags(resolvedRoot);
			const details: KbListTagsDetails = { tags };
			const listing = tags.length === 0 ? "(no tags yet)" : tags.map((t) => `- ${t.tag} (${t.count})`).join("\n");
			return {
				content: [{ type: "text", text: `kb_list_available_tags — ${tags.length} tag(s):\n${listing}` }],
				details,
			};
		},
	};
}

export const kbListTagsTool = createKbListTagsTool();
