import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseActionCommand, runActionCommand } from "./action-command.js";
import { parseDebugCommand, runDebugCommand } from "./debug-command.js";

const HELP_TEXT = `Usage:
  astravia [options] [@files...] [messages...]
  astravia action <subcommand> [options]
  astravia debug <subcommand> [options]
  astravia agent [options] [@files...] [messages...]

Options:
  -h, --help            Show this help text.
  --version, -v         Show agent version.

Commands:
  action search         Search GUI actions.
  action describe       Describe a GUI action.
  action run            Run a GUI action.
  debug search          Search development-only Debug capabilities.
  debug describe        Describe a Debug capability.
  debug run             Run a Debug capability.
  agent                 Run the coding agent explicitly.

Run "astravia agent --help" for coding-agent options.
Run "astravia action --help" for GUI action options.
Run "astravia debug --help" for development Debug options.
`;

function isTopLevelHelp(argv: string[]): boolean {
	return argv.length === 0 || argv[0] === "-h" || argv[0] === "--help";
}

async function runAgentCli(argv: string[]): Promise<number> {
	const agentCliPath = fileURLToPath(new URL("./agent-cli.js", import.meta.url));
	const child = spawn(process.execPath, [agentCliPath, ...argv], {
		stdio: "inherit",
	});

	return await new Promise<number>((resolve, reject) => {
		child.once("error", reject);
		child.once("exit", (code, signal) => {
			if (signal) {
				process.kill(process.pid, signal);
				return;
			}
			resolve(code ?? 1);
		});
	});
}

export async function runCli(argv: string[]): Promise<void> {
	if (isTopLevelHelp(argv)) {
		process.stdout.write(HELP_TEXT);
		return;
	}

	const actionCommand = parseActionCommand(argv);
	if (actionCommand) {
		process.exitCode = await runActionCommand(actionCommand);
		return;
	}

	const debugCommand = parseDebugCommand(argv);
	if (debugCommand) {
		process.exitCode = await runDebugCommand(debugCommand);
		return;
	}

	process.exitCode = await runAgentCli(argv[0] === "agent" ? argv.slice(1) : argv);
}
