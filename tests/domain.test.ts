import { describe, expect, it } from "vitest";
import {
  canonicalPayload,
  credentialDigest,
  newPayload,
  parseConfiguration,
  parseCredential,
  parsePortfolio,
  samplePortfolio,
} from "../src/domain";

describe("portable portfolio data", () => {
  it("round trips content but discards imported verification claims", () => {
    const data = {
      ...structuredClone(samplePortfolio),
      verified: true,
      credentials: samplePortfolio.credentials.map((e) => ({
        ...e,
        status: "valid",
      })),
    };
    expect(parsePortfolio(JSON.parse(JSON.stringify(data)))).toEqual(
      samplePortfolio,
    );
  });
  it("preserves validated local activity without treating it as verification", () => {
    const activity = [
      {
        id: "local-edit",
        text: "Project added.",
        at: "2026-10-27T12:00:00.000Z",
      },
    ];
    expect(parsePortfolio({ ...samplePortfolio, activity }).activity).toEqual(
      activity,
    );
    expect(() =>
      parsePortfolio({
        ...samplePortfolio,
        activity: [{ ...activity[0], at: "invalid" }],
      }),
    ).toThrow("Invalid activity time");
  });
  it("rejects invalid imports at the boundary", () => {
    for (const change of [
      { schemaVersion: 2 },
      { projects: [{}] },
      {
        credentials: [
          {
            payload: {
              ...samplePortfolio.credentials[0].payload,
              issuerAddress: "fake",
            },
          },
        ],
      },
      {
        profile: { ...samplePortfolio.profile, website: "javascript:alert(1)" },
      },
    ])
      expect(() => parsePortfolio({ ...samplePortfolio, ...change })).toThrow();
    expect(() =>
      parsePortfolio({
        ...samplePortfolio,
        projects: [...samplePortfolio.projects, samplePortfolio.projects[0]],
      }),
    ).toThrow("Duplicate");
    expect(() =>
      parsePortfolio({
        ...samplePortfolio,
        projects: [{ ...samplePortfolio.projects[0], title: "x".repeat(201) }],
      }),
    ).toThrow();
  });
  it("rejects malformed dates and impossible expiry", () => {
    expect(() =>
      parseCredential({
        payload: {
          ...samplePortfolio.credentials[0].payload,
          issuedAt: "2026-02-30",
        },
      }),
    ).toThrow();
    expect(() =>
      parseCredential({
        payload: {
          ...samplePortfolio.credentials[0].payload,
          expiresAt: "2020-01-01",
        },
      }),
    ).toThrow();
  });
  it("uses stable order and normalized addresses for fingerprints, changes on tampering", () => {
    const p = samplePortfolio.credentials[0].payload;
    expect(credentialDigest(p)).toBe(credentialDigest({ ...p }));
    expect(canonicalPayload(p)).toContain(p.id);
    for (const modified of [
      { ...p, title: `${p.title}!` },
      { ...p, evidence: "https://example.com/proof" },
      { ...p, subjectAddress: p.issuerAddress },
    ])
      expect(credentialDigest(modified)).not.toBe(credentialDigest(p));
  });
  it("gives new drafts unique random IDs", () => {
    const {
      version: _version,
      id: _id,
      ...values
    } = samplePortfolio.credentials[0].payload;
    expect(newPayload(values).id).not.toBe(newPayload(values).id);
  });
  it("requires explicit supported configuration and safe endpoints", () => {
    expect(() =>
      parseConfiguration({
        chainId: 1,
        registryAddress: "0x1111111111111111111111111111111111111111",
        rpcUrl: "https://example.com",
      }),
    ).toThrow();
    expect(() =>
      parseConfiguration({
        chainId: 31337,
        registryAddress: "0x1111111111111111111111111111111111111111",
        rpcUrl: "file:///secret",
      }),
    ).toThrow();
  });
});
