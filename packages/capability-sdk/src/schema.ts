import { KindGuard, type StaticDecode, type TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { CAPABILITY_ERROR_CODES, CapabilityError } from "./contracts.js";

export interface CapabilityJsonObject {
	readonly [key: string]: CapabilityJsonValue;
}

export type CapabilityJsonValue =
	| boolean
	| number
	| string
	| null
	| CapabilityJsonObject
	| readonly CapabilityJsonValue[];

export type CapabilityJsonSchema = boolean | CapabilityJsonObject;

export interface CapabilitySchema<Value> {
	readonly jsonSchema: CapabilityJsonSchema;
	readonly parse: (value: unknown) => Value;
}

export interface CapabilityTypeBoxSchemaOptions {
	/** Preserve legacy parser behavior that accepts but removes excess object properties. */
	readonly clean?: boolean;
	/** Keep explicitly present `undefined` properties while cleaning other excess properties. */
	readonly preserveUndefinedProperties?: boolean;
}

const capabilitySchemaSkipClean = Symbol("capability.schema.skip-clean");
const capabilitySchemaRejectExcess = Symbol("capability.schema.reject-excess");

type CapabilityCleanBoundarySchema = TSchema & {
	readonly [capabilitySchemaRejectExcess]?: true;
	readonly [capabilitySchemaSkipClean]?: true;
};

/**
 * Keeps a nested schema untouched during excess-property cleanup so its own
 * validation rules, such as `additionalProperties: false`, remain strict.
 */
export function skipCapabilitySchemaClean<Schema extends TSchema>(schema: Schema): Schema {
	Object.defineProperty(schema, capabilitySchemaSkipClean, { enumerable: true, value: true });
	return schema;
}

/**
 * Keeps excess properties at this schema level so `additionalProperties: false`
 * rejects them, while known nested properties remain eligible for cleanup.
 */
export function rejectCapabilitySchemaExcess<Schema extends TSchema>(schema: Schema): Schema {
	Object.defineProperty(schema, capabilitySchemaRejectExcess, { enumerable: true, value: true });
	return schema;
}

function cloneJsonValue(value: unknown): CapabilityJsonValue {
	if (value === null || typeof value === "boolean" || typeof value === "string") return value;
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (Array.isArray(value)) return Object.freeze(value.map(cloneJsonValue));
	if (typeof value !== "object") throw new Error("Capability schema must contain JSON-compatible values");

	const result: Record<string, CapabilityJsonValue> = {};
	for (const [key, child] of Object.entries(value)) {
		if (child !== undefined) result[key] = cloneJsonValue(child);
	}
	return Object.freeze(result);
}

function cloneJsonSchema(schema: TSchema): CapabilityJsonSchema {
	const cloned = cloneJsonValue(schema);
	if (typeof cloned === "boolean") return cloned;
	if (Array.isArray(cloned) || typeof cloned !== "object" || cloned === null) {
		throw new Error("Capability schema root must be a JSON Schema object or boolean");
	}
	return cloned as CapabilityJsonObject;
}

function removeUndefinedProperties(value: unknown): void {
	if (Array.isArray(value)) {
		for (const item of value) removeUndefinedProperties(item);
		return;
	}
	if (typeof value !== "object" || value === null) return;

	const record = value as Record<string, unknown>;
	for (const [key, child] of Object.entries(record)) {
		if (child === undefined) Reflect.deleteProperty(record, key);
		else removeUndefinedProperties(child);
	}
}

function cleanCapabilityValueBySchema(schema: TSchema, value: unknown, parentReferences: TSchema[]): unknown {
	if ((schema as CapabilityCleanBoundarySchema)[capabilitySchemaSkipClean]) return value;
	const references = schema.$id === undefined ? parentReferences : [...parentReferences, schema];

	if (KindGuard.IsUnion(schema)) {
		for (const member of schema.anyOf) {
			const candidate = cleanCapabilityValueBySchema(member, Value.Clone(value), references);
			if (Value.Check(member, references, candidate)) return candidate;
		}
		return value;
	}

	if (KindGuard.IsObject(schema) && typeof value === "object" && value !== null && !Array.isArray(value)) {
		const record = value as Record<string, unknown>;
		const rejectExcess = (schema as CapabilityCleanBoundarySchema)[capabilitySchemaRejectExcess] === true;
		for (const key of Object.getOwnPropertyNames(record)) {
			if (Object.hasOwn(schema.properties, key)) {
				const propertySchema = schema.properties[key];
				if (propertySchema !== undefined) {
					record[key] = cleanCapabilityValueBySchema(propertySchema, record[key], references);
				}
				continue;
			}
			if (rejectExcess) continue;
			if (
				KindGuard.IsSchema(schema.additionalProperties) &&
				Value.Check(schema.additionalProperties, references, record[key])
			) {
				record[key] = cleanCapabilityValueBySchema(schema.additionalProperties, record[key], references);
				continue;
			}
			Reflect.deleteProperty(record, key);
		}
		return record;
	}

	if (KindGuard.IsArray(schema) && Array.isArray(value)) {
		for (let index = 0; index < value.length; index += 1) {
			value[index] = cleanCapabilityValueBySchema(schema.items, value[index], references);
		}
		return value;
	}

	return Value.Clean(schema, references, value);
}

function cleanCapabilityValue(schema: TSchema, value: unknown, preserveUndefinedProperties: boolean): unknown {
	const cloned = Value.Clone(value);
	if (!preserveUndefinedProperties) removeUndefinedProperties(cloned);
	return cleanCapabilityValueBySchema(schema, cloned, []);
}

function defineTypeBoxCapabilitySchema<Schema extends TSchema>(
	schema: Schema,
	errorCode: typeof CAPABILITY_ERROR_CODES.INVALID_INPUT | typeof CAPABILITY_ERROR_CODES.INVALID_OUTPUT,
	message: string,
	options: CapabilityTypeBoxSchemaOptions,
): CapabilitySchema<StaticDecode<Schema>> {
	return Object.freeze({
		jsonSchema: cloneJsonSchema(schema),
		parse: (value: unknown): StaticDecode<Schema> => {
			try {
				const candidate = options.clean
					? cleanCapabilityValue(schema, value, options.preserveUndefinedProperties === true)
					: value;
				return Value.Decode(schema, candidate);
			} catch (cause) {
				throw new CapabilityError(errorCode, message, { cause });
			}
		},
	});
}

/**
 * Defines a JSON-compatible TypeBox input schema. Transform and JavaScript-only
 * TypeBox schemas are intentionally unsupported because Catalog output is JSON Schema.
 */
export function defineCapabilityInputSchema<Schema extends TSchema>(
	schema: Schema,
	options: CapabilityTypeBoxSchemaOptions = {},
): CapabilitySchema<StaticDecode<Schema>> {
	return defineTypeBoxCapabilitySchema(
		schema,
		CAPABILITY_ERROR_CODES.INVALID_INPUT,
		"Capability input validation failed",
		options,
	);
}

/**
 * Defines a JSON-compatible TypeBox output schema. Transform and JavaScript-only
 * TypeBox schemas are intentionally unsupported because Catalog output is JSON Schema.
 */
export function defineCapabilityOutputSchema<Schema extends TSchema>(
	schema: Schema,
	options: CapabilityTypeBoxSchemaOptions = {},
): CapabilitySchema<StaticDecode<Schema>> {
	return defineTypeBoxCapabilitySchema(
		schema,
		CAPABILITY_ERROR_CODES.INVALID_OUTPUT,
		"Capability output validation failed",
		options,
	);
}

/** Represents a command that returns no JSON result payload. */
export function defineCapabilityNoOutputSchema(): CapabilitySchema<undefined> {
	return Object.freeze({
		jsonSchema: false,
		parse: (value: unknown): undefined => {
			if (value !== undefined) {
				throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability output must be undefined");
			}
			return undefined;
		},
	});
}
