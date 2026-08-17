# Built-in Tool Integration Checklist

This document records the full integration path for adding a built-in coding-agent tool.
Use it as a checklist when creating a new tool so the implementation is not only present on disk, but also visible to agents, SDK consumers, CLI users, and downstream packages.

## Add the Tool Implementation

Create a directory under `src/core/tools/<tool-name>/`.

Required files:

- `index.ts`: exports the tool factory and default tool instance.
- `description.txt`: concise model-facing description loaded by `loadToolDescription()`.

The factory should follow the existing pattern:

```ts
export function createExampleTool(cwd: string): AgentTool<typeof schema> {
	return {
		name: "example_tool",
		label: "example_tool",
		description,
		parameters: schema,
		execute: async (_toolCallId, input, signal) => {
			// implementation
		},
	};
}

export const exampleTool = createExampleTool(process.cwd());
```

Prefer explicit input and detail types. Avoid `any` unless the upstream API requires it.

## Register in `src/core/tools/index.ts`

Add all of the following:

- Re-export the factory, input/details/options types, and default tool instance.
- Import the factory and default instance.
- Add the default instance to `allTools`.
- Add the factory to `createAllTools()`.
- Add the factory to `createCodingTools()` if the tool should be available in normal coding sessions.
- Add the default instance to `codingTools` if SDK users importing the preset should receive it.
- Extend `ToolsOptions` if the tool supports configurable operations or options.

Do not assume `createAllTools()` is enough. Some integrations use `codingTools` directly.

## Activate in `src/core/agent-session.ts`

If the tool should be available by default, make sure `_buildRuntime()` adds it to `activeToolNameSet`, following the pattern used by `doc_to_pdf` and `current_time`.

Example:

```ts
if (this._baseToolRegistry.has("example_tool")) {
	activeToolNameSet.add("example_tool");
}
```

Without this step, the tool may exist in the registry but not be available to the agent.

## Add System Prompt Description

Update `src/core/system-prompt.ts`:

- Add the tool to `toolDescriptions`.
- Add any specific usage guideline if the model should prefer this tool over shell commands.

The agent only sees built-in tools in the system prompt when the selected active tool names have matching descriptions.

## Export Public API

Update public export surfaces:

- `src/index.ts`
- `src/core/sdk.ts`

Export both the default tool and the factory. Export input/details/options types when they are useful to SDK consumers.

## Update Downstream Re-export Packages

If downstream packages re-export coding-agent tools, update them too.

Current known package:

- `packages/runtime-tools/src/index.ts`

This avoids a mismatch where `@astravia/coding-agent` has the tool but `@astravia/runtime-tools` consumers cannot import it.

## Update CLI Help

Update `src/cli/args.ts`:

- Default tool list shown in help.
- Available tool list.
- Tool description in the "Available Tools" section.

This is not just documentation. CLI users often verify integration through `--help` and `--tools`.

## Add Changelog Entry

Update `packages/coding-agent/CHANGELOG.md` under `## [Unreleased]`.

Use:

- `### Added` for new tools.
- `### Changed` for behavior changes to existing tools.
- `### Fixed` for integration or activation fixes.

## Verify

Run the repository check after code changes:

```bash
bun run check
```

For a default-active tool, also verify a new session actually exposes it:

```bash
bunx tsx -e "/* create a session and print session.agent.state.tools.map((t) => t.name) */"
```

The output should include the new tool name.

Also verify:

- `Object.keys(allTools)` includes the tool.
- `codingTools.map((t) => t.name)` includes the tool when it is default-enabled.
- `createCodingTools(cwd).map((t) => t.name)` includes the tool when it is default-enabled.
- `createAllTools(cwd)` contains the tool.
- `buildSystemPrompt({ selectedTools: [toolName] })` includes the tool description.
- CLI `--tools <toolName>` accepts the tool without an unknown-tool warning.

## Common Misses

- Creating `src/core/tools/<tool>/index.ts` but not adding it to `allTools`.
- Adding it to `allTools` but not activating it in `AgentSession`.
- Adding it to `createCodingTools()` but not to the `codingTools` preset.
- Adding it to `@astravia/coding-agent` exports but not `@astravia/runtime-tools`.
- Forgetting `system-prompt.ts`, causing the model not to see a useful description.
- Updating runtime behavior but leaving CLI help stale.
