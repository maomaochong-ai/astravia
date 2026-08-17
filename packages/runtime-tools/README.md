# @astravia/runtime-tools

Host-facing exports for the built-in coding tools defined by `@astravia/coding-agent`.

## What It Owns

- stable re-exports of built-in coding tools for host reuse

## What It Does Not Own

- tool execution policy
- agent state
- app-specific permission UX

## Who Depends On It

- runtime hosts that want the default tool set without reaching into `coding-agent` internals

## Main Exports

- `codingTools`
- `readOnlyTools`
- individual tool factories such as `createReadTool`, `createBashTool`, `createTreeTool`
