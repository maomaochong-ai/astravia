import { describe, expect, it } from "vitest";
import { CAPABILITY_ERROR_CODES, CAPABILITY_PREFIXES } from "../../src/contracts.js";
import {
	DOMAIN_SCHEDULER_CAPABILITIES,
	DOMAIN_SCHEDULER_CAPABILITY_CATALOG,
	SCHEDULER_EXECUTION_MODES,
	SCHEDULER_RECORD_STATUSES,
	SCHEDULER_SKILL_TYPES,
} from "../../src/domain.js";

describe("scheduler domain capabilities", () => {
	it("uses one stable id per scheduler operation", () => {
		expect(Object.values(DOMAIN_SCHEDULER_CAPABILITIES).map((capability) => capability.id)).toEqual([
			`${CAPABILITY_PREFIXES.ASTRAVIA_DOMAIN}scheduler.task.list`,
			`${CAPABILITY_PREFIXES.ASTRAVIA_DOMAIN}scheduler.task.get`,
			`${CAPABILITY_PREFIXES.ASTRAVIA_DOMAIN}scheduler.task.history.list`,
			`${CAPABILITY_PREFIXES.ASTRAVIA_DOMAIN}scheduler.task.create`,
			`${CAPABILITY_PREFIXES.ASTRAVIA_DOMAIN}scheduler.task.update`,
			`${CAPABILITY_PREFIXES.ASTRAVIA_DOMAIN}scheduler.task.delete`,
			`${CAPABILITY_PREFIXES.ASTRAVIA_DOMAIN}scheduler.task.set-enabled`,
			`${CAPABILITY_PREFIXES.ASTRAVIA_DOMAIN}scheduler.task.run`,
			`${CAPABILITY_PREFIXES.ASTRAVIA_DOMAIN}scheduler.task.abort`,
		]);
	});

	it("validates scheduler inputs and preserves explicit optional-field clearing", () => {
		expect(
			DOMAIN_SCHEDULER_CAPABILITIES.CREATE_TASK.parseInput({
				data: {
					name: "Daily",
					prompt: "Run",
					cron: "0 9 * * *",
					isOnce: false,
					enabled: true,
					cwd: "C:/workspace",
					executionMode: SCHEDULER_EXECUTION_MODES.SANDBOX,
					skill: { name: "review", type: SCHEDULER_SKILL_TYPES.SKILL, ignored: true },
				},
				ignored: true,
			}),
		).toEqual({
			data: {
				name: "Daily",
				prompt: "Run",
				cron: "0 9 * * *",
				isOnce: false,
				enabled: true,
				cwd: "C:/workspace",
				executionMode: SCHEDULER_EXECUTION_MODES.SANDBOX,
				skill: { name: "review", type: SCHEDULER_SKILL_TYPES.SKILL },
			},
		});
		const update = DOMAIN_SCHEDULER_CAPABILITIES.UPDATE_TASK.parseInput({
			taskId: "task",
			data: { modelKey: undefined, skill: undefined },
		});
		expect(update.data).toHaveProperty("modelKey", undefined);
		expect(update.data).toHaveProperty("skill", undefined);
		expect(() => DOMAIN_SCHEDULER_CAPABILITIES.UPDATE_TASK.parseInput({ taskId: "task", data: {} })).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_INPUT }),
		);
		expect(() =>
			DOMAIN_SCHEDULER_CAPABILITIES.CREATE_TASK.parseInput({
				data: {
					name: "Daily",
					prompt: "Run",
					cron: "0 9 * * *",
					isOnce: false,
					enabled: true,
					cwd: "C:/workspace",
					ignored: true,
				},
			}),
		).toThrowError(expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_INPUT }));
	});

	it("cleans task and history outputs while validating nested statuses", () => {
		const task = {
			id: "task",
			name: "Daily",
			prompt: "Run",
			cron: "0 9 * * *",
			isOnce: false,
			enabled: true,
			cwd: "C:/workspace",
			skill: { name: "review", type: SCHEDULER_SKILL_TYPES.SKILL, ignored: true },
			createdAt: 1,
			updatedAt: 2,
			lastRunAt: null,
			lastRunStatus: null,
			ignored: true,
		};
		const parsedTask = DOMAIN_SCHEDULER_CAPABILITIES.GET_TASK.parseOutput(task);
		expect(parsedTask).not.toHaveProperty("ignored");
		expect(parsedTask).not.toHaveProperty("skill.ignored");

		expect(
			DOMAIN_SCHEDULER_CAPABILITIES.LIST_HISTORY.parseOutput([
				{
					id: "record",
					taskId: "task",
					sessionId: "session",
					startedAt: 1,
					completedAt: 2,
					status: SCHEDULER_RECORD_STATUSES.SUCCESS,
					prompt: "Run",
					responsePreview: "Done",
					executionMode: SCHEDULER_EXECUTION_MODES.FULL_ACCESS,
					ignored: true,
				},
			]),
		).toEqual([
			{
				id: "record",
				taskId: "task",
				sessionId: "session",
				startedAt: 1,
				completedAt: 2,
				status: SCHEDULER_RECORD_STATUSES.SUCCESS,
				prompt: "Run",
				responsePreview: "Done",
				executionMode: SCHEDULER_EXECUTION_MODES.FULL_ACCESS,
			},
		]);
		expect(() =>
			DOMAIN_SCHEDULER_CAPABILITIES.LIST_HISTORY.parseOutput([
				{
					id: "record",
					taskId: "task",
					sessionId: "session",
					startedAt: 1,
					completedAt: null,
					status: SCHEDULER_RECORD_STATUSES.RUNNING,
					prompt: "Run",
					responsePreview: "",
					executionMode: SCHEDULER_EXECUTION_MODES.INHERIT,
				},
			]),
		).toThrowError(expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_OUTPUT }));
	});

	it("publishes task mutation and execution history schemas", () => {
		expect(DOMAIN_SCHEDULER_CAPABILITY_CATALOG).toHaveLength(9);
		expect(DOMAIN_SCHEDULER_CAPABILITY_CATALOG[2]?.outputSchema).toMatchObject({
			type: "array",
			items: {
				type: "object",
				required: ["id", "taskId", "sessionId", "startedAt", "completedAt", "status", "prompt", "responsePreview"],
				properties: {
					status: {
						anyOf: [
							{ const: SCHEDULER_RECORD_STATUSES.RUNNING },
							{ const: SCHEDULER_RECORD_STATUSES.SUCCESS },
							{ const: SCHEDULER_RECORD_STATUSES.FAILED },
							{ const: SCHEDULER_RECORD_STATUSES.ABORTED },
						],
					},
					executionMode: {
						anyOf: [
							{ const: SCHEDULER_EXECUTION_MODES.SANDBOX },
							{ const: SCHEDULER_EXECUTION_MODES.FULL_ACCESS },
						],
					},
				},
			},
		});
		expect(DOMAIN_SCHEDULER_CAPABILITY_CATALOG[3]?.inputSchema).toMatchObject({
			type: "object",
			required: ["data"],
			properties: {
				data: {
					type: "object",
					additionalProperties: false,
					required: ["name", "prompt", "cron", "isOnce", "enabled", "cwd"],
				},
			},
		});
		expect(DOMAIN_SCHEDULER_CAPABILITY_CATALOG[4]?.inputSchema).toMatchObject({
			properties: {
				data: {
					type: "object",
					additionalProperties: false,
					minProperties: 1,
				},
			},
		});
		expect(() => JSON.stringify(DOMAIN_SCHEDULER_CAPABILITY_CATALOG)).not.toThrow();
	});
});
