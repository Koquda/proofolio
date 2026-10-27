import {
  BrowserProvider,
  Contract,
  FetchRequest,
  JsonRpcProvider,
  ZeroAddress,
  getAddress,
} from "ethers";
import type { Eip1193Provider } from "ethers";
import { credentialDigest, parseCredential } from "./domain";
import type {
  ChainConfiguration,
  CredentialEnvelope,
  VerificationResult,
} from "./domain";
export const registryAbi = [
  "function admin() view returns(address)",
  "function issuers(address) view returns(bool)",
  "function records(bytes32) view returns(address subject,address issuer,uint64 expiresAt,uint64 issuedAt,bool revoked)",
  "function issue(bytes32,address,uint64)",
  "function revoke(bytes32)",
  "function setIssuer(address,bool)",
];
export interface WalletProvider extends Eip1193Provider {
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (
    event: string,
    listener: (...args: unknown[]) => void,
  ) => void;
}
declare global {
  interface Window {
    ethereum?: WalletProvider;
  }
}
export const expirationSeconds = (e: CredentialEnvelope): number =>
  e.payload.expiresAt
    ? Math.floor(Date.parse(`${e.payload.expiresAt}T23:59:59Z`) / 1000)
    : 0;
export async function verifyCredential(
  e: CredentialEnvelope,
  config: ChainConfiguration | null,
): Promise<VerificationResult> {
  try {
    e = parseCredential(e);
  } catch {
    return {
      status: "mismatch",
      message: "This credential is malformed and cannot be verified.",
    };
  }
  if (!e.registryAddress || !e.chainId)
    return {
      status: "draft",
      message:
        "This credential is a draft. An authorized issuer must anchor its fingerprint on-chain.",
    };
  if (!config)
    return {
      status: "unavailable",
      message: "Set up a trusted registry to check this credential.",
    };
  if (
    e.chainId !== config.chainId ||
    getAddress(e.registryAddress) !== getAddress(config.registryAddress)
  )
    return {
      status: "mismatch",
      message:
        "The credential belongs to a different registry or network. Check its origin before changing your trusted settings.",
    };
  const request = new FetchRequest(config.rpcUrl);
  request.timeout = 8000;
  const provider = new JsonRpcProvider(request, undefined, {
    staticNetwork: false,
  });
  try {
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== config.chainId)
      return {
        status: "mismatch",
        message: "The RPC endpoint is connected to a different network.",
      };
    if ((await provider.getCode(config.registryAddress)) === "0x")
      return {
        status: "unavailable",
        message: "No contract exists at this registry address.",
      };
    const registry = new Contract(
      config.registryAddress,
      registryAbi,
      provider,
    );
    const block = await provider.getBlock("latest");
    if (!block) throw new Error("Latest block unavailable");
    const record = await registry.records(credentialDigest(e.payload), {
      blockTag: block.number,
    });
    const common = {
      checkedAt: new Date().toISOString(),
      issuer: String(record.issuer),
      issuedAt: Number(record.issuedAt),
    };
    if (record.issuer === ZeroAddress)
      return {
        ...common,
        status: "missing",
        message:
          "No issuance matches this fingerprint. The content may have changed or was never issued here.",
      };
    if (
      getAddress(record.subject) !== getAddress(e.payload.subjectAddress) ||
      getAddress(record.issuer) !== getAddress(e.payload.issuerAddress) ||
      Number(record.expiresAt) !== expirationSeconds(e)
    )
      return {
        ...common,
        status: "mismatch",
        message:
          "The on-chain subject, issuer, or expiry differs from this credential.",
      };
    if (record.revoked)
      return {
        ...common,
        status: "revoked",
        message: "The original issuer revoked this credential.",
      };
    if (
      Number(record.expiresAt) !== 0 &&
      Number(record.expiresAt) <= block.timestamp
    )
      return {
        ...common,
        status: "expired",
        message: "This credential has expired.",
      };
    return {
      ...common,
      status: "valid",
      message:
        "The fingerprint, issuer, subject, and expiry match the registry. No revocation is recorded. The issuer name is self-described.",
    };
  } catch {
    return {
      status: "unavailable",
      message:
        "The registry could not be reached or read. Check your endpoint and contract, then try again.",
    };
  } finally {
    provider.destroy();
  }
}
export async function connectWallet(): Promise<string> {
  if (!window.ethereum)
    throw new Error(
      "Install an Ethereum browser wallet to connect. You can keep editing without one.",
    );
  const provider = new BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  return (await provider.getSigner()).getAddress();
}
export async function registryWrite(
  action: "issue" | "revoke" | "authorize" | "deauthorize",
  config: ChainConfiguration | null,
  envelope?: CredentialEnvelope,
  issuer?: string,
): Promise<string> {
  if (!config) throw new Error("Set up a trusted registry first.");
  if (!window.ethereum)
    throw new Error("Connect an Ethereum browser wallet first.");
  const provider = new BrowserProvider(window.ethereum),
    network = await provider.getNetwork();
  if (Number(network.chainId) !== config.chainId)
    throw new Error(
      `Switch your wallet to ${config.chainId === 31337 ? "Local network (31337)" : "Sepolia (11155111)"}.`,
    );
  const signer = await provider.getSigner();
  if ((await provider.getCode(config.registryAddress)) === "0x")
    throw new Error("No registry contract exists at this address.");
  const registry = new Contract(config.registryAddress, registryAbi, signer);
  let tx;
  if (action === "issue" && envelope) {
    if (
      getAddress(await signer.getAddress()) !==
      getAddress(envelope.payload.issuerAddress)
    )
      throw new Error("Connect the issuer address shown in this draft.");
    if (!(await registry.issuers(await signer.getAddress())))
      throw new Error(
        "This wallet is not an authorized issuer. Ask the registry administrator to authorize it.",
      );
    tx = await registry.issue(
      credentialDigest(envelope.payload),
      envelope.payload.subjectAddress,
      expirationSeconds(envelope),
    );
  } else if (action === "revoke" && envelope) {
    if (
      envelope.chainId !== config.chainId ||
      getAddress(envelope.registryAddress || ZeroAddress) !==
        getAddress(config.registryAddress)
    )
      throw new Error("This credential belongs to another registry.");
    tx = await registry.revoke(credentialDigest(envelope.payload));
  } else if ((action === "authorize" || action === "deauthorize") && issuer)
    tx = await registry.setIssuer(getAddress(issuer), action === "authorize");
  else throw new Error("Missing transaction details.");
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1)
    throw new Error("Transaction did not complete.");
  return tx.hash;
}
