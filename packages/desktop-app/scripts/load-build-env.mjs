import { config } from "dotenv";

// 让纯 node 构建脚本（build-presets / prepare-pack）也能从 .env 读取构建期变量。
// 与 vite.main.config.ts 的约定对齐：按 ASTRAVIA_BUILD_ENV 选择 .env.<mode>，再回退 .env。
//
// dotenv 不覆盖已存在的变量，因此优先级为：命令行内联 > .env.<mode> > .env。
// cwd 约定为 packages/desktop-app（两个脚本均从该目录运行）。
export function loadBuildEnv() {
	const mode = process.env.ASTRAVIA_BUILD_ENV || "development";
	config({ path: `.env.${mode}`, quiet: true });
	config({ path: ".env", quiet: true });
}
