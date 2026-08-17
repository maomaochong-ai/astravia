# `mentionedFile` accepts any absolute path, not just paths inside the session cwd

> The absolute-path decision remains active. ADR-0043 supersedes only the `@path` prompt serialization and image transport described below.

`mentionedFile` (the per-prompt file/directory reference shown as a `Capsule` in `InputBar` and serialized as `@${path}` lines into the user message) is broadened: its `path` may be any absolute filesystem path. It is no longer implicitly scoped to the active session's cwd. External OS drag-drops onto `ChatPage`, internal drags from `File Explorer`, and the original `@`-mention picker all push into the same `mentionedFilesAtom` channel.

The driving requirement is that users want to "grab a file from their desktop and chat about it" with the same affordance they already use for in-project files. Forcing a second concept ("dropped file" vs "mentioned file") would have produced two near-identical capsule UIs and two prompt-injection paths for what the user perceives as one thing.

## Considered options

- **Separate `droppedFilesAtom` channel** with its own capsule style and prompt-injection rules. Cleanest boundary — "in-project mention" vs "external attachment" would never blur. Rejected because the user-facing surface is identical (small capsule, hover-for-path, prepended to the prompt) and duplicating the rendering / send / dedup / backspace-removal logic is gratuitous.
- **Allow drops only when the dropped path is inside the session cwd**, reject otherwise. Preserves the original glossary meaning of `mentionedFile`. Rejected because "drag a file from `~/Downloads`" is the dominant requested workflow; a cwd-only restriction would reject the most common case.
- **Broaden `mentionedFile`** (chosen). One concept, one channel, one capsule, one serializer. The cost is that `mentionedFile.path` can no longer be relied on as "a path inside cwd" — readers must treat it as an arbitrary absolute path.

## Consequences

- Legacy session jsonl may contain `@/absolute/path/outside/cwd` lines in user messages. New desktop turns use structured prompt attachments as defined by ADR-0043; the legacy parser remains for old logs and text-only integrations.
- The `@`-mention picker (`AtPanel`) continues to constrain itself to cwd by its own UI logic — the broadening is at the data layer, not at every producer. Producers that want a stricter scope (e.g. `AtPanel`) enforce it themselves.
- Image drops still enter through `attachedImagesAtom`, but the desktop persists them and sends the resulting absolute paths as structured image attachments. Direct multimodal data is only the persistence-failure fallback.
- Future "where did this reference come from" telemetry (e.g. distinguishing `@`-picker vs drag-drop) would require adding an explicit `source` field to `MentionedFile`; today the origin is intentionally not tracked.
