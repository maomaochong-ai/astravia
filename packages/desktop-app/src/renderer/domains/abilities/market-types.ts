/**
 * 能力（Ability）的展示与配置形状（ADR-0049：Skill / MCP / Plugin / Bundle 统一）。
 *
 * 这些类型原本随服务端市场接口而生，现在唯一的来源是[[开放市场]]（GitHub 归档 +
 * `.astravia/marketplace.json`），故类型定义留在客户端、与任何网络调用解耦。
 */

// ─── Market Abilities（ADR-0049：Skill / MCP / Plugin / Bundle 统一为 Ability） ───

export type AbilityType = "skill" | "mcp" | "plugin" | "bundle";
/** bundle 不允许嵌套，成员集合恒为一层。 */
export type AbilityMemberType = Exclude<AbilityType, "bundle">;

export interface AbilityMember {
	type: AbilityMemberType;
	slug: string;
	/** 仅 mcp 私有内联成员才有；有它就没有展开字段。 */
	inline?: Record<string, unknown>;
	/** 引用的成员当前是否仍在库；内联成员恒 false。 */
	exists: boolean;
	name: string;
	icon: string;
	version: string;
}

/** raw.config：客户端运行时读，按 type 取不同字段。 */
export interface AbilityConfig {
	/** type=mcp：原样写入 `~/.astravia/agent/mcp.json` 的配置块。 */
	mcp?: Record<string, unknown>;
	/** type=plugin：以 zip 内 plugin.json 为准，admin 不可改。 */
	api_version?: string;
	permissions?: string[];
	commands?: string[];
	/**
	 * type=plugin：插件内聚的 MCP server 与 skill（ADR-0040），上传时从 zip 解析。
	 * 纯展示——运行时装配仍由客户端读安装目录的 plugin.json 完成。
	 */
	contributions?: AbilityPluginContributions;
	/** type=bundle：成员清单。 */
	members?: AbilityMember[];
}

/** 插件内聚的 agent 贡献（对用户不可见地随插件生死，故需在装之前列清楚）。 */
export interface AbilityPluginContributions {
	mcp_servers?: AbilityContributedMcp[];
	skills?: AbilityContributedSkill[];
}

export interface AbilityContributedMcp {
	name: string;
	display_name?: string;
	description?: string;
}

export interface AbilityContributedSkill {
	name: string;
	alias?: string;
	description?: string;
}

export type AbilityShowcaseTemplate = "chat-over-canvas" | "chat-thread";
export type AbilityShowcaseCanvas = "design" | "code" | "docs" | "generic";

export interface AbilityShowcase {
	template: AbilityShowcaseTemplate;
	user_prompt: string;
	assistant_reply: string;
	/** 仅 chat-over-canvas 有意义。 */
	canvas?: AbilityShowcaseCanvas;
	brand_icon_url?: string;
	brand_name?: string;
}

export interface AbilityFeatureItem {
	title: string;
	description: string;
	icon?: string;
}

export interface AbilityStepItem {
	title: string;
	description?: string;
}

export interface AbilityLinkItem {
	label: string;
	href: string;
}

/** 仓库只能声明宿主支持的区块，不能注入 HTML、脚本、样式或任意操作。 */
export type AbilityDetailBlock =
	| { type: "feature-grid"; title?: string; items: AbilityFeatureItem[] }
	| { type: "steps"; title?: string; items: AbilityStepItem[] }
	| { type: "showcase"; showcase: AbilityShowcase }
	| { type: "image"; src: string; alt?: string; caption?: string }
	| { type: "callout"; tone: "info" | "success" | "warning"; title?: string; content: string }
	| { type: "markdown"; content: string }
	| { type: "links"; title?: string; items: AbilityLinkItem[] };

/** 预置元信息键，label 由客户端按 locale 解析。 */
export type AbilityMetaKey = "homepage" | "repository" | "docs" | "license";

/**
 * 一条元信息。刻意是**有序数组**的元素而非对象键值——对象的键顺序在序列化时
 * 不保证，会让详情页字段顺序随机跳动；数组顺序即运营排定的展示顺序。
 */
export interface AbilityMetaEntry {
	/** 预置键；非空时 label 走 i18n，忽略 label 字段。 */
	key?: AbilityMetaKey;
	/** 自定义条目的展示名，仅在无 key 时使用，原样显示不翻译。 */
	label?: string;
	/** 展示值；http(s):// 开头渲染为可点击链接。 */
	value: string;
}

/** raw.detail.i18n[locale]：整体覆盖，不与默认值合并。 */
export interface AbilityDetailLocale {
	name?: string;
	description?: string;
	/** 整体替换默认语言的 tags，不与之合并。 */
	tags?: string[];
	content?: string;
	showcases?: AbilityShowcase[];
	meta?: AbilityMetaEntry[];
	blocks?: AbilityDetailBlock[];
}

/**
 * raw.detail：全部展示信息的唯一真相源。
 * 顶层字段为默认语言，i18n[locale] 覆盖其它语言，两者同构。
 * MarketAbility 顶层的 name/description 等由服务端从这里投影而来，读哪个都一致。
 */
export interface AbilityDetail {
	name?: string;
	description?: string;
	license?: string;
	author?: string;
	/** 空 / solar:xxx-bold / http(s):// */
	icon?: string;
	tags?: string[];
	showcases?: AbilityShowcase[];
	/** 元信息条目（官网 / 开源协议 / 自定义…），按数组顺序展示。 */
	meta?: AbilityMetaEntry[];
	/** markdown 正文。 */
	content?: string;
	/** 宿主白名单渲染的结构化详情；存在时优先于旧的 showcases + content。 */
	blocks?: AbilityDetailBlock[];
	i18n?: Record<string, AbilityDetailLocale>;
}

export interface MarketAbility {
	/** 机器标识，与 type 联合唯一。 */
	slug: string;
	type: AbilityType;
	name: string;
	description: string;
	license: string;
	version: string;
	author: string;
	/** 四态：空=默认 / solar:xxx-bold / http(s) 外链 / 已解析的绝对图 URL */
	icon: string;
	/** 分类的规范名（服务端已 resolve），未分类为空串。分组与筛选都用它，不随界面语言变。 */
	category: string;
	/** 分类译名，取 `category_i18n[locale] ?? category` 得到展示名；无译名时字段缺省。 */
	category_i18n?: Record<string, string>;
	tags: string[];
	/** 产物摘要，安装前校验；mcp / bundle 恒为空。 */
	sha256: string;
	download_count: number;
	config: AbilityConfig;
	detail: AbilityDetail;
	updated_at: string;
}

// ─── MCP 配置适配（能力 → mcp.json 条目） ───

/** mcp 设置页消费的服务器形状：由 MarketAbility 适配而来，不再是独立市场实体。 */
export interface MarketMcpServer {
	/** 列表渲染用的稳定标识，取 ability slug。 */
	id: string;
	name: string;
	display_name: string;
	description: string;
	/** 已解析为可直接渲染的图标值。 */
	icon?: string;
	/** 直接作为 mcpServers[name] 写入本地 mcp.json 的原样配置。 */
	config: Record<string, unknown>;
}

export function abilityToMarketMcpServer(ability: MarketAbility): MarketMcpServer {
	return {
		id: ability.slug,
		name: ability.slug,
		display_name: ability.name,
		description: ability.description,
		icon: ability.icon || undefined,
		config: ability.config.mcp ?? {},
	};
}
