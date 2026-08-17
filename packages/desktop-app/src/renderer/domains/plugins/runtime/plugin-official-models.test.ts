import { afterEach, describe, expect, it, vi } from "vitest";
import { createOfficialModelsApi } from "./plugin-official-models.js";

afterEach(() => {
	Reflect.deleteProperty(globalThis, "window");
});

describe("createOfficialModelsApi", () => {
	it("routes model operations through the capability session", async () => {
		const listResult = {
			defaultModel: "openai/gpt-5",
			providers: [
				{
					id: "openai",
					displayName: "OpenAI",
					hasApiKey: true,
					modelCount: 1,
					models: [{ id: "gpt-5" }],
				},
			],
		};
		const models = {
			list: vi.fn().mockResolvedValue(listResult),
			getConfig: vi.fn().mockResolvedValue({ defaultModel: "openai/gpt-5", providers: {} }),
			getProvider: vi.fn().mockResolvedValue({ provider: "openai", apiKey: "***" }),
			probe: vi.fn().mockResolvedValue({ ok: true }),
			validateModelKey: vi.fn().mockResolvedValue(undefined),
			setDefault: vi.fn().mockResolvedValue({ defaultModel: "openai/gpt-5" }),
			upsertProvider: vi.fn().mockResolvedValue({ apiKey: "***" }),
			removeProvider: vi.fn().mockResolvedValue(undefined),
		};
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			value: { astravia: { plugins: { internalCapabilities: { models } } } },
		});
		const assertOfficial = vi.fn();
		const api = createOfficialModelsApi(assertOfficial, "capability-session");

		await expect(api.list()).resolves.toEqual(listResult);
		await expect(api.get()).resolves.toEqual({ defaultModel: "openai/gpt-5", providers: {} });
		await expect(api.get("openai")).resolves.toEqual({ provider: "openai", apiKey: "***" });
		await expect(api.probe("openai", "gpt-5")).resolves.toEqual({ ok: true });
		await expect(api.listProviderIds()).resolves.toEqual(["openai"]);
		await expect(api.assertModelKeyExists("openai/gpt-5", "test")).resolves.toBeUndefined();
		await expect(api.setDefault("openai/gpt-5")).resolves.toEqual({ defaultModel: "openai/gpt-5" });
		await expect(api.upsertProvider("openai", { displayName: "OpenAI" })).resolves.toEqual({ apiKey: "***" });
		await expect(api.removeProvider("openai")).resolves.toBeUndefined();

		expect(assertOfficial).toHaveBeenCalledTimes(9);
		expect(models.getConfig).toHaveBeenCalledWith("capability-session");
		expect(models.getProvider).toHaveBeenCalledWith("capability-session", "openai");
		expect(models.validateModelKey).toHaveBeenCalledWith("capability-session", "openai/gpt-5", "test");
		expect(models.upsertProvider).toHaveBeenCalledWith("capability-session", "openai", {
			displayName: "OpenAI",
		});
	});
});
