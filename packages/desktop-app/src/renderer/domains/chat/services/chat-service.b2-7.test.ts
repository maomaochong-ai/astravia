import { describe, expect, it } from "vitest";
import type { HistoryEntry } from "../../../../../../runtime-core/src/index.js";
import { fullHistoryToChat } from "./chat-service.js";

/**
 * B2.7 界面 ⇄ 对话双向联动：历史回放时 settings_assist_marker 携带的
 * databaseTable 必须透传到紧随其后的 user 消息，气泡才能回跳「在界面打开」。
 */
describe("fullHistoryToChat — B2.7 databaseTable 回放", () => {
	function userEntry(id: string, text: string): HistoryEntry {
		return {
			type: "message",
			entryId: id,
			message: { role: "user", content: text, timestamp: Date.now() },
		};
	}

	function assistMarker(databaseTable?: { connection: string; table: string }): HistoryEntry {
		return {
			type: "settings_assist_marker",
			tabId: "database",
			databaseTable,
			timestamp: new Date().toISOString(),
		};
	}

	it("marker 携带 databaseTable 时，下一条 user 消息透传 connection/table", () => {
		const messages = fullHistoryToChat([
			assistMarker({ connection: "local-sqlite", table: "orders" }),
			userEntry("u1", "让 AI 分析表「orders」的结构与数据质量。"),
		]);

		expect(messages).toHaveLength(1);
		expect(messages[0]).toMatchObject({
			role: "user",
			settingsAssistTabId: "database",
			databaseTable: { connection: "local-sqlite", table: "orders" },
		});
	});

	it("marker 无 databaseTable 时，只透传 tabId，不携带 databaseTable", () => {
		const messages = fullHistoryToChat([assistMarker(), userEntry("u1", "帮我看看数据库连接配置。")]);

		expect(messages).toHaveLength(1);
		expect(messages[0].settingsAssistTabId).toBe("database");
		expect(messages[0].databaseTable).toBeUndefined();
	});

	it("databaseTable 只作用于紧随其后的 user 消息，之后自动清空", () => {
		const messages = fullHistoryToChat([
			assistMarker({ connection: "c1", table: "t1" }),
			userEntry("u1", "第一条"),
			userEntry("u2", "第二条（无 marker）"),
		]);

		expect(messages).toHaveLength(2);
		expect(messages[0].databaseTable).toEqual({ connection: "c1", table: "t1" });
		expect(messages[1].databaseTable).toBeUndefined();
	});
});
