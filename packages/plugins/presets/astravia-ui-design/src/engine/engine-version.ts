/**
 * Shared design-engine version. Bumping it targets a fresh
 * ~/.astravia/design-engine/<version>/ directory (files re-materialized, deps
 * re-installed), so engine upgrades never mutate a possibly-running old tree.
 */
export const ENGINE_VERSION = "0.1.0";
