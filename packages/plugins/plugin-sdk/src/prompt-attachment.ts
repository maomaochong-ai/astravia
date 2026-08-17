/**
 * One-shot plugin-owned context attached to the next outgoing prompt.
 *
 * The host renders only the label/icon, merges metadata and hidden instructions
 * at send time, then clears the attachment. Domain payloads stay in plugin
 * storage or out-of-band references.
 */
export interface PluginPromptAttachment {
	id: string;
	label: string;
	icon?: string;
	instructions?: string[];
	metadata?: Record<string, unknown>;
}
