declare module "@anthropic-ai/sandbox-runtime" {
	export interface SandboxNetworkConfig {
		allowedDomains?: string[];
		deniedDomains?: string[];
	}

	export interface SandboxFilesystemConfig {
		denyRead?: string[];
		allowWrite?: string[];
		denyWrite?: string[];
	}

	export interface SandboxRuntimeConfig {
		network?: SandboxNetworkConfig;
		filesystem?: SandboxFilesystemConfig;
		ignoreViolations?: Record<string, string[]>;
		enableWeakerNestedSandbox?: boolean;
	}

	export const SandboxManager: {
		initialize(config: SandboxRuntimeConfig): Promise<void>;
		wrapWithSandbox(command: string): Promise<string>;
		reset(): Promise<void>;
	};
}
