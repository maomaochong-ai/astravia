#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PACKAGE_DIR="$ROOT_DIR/packages/coding-agent"
PACKAGE_NAME="@ASTRAVIA/coding-agent"
BUN_BIN="${BUN_BIN:-bun}"

if [[ ! -d "$PACKAGE_DIR" ]]; then
	echo "Error: coding-agent package directory not found: $PACKAGE_DIR"
	exit 1
fi

if ! command -v "$BUN_BIN" >/dev/null 2>&1; then
	echo "Error: bun is not installed or not in PATH."
	exit 1
fi

echo "Ensuring workspace dependencies with bun..."
cd "$ROOT_DIR"
if ! "$BUN_BIN" install; then
	echo ""
	echo "Error: bun install failed."
	echo "Please run 'bun install' in $ROOT_DIR and fix install errors first."
	exit 1
fi

echo "Building workspace dependencies (ai, agent)..."
for dep_pkg in ai agent; do
	echo "  - $dep_pkg"
	cd "$ROOT_DIR/packages/$dep_pkg"
	if [[ "$dep_pkg" == "ai" ]]; then
		echo "    (offline: skip model fetching)"
		"$BUN_BIN" run tsgo -p tsconfig.build.json
	else
		"$BUN_BIN" run build
	fi
done

echo "Building coding-agent with bun..."
cd "$PACKAGE_DIR"
"$BUN_BIN" run build

echo "Linking $PACKAGE_NAME globally..."

# Create a symlink in bun's global bin directory directly.
# `bun link -g` fails with FileNotFound for workspace packages, so we bypass it.
BUN_GLOBAL_BIN="$("$BUN_BIN" pm bin -g 2>/dev/null || true)"
if [[ -z "$BUN_GLOBAL_BIN" ]]; then
	echo "Error: could not determine bun global bin directory."
	exit 1
fi

mkdir -p "$BUN_GLOBAL_BIN"
ln -sf "$PACKAGE_DIR/dist/cli.js" "$BUN_GLOBAL_BIN/ASTRAVIA"

echo "Bun global bin: $BUN_GLOBAL_BIN"

echo ""
echo "Done. You can now run 'ASTRAVIA' from any directory."
echo "Check: ASTRAVIA --help"
