# @astravia/runtime-core

Runtime-facing facade for creating and controlling `@astravia/coding-agent` sessions from host applications.

## What It Owns

- session lifecycle facade (`createSession`, `prompt`, `continue`, `abort`)
- runtime-safe event contract for hosts
- state snapshots and session history listing

## What It Does Not Own

- provider implementations
- terminal UI
- Electron IPC wiring
- business-specific APIs or permissions

## Who Depends On It

- [packages/cli-app](../cli-app)
- [packages/desktop-app](../desktop-app)

## Main Exports

- `RuntimeHost`
- session event and state contracts from `src/contracts.ts`
- shared runtime error helpers
