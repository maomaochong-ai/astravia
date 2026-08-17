/**
 * 能力页的原始数据源：市场行 + 安装台账 + 三条安装轨道的本地状态。
 * 只负责取数与刷新，条目组装在 lib/build-ability-items.ts。
 */
import type {
	AbilityLedger,
	AddMarketplaceSourceInput,
	InstalledPlugin,
	InstalledSkill,
	MarketplaceSource,
	OpenMarketplaceCatalog,
	SkillInfo,
	UpdateMarketplaceSourceInput,
} from "@preload/api";
import { i18n } from "@shared/i18n";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { areAllAttemptedMarketSourcesUnavailable, getOpenMarketplaceLoadState } from "../lib/ability-load-policy";
import { mergeAbilityCatalogs } from "../lib/merge-ability-catalogs";
import type { MarketAbility } from "../market-types";

export interface AbilityData {
	market: MarketAbility[];
	/** 已配置的市场来源（含未启用的），来源管理弹窗直接消费。 */
	marketplaceSources: MarketplaceSource[];
	ledger: AbilityLedger;
	skillManifest: Record<string, InstalledSkill>;
	/** 通用 Agent / 内置 skill（只读展示）。 */
	localSkills: SkillInfo[];
	plugins: InstalledPlugin[];
	loading: boolean;
	refreshing: boolean;
	error: string | null;
	refresh: () => void;
	addMarketplaceSource: (input: AddMarketplaceSourceInput) => Promise<void>;
	updateMarketplaceSource: (id: string, input: UpdateMarketplaceSourceInput) => Promise<void>;
	removeMarketplaceSource: (id: string) => Promise<void>;
}

function isReadonlySkillSource(source: string): boolean {
	return source.startsWith("agents-") || source === "builtin";
}

export function useAbilityData(): AbilityData {
	const [openMarketplace, setOpenMarketplace] = useState<OpenMarketplaceCatalog>({
		sources: [],
		snapshots: [],
		abilities: [],
		failedSourceIds: [],
	});
	const [ledger, setLedger] = useState<AbilityLedger>({});
	const [skillManifest, setSkillManifest] = useState<Record<string, InstalledSkill>>({});
	const [localSkills, setLocalSkills] = useState<SkillInfo[]>([]);
	const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback((forceOpenMarketplaceRefresh: boolean) => {
		setRefreshing(true);
		const local = Promise.all([
			window.astravia.abilities.getLedger(),
			window.astravia.skills.getMarketManifest(),
			window.astravia.skills.list(),
			// 能力市场不按工作模式过滤：另一模式下已装的插件仍要出现在「我的」。
			window.astravia.plugins.listAll(),
		]);

		const open = forceOpenMarketplaceRefresh
			? window.astravia.abilities.refreshOpenMarketplaces()
			: window.astravia.abilities.listOpenMarketplaces();

		void Promise.allSettled([local, open])
			.then(([localResult, openResult]) => {
				const errors: string[] = [];
				if (localResult.status === "fulfilled") {
					const [nextLedger, manifest, skills, installedPlugins] = localResult.value;
					setLedger(nextLedger);
					setSkillManifest(manifest);
					setLocalSkills(skills.filter((skill) => isReadonlySkillSource(skill.source)));
					setPlugins(installedPlugins);
				} else {
					console.warn("Ability local state load failed", localResult.reason);
					errors.push(i18n.t("abilities:error.loadFailed"));
				}
				let openState = { attempted: true, usable: false };
				if (openResult.status === "fulfilled") {
					setOpenMarketplace(openResult.value);
					openState = getOpenMarketplaceLoadState(openResult.value);
					if (openResult.value.failedSourceIds.length > 0) {
						console.warn("Open marketplace sources failed", openResult.value.failedSourceIds);
					}
				} else {
					console.warn("Open marketplace catalog load failed", openResult.reason);
				}
				if (areAllAttemptedMarketSourcesUnavailable([openState])) {
					errors.push(i18n.t("abilities:error.loadFailed"));
				}
				setError(errors.length > 0 ? errors.join("; ") : null);
			})
			.finally(() => {
				setLoading(false);
				setRefreshing(false);
			});
	}, []);

	const refresh = useCallback(() => load(true), [load]);
	const addMarketplaceSource = useCallback(async (input: AddMarketplaceSourceInput): Promise<void> => {
		const source = await window.astravia.abilities.addMarketplaceSource(input);
		try {
			const snapshot = await window.astravia.abilities.refreshMarketplaceSource(source.id);
			setOpenMarketplace((current) => {
				const sources = [...current.sources.filter((item) => item.id !== source.id), source].sort(
					(a, b) => a.priority - b.priority,
				);
				const snapshots = [...current.snapshots.filter((item) => item.sourceId !== source.id), snapshot];
				return {
					sources,
					snapshots,
					abilities: snapshots.flatMap((item) => item.abilities),
					failedSourceIds: current.failedSourceIds.filter((id) => id !== source.id),
				};
			});
		} catch (error) {
			try {
				await window.astravia.abilities.removeMarketplaceSource(source.id);
			} catch (rollbackError) {
				console.warn("Failed to roll back marketplace source", rollbackError);
			}
			throw error;
		}
	}, []);

	const reloadCatalog = useCallback(async (): Promise<void> => {
		setOpenMarketplace(await window.astravia.abilities.listOpenMarketplaces());
	}, []);

	const updateMarketplaceSource = useCallback(
		async (id: string, input: UpdateMarketplaceSourceInput): Promise<void> => {
			await window.astravia.abilities.updateMarketplaceSource(id, input);
			// 改分支后旧快照已失效，先按新配置同步一次再重读目录。
			if (input.ref !== undefined) await window.astravia.abilities.refreshMarketplaceSource(id);
			await reloadCatalog();
		},
		[reloadCatalog],
	);

	const removeMarketplaceSource = useCallback(
		async (id: string): Promise<void> => {
			await window.astravia.abilities.removeMarketplaceSource(id);
			await reloadCatalog();
		},
		[reloadCatalog],
	);

	useEffect(
		() =>
			window.astravia.abilities.onOpenMarketplacesUpdated(() => {
				void window.astravia.abilities
					.listOpenMarketplaces()
					.then(setOpenMarketplace)
					.catch(() => undefined);
			}),
		[],
	);

	// 内置 skill 的展示文案由主进程按当前语言给出（`skills:builtin.*`），切语言要重新取数。
	const { i18n: i18nInstance } = useTranslation();
	const language = i18nInstance.language;
	useEffect(() => {
		void language;
		load(false);
	}, [load, language]);

	const market = useMemo(() => mergeAbilityCatalogs(openMarketplace.snapshots), [openMarketplace.snapshots]);

	return {
		market,
		marketplaceSources: openMarketplace.sources,
		ledger,
		skillManifest,
		localSkills,
		plugins,
		loading,
		refreshing,
		error,
		refresh,
		addMarketplaceSource,
		updateMarketplaceSource,
		removeMarketplaceSource,
	};
}
