# @astravia/runtime-storage

Storage primitives re-exported for hosts that need session, auth, and settings persistence.

## What It Owns

- session storage exports
- auth storage exports
- settings storage exports

## What It Does Not Own

- host-specific file selection or path permissions
- application UI
- business data models

## Who Depends On It

- runtime hosts and embedded apps that need storage without importing deep `coding-agent` internals
