import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import ganache from "@ganache/core";
import { ContractFactory, JsonRpcProvider, Contract } from "ethers";
import { compileRegistry } from "../scripts/compile.mjs";
import { credentialDigest, samplePortfolio } from "../src/domain";
import type { ChainConfiguration, CredentialEnvelope } from "../src/domain";
import {
  connectWallet,
  expirationSeconds,
  registryAbi,
  registryWrite,
  verifyCredential,
} from "../src/blockchain";

const server = ganache.server({
  chain: { chainId: 31337 },
  logging: { quiet: true },
});
let provider: JsonRpcProvider,
  registry: Contract,
  config: ChainConfiguration,
  issuer: string,
  subject: string;
const make = (id: string): CredentialEnvelope => ({
  payload: {
    ...samplePortfolio.credentials[0].payload,
    id,
    issuerAddress: issuer,
    subjectAddress: subject,
  },
  chainId: 31337,
  registryAddress: config.registryAddress,
});
beforeAll(async () => {
  await server.listen(0, "127.0.0.1");
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("No test server");
  provider = new JsonRpcProvider(`http://127.0.0.1:${addr.port}`);
  provider.pollingInterval = 20;
  const signer = await provider.getSigner(0);
  issuer = await signer.getAddress();
  subject = await (await provider.getSigner(1)).getAddress();
  const artifact = compileRegistry(),
    deployed = await new ContractFactory(
      artifact.abi,
      artifact.evm.bytecode.object,
      signer,
    ).deploy();
  await deployed.waitForDeployment();
  registry = new Contract(await deployed.getAddress(), registryAbi, signer);
  config = {
    chainId: 31337,
    registryAddress: await deployed.getAddress(),
    rpcUrl: provider._getConnection().url,
  };
}, 30000);
afterAll(async () => {
  vi.unstubAllGlobals();
  provider?.destroy();
  await server.close();
});
describe("real local-chain credential lifecycle", () => {
  it("separates unissued drafts, unavailable setup, and untrusted origins", async () => {
    const e = make("draft");
    expect((await verifyCredential({ payload: e.payload }, null)).status).toBe(
      "draft",
    );
    expect((await verifyCredential(e, null)).status).toBe("unavailable");
    expect(
      (await verifyCredential({ ...e, chainId: 11155111 }, config)).status,
    ).toBe("mismatch");
    expect((await verifyCredential(e, config)).status).toBe("missing");
  });
  it("handles malformed credentials and wrong RPC networks without trusting the envelope", async () => {
    const e = make("boundaries");
    expect(
      (
        await verifyCredential(
          { ...e, payload: { ...e.payload, issuerAddress: "invalid" } },
          config,
        )
      ).status,
    ).toBe("mismatch");
    expect(
      (
        await verifyCredential(
          { ...e, registryAddress: subject },
          { ...config, registryAddress: subject },
        )
      ).status,
    ).toBe("unavailable");
    expect(
      (
        await verifyCredential(
          { ...e, chainId: 11155111 },
          { ...config, chainId: 11155111 },
        )
      ).status,
    ).toBe("mismatch");
  });
  it("blocks unauthorized issuance, subject zero, and duplicates", async () => {
    const e = make("permissions"),
      outsider = registry.connect(await provider.getSigner(1)) as Contract;
    await expect(
      outsider
        .issue(credentialDigest(e.payload), subject, 0)
        .then((tx: { wait: () => Promise<unknown> }) => tx.wait()),
    ).rejects.toThrow();
    await expect(
      registry
        .issue(
          credentialDigest(e.payload),
          "0x0000000000000000000000000000000000000000",
          0,
        )
        .then((tx: { wait: () => Promise<unknown> }) => tx.wait()),
    ).rejects.toThrow();
    await (
      await registry.issue(credentialDigest(e.payload), subject, 0)
    ).wait();
    expect((await verifyCredential(e, config)).status).toBe("valid");
    await expect(
      registry
        .issue(credentialDigest(e.payload), subject, 0)
        .then((tx: { wait: () => Promise<unknown> }) => tx.wait()),
    ).rejects.toThrow();
  });
  it("detects tampering and on-chain subject / expiry mismatches", async () => {
    const e = make("tampering");
    await (
      await registry.issue(credentialDigest(e.payload), subject, 0)
    ).wait();
    expect(
      (
        await verifyCredential(
          { ...e, payload: { ...e.payload, title: "Altered claim" } },
          config,
        )
      ).status,
    ).toBe("missing");
    const wrongSubject = make("wrong-subject");
    await (
      await registry.issue(credentialDigest(wrongSubject.payload), issuer, 0)
    ).wait();
    expect((await verifyCredential(wrongSubject, config)).status).toBe(
      "mismatch",
    );
    const wrongExpiry = make("wrong-expiry"),
      block = await provider.getBlock("latest");
    await (
      await registry.issue(
        credentialDigest(wrongExpiry.payload),
        subject,
        block!.timestamp + 5000,
      )
    ).wait();
    expect((await verifyCredential(wrongExpiry, config)).status).toBe(
      "mismatch",
    );
  });
  it("retains original issuer revocation rights after deauthorization", async () => {
    const e = make("revocable");
    await (
      await registry.issue(credentialDigest(e.payload), subject, 0)
    ).wait();
    const outsider = registry.connect(await provider.getSigner(1)) as Contract;
    await expect(
      outsider
        .setIssuer(subject, true)
        .then((tx: { wait: () => Promise<unknown> }) => tx.wait()),
    ).rejects.toThrow();
    await expect(
      outsider
        .revoke(credentialDigest(e.payload))
        .then((tx: { wait: () => Promise<unknown> }) => tx.wait()),
    ).rejects.toThrow();
    await (await registry.setIssuer(issuer, false)).wait();
    await expect(
      registry
        .issue(credentialDigest(make("deauthorized").payload), subject, 0)
        .then((tx: { wait: () => Promise<unknown> }) => tx.wait()),
    ).rejects.toThrow();
    await (await registry.revoke(credentialDigest(e.payload))).wait();
    expect((await verifyCredential(e, config)).status).toBe("revoked");
    await expect(
      registry
        .revoke(credentialDigest(e.payload))
        .then((tx: { wait: () => Promise<unknown> }) => tx.wait()),
    ).rejects.toThrow();
    await (await registry.setIssuer(issuer, true)).wait();
  });
  it("detects a different issuing wallet even when the subject matches", async () => {
    const e = make("wrong-issuer");
    e.payload.issuerAddress = subject;
    await (
      await registry.issue(credentialDigest(e.payload), subject, 0)
    ).wait();
    expect((await verifyCredential(e, config)).status).toBe("mismatch");
  });
  it("uses the real EIP-1193 wallet adapter for connection, issuer access, issuance, and revocation", async () => {
    vi.stubGlobal("window", {
      ethereum: {
        request: (args: { method: string; params?: unknown[] }) =>
          server.provider.request({
            ...args,
            method:
              args.method === "eth_requestAccounts"
                ? "eth_accounts"
                : args.method,
          } as never),
      },
    });
    expect(await connectWallet()).toBe(issuer);
    await registryWrite("authorize", config, undefined, subject);
    expect(await registry.issuers(subject)).toBe(true);
    await registryWrite("deauthorize", config, undefined, subject);
    expect(await registry.issuers(subject)).toBe(false);
    const e = make("wallet-adapter");
    const hash = await registryWrite("issue", config, e);
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
    expect((await verifyCredential(e, config)).status).toBe("valid");
    await registryWrite("revoke", config, e);
    expect((await verifyCredential(e, config)).status).toBe("revoked");
    await expect(
      registryWrite(
        "issue",
        { ...config, chainId: 11155111 },
        make("wrong-wallet-chain"),
      ),
    ).rejects.toThrow("Switch your wallet");
    await expect(
      registryWrite("issue", config, {
        ...make("wrong-wallet"),
        payload: { ...make("wrong-wallet").payload, issuerAddress: subject },
      }),
    ).rejects.toThrow("Connect the issuer");
  });
  it("evaluates expiry against current block time", async () => {
    const e = make("expiry"),
      now = (await provider.getBlock("latest"))!.timestamp;
    e.payload.expiresAt = new Date((now + 86400) * 1000)
      .toISOString()
      .slice(0, 10);
    const expiry = expirationSeconds(e);
    await (
      await registry.issue(credentialDigest(e.payload), subject, expiry)
    ).wait();
    expect((await verifyCredential(e, config)).status).toBe("valid");
    await provider.send("evm_increaseTime", [expiry - now + 1]);
    await provider.send("evm_mine", []);
    expect((await verifyCredential(e, config)).status).toBe("expired");
  });
});
