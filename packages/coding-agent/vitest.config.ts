import { coverageConfigDefaults, defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		testTimeout: 30000, // 30 seconds for API calls
		server: {
			deps: {
				external: [/@silvia-odwyer\/photon-node/],
			},
		},
		// Opt-in via `bun run test:coverage` only; default `test` is unchanged.
		coverage: {
			provider: "v8",
			reporter: ["text", "html", "lcov"],
			reportsDirectory: "./coverage",
			// Known baseline failures must not hide the coverage map.
			reportOnFailure: true,
			// Honest denominator: package source. Untested files stay at 0% (Vitest 3 all:true).
			include: ["src/**/*.{ts,tsx}"],
			exclude: [
				...coverageConfigDefaults.exclude,
				// Third-party / static assets shipped with the package, not unit-test targets.
				"src/core/export-html/vendor/**",
			],
		},
	},
});
