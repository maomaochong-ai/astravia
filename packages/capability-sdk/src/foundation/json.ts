import { type Static, Type } from "@sinclair/typebox";
import { defineCapabilityInputSchema, defineCapabilityOutputSchema } from "../schema.js";

export const CAPABILITY_JSON_VALUE_TYPE = Type.Recursive(
	(Self) =>
		Type.Union([
			Type.Null(),
			Type.Boolean(),
			Type.Number(),
			Type.String(),
			Type.Array(Self),
			Type.Record(Type.String(), Self),
		]),
	{ $id: "CapabilityJsonValue" },
);

export const CAPABILITY_JSON_MAP_TYPE = Type.Record(Type.String(), CAPABILITY_JSON_VALUE_TYPE);

export type CapabilityJsonValue = Static<typeof CAPABILITY_JSON_VALUE_TYPE>;
export type CapabilityJsonMap = Static<typeof CAPABILITY_JSON_MAP_TYPE>;

const capabilityJsonValueInputSchema = defineCapabilityInputSchema(CAPABILITY_JSON_VALUE_TYPE);
const capabilityJsonMapOutputSchema = defineCapabilityOutputSchema(CAPABILITY_JSON_MAP_TYPE);

export function parseCapabilityJsonValue(value: unknown): CapabilityJsonValue {
	return capabilityJsonValueInputSchema.parse(value);
}

export function parseCapabilityJsonMap(value: unknown): CapabilityJsonMap {
	return capabilityJsonMapOutputSchema.parse(value);
}
