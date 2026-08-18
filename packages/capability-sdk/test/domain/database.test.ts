import { describe, expect, it } from "vitest";
import { CAPABILITY_ERROR_CODES, CAPABILITY_PREFIXES } from "../../src/contracts.js";
import { DOMAIN_DATABASE_CAPABILITIES, DOMAIN_DATABASE_CAPABILITY_CATALOG } from "../../src/domain.js";

describe("database domain capabilities", () => {
	it("uses one stable id per database operation", () => {
		expect(Object.values(DOMAIN_DATABASE_CAPABILITIES).map((capability) => capability.id)).toEqual([
			`${CAPABILITY_PREFIXES.ASTRAVIA_DOMAIN}database.connection.list`,
			`${CAPABILITY_PREFIXES.ASTRAVIA_DOMAIN}database.connection.add`,
			`${CAPABILITY_PREFIXES.ASTRAVIA_DOMAIN}database.connection.test`,
			`${CAPABILITY_PREFIXES.ASTRAVIA_DOMAIN}database.connection.remove`,
		]);
	});

	it("validates the empty list input", () => {
		expect(() => DOMAIN_DATABASE_CAPABILITIES.LIST_CONNECTIONS.parseInput({})).not.toThrow();
		expect(() => DOMAIN_DATABASE_CAPABILITIES.LIST_CONNECTIONS.parseInput({ ignored: true })).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_INPUT }),
		);
	});

	it("validates database connection mutations", () => {
		expect(() =>
			DOMAIN_DATABASE_CAPABILITIES.ADD_CONNECTION.parseInput({
				name: "prod",
				dbType: "postgresql",
				host: "localhost",
				port: 5432,
				ssl: true,
			}),
		).not.toThrow();
		expect(() =>
			DOMAIN_DATABASE_CAPABILITIES.ADD_CONNECTION.parseInput({ name: "", dbType: "sqlite", host: "x" }),
		).toThrowError(expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_INPUT }));
		// clean: true 清理多余字段而非拒绝（与 knowledge 顶层 input 行为一致）
		expect(
			DOMAIN_DATABASE_CAPABILITIES.ADD_CONNECTION.parseInput({
				name: "prod",
				dbType: "sqlite",
				host: "x",
				ignored: 1,
			}),
		).toEqual({ name: "prod", dbType: "sqlite", host: "x" });
	});

	it("validates test and remove connection inputs", () => {
		expect(() => DOMAIN_DATABASE_CAPABILITIES.TEST_CONNECTION.parseInput({ connectionName: "prod" })).not.toThrow();
		expect(() =>
			DOMAIN_DATABASE_CAPABILITIES.TEST_CONNECTION.parseInput({
				draft: { name: "draft", dbType: "sqlite", host: "C:/data.db" },
			}),
		).not.toThrow();
		expect(() => DOMAIN_DATABASE_CAPABILITIES.TEST_CONNECTION.parseInput({})).not.toThrow();
		expect(() => DOMAIN_DATABASE_CAPABILITIES.TEST_CONNECTION.parseInput({ connectionName: "" })).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_INPUT }),
		);
		expect(() =>
			DOMAIN_DATABASE_CAPABILITIES.TEST_CONNECTION.parseInput({ connectionName: "prod", ignored: true }),
		).not.toThrow();
		expect(() => DOMAIN_DATABASE_CAPABILITIES.REMOVE_CONNECTION.parseInput({ id: "prod" })).not.toThrow();
		expect(() => DOMAIN_DATABASE_CAPABILITIES.REMOVE_CONNECTION.parseInput({ id: "" })).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_INPUT }),
		);
		expect(() => DOMAIN_DATABASE_CAPABILITIES.REMOVE_CONNECTION.parseInput({})).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_INPUT }),
		);
	});

	it("cleans database connection outputs", () => {
		expect(
			DOMAIN_DATABASE_CAPABILITIES.LIST_CONNECTIONS.parseOutput([
				{
					id: "conn",
					name: "prod",
					groupPath: "production",
					type: "postgresql",
					host: "localhost",
					port: 5432,
					database: "app",
					ignored: true,
				},
			]),
		).toEqual([
			{
				id: "conn",
				name: "prod",
				groupPath: "production",
				type: "postgresql",
				host: "localhost",
				port: 5432,
				database: "app",
			},
		]);
		expect(
			DOMAIN_DATABASE_CAPABILITIES.LIST_CONNECTIONS.parseOutput([
				{ id: "conn", name: "prod", groupPath: "", type: "sqlite", host: "x", port: 1, database: "" },
			]),
		).toEqual([{ id: "conn", name: "prod", groupPath: "", type: "sqlite", host: "x", port: 1, database: "" }]);
		expect(
			DOMAIN_DATABASE_CAPABILITIES.TEST_CONNECTION.parseOutput({ tableCount: 3, detail: "3 tables", ignored: true }),
		).toEqual({ tableCount: 3, detail: "3 tables" });
	});

	it("publishes database connection schemas", () => {
		expect(DOMAIN_DATABASE_CAPABILITY_CATALOG).toHaveLength(4);
		expect(DOMAIN_DATABASE_CAPABILITY_CATALOG[0]?.outputSchema).toMatchObject({
			type: "array",
			items: {
				type: "object",
				required: ["id", "name", "groupPath", "type", "host", "port", "database"],
				properties: {
					port: { type: "number" },
				},
			},
		});
		expect(DOMAIN_DATABASE_CAPABILITY_CATALOG[1]?.inputSchema).toMatchObject({
			type: "object",
			required: ["name", "dbType", "host"],
			properties: {
				name: { type: "string", pattern: "\\S" },
				ssl: { type: "boolean" },
			},
		});
		expect(() => JSON.stringify(DOMAIN_DATABASE_CAPABILITY_CATALOG)).not.toThrow();
	});
});
