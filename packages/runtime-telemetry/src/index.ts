export interface LoggerContext {
	sessionId?: string;
	requestId?: string;
	toolCallId?: string;
	meta?: Record<string, unknown>;
}

export interface RuntimeLogger {
	info(message: string, context?: LoggerContext): void;
	warn(message: string, context?: LoggerContext): void;
	error(message: string, context?: LoggerContext): void;
}

export class ConsoleRuntimeLogger implements RuntimeLogger {
	info(message: string, context?: LoggerContext): void {
		console.info(this.format("info", message, context));
	}

	warn(message: string, context?: LoggerContext): void {
		console.warn(this.format("warn", message, context));
	}

	error(message: string, context?: LoggerContext): void {
		console.error(this.format("error", message, context));
	}

	private format(level: "info" | "warn" | "error", message: string, context?: LoggerContext): string {
		const payload = context ? ` ${JSON.stringify(context)}` : "";
		return `[runtime][${level}] ${message}${payload}`;
	}
}

export type RuntimeObservationType = "span" | "generation" | "event" | "agent" | "tool";
export type RuntimeObservationLevel = "DEBUG" | "DEFAULT" | "WARNING" | "ERROR";

export interface RuntimeUsageDetails {
	input?: number;
	output?: number;
	cacheRead?: number;
	cacheWrite?: number;
	totalTokens?: number;
	[key: string]: number | undefined;
}

export interface RuntimeCostDetails {
	input?: number;
	output?: number;
	cacheRead?: number;
	cacheWrite?: number;
	total?: number;
	[key: string]: number | undefined;
}

export interface RuntimeObservationUpdate {
	input?: unknown;
	output?: unknown;
	metadata?: Record<string, unknown>;
	level?: RuntimeObservationLevel;
	statusMessage?: string;
	userId?: string;
	sessionId?: string;
	traceName?: string;
	tags?: string[];
	version?: string;
	model?: string;
	modelParameters?: Record<string, string | number>;
	usageDetails?: RuntimeUsageDetails;
	costDetails?: RuntimeCostDetails;
}

export interface RuntimeObservationStartOptions {
	type?: RuntimeObservationType;
}

export interface RuntimeObservation {
	id: string;
	traceId: string;
	type: RuntimeObservationType;
	startObservation(
		name: string,
		update?: RuntimeObservationUpdate,
		options?: RuntimeObservationStartOptions,
	): RuntimeObservation;
	update(update: RuntimeObservationUpdate): void;
	end(update?: RuntimeObservationUpdate): void;
}

export interface RuntimeTracer {
	startObservation(
		name: string,
		update?: RuntimeObservationUpdate,
		options?: RuntimeObservationStartOptions,
	): RuntimeObservation;
	flush?(): Promise<void>;
	shutdown?(): Promise<void>;
}
