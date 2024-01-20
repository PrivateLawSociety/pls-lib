import { createContractSchema } from "pls-core";
import { bitcoinSchemas } from "pls-bitcoin";
import { liquidSchemas } from "pls-liquid";
import { nostrCommunicationSchema } from "pls-nostr";
import type { z } from "zod";

const schemas = createContractSchema(
	[
		bitcoinSchemas.mainnet,
		bitcoinSchemas.testnet,
		liquidSchemas.mainnet,
		liquidSchemas.testnet,
	],
	[nostrCommunicationSchema]
);

export const contractSchema = schemas.signed;
export const unsignedContractSchema = schemas.unsigned;

export type Contract = z.infer<typeof contractSchema>;
export type UnsignedContract = z.infer<typeof unsignedContractSchema>;
