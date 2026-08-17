# @astravia/capability-sdk

Capability contracts and built-in system adapters for Astravia hosts.

The root exports stable capability tokens, IDs, input/output types, constraints, and error codes. Host-only adapters live under `internal/*` and are not re-exported from the package root. Plugin and Theme authors consume their system SDKs rather than this package.

Providers, access decisions, and Electron implementations remain in the host runtime.

See [`docs/capabilities/README.md`](../../docs/capabilities/README.md) for the architecture.
