import { createContractSchema } from "pls-core";
import { bitcoinCollateralSchema } from "pls-bitcoin";
import { liquidCollateralSchema } from "pls-liquid";
import { nostrCommunicationSchema } from "pls-nostr";
import { z } from "zod";

export const contractSchema = createContractSchema(
	[bitcoinCollateralSchema, liquidCollateralSchema],
	[nostrCommunicationSchema]
);

export type ContractSchema = z.infer<typeof contractSchema>;
