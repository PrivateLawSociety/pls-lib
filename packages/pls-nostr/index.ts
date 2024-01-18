import { z } from "zod";
import { PubkeysSchema } from "pls-core";

export const nostrCommunicationSchema = z.object({
	type: z.literal("nostr"),
	identifiers: PubkeysSchema,
});
