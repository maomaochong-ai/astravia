# Structured prompt attachments

Files, directories, and persisted images selected in the desktop input bar are carried in `PromptRequest.attachments` rather than serialized into the user-visible prompt as `@absolute-path` lines.

Each attachment is an absolute filesystem reference:

```ts
interface PromptAttachmentRef {
  kind: "file" | "directory" | "image";
  path: string;
}
```

The coding-agent input pipeline persists one hidden `prompt_attachment_context` custom message before the user message. Its content gives the model the attachment list and instructs it to read entries with tools only when needed; its structured `details.attachments` restores desktop history and message editing without parsing model-facing text.

## Consequences

- User text, conversation titles, copy actions, and prompt editing no longer contain transport prefixes.
- Adding an attachment does not read it or grant filesystem permission. Existing tool and sandbox policy remains authoritative.
- Missing or moved paths are normal historical state. History loading keeps the reference; the read tool reports availability only if the agent uses it.
- Persisted desktop images use `kind: "image"` path references. `PromptRequest.images` remains available for direct multimodal callers and as a desktop fallback when image persistence fails.
- Old `@absolute-path` prefixes remain readable for existing sessions and text-only integrations.
- The paused batch-task resume API still accepts text only, so that compatibility path temporarily serializes attachments with the legacy prefix format until its contract is migrated.
