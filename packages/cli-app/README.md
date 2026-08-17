# @astravia/cli-app

Thin CLI wrapper around `@astravia/coding-agent`.

## What It Owns

- process entrypoint for the CLI app
- argument handoff into `coding-agent`

## What It Does Not Own

- agent behavior
- model/provider logic
- terminal UI primitives

## Who Depends On It

- shell users and packaging targets that want a dedicated CLI package
