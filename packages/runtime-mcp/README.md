# @astravia/runtime-mcp

MCP manager exports for host applications embedding the coding agent runtime.

## What It Owns

- MCP manager creation helpers
- host-facing MCP types

## What It Does Not Own

- MCP server configuration UI
- product-specific command flows
- transport outside the coding-agent MCP runtime

## Who Depends On It

- desktop or embedded hosts that need to surface MCP state through their own shell
