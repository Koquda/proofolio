import { getAddress, isAddress, keccak256, toUtf8Bytes } from "ethers";

export interface Profile {
  name: string;
  role: string;
  location: string;
  bio: string;
  email: string;
  website: string;
}
export type ProjectCategory = "Product design" | "Engineering" | "Research";
export interface Project {
  id: string;
  title: string;
  description: string;
  category: ProjectCategory;
  year: string;
  tags: string[];
  url: string;
  visual: "orbit" | "wave" | "grid";
  featured: boolean;
}
export interface CredentialPayload {
  version: 1;
  id: string;
  title: string;
  issuer: string;
  issuerAddress: string;
  subjectAddress: string;
  issuedAt: string;
  expiresAt: string;
  evidence: string;
}
export interface CredentialEnvelope {
  payload: CredentialPayload;
  chainId?: number;
  registryAddress?: string;
  txHash?: string;
}
export interface Activity {
  id: string;
  text: string;
  at: string;
}
export interface Portfolio {
  schemaVersion: 1;
  profile: Profile;
  projects: Project[];
  credentials: CredentialEnvelope[];
  activity: Activity[];
  sample: boolean;
}
export type VerificationResult = {
  status:
    | "unchecked"
    | "checking"
    | "draft"
    | "valid"
    | "revoked"
    | "expired"
    | "missing"
    | "mismatch"
    | "unavailable";
  message: string;
  checkedAt?: string;
  issuer?: string;
  issuedAt?: number;
};
export interface ChainConfiguration {
  chainId: number;
  registryAddress: string;
  rpcUrl: string;
}
export const categories: ProjectCategory[] = [
  "Product design",
  "Engineering",
  "Research",
];
export const shortAddress = (value: string) =>
  `${value.slice(0, 6)}…${value.slice(-4)}`;
