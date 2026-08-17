import { federation, type ModuleFederationOptions } from "@module-federation/vite";
import type { Plugin, PluginOption } from "vite";
import { type CreateAstraviaPluginPackageOptions, createAstraviaPluginPackage } from "./pack.js";
import { createPluginStyleScopePlugin } from "./style-scope.js";

export interface AstraviaPluginPackageOptions extends Omit<CreateAstraviaPluginPackageOptions, "rootDir" | "distDir"> {
	enabled?: boolean;
}

export interface AstraviaPluginFederationOptions {
	name: string;
	expose?: string;
	entry?: string;
	manifestFileName?: string;
	remoteEntryFileName?: string;
	shared?: ModuleFederationOptions["shared"];
	package?: boolean | AstraviaPluginPackageOptions;
}

export function createAstraviaPluginFederationConfig(options: AstraviaPluginFederationOptions): ModuleFederationOptions {
	const expose = options.expose ?? "./plugin";
	const entry = options.entry ?? "./src/index.tsx";
	return {
		name: options.name,
		filename: options.remoteEntryFileName ?? "remoteEntry.js",
		exposes: {
			[expose]: entry,
		},
		manifest: {
			fileName: options.manifestFileName ?? "mf-manifest.json",
		},
		dts: false,
		shared: {
			react: {
				singleton: true,
				import: false,
				requiredVersion: "*",
			},
			"react-dom": {
				singleton: true,
				import: false,
				requiredVersion: "*",
			},
			// Match host plugin-shared-modules (tldraw remotes may require this subpath).
			"react-dom/client": {
				singleton: true,
				import: false,
				requiredVersion: "*",
			},
			// Host design-system primitives; runtime provided by desktop-app share scope.
			"@astravia/ui": {
				singleton: true,
				import: false,
				requiredVersion: "*",
			},
			...options.shared,
		},
	};
}

function createBuildDefaultsPlugin(entry: string): Plugin {
	return {
		name: "astravia-plugin-build-defaults",
		apply: "build",
		config() {
			return {
				build: {
					rollupOptions: {
						input: entry,
						// Host-provided singletons (see desktop-app plugin-shared-modules + astravia-host protocol).
						external: ["@astravia-org/plugin-sdk", "@astravia/ui"],
						output: {
							assetFileNames(assetInfo) {
								return assetInfo.names.some((name) => name.endsWith(".css"))
									? "style.css"
									: "assets/[name]-[hash][extname]";
							},
							paths: {
								"@astravia-org/plugin-sdk": "astravia-host://plugin-sdk",
								"@astravia/ui": "astravia-host://ui",
							},
						},
					},
				},
			};
		},
	};
}

function createPackagePlugin(options: AstraviaPluginPackageOptions): Plugin {
	let rootDir = "";
	let distDir = "";
	let buildFailed = false;

	return {
		name: "astravia-plugin-package",
		apply: "build",
		buildStart() {
			buildFailed = false;
		},
		buildEnd(error) {
			buildFailed = error !== undefined;
		},
		configResolved(config) {
			rootDir = config.root;
			distDir = config.build.outDir;
		},
		async closeBundle() {
			if (options.enabled === false || buildFailed) {
				return;
			}
			const result = await createAstraviaPluginPackage({
				...options,
				rootDir,
				distDir,
			});
			console.log(`[astravia-plugin-vite] Wrote ${result.outputPath} with ${result.files.length} runtime files`);
		},
	};
}

export function astraviaPluginFederation(options: AstraviaPluginFederationOptions): PluginOption[] {
	const packageOptions = typeof options.package === "object" ? options.package : {};
	const entry = options.entry ?? "./src/index.tsx";
	const plugins: PluginOption[] = [
		createBuildDefaultsPlugin(entry),
		...federation(createAstraviaPluginFederationConfig(options)),
		createPluginStyleScopePlugin(),
	];
	// ASTRAVIA_PLUGIN_DEV_WATCH=1：宿主 dev 热更新的 `vite build --watch` 只需要 dist，
	// 跳过每次增量重建都重打 zip（closeBundle 在 watch 模式每轮都会触发）。
	if (options.package !== false && process.env.ASTRAVIA_PLUGIN_DEV_WATCH !== "1") {
		plugins.push(createPackagePlugin(packageOptions));
	}
	return plugins;
}
