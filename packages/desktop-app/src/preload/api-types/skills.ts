export interface SkillInfo {
	name: string;
	alias?: string;
	description: string;
	source: string;
	type: "skill";
}

export interface MarketSkillMeta {
	name: string;
	description: string;
	type: "skill";
	version: string;
	author: string;
	tags: string[];
}

export interface InstalledMarketSkill {
	name: string;
	version: string;
	installedAt: string;
	source: "market";
	enabled: boolean;
	type?: "skill";
	alias?: string;
	marketDescription?: string;
}

export interface InstalledCustomSkill {
	name: string;
	version: string;
	installedAt: string;
	source: "custom";
	enabled: boolean;
	type: "skill";
	alias?: string;
	description: string;
}

export type InstalledSkill = InstalledMarketSkill | InstalledCustomSkill;

export interface DesktopSkillsApi {
	/** @param cwd 当前会话/项目 cwd，用于发现项目级 `<cwd>/.agents/skills` 与 `<cwd>/.astravia/skills`；省略则仅列全局来源。 */
	list(cwd?: string): Promise<SkillInfo[]>;
	installFromMarket(
		name: string,
		archiveBuffer: ArrayBuffer,
		type: "skill",
		/** sha256：市场归档包摘要，安装前校验；存量技能无摘要时省略，跳过校验 */
		meta?: { alias?: string; marketDescription?: string; version?: string; sha256?: string },
	): Promise<void>;
	importCustom(archiveBuffer: ArrayBuffer): Promise<{ name: string }>;
	uninstall(name: string, type: "skill"): Promise<void>;
	toggle(name: string): Promise<void>;
	getMarketManifest(): Promise<Record<string, InstalledSkill>>;
	getSkillMdPath(name: string, type: "skill"): Promise<string>;
}
