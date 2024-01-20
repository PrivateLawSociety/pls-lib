import { z } from "zod";
import { createHash } from "crypto";

export const PubkeysSchema = z
	.object({
		clients: z.array(z.string()).min(2),
		arbitrators: z.array(z.string()).min(1),
	})
	.catchall(z.array(z.string()).min(1)); // Any other key, such as 'mediator', is optional

const DocumentSchema = z.object({
	fileHash: z.string(),
	pubkeys: PubkeysSchema,
});

type UnionOptions<T extends string> = [
	z.ZodDiscriminatedUnionOption<T>,
	...z.ZodDiscriminatedUnionOption<T>[],
];

export function createContractSchema<
	CollateralOptions extends UnionOptions<"network">,
	CommunicationOptions extends UnionOptions<"type">,
>(
	collateralOptions: CollateralOptions,
	communicationOptions: CommunicationOptions
) {
	const unsigned = z.object({
		collateral: z.discriminatedUnion("network", collateralOptions),
		communication: z.discriminatedUnion("type", communicationOptions),
		document: DocumentSchema,
		version: z.literal(0),
	});

	const signed = unsigned.merge(
		z.object({
			signatures: z.record(z.string()),
		})
	);

	return {
		unsigned,
		signed,
	};
}

/**
 * @description Sorts an object's properties
 */
function sortObjectProperties<T>(obj: Record<string, T>): Record<string, T> {
	const sortedObj: Record<string, any> = {};

	const sortedKeys = Object.keys(obj).sort();

	for (const key of sortedKeys) {
		const value = obj[key];

		if (typeof value == "object") {
			sortedObj[key] = sortObjectProperties(value as any);
		} else {
			sortedObj[key] = obj[key];
		}
	}

	return sortedObj;
}

/**
 * @description hashes an Object deterministically
 */
export function hashFromJSON(obj: Record<string, any>) {
	const json = JSON.stringify(sortObjectProperties(obj));

	return createHash("sha256")
		.update(new Uint8Array(Buffer.from(json)))
		.digest();
}
