import type { EcosystemToolDescriptor } from "../../../hooks/runtime.js";
import type { HookToolIdentity } from "../../../hooks/types.js";

export function mapToolToLatestCodex(tool: EcosystemToolDescriptor): HookToolIdentity {
	if (tool.kind === "shell") return { name: "Bash", matcherAliases: [] };
	if (tool.kind === "agent" && tool.hostName === "spawn_agent") {
		return { name: "spawn_agent", matcherAliases: ["Agent"] };
	}
	if (tool.kind === "mcp") return { name: mcpToolName(tool), matcherAliases: [] };
	if (tool.kind === "file-edit") {
		const alias = tool.hostName === "write" ? "Write" : tool.hostName === "edit" ? "Edit" : undefined;
		return { name: tool.hostName, matcherAliases: alias ? [alias] : [] };
	}
	return { name: tool.hostName, matcherAliases: [] };
}

function mcpToolName(tool: EcosystemToolDescriptor): string {
	const serverName = tool.source?.serverName;
	const originalName = tool.source?.originalName;
	if (serverName && originalName) return `mcp__${serverName}__${originalName}`;
	const legacyMatch = /^mcp_([^_]+)_(.+)$/.exec(tool.hostName);
	return legacyMatch ? `mcp__${legacyMatch[1]}__${legacyMatch[2]}` : tool.hostName;
}
