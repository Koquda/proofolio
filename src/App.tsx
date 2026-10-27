import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  Search,
  SlidersHorizontal,
  Wallet,
  Check,
  X,
  ShieldCheck,
  Fingerprint,
  MoreHorizontal,
  Download,
  Upload,
  Eye,
  Pencil,
  ExternalLink,
  Copy,
  Settings,
  Globe2,
  MapPin,
  CheckCircle2,
  Circle,
  AlertCircle,
  Clock3,
  Link2,
} from "lucide-react";
import type {
  ChainConfiguration,
  CredentialEnvelope,
  Portfolio,
  Project,
  VerificationResult,
} from "./domain";
import {
  categories,
  credentialDigest,
  newPayload,
  parseConfiguration,
  parseCredential,
  parsePortfolio,
  samplePortfolio,
  shortAddress,
} from "./domain";
import { connectWallet, registryWrite, verifyCredential } from "./blockchain";

type Modal =
  | { type: "profile" }
  | { type: "project"; project?: Project }
  | { type: "credential" }
  | { type: "detail"; id: string }
  | { type: "settings" }
  | { type: "import" };
const STORAGE = "proofolio.portfolio.v1",
  CONFIG = "proofolio.registry.v1";
const unchecked: VerificationResult = {
  status: "unchecked",
  message: "Check the live registry to see its current status.",
};
function initialPortfolio(): Portfolio {
  try {
    const saved = localStorage.getItem(STORAGE);
    return saved
      ? parsePortfolio(JSON.parse(saved))
      : structuredClone(samplePortfolio);
  } catch {
    return structuredClone(samplePortfolio);
  }
}
function initialConfig(): ChainConfiguration | null {
  try {
    const c = localStorage.getItem(CONFIG);
    if (c) return parseConfiguration(JSON.parse(c));
    if (import.meta.env.VITE_REGISTRY_ADDRESS && import.meta.env.VITE_RPC_URL)
      return parseConfiguration({
        chainId: import.meta.env.VITE_CHAIN_ID || 31337,
        registryAddress: import.meta.env.VITE_REGISTRY_ADDRESS,
        rpcUrl: import.meta.env.VITE_RPC_URL,
      });
  } catch {
    /* Invalid configuration requires explicit setup. */
  }
  return null;
}
function ModalShell({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef(document.activeElement as HTMLElement | null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => {
      dialog.close();
      previousFocus.current?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={close}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
      aria-labelledby="modal-title"
    >
      <div className="modal-head">
        <div>
          <span className="eyebrow">PROOFOLIO STUDIO</span>
          <h2 id="modal-title">{title}</h2>
        </div>
        <button
          className="icon-button"
          onClick={close}
          aria-label="Close dialog"
        >
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function ProjectVisual({ kind }: { kind: Project["visual"] }) {
  if (kind === "orbit")
    return (
      <div className="visual orbit-visual" aria-hidden="true">
        <span className="visual-label">MAKE ROOM FOR GOOD THINGS.</span>
        <div className="orbit-ui">
          <div className="orbit-ui-top">
            <span className="tiny-orbit" /> orbit <MoreHorizontal size={18} />
          </div>
          <div className="orbit-ui-greeting">
            A little more
            <br />
            <b>headspace.</b>
          </div>
          <div className="orbit-ui-footer">
            <span>Today's space</span>
            <span>↗</span>
          </div>
          <div className="orbit-progress">
            <i />
          </div>
        </div>
        <div className="orbit-ring ring-one" />
        <div className="orbit-ring ring-two" />
        <span className="visual-bottom">
          INTENTIONAL BY DESIGN <ArrowUpRight size={14} />
        </span>
      </div>
    );
  if (kind === "wave")
    return (
      <div className="visual wave-visual" aria-hidden="true">
        <div className="wave-word">f.</div>
        <svg viewBox="0 0 400 230" preserveAspectRatio="none">
          {Array.from({ length: 13 }, (_, i) => (
            <path
              key={i}
              d={`M -20 ${65 + i * 11} C 110 ${-10 + i * 8}, 160 ${290 - i * 6}, 430 ${75 + i * 10}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
            />
          ))}
        </svg>
        <span className="wave-note">
          A FIELD GUIDE TO
          <br />
          THE UNEXPECTED.
        </span>
      </div>
    );
  return (
    <div className="visual grid-visual" aria-hidden="true">
      <span className="visual-label">OPEN TO POSSIBILITY.</span>
      <div className="forma-tiles">
        <i />
        <i />
        <i />
        <i />
      </div>
      <span className="forma-word">
        forma<span>®</span>
      </span>
      <span className="visual-bottom">
        BUILD SOMETHING DIFFERENT <ArrowUpRight size={14} />
      </span>
    </div>
  );
}
export default function App() {
  const [portfolio, setPortfolio] = useState(initialPortfolio),
    [config, setConfig] = useState(initialConfig);
  const [tab, setTab] = useState<"Portfolio" | "Credentials" | "Activity">(
    "Portfolio",
  );
  const [modal, setModal] = useState<Modal | null>(null),
    [preview, setPreview] = useState(false),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState("All work");
  const [wallet, setWallet] = useState(""),
    [toast, setToast] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [importCandidate, setImportCandidate] = useState<Portfolio | null>(null),
    [undo, setUndo] = useState<Portfolio | null>(null),
    [statuses, setStatuses] = useState<Record<string, VerificationResult>>({});
  const epoch = useRef(0),
    fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(portfolio));
    } catch {
      setToast(
        "Storage is full or unavailable. Export your portfolio to keep a copy.",
      );
    }
  }, [portfolio]);
  useEffect(() => {
    try {
      if (config) localStorage.setItem(CONFIG, JSON.stringify(config));
      else localStorage.removeItem(CONFIG);
    } catch {
      setToast("Registry settings could not be saved.");
    }
    epoch.current++;
    setStatuses({});
  }, [config]);
  useEffect(() => {
    const provider = window.ethereum;
    const reset = () => {
      epoch.current++;
      setWallet("");
      setStatuses({});
      setToast("Wallet changed. Connect again before continuing.");
    };
    provider?.on?.("accountsChanged", reset);
    provider?.on?.("chainChanged", reset);
    return () => {
      provider?.removeListener?.("accountsChanged", reset);
      provider?.removeListener?.("chainChanged", reset);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => {
      setToast("");
      setUndo(null);
    }, 7000);
    return () => clearTimeout(timer);
  }, [toast]);
  const open = (next: Modal) => {
    setError("");
    setImportCandidate(null);
    setModal(next);
  };
  const close = () => {
    if (!busy) setModal(null);
  };
  const update = (next: Portfolio, text: string) => {
    setUndo(null);
    setPortfolio({
      ...next,
      activity: [
        { id: crypto.randomUUID(), text, at: new Date().toISOString() },
        ...next.activity,
      ].slice(0, 100),
    });
    setToast(text);
  };
  const transact = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message.replace(/ \(action=.*$/s, "")
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  const connect = async () => {
    try {
      setWallet(await connectWallet());
      setToast("Wallet connected.");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Could not connect wallet.");
    }
  };
  const checkCredential = async (e: CredentialEnvelope) => {
    const generation = epoch.current;
    setStatuses((s) => ({
      ...s,
      [e.payload.id]: {
        status: "checking",
        message: "Reading the current registry…",
      },
    }));
    const result = await verifyCredential(e, config);
    if (generation === epoch.current)
      setStatuses((s) => ({ ...s, [e.payload.id]: result }));
  };
  const exportPortfolio = () => {
    const blob = new Blob([JSON.stringify(portfolio, null, 2)], {
        type: "application/json",
      }),
      href = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = href;
    a.download = "proofolio.json";
    a.click();
    URL.revokeObjectURL(href);
    setToast("Portfolio exported. Your registry settings stay on this device.");
  };
  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 1_000_000)
        throw new Error("Choose a JSON file smaller than 1 MB.");
      const imported = parsePortfolio(JSON.parse(await file.text()));
      setImportCandidate({ ...imported, activity: [] });
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not import this file.");
    }
    if (fileRef.current) fileRef.current.value = "";
  };
  const projectForm = (
    event: FormEvent<HTMLFormElement>,
    existing?: Project,
  ) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget),
      value = (key: string) => String(data.get(key) || "");
    try {
      const project: Project = {
        id: existing?.id || crypto.randomUUID(),
        title: value("title"),
        description: value("description"),
        category: value("category") as Project["category"],
        year: value("year"),
        tags: value("tags")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        url: value("url"),
        visual: value("visual") as Project["visual"],
        featured: data.get("featured") === "on",
      };
      const projects = existing
        ? portfolio.projects.map((p) => (p.id === existing.id ? project : p))
        : [...portfolio.projects, project];
      const next = parsePortfolio({ ...portfolio, projects });
      update(
        { ...next, activity: portfolio.activity },
        existing ? "Project updated." : "Project added.",
      );
      setModal(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const filteredProjects = portfolio.projects.filter(
    (p) =>
      (category === "All work" || p.category === category) &&
      `${p.title} ${p.description} ${p.tags.join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const filteredCredentials = portfolio.credentials.filter((e) =>
    `${e.payload.title} ${e.payload.issuer}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const selected =
    modal?.type === "detail"
      ? portfolio.credentials.find((e) => e.payload.id === modal.id)
      : undefined;
  const result = selected
    ? statuses[selected.payload.id] ||
      (selected.registryAddress
        ? unchecked
        : ({
            status: "draft",
            message: "An unissued draft. No on-chain proof exists yet.",
          } as VerificationResult))
    : unchecked;
  const validCount = Object.values(statuses).filter(
    (s) => s.status === "valid",
  ).length;
  return (
    <div className={preview ? "app preview-mode" : "app"}>
      {preview && (
        <div className="preview-banner">
          <Eye size={16} />
          <span>Public preview · visible only in this browser</span>
          <button onClick={() => setPreview(false)}>
            Back to editing <ArrowRight size={15} />
          </button>
        </div>
      )}
      <header className="topbar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setTab("Portfolio");
          }}
          aria-label="Proofolio home"
        >
          <span className="brand-mark">
            <Fingerprint size={25} />
          </span>
          proofolio<span className="brand-dot">.</span>
        </a>
        <nav aria-label="Main navigation">
          {(["Portfolio", "Credentials", "Activity"] as const).map((t) => (
            <button
              key={t}
              aria-current={tab === t ? "page" : undefined}
              className={tab === t ? "active" : ""}
              onClick={() => {
                setTab(t);
                setSearch("");
              }}
            >
              {t}
            </button>
          ))}
        </nav>
        <div className="topbar-right">
          {!preview && (
            <button
              className="icon-button settings-button"
              aria-label="Registry and data settings"
              onClick={() => open({ type: "settings" })}
            >
              <Settings size={19} />
            </button>
          )}
          <button
            className={`wallet-button ${wallet ? "connected" : ""}`}
            onClick={connect}
          >
            <Wallet size={16} />
            <span>{wallet ? shortAddress(wallet) : "Connect wallet"}</span>
          </button>
        </div>
      </header>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="hero-kicker">
              <span /> A LITTLE MORE YOU. A LOT MORE PROOF.
            </div>
            <h1>
              Your work.
              <br />
              <span>With proof.</span>
              <span className="headline-spark">✳</span>
            </h1>
            <p>
              A home for what you make.
              <br />A way to back it up.
            </p>
            <div className="hero-actions">
              {!preview ? (
                <button
                  className="button primary"
                  onClick={() => open({ type: "project" })}
                >
                  Add your work <Plus size={17} />
                </button>
              ) : (
                <a className="button primary" href="#selected-work">
                  Explore the work <ArrowRight size={17} />
                </a>
              )}
              <button
                className="text-button"
                onClick={() =>
                  preview
                    ? document
                        .getElementById("selected-work")
                        ?.scrollIntoView({ behavior: "smooth" })
                    : setPreview(true)
                }
              >
                {preview ? "View portfolio" : "Preview portfolio"}{" "}
                <ArrowUpRight size={17} />
              </button>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="art-orbit orbit-a" />
            <div className="art-orbit orbit-b" />
            <span className="art-label label-a">BUILT BY YOU.</span>
            <div className="proof-medallion">
              <div className="medallion-rim">
                <span className="medallion-top">
                  ORIGINAL WORK · REAL POTENTIAL
                </span>
                <Fingerprint size={106} strokeWidth={1.3} />
                <span className="medallion-bottom">
                  YOUR NEXT CHAPTER STARTS HERE
                </span>
              </div>
              <span className="medallion-spark">✳</span>
            </div>
            <div className="floating-proof">
              <span>
                <Check size={15} />
              </span>
              <div>
                More than a claim.<small>A checkable fingerprint.</small>
              </div>
            </div>
            <span className="art-label label-b">BACKED BY PROOF.</span>
            <span className="small-star">✦</span>
          </div>
        </section>
        <section className="profile-strip" aria-label="Portfolio owner">
          <div className="avatar">
            {portfolio.profile.name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2)}
          </div>
          <div className="profile-info">
            <div className="profile-name">
              <h2>{portfolio.profile.name}</h2>
              {portfolio.sample && (
                <span className="sample-chip">FICTIONAL EXAMPLE</span>
              )}
            </div>
            <p>
              {portfolio.profile.role}
              <span className="profile-location">
                <span>·</span>
                <MapPin size={13} />
                {portfolio.profile.location}
              </span>
            </p>
          </div>
          <div className="profile-links">
            {portfolio.profile.website && (
              <a
                className="icon-button"
                href={portfolio.profile.website}
                target="_blank"
                rel="noreferrer"
                aria-label="Visit profile website"
              >
                <Globe2 size={19} />
              </a>
            )}
            {!preview && (
              <button
                className="button subtle"
                onClick={() => open({ type: "profile" })}
              >
                <Pencil size={14} /> Edit profile
              </button>
            )}
          </div>
        </section>
        <section className="workspace" id="selected-work">
          <div className="section-header">
            <div>
              <span className="eyebrow">
                {tab === "Portfolio"
                  ? "THE THINGS YOU PUT INTO THE WORLD"
                  : tab === "Credentials"
                    ? "CLAIMS YOU CAN INSPECT"
                    : "YOUR PORTFOLIO, IN MOTION"}
              </span>
              <h2>
                {tab === "Portfolio"
                  ? "Selected work"
                  : tab === "Credentials"
                    ? "Your credentials"
                    : "Recent activity"}
                <span className="count">
                  {tab === "Portfolio"
                    ? portfolio.projects.length
                    : tab === "Credentials"
                      ? portfolio.credentials.length
                      : portfolio.activity.length}
                </span>
              </h2>
            </div>
            <div className="section-controls">
              {tab !== "Activity" && (
                <label className="search-field">
                  <Search size={16} />
                  <input
                    aria-label={
                      tab === "Portfolio"
                        ? "Search projects"
                        : "Search credentials"
                    }
                    placeholder="Find something…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <kbd>⌕</kbd>
                </label>
              )}
              {!preview && tab !== "Activity" && (
                <button
                  className="icon-button add-control"
                  aria-label={
                    tab === "Credentials" ? "Add credential" : "Add project"
                  }
                  onClick={() =>
                    open({
                      type: tab === "Credentials" ? "credential" : "project",
                    })
                  }
                >
                  <Plus size={21} />
                </button>
              )}
            </div>
          </div>
          {tab === "Portfolio" && (
            <>
              <div className="filter-row">
                <div
                  className="filters"
                  role="group"
                  aria-label="Filter projects"
                >
                  {["All work", ...categories].map((c) => (
                    <button
                      key={c}
                      aria-pressed={category === c}
                      className={category === c ? "chosen" : ""}
                      onClick={() => setCategory(c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <span className="curated">
                  <SlidersHorizontal size={14} /> Thoughtfully curated
                </span>
              </div>
              <div className="portfolio-layout">
                <div className="projects-grid">
                  {filteredProjects.map((project, index) => (
                    <article
                      className={`project-card ${index === 0 && project.featured ? "featured" : ""}`}
                      key={project.id}
                    >
                      <button
                        className="project-cover"
                        onClick={() =>
                          preview
                            ? setToast(project.description)
                            : open({ type: "project", project })
                        }
                        aria-label={
                          preview
                            ? `About ${project.title}`
                            : `Edit ${project.title}`
                        }
                      >
                        <ProjectVisual kind={project.visual} />
                        <span className="cover-arrow">
                          <ArrowUpRight size={21} />
                        </span>
                      </button>
                      <div className="project-meta">
                        <div>
                          <span className="project-category">
                            {project.category} <span> / </span> {project.year}
                          </span>
                          <h3>{project.title}</h3>
                        </div>
                        {project.url && (
                          <a
                            href={project.url}
                            target="_blank"
                            rel="noreferrer"
                            className="icon-button"
                            aria-label={`Open ${project.title}`}
                          >
                            <ArrowUpRight size={20} />
                          </a>
                        )}
                      </div>
                      <p>{project.description}</p>
                      <div className="tags">
                        {project.tags.map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                      </div>
                    </article>
                  ))}
                  {filteredProjects.length === 0 && (
                    <div className="empty-state">
                      <Search />
                      <h3>No projects here yet.</h3>
                      <p>Try a different search or add your next idea.</p>
                    </div>
                  )}
                </div>
                <aside className="portfolio-aside">
                  <div className="credentials-panel">
                    <div className="panel-heading">
                      <span className="small-icon">
                        <ShieldCheck size={17} />
                      </span>
                      <h3>Proof, attached.</h3>
                      <button
                        className="icon-button"
                        aria-label="View all credentials"
                        onClick={() => setTab("Credentials")}
                      >
                        <ArrowUpRight size={19} />
                      </button>
                    </div>
                    <p className="panel-description">
                      The learning, experience, and little wins behind the work.
                    </p>
                    <div className="credential-mini-list">
                      {portfolio.credentials.slice(0, 3).map((e, i) => (
                        <button
                          key={e.payload.id}
                          className="credential-mini"
                          onClick={() =>
                            open({ type: "detail", id: e.payload.id })
                          }
                        >
                          <span className={`credential-emblem emblem-${i % 2}`}>
                            <Fingerprint size={23} />
                          </span>
                          <span>
                            <strong>{e.payload.title}</strong>
                            <small>{e.payload.issuer}</small>
                            <span
                              className={`status-dot ${statuses[e.payload.id]?.status === "valid" ? "valid" : ""}`}
                            >
                              {statuses[e.payload.id]?.status === "valid"
                                ? "Verified now"
                                : e.registryAddress
                                  ? "Check available"
                                  : "Unissued draft"}
                            </span>
                          </span>
                          <ArrowUpRight size={14} />
                        </button>
                      ))}
                    </div>
                    {!preview && (
                      <button
                        className="add-credential"
                        onClick={() => open({ type: "credential" })}
                      >
                        <Plus size={15} /> Add a credential
                      </button>
                    )}
                    <div className="proof-note">
                      <Link2 size={14} />
                      <span>
                        {config
                          ? "Connected to your trusted registry"
                          : "Proof starts with a trusted registry"}
                        <button onClick={() => open({ type: "settings" })}>
                          {config
                            ? "View network settings"
                            : "Set up when you’re ready"}{" "}
                          <ArrowRight size={12} />
                        </button>
                      </span>
                    </div>
                  </div>
                  <div className="about-card">
                    <span className="eyebrow">A PERSON BEHIND THE PIXELS</span>
                    <h3>
                      Curiosity.
                      <br />
                      Then craft.
                    </h3>
                    <p>{portfolio.profile.bio}</p>
                    <span className="about-flower" aria-hidden="true">
                      ✳
                    </span>
                  </div>
                  <div className="local-note">
                    <Circle size={7} fill="currentColor" />
                    <span>
                      Yours, on this device.
                      <br />
                      Export a copy to take it with you.
                    </span>
                    {!preview && (
                      <button
                        onClick={exportPortfolio}
                        aria-label="Export portfolio"
                      >
                        <Download size={16} />
                      </button>
                    )}
                  </div>
                </aside>
              </div>
            </>
          )}
          {tab === "Credentials" && (
            <>
              <div className="credentials-intro">
                <ShieldCheck size={22} />
                <p>
                  A credential is a claim until its fingerprint matches a
                  trusted registry. Checking proves wallet issuance and content
                  integrity. It does not establish an institution’s real-world
                  identity.
                </p>
                <span>{validCount} checked valid</span>
              </div>
              <div className="credential-grid">
                {filteredCredentials.map((e) => {
                  const status = statuses[e.payload.id];
                  return (
                    <button
                      key={e.payload.id}
                      className="credential-card"
                      onClick={() => open({ type: "detail", id: e.payload.id })}
                    >
                      <span className="credential-card-icon">
                        <Fingerprint size={35} />
                      </span>
                      <span className="credential-card-status">
                        {status?.status === "valid"
                          ? "Verified now"
                          : e.registryAddress
                            ? "Ready to check"
                            : "Unissued draft"}
                      </span>
                      <h3>{e.payload.title}</h3>
                      <p>{e.payload.issuer}</p>
                      <div>
                        <span>
                          Issued{" "}
                          {new Date(
                            `${e.payload.issuedAt}T12:00:00`,
                          ).toLocaleDateString("en", {
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                        <ArrowUpRight size={20} />
                      </div>
                    </button>
                  );
                })}
                {!preview && (
                  <button
                    className="credential-card new-credential-card"
                    onClick={() => open({ type: "credential" })}
                  >
                    <Plus size={30} />
                    <h3>Add your next milestone</h3>
                    <p>Start with a draft. Attach proof later.</p>
                  </button>
                )}
              </div>
              {filteredCredentials.length === 0 && (
                <div className="empty-state">
                  <Fingerprint />
                  <h3>No matching credentials.</h3>
                  <p>Add a draft or try another search.</p>
                </div>
              )}
            </>
          )}
          {tab === "Activity" && (
            <div className="activity-list">
              {portfolio.activity.length === 0 ? (
                <div className="empty-state">
                  <Clock3 />
                  <h3>A fresh page.</h3>
                  <p>Your edits, imports, and transactions will appear here.</p>
                </div>
              ) : (
                portfolio.activity.map((a) => (
                  <div className="activity-row" key={a.id}>
                    <span>
                      <Check size={16} />
                    </span>
                    <div>
                      <strong>{a.text}</strong>
                      <small>{new Date(a.at).toLocaleString()}</small>
                    </div>
                  </div>
                ))
              )}
              <p className="activity-note">
                Activity is a local convenience log. It is not a blockchain
                audit trail.
              </p>
            </div>
          )}
        </section>
        <section className="closing-note">
          <span className="closing-icon">
            <Fingerprint size={34} />
          </span>
          <div>
            <h2>Good work deserves a paper trail.</h2>
            <p>Keep the story. Make the proof checkable.</p>
          </div>
          <button
            className="text-button"
            onClick={() => open({ type: "settings" })}
          >
            How proof works <ArrowUpRight size={17} />
          </button>
        </section>
      </main>
      <footer>
        <a className="brand footer-brand" href="#">
          proofolio<span className="brand-dot">.</span>
        </a>
        <span>Made of ideas. Backed by you.</span>
        <span className="footer-local">
          LOCAL FIRST <span>·</span> OPEN SOURCE
        </span>
      </footer>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
          {undo && (
            <button
              className="undo-button"
              onClick={() => {
                setPortfolio(undo);
                setUndo(null);
                setToast("Restored to your portfolio.");
              }}
            >
              Undo
            </button>
          )}
          <button
            onClick={() => {
              setToast("");
              setUndo(null);
            }}
            aria-label="Dismiss notification"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {modal && (
        <ModalShell
          title={
            modal.type === "profile"
              ? "Make it yours."
              : modal.type === "project"
                ? modal.project
                  ? "A little fine-tuning."
                  : "Put your work out there."
                : modal.type === "credential"
                  ? "Your next milestone."
                  : modal.type === "detail"
                    ? "A closer look."
                    : modal.type === "import"
                      ? "Bring your story along."
                      : "Behind the proof."
          }
          close={close}
        >
          {error && (
            <div className="form-error" role="alert">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}
          {modal.type === "profile" && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const data = Object.fromEntries(
                  new FormData(event.currentTarget),
                );
                try {
                  const next = parsePortfolio({
                    ...portfolio,
                    profile: data,
                    sample: false,
                  });
                  update(
                    { ...next, activity: portfolio.activity },
                    "Profile updated.",
                  );
                  setModal(null);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <p className="form-intro">
                The person behind the portfolio. Editing the profile removes the
                fictional example label.
              </p>
              {(
                ["name", "role", "location", "bio", "email", "website"] as const
              ).map((key) => (
                <label key={key}>
                  {key === "bio"
                    ? "A few words about you"
                    : key[0].toUpperCase() + key.slice(1)}
                  {key === "bio" ? (
                    <textarea
                      name={key}
                      defaultValue={portfolio.profile[key]}
                      maxLength={2000}
                    />
                  ) : (
                    <input
                      name={key}
                      type={
                        key === "website"
                          ? "url"
                          : key === "email"
                            ? "email"
                            : "text"
                      }
                      defaultValue={portfolio.profile[key]}
                      required={key === "name" || key === "role"}
                      maxLength={200}
                    />
                  )}
                </label>
              ))}
              <div className="modal-actions">
                <button type="button" className="button subtle" onClick={close}>
                  Cancel
                </button>
                <button className="button primary">
                  Save profile <Check size={16} />
                </button>
              </div>
            </form>
          )}
          {modal.type === "project" && (
            <form onSubmit={(e) => projectForm(e, modal.project)}>
              <div className="field-row">
                <label>
                  Project name
                  <input
                    name="title"
                    defaultValue={modal.project?.title}
                    placeholder="Something worth sharing"
                    maxLength={200}
                    required
                  />
                </label>
                <label className="year-field">
                  Year
                  <input
                    name="year"
                    defaultValue={modal.project?.year || "2026"}
                    pattern="[0-9]{4}"
                    maxLength={4}
                    required
                  />
                </label>
              </div>
              <label>
                The story
                <textarea
                  name="description"
                  defaultValue={modal.project?.description}
                  placeholder="What did you make, and why does it matter?"
                  maxLength={2000}
                />
              </label>
              <div className="field-row">
                <label>
                  Discipline
                  <select
                    name="category"
                    defaultValue={modal.project?.category}
                  >
                    {categories.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Cover style
                  <select
                    name="visual"
                    defaultValue={modal.project?.visual || "orbit"}
                  >
                    <option value="orbit">Orbit · soft sage</option>
                    <option value="wave">Fieldnotes · electric blue</option>
                    <option value="grid">Forma · apricot</option>
                  </select>
                </label>
              </div>
              <label>
                Tags <small>Separated by commas, up to 8</small>
                <input
                  name="tags"
                  defaultValue={modal.project?.tags.join(", ")}
                  placeholder="Design, React, Research"
                />
              </label>
              <label>
                Project link <small>Optional</small>
                <input
                  name="url"
                  type="url"
                  defaultValue={modal.project?.url}
                  placeholder="https://…"
                />
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="featured"
                  defaultChecked={modal.project?.featured}
                />{" "}
                Give this project a little more space
              </label>
              <div className="modal-actions">
                {modal.project && (
                  <button
                    type="button"
                    className="button danger local-remove"
                    onClick={() => {
                      const previous = portfolio;
                      update(
                        {
                          ...portfolio,
                          projects: portfolio.projects.filter(
                            (p) => p.id !== modal.project!.id,
                          ),
                        },
                        "Project removed from this portfolio.",
                      );
                      setUndo(previous);
                      setModal(null);
                    }}
                  >
                    Remove project
                  </button>
                )}
                <button type="button" className="button subtle" onClick={close}>
                  Cancel
                </button>
                <button className="button primary">
                  Save project <Check size={16} />
                </button>
              </div>
            </form>
          )}
          {modal.type === "credential" && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget),
                  val = (name: string) => String(data.get(name) || "");
                try {
                  const envelope = parseCredential({
                    payload: newPayload({
                      title: val("title"),
                      issuer: val("issuer"),
                      issuerAddress: val("issuerAddress"),
                      subjectAddress: val("subjectAddress"),
                      issuedAt: val("issuedAt"),
                      expiresAt: val("expiresAt"),
                      evidence: val("evidence"),
                    }),
                  });
                  update(
                    {
                      ...portfolio,
                      credentials: [...portfolio.credentials, envelope],
                    },
                    "Credential draft created.",
                  );
                  open({ type: "detail", id: envelope.payload.id });
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <p className="form-intro">
                Create a draft first. Only an authorized issuer can issue it on
                your trusted registry. Names and evidence stay off-chain.
              </p>
              <label>
                Credential title
                <input
                  name="title"
                  placeholder="What did you achieve?"
                  maxLength={200}
                  required
                />
              </label>
              <label>
                Issuer display name
                <input
                  name="issuer"
                  placeholder="A self-described person or organization"
                  maxLength={200}
                  required
                />
              </label>
              <label>
                Issuer wallet address
                <input
                  name="issuerAddress"
                  defaultValue={wallet}
                  placeholder="0x…"
                  required
                />
              </label>
              <label>
                Recipient wallet address
                <input name="subjectAddress" placeholder="0x…" required />
              </label>
              <div className="field-row">
                <label>
                  Issue date
                  <input
                    name="issuedAt"
                    type="date"
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    required
                  />
                </label>
                <label>
                  Expiry <small>Optional</small>
                  <input name="expiresAt" type="date" />
                </label>
              </div>
              <label>
                Evidence link <small>Optional, public in your export</small>
                <input name="evidence" type="url" placeholder="https://…" />
              </label>
              <div className="modal-actions">
                <button type="button" className="button subtle" onClick={close}>
                  Cancel
                </button>
                <button className="button primary">
                  Create draft <Plus size={16} />
                </button>
              </div>
            </form>
          )}
          {modal.type === "detail" && selected && (
            <div className="detail">
              <div className="detail-card">
                <span className="credential-card-icon">
                  <Fingerprint size={36} />
                </span>
                <h3>{selected.payload.title}</h3>
                <p>{selected.payload.issuer}</p>
                <span className="draft-chip">
                  {selected.registryAddress
                    ? "ON-CHAIN CREDENTIAL"
                    : "UNISSUED DRAFT"}
                </span>
              </div>
              <div
                className={`verification-result result-${result.status}`}
                role="status"
              >
                <ShieldCheck size={21} />
                <div>
                  <strong>
                    {result.status === "valid"
                      ? "Verified against the registry"
                      : result.status === "checking"
                        ? "Checking current proof…"
                        : result.status === "draft"
                          ? "Ready for a first proof"
                          : result.status === "unchecked"
                            ? "A fresh check is needed"
                            : result.status[0].toUpperCase() +
                              result.status.slice(1)}
                  </strong>
                  <p>{result.message}</p>
                  {result.checkedAt && (
                    <small>
                      Checked {new Date(result.checkedAt).toLocaleString()}. A
                      new check reads the registry again.
                    </small>
                  )}
                </div>
              </div>
              <dl className="proof-details">
                <div>
                  <dt>Issuer wallet</dt>
                  <dd>{selected.payload.issuerAddress}</dd>
                </div>
                <div>
                  <dt>Recipient wallet</dt>
                  <dd>{selected.payload.subjectAddress}</dd>
                </div>
                <div>
                  <dt>Issue date / expiry</dt>
                  <dd>
                    {selected.payload.issuedAt} /{" "}
                    {selected.payload.expiresAt || "No expiry"}
                  </dd>
                </div>
                <div>
                  <dt>Content fingerprint</dt>
                  <dd>
                    {credentialDigest(selected.payload)}
                    <button
                      className="copy-button"
                      aria-label="Copy fingerprint"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(
                            credentialDigest(selected.payload),
                          );
                          setToast("Fingerprint copied.");
                        } catch {
                          setToast(
                            "Clipboard unavailable. Select and copy the fingerprint.",
                          );
                        }
                      }}
                    >
                      <Copy size={13} />
                    </button>
                  </dd>
                </div>
                {selected.registryAddress && (
                  <div>
                    <dt>Registry / network</dt>
                    <dd>
                      {selected.registryAddress}
                      <br />
                      {selected.chainId === 31337
                        ? "Local · 31337"
                        : "Sepolia · 11155111"}
                    </dd>
                  </div>
                )}
                {selected.txHash && (
                  <div>
                    <dt>Issuance transaction</dt>
                    <dd>{selected.txHash}</dd>
                  </div>
                )}
                {selected.payload.evidence && (
                  <div>
                    <dt>Evidence</dt>
                    <dd>
                      <a
                        href={selected.payload.evidence}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open supporting evidence <ExternalLink size={13} />
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
              <p className="detail-disclaimer">
                A fingerprint proves content integrity, not the truth of a
                claim. Wallet addresses and fingerprints are public. A random
                credential ID reduces guessability; it does not make content
                confidential.
              </p>
              <div className="detail-actions">
                <button
                  disabled={result.status === "checking"}
                  className="button primary"
                  onClick={() => checkCredential(selected)}
                >
                  <ShieldCheck size={16} />{" "}
                  {result.status === "checking"
                    ? "Checking…"
                    : "Check live proof"}
                </button>
                {!preview && !selected.registryAddress && (
                  <button
                    disabled={busy}
                    className="button subtle"
                    onClick={() =>
                      transact(async () => {
                        const generation = epoch.current,
                          hash = await registryWrite("issue", config, selected);
                        if (generation !== epoch.current) {
                          setToast(
                            "Wallet changed. The transaction may have completed. Check it before retrying.",
                          );
                          return;
                        }
                        const issued = {
                          ...selected,
                          chainId: config!.chainId,
                          registryAddress: config!.registryAddress,
                          txHash: hash,
                        };
                        update(
                          {
                            ...portfolio,
                            credentials: portfolio.credentials.map((e) =>
                              e.payload.id === selected.payload.id ? issued : e,
                            ),
                          },
                          "Credential issued on the registry.",
                        );
                        await checkCredential(issued);
                      })
                    }
                  >
                    {busy ? "Waiting for wallet…" : "Issue on-chain"}{" "}
                    <ArrowUpRight size={15} />
                  </button>
                )}
                {!preview && selected.registryAddress && (
                  <button
                    disabled={busy}
                    className="button danger"
                    onClick={() => {
                      if (
                        window.confirm(
                          "Revocation is permanent. Revoke this credential on-chain?",
                        )
                      )
                        void transact(async () => {
                          await registryWrite("revoke", config, selected);
                          update(
                            portfolio,
                            "Credential revoked by its issuer.",
                          );
                          await checkCredential(selected);
                        });
                    }}
                  >
                    Revoke permanently
                  </button>
                )}
              </div>
              {!preview && (
                <>
                  <p className="immutable-note">
                    Credential content is immutable. To correct a claim, create
                    a new draft with a fresh fingerprint.
                  </p>
                  <button
                    className="text-button local-remove-credential"
                    onClick={() => {
                      const previous = portfolio;
                      epoch.current++;
                      setStatuses({});
                      update(
                        {
                          ...portfolio,
                          credentials: portfolio.credentials.filter(
                            (e) => e.payload.id !== selected.payload.id,
                          ),
                        },
                        "Credential removed locally. On-chain records are unchanged.",
                      );
                      setUndo(previous);
                      setModal(null);
                    }}
                  >
                    Remove local copy
                  </button>
                </>
              )}
            </div>
          )}
          {modal.type === "settings" && (
            <div>
              <p className="form-intro">
                Proofolio stores content on this device. A registry records only
                fingerprints, wallet addresses, timestamps, and revocations.
                Start a local chain with the README, or use your own Sepolia
                deployment.
              </p>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = Object.fromEntries(
                    new FormData(event.currentTarget),
                  );
                  try {
                    setConfig(parseConfiguration(data));
                    setToast(
                      "Trusted registry saved. All proof checks have been reset.",
                    );
                    setError("");
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <div className="settings-section">
                  <fieldset disabled={preview}>
                    <h3>Trusted registry</h3>
                    <p>
                      Only save endpoints and contracts you trust. Imported
                      portfolios cannot change these settings.
                    </p>
                    <label>
                      Network
                      <select
                        name="chainId"
                        defaultValue={config?.chainId || 31337}
                      >
                        <option value="31337">Local development · 31337</option>
                        <option value="11155111">
                          Sepolia testnet · 11155111
                        </option>
                      </select>
                    </label>
                    <label>
                      Registry contract address
                      <input
                        name="registryAddress"
                        placeholder="0x…"
                        defaultValue={config?.registryAddress}
                        required
                      />
                    </label>
                    <label>
                      Read-only RPC endpoint
                      <input
                        name="rpcUrl"
                        type="url"
                        defaultValue={config?.rpcUrl || "http://127.0.0.1:8545"}
                        required
                      />
                    </label>
                    {!preview && (
                      <button className="button primary">
                        Save trusted registry <Check size={15} />
                      </button>
                    )}
                  </fieldset>
                </div>
              </form>
              {!preview && (
                <form
                  className="settings-section"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    void transact(async () => {
                      await registryWrite(
                        data.get("permission") === "authorize"
                          ? "authorize"
                          : "deauthorize",
                        config,
                        undefined,
                        String(data.get("issuer")),
                      );
                      update(portfolio, "Issuer authorization updated.");
                    });
                  }}
                >
                  <h3>Issuer access</h3>
                  <p>
                    The registry administrator can authorize or remove issuer
                    wallets. Existing records stay intact.
                  </p>
                  <label>
                    Issuer wallet
                    <input name="issuer" placeholder="0x…" required />
                  </label>
                  <label>
                    Permission
                    <select name="permission">
                      <option value="authorize">Authorize issuer</option>
                      <option value="deauthorize">Remove authorization</option>
                    </select>
                  </label>
                  <button className="button subtle" disabled={busy}>
                    {busy ? "Waiting for wallet…" : "Update issuer access"}{" "}
                    <Wallet size={15} />
                  </button>
                </form>
              )}
              <div className="settings-section">
                <h3>Take your portfolio with you</h3>
                <p>
                  Exports include profile, projects, credentials, and their
                  public evidence links. Keep a backup before importing.
                </p>
                <div className="data-actions">
                  <button className="button subtle" onClick={exportPortfolio}>
                    <Download size={16} /> Export JSON
                  </button>
                  {!preview && (
                    <button
                      className="button subtle"
                      onClick={() => open({ type: "import" })}
                    >
                      <Upload size={16} /> Import JSON
                    </button>
                  )}
                </div>
              </div>
              <p className="settings-footnote">
                Public preview does not publish a website. No mainnet network is
                supported. Blockchain transactions require your wallet’s
                confirmation.
              </p>
            </div>
          )}
          {modal.type === "import" && (
            <div>
              <p className="form-intro">
                Importing replaces the portfolio on this device. Export your
                current work first if you want to keep it. Your trusted registry
                stays the same, and all credentials need a new check.
              </p>
              <button className="button subtle" onClick={exportPortfolio}>
                <Download size={16} /> Export current portfolio
              </button>
              <label className="file-drop">
                <Upload size={30} />
                <strong>Choose a portfolio JSON file</strong>
                <span>Proofolio format · up to 1 MB</span>
                <input
                  type="file"
                  ref={fileRef}
                  accept=".json,application/json"
                  onChange={(e) => void importFile(e.target.files?.[0])}
                />
              </label>
              {importCandidate && (
                <div className="import-review">
                  <h3>Ready to replace this portfolio?</h3>
                  <p>
                    {importCandidate.profile.name} ·{" "}
                    {importCandidate.projects.length} projects ·{" "}
                    {importCandidate.credentials.length} credentials
                  </p>
                  <button
                    className="button primary"
                    onClick={() => {
                      epoch.current++;
                      setStatuses({});
                      update(
                        importCandidate,
                        "Portfolio imported. Credentials need a fresh registry check.",
                      );
                      setImportCandidate(null);
                      setModal(null);
                    }}
                  >
                    Replace with imported portfolio <Check size={16} />
                  </button>
                </div>
              )}
            </div>
          )}
        </ModalShell>
      )}
    </div>
  );
}
