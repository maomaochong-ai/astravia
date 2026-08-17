/**
 * MCP Tool Adapter
 *
 * Converts MCP tools to AgentTool interface,
 * allowing MCP tools to be used in the agent system.
 */

import type { AgentTool } from "@astravia/agent-core";
import type { ImageContent, TextContent } from "@astravia/ai";
import { type TSchema, Type } from "@sinclair/typebox";
import type { EcosystemHookAwareTool } from "../hooks/tool-wrapper.js";
import type { IMcpClient, McpContent, McpTool } from "./types.js";

/**
 * Convert a JSON Schema object to TypeBox schema
 * This is a simplified conversion that handles common cases
 */
function jsonSchemaToTypebox(jsonSchema: any): TSchema {
	// If no schema provided, return empty object
	if (!jsonSchema) {
		return Type.Object({});
	}

	// Handle object type
	if (jsonSchema.type === "object") {
		const properties: Record<string, TSchema> = {};

		if (jsonSchema.properties) {
			for (const [key, propSchema] of Object.entries(jsonSchema.properties)) {
				properties[key] = jsonSchemaToTypebox(propSchema);
			}
		}

		const required = jsonSchema.required || [];
		const objectSchema = Type.Object(properties);

		// Mark optional properties
		for (const key in properties) {
			if (!required.includes(key)) {
				(objectSchema.properties as any)[key] = Type.Optional((objectSchema.properties as any)[key]);
			}
		}

		return objectSchema;
	}

	// Handle array type
	if (jsonSchema.type === "array") {
		const items = jsonSchema.items ? jsonSchemaToTypebox(jsonSchema.items) : Type.Any();
		return Type.Array(items);
	}

	// Handle string type
	if (jsonSchema.type === "string") {
		if (jsonSchema.enum) {
			return Type.Union(jsonSchema.enum.map((v: string) => Type.Literal(v)));
		}
		return Type.String();
	}

	// Handle number type
	if (jsonSchema.type === "number") {
		return Type.Number();
	}

	// Handle integer type
	if (jsonSchema.type === "integer") {
		return Type.Integer();
	}

	// Handle boolean type
	if (jsonSchema.type === "boolean") {
		return Type.Boolean();
	}

	// Handle null type
	if (jsonSchema.type === "null") {
		return Type.Null();
	}

	// Handle union types (anyOf, oneOf)
	if (jsonSchema.anyOf) {
		return Type.Union(jsonSchema.anyOf.map((schema: any) => jsonSchemaToTypebox(schema)));
	}

	if (jsonSchema.oneOf) {
		return Type.Union(jsonSchema.oneOf.map((schema: any) => jsonSchemaToTypebox(schema)));
	}

	// Default to any
	return Type.Any();
}

/**
 * Convert MCP content to AgentTool content
 */
function convertMcpContent(mcpContent: McpContent[]): (TextContent | ImageContent)[] {
	const result: (TextContent | ImageContent)[] = [];

	for (const content of mcpContent) {
		if (content.type === "text") {
			result.push({
				type: "text",
				text: content.text,
			});
		} else if (content.type === "image") {
			result.push({
				type: "image",
				data: content.data,
				mimeType: content.mimeType,
			});
		} else if (content.type === "resource") {
			// Convert resource to text representation
			const resource = content.resource;
			let text = `Resource: ${resource.uri}`;
			if (resource.text) {
				text += `\n${resource.text}`;
			} else if (resource.blob) {
				text += `\n[Binary data: ${resource.mimeType || "unknown"}]`;
			}
			result.push({
				type: "text",
				text,
			});
		}
	}

	return result;
}

/**
 * Adapt an MCP tool to AgentTool interface
 */
export function adaptMcpTool(mcpTool: McpTool, client: IMcpClient, serverName: string): AgentTool {
	// Convert JSON Schema to TypeBox
	const parameters = jsonSchemaToTypebox(mcpTool.inputSchema);

	// Create AgentTool
	const agentTool: EcosystemHookAwareTool = {
		name: `mcp_${serverName}_${mcpTool.name}`,
		label: `${serverName}: ${mcpTool.name}`,
		description: mcpTool.description || `MCP tool from ${serverName}`,
		parameters,
		ecosystemHook: {
			hostName: `mcp_${serverName}_${mcpTool.name}`,
			kind: "mcp",
			source: {
				ecosystem: "mcp",
				serverName,
				originalName: mcpTool.name,
			},
		},

		async execute(_toolCallId, params, _signal, _onUpdate) {
			try {
				// Call the MCP tool
				const result = await client.callTool(mcpTool.name, params as Record<string, any>);

				// Convert MCP content to agent content
				const content = convertMcpContent(result.content);

				// Return the result
				return {
					content,
					details: result,
				};
			} catch (error) {
				// Handle errors
				const errorMessage = error instanceof Error ? error.message : String(error);
				return {
					content: [
						{
							type: "text",
							text: `Error calling MCP tool '${mcpTool.name}': ${errorMessage}`,
						},
					],
					details: {
						content: [
							{
								type: "text",
								text: errorMessage,
							},
						],
						isError: true,
					},
				};
			}
		},
	};

	return agentTool;
}

/**
 * Adapt multiple MCP tools to AgentTools
 */
export function adaptMcpTools(mcpTools: McpTool[], client: IMcpClient, serverName: string): AgentTool[] {
	return mcpTools.map((tool) => adaptMcpTool(tool, client, serverName));
}

/**
 * Extract original MCP tool name from adapted tool name
 * Format: mcp_<serverName>_<toolName>
 */
export function extractMcpToolName(adaptedName: string): { serverName: string; toolName: string } | null {
	const match = adaptedName.match(/^mcp_([^_]+)_(.+)$/);
	if (!match) {
		return null;
	}
	return {
		serverName: match[1],
		toolName: match[2],
	};
}

/**
 * Check if a tool name is an MCP tool
 */
export function isMcpTool(toolName: string): boolean {
	return toolName.startsWith("mcp_");
}
