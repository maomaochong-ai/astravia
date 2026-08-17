import type {
	AnyCapabilityToken,
	CapabilityExecutionContext,
	CapabilityHandler,
	CapabilityToken,
} from "@astravia/capability-sdk";

export interface CapabilityProviderBinding {
	readonly token: AnyCapabilityToken;
	execute(input: unknown, context: CapabilityExecutionContext): Promise<unknown>;
}

export function bindCapability<Input, Output>(
	token: CapabilityToken<Input, Output>,
	handler: CapabilityHandler<Input, Output>,
): CapabilityProviderBinding {
	return {
		token,
		async execute(value, context) {
			const input = token.parseInput(value);
			const output = await handler.execute(input, context);
			return token.parseOutput(output);
		},
	};
}