export function newPayload(
  values: Omit<CredentialPayload, "version" | "id">,
): CredentialPayload {
  return { version: 1, id: crypto.randomUUID(), ...values };
}
export function canonicalPayload(p: CredentialPayload): string {
  return JSON.stringify({
    version: 1,
    id: p.id,
    title: p.title,
    issuer: p.issuer,
    issuerAddress: getAddress(p.issuerAddress),
    subjectAddress: getAddress(p.subjectAddress),
    issuedAt: p.issuedAt,
    expiresAt: p.expiresAt,
    evidence: p.evidence,
  });
}
export function credentialDigest(p: CredentialPayload): string {
  return keccak256(toUtf8Bytes(canonicalPayload(p)));
}
export function safeUrl(value: string): boolean {
  if (!value) return true;
  try {
    return ["https:", "http:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
const object = (x: unknown): Record<string, unknown> => {
  if (!x || typeof x !== "object" || Array.isArray(x))
    throw new Error("Expected an object.");
  return x as Record<string, unknown>;
};
const str = (x: unknown, label: string, max = 2000): string => {
  if (typeof x !== "string" || x.length > max)
    throw new Error(`${label} must be text under ${max} characters.`);
  return x;
};
const required = (x: unknown, label: string, max = 200): string => {
  const s = str(x, label, max);
  if (!s.trim()) throw new Error(`${label} is required.`);
  return s;
};
const url = (x: unknown): string => {
  const s = str(x, "Link");
  if (!safeUrl(s)) throw new Error("Links must use http or https.");
  return s;
};
const date = (x: unknown, optional = false): string => {
  const s = str(x, "Date", 10);
  if (optional && !s) return "";
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    !Number.isFinite(Date.parse(s)) ||
    new Date(s).toISOString().slice(0, 10) !== s
  )
    throw new Error("Use a valid date.");
  return s;
};
const address = (x: unknown): string => {
  const s = str(x, "Address", 42);
  if (!isAddress(s) || /^0x0{40}$/i.test(s))
    throw new Error("Enter a valid, nonzero Ethereum address.");
  return getAddress(s);
};
export function parseCredential(input: unknown): CredentialEnvelope {
  const e = object(input),
    p = object(e.payload);
  if (p.version !== 1) throw new Error("Unsupported credential version.");
  const payload: CredentialPayload = {
    version: 1,
    id: required(p.id, "Credential ID", 100),
    title: required(p.title, "Title"),
    issuer: required(p.issuer, "Issuer name"),
    issuerAddress: address(p.issuerAddress),
    subjectAddress: address(p.subjectAddress),
    issuedAt: date(p.issuedAt),
    expiresAt: date(p.expiresAt, true),
    evidence: url(p.evidence),
  };
  if (payload.expiresAt && payload.expiresAt < payload.issuedAt)
    throw new Error("Expiry must follow the issue date.");
  const result: CredentialEnvelope = { payload };
  if (e.chainId !== undefined || e.registryAddress !== undefined) {
    if (
      !Number.isSafeInteger(e.chainId) ||
      ![31337, 11155111].includes(Number(e.chainId))
    )
      throw new Error(
        "Only local and Sepolia credential networks are supported.",
      );
    result.chainId = Number(e.chainId);
    result.registryAddress = address(e.registryAddress);
  }
  if (e.txHash !== undefined) {
    const hash = str(e.txHash, "Transaction hash", 66);
    if (!/^0x[\da-f]{64}$/i.test(hash))
      throw new Error("Invalid transaction hash.");
    result.txHash = hash;
  }
  return result;
}
export function parsePortfolio(input: unknown): Portfolio {
  const p = object(input),
    profile = object(p.profile);
  if (p.schemaVersion !== 1) throw new Error("Unsupported portfolio version.");
  if (
    !Array.isArray(p.projects) ||
    p.projects.length > 100 ||
    !Array.isArray(p.credentials) ||
    p.credentials.length > 100
  )
    throw new Error(
      "A portfolio supports up to 100 projects and 100 credentials.",
    );
  const projects = p.projects.map((raw) => {
    const v = object(raw);
    if (!categories.includes(v.category as ProjectCategory))
      throw new Error("Unknown project category.");
    if (!Array.isArray(v.tags) || v.tags.length > 8)
      throw new Error("Use up to eight tags.");
    return {
      id: required(v.id, "Project ID", 100),
      title: required(v.title, "Project title"),
      description: str(v.description, "Description"),
      category: v.category as ProjectCategory,
      year: (() => {
        const year = required(v.year, "Year", 4);
        if (!/^\d{4}$/.test(year))
          throw new Error("Year must have four digits.");
        return year;
      })(),
      tags: v.tags.map((t) => str(t, "Tag", 40)),
      url: url(v.url),
      visual: (["orbit", "wave", "grid"].includes(String(v.visual))
        ? v.visual
        : "grid") as Project["visual"],
      featured: v.featured === true,
    };
  });
  const credentials = p.credentials.map(parseCredential);
  if (
    new Set(projects.map((x) => x.id)).size !== projects.length ||
    new Set(credentials.map((x) => x.payload.id)).size !== credentials.length
  )
    throw new Error("Duplicate IDs are not allowed.");
  return {
    schemaVersion: 1,
    profile: {
      name: required(profile.name, "Name"),
      role: required(profile.role, "Role"),
      location: str(profile.location, "Location", 200),
      bio: str(profile.bio, "Bio"),
      email: str(profile.email, "Email", 200),
      website: url(profile.website),
    },
    projects,
    credentials,
    activity: Array.isArray(p.activity)
      ? p.activity.slice(0, 100).map((raw) => {
          const a = object(raw);
          const at = str(a.at, "Activity time", 40);
          if (!Number.isFinite(Date.parse(at)))
            throw new Error("Invalid activity time.");
          return {
            id: required(a.id, "Activity ID", 100),
            text: required(a.text, "Activity text", 500),
            at,
          };
        })
      : [],
    sample: p.sample === true,
  };
}
export function parseConfiguration(input: unknown): ChainConfiguration {
  const c = object(input);
  if (![31337, 11155111].includes(Number(c.chainId)))
    throw new Error("Choose the local network or Sepolia.");
  const rpcUrl = required(c.rpcUrl, "RPC URL");
  if (!safeUrl(rpcUrl)) throw new Error("RPC must use http or https.");
  return {
    chainId: Number(c.chainId),
    registryAddress: address(c.registryAddress),
    rpcUrl,
  };
}
export const SAMPLE_ADDRESS = "0x1111111111111111111111111111111111111111";
export const samplePortfolio: Portfolio = {
  schemaVersion: 1,
  sample: true,
  profile: {
    name: "Alex Morgan",
    role: "Designer & creative engineer",
    location: "Madrid, Spain",
    bio: "Turning curious ideas into considered digital experiences. Working at the intersection of design, technology, and a little possibility.",
    email: "",
    website: "",
  },
  projects: [
    {
      id: "orbit",
      title: "Orbit",
      description:
        "A calmer way to make space for what matters. A concept for a more intentional day.",
      category: "Product design",
      year: "2026",
      tags: ["Strategy", "Interface design", "Prototype"],
      url: "",
      visual: "orbit",
      featured: true,
    },
    {
      id: "wave",
      title: "Fieldnotes",
      description:
        "Small observations. Bigger discoveries. A field research toolkit for curious teams.",
      category: "Research",
      year: "2026",
      tags: ["Research", "Systems thinking"],
      url: "",
      visual: "wave",
      featured: false,
    },
    {
      id: "grid",
      title: "Forma",
      description:
        "An open, modular playground for the next generation of digital makers.",
      category: "Engineering",
      year: "2025",
      tags: ["React", "Creative coding"],
      url: "",
      visual: "grid",
      featured: false,
    },
  ],
  credentials: [
    {
      payload: {
        version: 1,
        id: "f19099fc-052a-411c-8e9c-3054fa1d05b7",
        title: "Creative Technology Fellowship",
        issuer: "Example Design Lab",
        issuerAddress: SAMPLE_ADDRESS,
        subjectAddress: "0x2222222222222222222222222222222222222222",
        issuedAt: "2026-06-15",
        expiresAt: "",
        evidence: "",
      },
    },
    {
      payload: {
        version: 1,
        id: "2b7831ea-3e5a-4565-b2e6-f07f8249c7be",
        title: "Product Design Foundations",
        issuer: "Example Learning Studio",
        issuerAddress: SAMPLE_ADDRESS,
        subjectAddress: "0x2222222222222222222222222222222222222222",
        issuedAt: "2025-11-12",
        expiresAt: "",
        evidence: "",
      },
    },
  ],
  activity: [],
};
