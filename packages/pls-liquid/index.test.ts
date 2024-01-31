import { afterEach, describe, expect, test } from "vitest";
import {
	createLiquidMultisig,
	finalizeTxSpendingFromLiquidMultisig,
	getTapscriptSigsOrdered,
	signTaprootTransaction,
	startSpendFromLiquidMultisig,
} from "./index.js";
import { ECPairFactory, ECPairInterface } from "ecpair";
import { Pset, Transaction, address, bip341, networks } from "liquidjs-lib";

import * as ecc from "tiny-secp256k1";

const ECPair = ECPairFactory(ecc);

const keypair1 = ECPair.fromPrivateKey(
	Buffer.from(
		"0000000000000000000000000000000000000000000000000000000000000001",
		"hex"
	)
);
const keypair2 = ECPair.fromPrivateKey(
	Buffer.from(
		"0000000000000000000000000000000000000000000000000000000000000002",
		"hex"
	)
);
const keypair3 = ECPair.fromPrivateKey(
	Buffer.from(
		"0000000000000000000000000000000000000000000000000000000000000003",
		"hex"
	)
);

const API_URL = "http://localhost:3001";

async function takeFromFaucet(address: string) {
	const res = await fetch(`${API_URL}/faucet`, {
		method: "POST",
		body: JSON.stringify({
			address,
		}),
	});

	if (!res.ok) throw new Error(await res.text());

	return (await res.json()).txId;
}

async function getTransactionHexById(txid: string) {
	const res = await fetch(`${API_URL}/tx/${txid}/hex`);

	if (!res.ok) throw new Error(await res.text());

	return await res.text();
}

async function publishTransaction(hex: string) {
	const res = await fetch(`${API_URL}/tx`, {
		method: "POST",
		body: hex,
	});

	if (!res.ok) throw new Error(await res.text());

	return await res.text();
}

async function sleep(ms: number) {
	return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function retryWithDelay<T extends any>(
	func: () => Promise<T>,
	ms: number,
	tries: number
) {
	let i = 0;

	while (i < tries) {
		try {
			return await func();
		} catch (error) {
			await sleep(ms);
		}
		i++;
	}

	throw new Error(`Failed after ${tries} retries`);
}

async function testMultisigWithParameters(
	clientKeypairs: ECPairInterface[],
	arbitratorKeypairs: ECPairInterface[],
	quorum: number,
	redeemOutput: string,
	usedKeysCombination: ECPairInterface[]
) {
	const multisig = createLiquidMultisig(
		clientKeypairs.map((ecpair) => ecpair.publicKey.toString("hex")),
		arbitratorKeypairs.map((ecpair) => ecpair.publicKey.toString("hex")),
		quorum,
		networks.regtest
	);

	const inputTransactionId = await takeFromFaucet(multisig.confidentialAddress);

	// since the transaction might not be available instantly
	const inputTransactionHex = await retryWithDelay(
		() => {
			return getTransactionHexById(inputTransactionId);
		},
		3000,
		5
	);

	const inputTransaction = Transaction.fromHex(inputTransactionHex);

	const script = multisig.multisigScripts.find(({ combination }) =>
		usedKeysCombination.every((ecpair) =>
			combination.includes(ecpair.publicKey.toString("hex"))
		)
	);

	expect(script?.leaf.output.toString("hex")).toBe(redeemOutput);

	const inputTxOutputs = inputTransaction.outs
		.map((output, vout) => ({ ...output, vout }))
		.filter(
			(output) =>
				output.script.toString("hex") ===
				address
					.toOutputScript(multisig.address, networks.regtest)
					.toString("hex")
		);

	expect(inputTxOutputs.length).toBe(1);

	const pset = await startSpendFromLiquidMultisig(
		multisig.hashTree,
		redeemOutput,
		inputTxOutputs.map((output) => ({
			txid: inputTransactionId,
			hex: inputTransactionHex,
			vout: output.vout,
			value: undefined,
		})),
		networks.regtest,
		usedKeysCombination[0]!,
		[
			{
				address: multisig.confidentialAddress,
				value: 100_000_000 - 200, // 200 for fees
			},
		]
	);

	if (!pset) throw new Error("Couldn't create pset");

	await Promise.all(
		usedKeysCombination.slice(1).map(async (keypair) => {
			await signTaprootTransaction(
				pset,
				keypair,
				bip341.tapLeafHash({
					scriptHex: redeemOutput,
				}),
				networks.regtest
			);
		})
	);

	await finalizeAndPublishTx(
		pset,
		clientKeypairs.map((ecpair) => ecpair.publicKey.toString("hex")),
		arbitratorKeypairs.map((ecpair) => ecpair.publicKey.toString("hex"))
	);
}

async function finalizeAndPublishTx(
	pset: Pset,
	clients: string[],
	arbitrators: string[]
) {
	const { clientSigs, arbitratorSigs } = getTapscriptSigsOrdered(
		pset,
		clients,
		arbitrators
	);

	const transaction = finalizeTxSpendingFromLiquidMultisig(
		pset,
		clientSigs,
		arbitratorSigs
	);

	await publishTransaction(transaction.toHex());
}

describe(
	"1 arbitrator multisig (connects to local liquid node)",
	(it) => {
		const multisigClients = [
			keypair1.publicKey.toString("hex"),
			keypair2.publicKey.toString("hex"),
		];
		const multisigArbitrators = [keypair3.publicKey.toString("hex")];

		const multisig = createLiquidMultisig(
			multisigClients,
			multisigArbitrators,
			1,
			networks.regtest
		);

		afterEach(async () => {
			await sleep(1000);
		});

		it("Can create addresses", () => {
			expect(multisig.address).toBe(
				"ert1pcjelkftkp38t74357sq4zwc7wtcg39eglcz657jw2z6ph5u00guqelnywz"
			);
			expect(multisig.confidentialAddress).toBe(
				"el1pqfumuen7l8wthtz45p3ftn58pvrs9xlumvkuu2xet8egzkcklqte339nlvjhvrzwhatrfaqp2ya3uuhs3ztj3ls94fayu595r0fc773cp0mugegr8zz4"
			);
		});

		it("Can spend with 2 clients", async () => {
			await testMultisigWithParameters(
				[keypair1, keypair2],
				[keypair3],
				1,
				"2079be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798ac20c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5ba529c",
				[keypair1, keypair2]
			);
		});

		it("Can spend with client 1 and arbitrator", async () => {
			await testMultisigWithParameters(
				[keypair1, keypair2],
				[keypair3],
				1,
				"2079be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798ac20f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9ba529c",
				[keypair1, keypair3]
			);
		});

		it("Can spend with client 2 and arbitrator", async () => {
			await testMultisigWithParameters(
				[keypair1, keypair2],
				[keypair3],
				1,
				"20c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5ac20f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9ba529c",
				[keypair3, keypair2]
			);
		});
	},
	{
		timeout: 60 * 1000,
	}
);
