# MCP (Model Context Protocol) Support

Astravia supports the Model Context Protocol (MCP), which allows the agent to connect to external tools and data sources through MCP servers.

## Configuration

MCP servers are configured via JSON files:

- **Global configuration**: `~/.astravia/agent/mcp.json`
- **Project configuration**: `<project>/.astravia/mcp.json`

Project configuration takes precedence over global configuration.

## Configuration Format

```json
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-package"],
      "env": {
        "API_KEY": "${YOUR_API_KEY}"
      },
      "cwd": "${PROJECT_ROOT}",
      "disabled": false,
      "autoApprove": ["tool_name1", "tool_name2"],
      "startupTimeout": 10000,
      "debug": false
    }
  }
}
```

### Configuration Options

- **command** (required): The command to execute (e.g., `"npx"`, `"node"`, `"/path/to/binary"`)
- **args** (optional): Array of command-line arguments
- **env** (optional): Environment variables for the server process
  - Supports variable substitution: `${VAR_NAME}` will be replaced with the environment variable value
- **cwd** (optional): Working directory for the server process
  - Supports `${PROJECT_ROOT}` which will be replaced with the project root directory
- **disabled** (optional): Set to `true` to disable this server (default: `false`)
- **autoApprove** (optional): Array of tool names that should be auto-approved without user confirmation
- **startupTimeout** (optional): Timeout in milliseconds for server startup (default: `10000`)
- **debug** (optional): Enable debug logging for this server (default: `false`)

## Example Configurations

### Filesystem Server

Provides tools to read and list files in a specific directory:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/username/Documents"],
      "autoApprove": ["read_file", "list_directory"]
    }
  }
}
```

### GitHub Server

Provides tools to interact with GitHub repositories:

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  }
}
```

### Custom Project Server

A custom MCP server specific to your project:

```json
{
  "mcpServers": {
    "project-tools": {
      "command": "node",
      "args": ["./scripts/mcp-server.js"],
      "cwd": "${PROJECT_ROOT}",
      "env": {
        "DATABASE_URL": "${DATABASE_URL}"
      }
    }
  }
}
```

## Using MCP

### Viewing MCP Status

Use the `/mcp` command to view the status of all MCP servers:

```
/mcp
```

This will display:
- Configuration file paths
- Server statistics (total servers, ready, errors)
- Total tools and resources available
- Detailed status of each server

### MCP Commands

- **`/mcp`** - Show MCP status and available servers
- **`/mcp:reload`** - Reload MCP configuration and restart all servers
- **`/mcp:enable <server>`** - Enable a specific server
- **`/mcp:disable <server>`** - Disable a specific server

### Using MCP Tools

Once MCP servers are running, their tools are automatically available to the agent. MCP tools are prefixed with `mcp_<servername>_` to distinguish them from built-in tools.

For example, if you have a `filesystem` server, its tools might be:
- `mcp_filesystem_read_file`
- `mcp_filesystem_list_directory`

The agent can use these tools just like built-in tools.

## Settings

You can control MCP behavior through settings:

```json
{
  "enableMcp": true,
  "mcpDebug": false
}
```

- **enableMcp** (default: `true`): Enable or disable MCP globally
- **mcpDebug** (default: `false`): Enable debug logging for all MCP servers

## Troubleshooting

### Server Not Starting

1. Check the server command and arguments are correct
2. Ensure required environment variables are set
3. Check the startup timeout is sufficient
4. Enable debug mode: `"debug": true`

### Tools Not Appearing

1. Verify the server status with `/mcp`
2. Check if the server is in "ready" state
3. Look for error messages in the server output
4. Ensure the server actually provides tools

### Permission Issues

If MCP tools require user approval:
1. Add tool names to `autoApprove` list in configuration
2. Or approve them interactively when prompted

## Creating Custom MCP Servers

You can create custom MCP servers to expose your own tools and data sources. See the [MCP specification](https://modelcontextprotocol.io) for details on implementing MCP servers.

### Minimal Example

```javascript
// mcp-server.js
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server({
  name: 'custom-server',
  version: '1.0.0',
}, {
  capabilities: {
    tools: {},
  },
});

server.setRequestHandler('tools/list', async () => {
  return {
    tools: [
      {
        name: 'hello',
        description: 'Say hello',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
        },
      },
    ],
  };
});

server.setRequestHandler('tools/call', async (request) => {
  if (request.params.name === 'hello') {
    const name = request.params.arguments?.name || 'World';
    return {
      content: [
        {
          type: 'text',
          text: `Hello, ${name}!`,
        },
      ],
    };
  }
  throw new Error('Unknown tool');
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

Configure it in `mcp.json`:

```json
{
  "mcpServers": {
    "custom": {
      "command": "node",
      "args": ["./mcp-server.js"],
      "cwd": "${PROJECT_ROOT}"
    }
  }
}
```
