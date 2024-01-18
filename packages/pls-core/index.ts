import { z } from "zod";

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
	return z.object({
		collateral: z.discriminatedUnion("network", collateralOptions),
		communication: z.discriminatedUnion("type", communicationOptions),
		document: DocumentSchema,
		signatures: z.record(z.string()),
		version: z.literal(0),
	});
}
