import "server-only";
import {
  BaseError,
  ContractFunctionRevertedError,
  concat,
  createWalletClient,
  decodeErrorResult,
  http,
  isAddress,
  isHex,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { firstrowAbi, forwarderAbi } from "../abi";
import { chain, network, publicClient } from "../chain";
import type { ForwardRequest } from "../signing";

const MAX_INNER_GAS = 3_000_000n;

function relayerAccount() {
  const key = process.env.RELAYER_PRIVATE_KEY;
  if (!key || !isHex(key)) throw new Error("RELAYER_PRIVATE_KEY is not set");
  return privateKeyToAccount(key);
}

export const walletClient = () => createWalletClient({ account: relayerAccount(), chain, transport: http() });

export class RelayError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export function parseRequest(body: unknown): ForwardRequest {
  const r = body as Partial<ForwardRequest>;
  if (
    !r ||
    !isAddress(r.from ?? "") ||
    r.to?.toLowerCase() !== network.firstrow.toLowerCase() ||
    r.value !== "0" ||
    typeof r.gas !== "string" ||
    !/^\d+$/.test(r.gas) ||
    typeof r.deadline !== "number" ||
    !isHex(r.data) ||
    !isHex(r.signature)
  ) {
    throw new RelayError("Malformed request");
  }
  if (BigInt(r.gas) > MAX_INNER_GAS) throw new RelayError("Request asks for too much gas");
  return r as ForwardRequest;
}

function toData(r: ForwardRequest) {
  return {
    from: r.from,
    to: r.to,
    value: 0n,
    gas: BigInt(r.gas),
    deadline: r.deadline,
    data: r.data,
    signature: r.signature,
  } as const;
}

function errorName(error: unknown): string {
  if (error instanceof BaseError) {
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) return revert.data?.errorName ?? revert.shortMessage;
    const raw = error.walk((e) => "data" in (e as object) && isHex((e as { data?: unknown }).data));
    const data = (raw as { data?: Hex } | null)?.data;
    if (data) {
      try {
        return decodeErrorResult({ abi: firstrowAbi, data }).errorName;
      } catch {}
    }
    return error.shortMessage;
  }
  return error instanceof Error ? error.message : "Unknown error";
}

// Verifies the signature, replays the call as the forwarder would make it to surface Firstrow's own error,
// then submits it and waits for the receipt.
export async function relay(r: ForwardRequest): Promise<Hex> {
  const request = toData(r);

  const valid = await publicClient.readContract({
    address: network.forwarder,
    abi: forwarderAbi,
    functionName: "verify",
    args: [request],
  });
  if (!valid) throw new RelayError("Invalid or expired signature");

  try {
    await publicClient.call({
      account: network.forwarder,
      to: network.firstrow,
      data: concat([r.data, r.from]),
      gas: request.gas,
    });
  } catch (error) {
    throw new RelayError(errorName(error), 422);
  }

  const wallet = walletClient();
  const gas = await publicClient.estimateContractGas({
    address: network.forwarder,
    abi: forwarderAbi,
    functionName: "execute",
    args: [request],
    account: wallet.account,
  });
  const hash = await wallet.writeContract({
    address: network.forwarder,
    abi: forwarderAbi,
    functionName: "execute",
    args: [request],
    gas: (gas * 11n) / 10n,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new RelayError("Transaction reverted", 500);
  return hash;
}
