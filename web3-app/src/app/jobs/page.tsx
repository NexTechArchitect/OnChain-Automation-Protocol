"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  useReadContract,
  useReadContracts,
  useSwitchChain,
} from "wagmi";
import { formatEther } from "viem";
import { Bricolage_Grotesque, Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import { BASE_CHAIN_ID, CONTRACT_ADDRESSES, CONTRACT_ABIS } from "@/constants/contracts";

const displayFont = Bricolage_Grotesque({ subsets: ["latin"], weight: ["500","600","700","800"], variable: "--display-font" });
const bodyFont    = Plus_Jakarta_Sans({  subsets: ["latin"], weight: ["400","500","600","700"], variable: "--body-font"    });
const monoFont    = JetBrains_Mono({    subsets: ["latin"], weight: ["400","500","700"],        variable: "--mono-font"    });

/* ─── TYPES ─────────────────────────────────────────────── */
type JobStatus = "Active" | "Paused" | "Completed" | "Inactive";
type JobType   = "Recurring" | "OneTime";
type FilterTab = "all" | "Active" | "Paused" | "Completed";

interface ChainJob {
  id: number;
  target: string;
  rewardPerExec: bigint;
  owner: string;
  interval: bigint;
  status: number;
  jobType: number;
  lastExecutedAt: bigint;
  registeredAt: bigint;
  totalExecutions: number;
  maxBaseFee: bigint;
  rewardPool: bigint;
}

/* ─── HELPERS ────────────────────────────────────────────── */
const shortAddr  = (a: string) => `${a.slice(0,6)}…${a.slice(-4)}`;
const basescanTx = (a: string) => `https://basescan.org/address/${a}`;

function fmtEth(wei: bigint) {
  const n = parseFloat(formatEther(wei));
  if (n === 0) return "0 ETH";
  if (n < 0.001) return `< 0.001 ETH`;
  return `${n.toFixed(4)} ETH`;
}
function fmtInterval(secs: bigint) {
  const s = Number(secs);
  if (s === 0) return "One-time";
  if (s % 86400 === 0) return `${s/86400}d`;
  if (s % 3600  === 0) return `${s/3600}h`;
  if (s % 60    === 0) return `${s/60}m`;
  return `${s}s`;
}
function fmtGwei(wei: bigint) { return `${(Number(wei)/1e9).toFixed(1)} Gwei`; }
function fmtTime(ts: bigint) {
  if (ts === BigInt(0)) return "Never";
  return new Date(Number(ts)*1000).toLocaleString("en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});
}

const STATUS_MAP:  Record<number, JobStatus> = { 0:"Inactive", 1:"Active", 2:"Paused", 3:"Completed" };
const JOBTYPE_MAP: Record<number, JobType>   = { 0:"Recurring", 1:"OneTime" };

/* ─── WALLET ─────────────────────────────────────────────── */
function WalletButton() {
  const { address, isConnected, chain } = useAccount();
  const chainId = useChainId();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const wrongNet = isConnected && chainId !== BASE_CHAIN_ID;

  if (isConnected && address) {
    return (
      <div className="wallet-wrap" ref={wrapRef}>
        <button className="wallet-button glass" type="button" onClick={() => setOpen(v=>!v)}>
          <span className={`wallet-orb ${wrongNet ? "" : "is-live"}`} />
          <span>{shortAddr(address)}</span>
          <em>{wrongNet ? "Wrong network" : (chain?.name ?? "Base")}</em>
        </button>
        {open && (
          <div className="wallet-menu glass">
            {wrongNet
              ? <button type="button" onClick={() => switchChain({ chainId: BASE_CHAIN_ID })}>{isSwitching ? "Switching…" : "Switch to Base"}</button>
              : <div className="wallet-chain">✓ Base Mainnet</div>
            }
            <button type="button" onClick={() => { disconnect(); setOpen(false); }}>Disconnect</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="wallet-wrap" ref={wrapRef}>
      <button className="wallet-button glass" type="button" onClick={() => setOpen(v=>!v)}>
        <span className="wallet-orb" />
        <span>{isPending ? "Connecting…" : "Connect wallet"}</span>
      </button>
      {open && (
        <div className="wallet-menu glass">
          {connectors.length === 0
            ? <p className="wallet-empty">No wallets configured yet — add connectors in config/wagmi.ts</p>
            : connectors.map(c => (
                <button key={c.uid} type="button" onClick={() => { connect({ connector: c }); setOpen(false); }}>
                  <span className="connector-dot">{c.name.charAt(0)}</span>{c.name}
                </button>
              ))
          }
        </div>
      )}
    </div>
  );
}

/* ─── STAT CARD ───────────────────────────────────────────── */
function StatCard({ label, value, tone, loading }: {
  label: string; value: string; tone: "cyan" | "amber" | "purple" | "green"; loading?: boolean;
}) {
  return (
    <div className={`telemetry-card glass tone-${tone}`}>
      <span className="tc-label">{label}</span>
      <strong className="tc-value">
        {loading ? <span className="skeleton-text" /> : value}
      </strong>
    </div>
  );
}

/* ─── JOB CARD ───────────────────────────────────────────── */
function JobCard({ job }: { job: ChainJob }) {
  const status: JobStatus = STATUS_MAP[job.status]  ?? "Inactive";
  const jobType: JobType  = JOBTYPE_MAP[job.jobType] ?? "Recurring";
  const isActive          = status === "Active";
  const poolEmpty         = job.rewardPool === BigInt(0);

  return (
    <div className={`job-card glass status-${status.toLowerCase()}`}>
      <div className="job-card-border" />

      {/* Header */}
      <div className="jc-head">
        <div className="jc-head-left">
          <span className="jc-id">{`#${job.id.toString().padStart(4,"0")}`}</span>
          <span className={`status-pill pill-${status.toLowerCase()}`}>{status}</span>
          {isActive && !poolEmpty && <span className="live-ring"><span /></span>}
        </div>
        <span className={`type-badge type-${jobType.toLowerCase()}`}>
          {jobType === "Recurring" ? "⟳ Recurring" : "◉ One-time"}
        </span>
      </div>

      {/* Target */}
      <div className="jc-target">
        <span className="jc-field-label">Target contract</span>
        <a href={basescanTx(job.target)} target="_blank" rel="noreferrer" className="jc-addr">
          {shortAddr(job.target)}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17 17 7"/><path d="M9 7h8v8"/></svg>
        </a>
      </div>

      {/* 6 metrics */}
      <div className="jc-metrics">
        <div className="jc-metric">
          <span className="jc-m-label">Reward pool</span>
          <span className={`jc-m-val ${poolEmpty ? "depleted" : "funded"}`}>{fmtEth(job.rewardPool)}</span>
        </div>
        <div className="jc-metric">
          <span className="jc-m-label">Per execution</span>
          <span className="jc-m-val">{fmtEth(job.rewardPerExec)}</span>
        </div>
        <div className="jc-metric">
          <span className="jc-m-label">Interval</span>
          <span className="jc-m-val mono">{fmtInterval(job.interval)}</span>
        </div>
        <div className="jc-metric">
          <span className="jc-m-label">Gas ceiling</span>
          <span className="jc-m-val mono">{fmtGwei(job.maxBaseFee)}</span>
        </div>
        <div className="jc-metric">
          <span className="jc-m-label">Executions</span>
          <span className="jc-m-val accent-num">{job.totalExecutions}</span>
        </div>
        <div className="jc-metric">
          <span className="jc-m-label">Last run</span>
          <span className="jc-m-val small-txt">{fmtTime(job.lastExecutedAt)}</span>
        </div>
      </div>

      {/* Footer */}
      <div className="jc-foot">
        <span>Owner: <span className="mono">{shortAddr(job.owner)}</span></span>
        <span>Registered {fmtTime(job.registeredAt)}</span>
      </div>

      {/* Pool bar */}
      {job.rewardPerExec > BigInt(0) && job.rewardPool > BigInt(0) && (
        <div className="pool-track">
          <div className="pool-fill" style={{
            width:`${Math.min(100,Number((job.rewardPool*BigInt(100))/(job.rewardPool+job.rewardPerExec*BigInt(job.totalExecutions||1))))}%`
          }} />
        </div>
      )}
    </div>
  );
}

/* ─── SKELETON ───────────────────────────────────────────── */
function SkeletonCard() {
  return (
    <div className="job-card glass skel-card">
      <div className="skel-row" />
      <div className="skel-target" />
      <div className="skel-grid">{[...Array(6)].map((_,i)=><div key={i} className="skel-cell"/>)}</div>
    </div>
  );
}

/* ─── SCROLL REVEAL ──────────────────────────────────────── */
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setVisible(true); return; }
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold: 0.15 });
    obs.observe(node);
    return () => obs.disconnect();
  }, []);
  return { ref, visible };
}
function Reveal({ children, className="" }: { children: React.ReactNode; className?: string }) {
  const { ref, visible } = useReveal<HTMLDivElement>();
  return <div ref={ref} className={`reveal ${visible?"is-visible":""} ${className}`}>{children}</div>;
}

/* ─── PAGE ───────────────────────────────────────────────── */
export default function JobsQueuePage() {
  const [search, setSearch]      = useState("");
  const [filter, setFilter]      = useState<FilterTab>("all");
  const [scrolled, setScrolled]  = useState(false);
  const [refreshKey, setRefresh] = useState(0);

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 12);
    h(); window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
  }, []);

  /* contract reads */
  const { data: totalJobsRaw,    isLoading: totalLoading    } = useReadContract({ address: CONTRACT_ADDRESSES.JOB_MANAGER,    abi: CONTRACT_ABIS.JOB_MANAGER    as never, functionName: "getTotalJobs",    chainId: BASE_CHAIN_ID, query: { refetchInterval: 30_000 } });
  const { data: activeIdsRaw,    isLoading: idsLoading      } = useReadContract({ address: CONTRACT_ADDRESSES.JOB_MANAGER,    abi: CONTRACT_ABIS.JOB_MANAGER    as never, functionName: "getActiveJobIds", chainId: BASE_CHAIN_ID, query: { refetchInterval: 30_000 } });
  const { data: totalKeepersRaw, isLoading: keepersLoading  } = useReadContract({ address: CONTRACT_ADDRESSES.KEEPER_REGISTRY, abi: CONTRACT_ABIS.KEEPER_REGISTRY as never, functionName: "getTotalKeepers",chainId: BASE_CHAIN_ID });
  const { data: minBondRaw } = useReadContract({ address: CONTRACT_ADDRESSES.KEEPER_REGISTRY, abi: CONTRACT_ABIS.KEEPER_REGISTRY as never, functionName: "getMinBond", chainId: BASE_CHAIN_ID });

  const totalJobs    = totalJobsRaw    ? Number(totalJobsRaw)    : 0;
  const activeIds    = (activeIdsRaw   as bigint[]|undefined)    ?? [];
  const totalKeepers = totalKeepersRaw ? Number(totalKeepersRaw) : 0;

  const jobCalls = useMemo(() => {
    if (!activeIds.length) return [];
    return activeIds.flatMap(id => [
      { address: CONTRACT_ADDRESSES.JOB_MANAGER as `0x${string}`, abi: CONTRACT_ABIS.JOB_MANAGER as never, functionName: "getJob",        args: [id] },
      { address: CONTRACT_ADDRESSES.JOB_MANAGER as `0x${string}`, abi: CONTRACT_ABIS.JOB_MANAGER as never, functionName: "getRewardPool", args: [id] },
    ]);
  }, [activeIds, refreshKey]);

  const { data: jobResults, isLoading: jobsLoading } = useReadContracts({
    contracts: jobCalls as never,
    query: { enabled: jobCalls.length > 0, refetchInterval: 30_000 },
  });

  const chainJobs: ChainJob[] = useMemo(() => {
    if (!jobResults || !activeIds.length) return [];
    return activeIds.reduce<ChainJob[]>((out, id, i) => {
      const jr = (jobResults as any)[i*2];
      const pr = (jobResults as any)[i*2+1];
      if (jr?.status !== "success" || !jr.result) return out;
      const j = jr.result as {
        target: string;
        rewardPerExec: bigint;
        owner: string;
        interval: bigint;
        status: number;
        jobType: number;
        lastExecutedAt: bigint;
        registeredAt: bigint;
        totalExecutions: number;
        maxBaseFee: bigint;
      };
      return [...out, {
        id: Number(id),
        ...j,
        rewardPool: pr?.status === "success" ? (pr.result as bigint) : BigInt(0),
      }];
    }, []);
  }, [jobResults, activeIds]);

  const visibleJobs = useMemo(() => chainJobs.filter(job => {
    const s = STATUS_MAP[job.status] ?? "Inactive";
    const matchStatus = filter === "all" || s === filter;
    const matchSearch = !search || job.id.toString().includes(search) || job.target.toLowerCase().includes(search.toLowerCase()) || job.owner.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  }), [chainJobs, filter, search]);

  const activeCount    = chainJobs.filter(j => STATUS_MAP[j.status] === "Active").length;
  const totalPooledWei = chainJobs.reduce((a, j) => a + j.rewardPool, BigInt(0));
  const isLoading      = idsLoading || jobsLoading;

  const handleRefresh = useCallback(() => setRefresh(k=>k+1), []);

  return (
    <>
      <style>{styles}</style>
      <main className={`jq-page ${displayFont.variable} ${bodyFont.variable} ${monoFont.variable}`}>

        <div className="cinematic-backdrop" aria-hidden="true">
          <div className="backdrop-static" />
          <div className="backdrop-veil" />
          <div className="backdrop-grain" />
        </div>

        <div className="viewport-frame" aria-hidden="true">
          <span className="frame-corner corner-tl" />
          <span className="frame-corner corner-tr" />
          <span className="frame-corner corner-bl" />
          <span className="frame-corner corner-br" />
        </div>

        {/* ── NAV ── */}
        <header className={`site-header glass ${scrolled ? "is-scrolled" : ""}`}>
          <a className="brand" href="/">
            <span className="brand-mark"><span /></span>
            <strong>Keeper Network</strong>
          </a>
          <nav className="nav-links" aria-label="Primary navigation">
            <a href="/jobs" className="nav-active">Jobs</a>
            <a href="/keepers">Keepers</a>
            <a href="/docs">Docs</a>
          </nav>
          <div className="header-right">
            <WalletButton />
          </div>
        </header>

        {/* ── HERO ── */}
        <section className="jq-hero">
          <div className="jq-hero-inner">
            <Reveal className="jq-hero-copy glass">
              <span className="eyebrow">
                <i className="eyebrow-dot" />
                Live and running on Base mainnet
              </span>
              <h1>
                Automation job
                <span className="h1-accent"> execution queue.</span>
              </h1>
              <p>
                Every job running through bonded keepers on Base, live.
                Inspect targets, reward pools, intervals, and execution history in one place.
              </p>
            </Reveal>

            <Reveal className="telemetry-stack">
              <StatCard label="Total jobs registered" value={totalLoading   ? "…" : totalJobs.toLocaleString()}     tone="cyan"   loading={totalLoading}   />
              <StatCard label="Active in queue"        value={isLoading      ? "…" : activeCount.toLocaleString()}  tone="amber"  loading={isLoading}       />
              <StatCard label="Bonded keepers"         value={keepersLoading ? "…" : totalKeepers.toLocaleString()} tone="purple" loading={keepersLoading}  />
              <StatCard label="Total reward pool"      value={isLoading      ? "…" : fmtEth(totalPooledWei)}        tone="green"  loading={isLoading}       />
            </Reveal>
          </div>
        </section>

        {/* ── FILTER / SEARCH BAR ── */}
        <section className="jq-filter-section">
          <Reveal className="jq-filter-bar glass">
            <div className="jq-search">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              <input
                type="text"
                placeholder="Search by job ID, target, or owner…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button type="button" className="jq-clear" onClick={() => setSearch("")} aria-label="Clear">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg>
                </button>
              )}
            </div>

            <div className="jq-tabs">
              {(["all","Active","Paused","Completed"] as const).map(tab => (
                <button key={tab} type="button"
                  className={`jq-tab ${filter===tab ? "active" : ""}`}
                  onClick={() => setFilter(tab)}>
                  {tab === "all" ? "All" : tab}
                  {tab !== "all" && (
                    <span className="tab-count">{chainJobs.filter(j => STATUS_MAP[j.status]===tab).length}</span>
                  )}
                </button>
              ))}
            </div>

            <button type="button" className="jq-refresh" onClick={handleRefresh} title="Refresh">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            </button>
          </Reveal>

          {!isLoading && (
            <p className="result-count">
              Showing <strong>{visibleJobs.length}</strong> of <strong>{chainJobs.length}</strong> jobs
              {search && <> matching <code>"{search}"</code></>}
            </p>
          )}
        </section>

        {/* ── JOB GRID ── */}
        <section className="jq-grid-section stagger-grid">
          {isLoading ? (
            <div className="jq-grid">{[...Array(6)].map((_,i)=><SkeletonCard key={i}/>)}</div>
          ) : visibleJobs.length === 0 ? (
            <Reveal>
              <div className="jq-empty glass">
                <div className="empty-icon">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/></svg>
                </div>
                <h3>No jobs found</h3>
                <p>{search ? `Nothing matched "${search}". Try a different address or ID.` : activeIds.length===0 ? "No jobs are currently registered on-chain." : "No jobs match the current filter."}</p>
                {search && <button type="button" className="btn-ghost glass" onClick={() => setSearch("")}>Clear search</button>}
              </div>
            </Reveal>
          ) : (
            <div className="jq-grid">
              {visibleJobs.map(job => (
                <Reveal key={job.id}>
                  <JobCard job={job} />
                </Reveal>
              ))}
            </div>
          )}
        </section>

        {/* ── FOOTER ── */}
        <footer className="site-footer">
          <div className="footer-top">
            <div className="brand">
              <span className="brand-mark"><span /></span>
              <strong>Keeper Network</strong>
            </div>
            <div className="footer-links">
              <a href="/jobs">Jobs</a>
              <a href="/keepers">Keepers</a>
              <a href="/docs">Docs</a>
              <a href="/register-job">Register job</a>
            </div>
          </div>
          <div className="footer-bottom">
            <span className="footer-status">
              <i className="status-dot" />
              Base mainnet, chain ID 8453
              {minBondRaw && <> &nbsp;·&nbsp; Min bond: <code>{fmtEth(minBondRaw as bigint)}</code></>}
            </span>
            <span>Always verify each address on Basescan before you send funds.</span>
          </div>
        </footer>

      </main>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   CSS
═══════════════════════════════════════════════════════════ */
const styles = `
html, body {
  margin: 0 !important;
  background: #eef2fb !important;
  color: #171e2c !important;
}

.jq-page, .jq-page * { box-sizing: border-box; }

.jq-page {
  --ink:          #171e2c;
  --muted:        #5b6478;
  --cyan:         #12b3a0;
  --cyan-deep:    #0c8676;
  --amber:        #e0a24a;
  --amber-deep:   #c47e1e;
  --purple:       #7c3aed;
  --purple-light: #a78bfa;
  --green:        #059669;
  --green-light:  #34d399;
  --red:          #dc2626;
  --line:         rgba(23,30,44,0.08);
  --glass-bg:     rgba(255,255,255,0.58);
  --glass-border: rgba(255,255,255,0.78);
  --shadow:       0 20px 60px rgba(23,30,44,0.10);

  position: relative;
  min-height: 100vh;
  overflow-x: hidden;
  background: linear-gradient(180deg, #eef2fb 0%, #f7f9ff 100%);
  font-family: var(--body-font), sans-serif;
  color: var(--ink);
  -webkit-tap-highlight-color: transparent;
}

.jq-page a, .jq-page button { color: inherit; font: inherit; text-decoration: none; touch-action: manipulation; }
.jq-page button { border: 0; cursor: pointer; background: none; }
.jq-page code, .mono { font-family: var(--mono-font), monospace; }
.jq-page h1, .jq-page h2, .jq-page h3, .eyebrow, .section-tag { font-family: var(--display-font), sans-serif; letter-spacing: -0.01em; }

.glass {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  backdrop-filter: blur(18px) saturate(140%);
  -webkit-backdrop-filter: blur(18px) saturate(140%);
  box-shadow: var(--shadow);
}

@property --border-angle {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}

.cinematic-backdrop { position: fixed; inset: 0; z-index: 0; overflow: hidden; }
.backdrop-static {
  position: absolute; inset: 0;
  background:
    radial-gradient(circle at 60% 20%, rgba(18,179,160,0.14), transparent 38%),
    radial-gradient(circle at 20% 70%, rgba(124,58,237,0.08), transparent 40%),
    linear-gradient(160deg, #eef2fb, #f7f9ff);
}
.backdrop-veil {
  position: absolute; inset: 0; z-index: 1;
  background: linear-gradient(180deg, rgba(238,242,251,0.2) 0%, rgba(238,242,251,0.45) 50%, rgba(238,242,251,0.72) 100%);
}
.backdrop-grain {
  position: absolute; inset: 0; z-index: 2; pointer-events: none;
  opacity: 0.04; mix-blend-mode: multiply;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E");
  background-size: 140px 140px;
}

.viewport-frame {
  position: fixed; inset: 10px; z-index: 60;
  pointer-events: none; border-radius: 26px;
  border: 1px solid rgba(23,30,44,0.07);
}
.frame-corner { position: absolute; width: 22px; height: 22px; }
.frame-corner.corner-tl { top:-1px;    left:-1px;  border-top:2px solid rgba(18,179,160,0.5); border-left:2px solid rgba(18,179,160,0.5);   border-radius:14px 0 0 0; }
.frame-corner.corner-tr { top:-1px;    right:-1px; border-top:2px solid rgba(224,162,74,0.5); border-right:2px solid rgba(224,162,74,0.5);  border-radius:0 14px 0 0; }
.frame-corner.corner-bl { bottom:-1px; left:-1px;  border-bottom:2px solid rgba(124,58,237,0.4); border-left:2px solid rgba(124,58,237,0.4); border-radius:0 0 0 14px; }
.frame-corner.corner-br { bottom:-1px; right:-1px; border-bottom:2px solid rgba(5,150,105,0.45); border-right:2px solid rgba(5,150,105,0.45); border-radius:0 0 14px 0; }

.site-header {
  position: fixed; top: 18px; left: 50%; transform: translateX(-50%); z-index: 50;
  display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 18px;
  width: min(1180px, calc(100% - 36px)); padding: 10px 16px;
  padding-top: max(10px, env(safe-area-inset-top));
  border-radius: 20px;
  transition: box-shadow 260ms ease, background 260ms ease;
}
.site-header.is-scrolled { box-shadow: 0 26px 70px rgba(23,30,44,0.16); }

.brand { display: flex; align-items: center; gap: 10px; }
.brand strong { font-size: 0.95rem; font-weight: 700; font-family: var(--display-font), sans-serif; }
.brand-mark {
  position: relative; width: 36px; aspect-ratio: 1;
  display: grid; place-items: center; border-radius: 10px; overflow: hidden;
  background: linear-gradient(135deg, rgba(18,179,160,0.25), rgba(224,162,74,0.2));
}
.brand-mark::before {
  content: ""; position: absolute; inset: -60%;
  background: conic-gradient(from 0deg, transparent, rgba(18,179,160,0.55), transparent 55%);
  animation: spinSlow 5s linear infinite;
}
.brand-mark span { position: relative; z-index: 1; width: 7px; aspect-ratio: 1; border-radius: 50%; background: var(--amber); }
@keyframes spinSlow { to { transform: rotate(360deg); } }

.nav-links { justify-self: center; display: flex; gap: 4px; }
.nav-links a {
  position: relative; padding: 10px 14px; border-radius: 12px;
  color: var(--muted); font-size: 0.85rem; font-weight: 600;
  transition: color 180ms ease, background 180ms ease;
}
.nav-links a:hover { color: var(--ink); background: rgba(23,30,44,0.05); }
.nav-links a::after {
  content: ""; position: absolute; left: 14px; right: 14px; bottom: 7px;
  height: 2px; border-radius: 2px;
  background: linear-gradient(90deg, var(--cyan), var(--amber));
  transform: scaleX(0); transform-origin: left;
  transition: transform 260ms cubic-bezier(.16,1,.3,1);
}
.nav-links a:hover::after,
.nav-links a.nav-active::after { transform: scaleX(1); }
.nav-links a.nav-active { color: var(--ink); }

.header-right { display: flex; align-items: center; gap: 10px; justify-self: end; }

.wallet-wrap { position: relative; }
.wallet-button {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; border-radius: 14px; font-weight: 700; font-size: 0.85rem;
  transition: transform 180ms ease;
}
.wallet-button:hover { transform: translateY(-1px); }
.wallet-orb { width: 8px; aspect-ratio: 1; border-radius: 50%; background: var(--amber); }
.wallet-orb.is-live { background: var(--cyan); box-shadow: 0 0 0 4px rgba(18,179,160,0.16); }
.wallet-button em { font-style: normal; font-size: 0.7rem; color: var(--muted); }
.wallet-menu {
  position: absolute; top: calc(100% + 8px); right: 0; min-width: 220px;
  border-radius: 14px; padding: 6px; display: grid; gap: 2px; z-index: 99;
}
.wallet-menu button, .wallet-menu a {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px; border-radius: 10px; text-align: left;
  font-size: 0.85rem; font-weight: 600; width: 100%;
  transition: background 160ms ease;
}
.wallet-menu button:hover { background: rgba(23,30,44,0.06); }
.wallet-chain { padding: 8px 12px; font-size: 0.8rem; color: var(--cyan-deep); }
.wallet-empty { padding: 10px 12px; font-size: 0.78rem; color: var(--muted); max-width: 220px; }
.connector-dot {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0;
  background: linear-gradient(135deg, rgba(18,179,160,0.2), rgba(224,162,74,0.18));
  color: var(--cyan-deep); font-weight: 800; font-size: 0.72rem;
}

.reveal { opacity: 0; transform: translateY(18px); transition: opacity 640ms cubic-bezier(.16,1,.3,1), transform 640ms cubic-bezier(.16,1,.3,1); }
.reveal.is-visible { opacity: 1; transform: none; }
@media (prefers-reduced-motion: reduce) {
  .reveal, .brand-mark::before { transition: none !important; animation: none !important; opacity: 1 !important; transform: none !important; }
}
.stagger-grid .reveal:nth-child(1) { transition-delay: 0ms; }
.stagger-grid .reveal:nth-child(2) { transition-delay: 80ms; }
.stagger-grid .reveal:nth-child(3) { transition-delay: 160ms; }
.stagger-grid .reveal:nth-child(4) { transition-delay: 240ms; }
.stagger-grid .reveal:nth-child(5) { transition-delay: 320ms; }
.stagger-grid .reveal:nth-child(6) { transition-delay: 400ms; }

.jq-hero { position: relative; z-index: 3; padding-top: 110px; }
.jq-hero-inner {
  display: grid; grid-template-columns: minmax(0,1fr) 300px; gap: 28px; align-items: start;
  width: min(1180px, calc(100% - 36px)); margin: 0 auto; padding-bottom: 60px;
}

.jq-hero-copy { padding: 32px; border-radius: 24px; }

.eyebrow {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 6px 12px; border-radius: 999px;
  background: rgba(18,179,160,0.1); color: var(--cyan-deep);
  font-size: 0.76rem; font-weight: 700;
  font-family: var(--display-font), sans-serif;
}
.eyebrow-dot {
  width: 6px; height: 6px; border-radius: 50%; background: var(--cyan);
  box-shadow: 0 0 0 4px rgba(18,179,160,0.16);
  animation: pulseDot 1.8s ease-in-out infinite;
}
@keyframes pulseDot { 0%,100%{opacity:1} 50%{opacity:0.4} }

.jq-hero-copy h1 {
  font-size: clamp(2.4rem, 5vw, 4rem); font-weight: 700; line-height: 1.05;
  margin: 20px 0 0; letter-spacing: -0.018em;
}
.h1-accent {
  background: linear-gradient(90deg, var(--cyan), var(--amber));
  -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
}
.jq-hero-copy p { margin: 18px 0 0; color: var(--muted); font-size: 1rem; line-height: 1.72; max-width: 580px; }

.telemetry-stack { display: grid; gap: 12px; align-content: start; }
.telemetry-card {
  padding: 20px; border-radius: 18px; position: relative; overflow: hidden;
  transition: transform 260ms cubic-bezier(.16,1,.3,1), box-shadow 260ms ease;
}
.telemetry-card:hover { transform: translateY(-4px); box-shadow: 0 28px 60px rgba(23,30,44,0.14); }

.telemetry-card::before {
  content: ""; position: absolute; inset: 0;
  border-left: 3px solid var(--cyan); opacity: 0.9;
}
.telemetry-card.tone-amber::before  { border-left-color: var(--amber); }
.telemetry-card.tone-purple::before { border-left-color: var(--purple-light); }
.telemetry-card.tone-green::before  { border-left-color: var(--green-light); }

.telemetry-card::after {
  content: ""; position: absolute; inset: 0; border-radius: inherit; padding: 1.5px;
  background: conic-gradient(from var(--border-angle), transparent 0 65%, var(--cyan) 82%, var(--amber) 92%, transparent 100%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor; mask-composite: exclude;
  opacity: 0; transition: opacity 320ms ease;
  animation: spinBorder 3.4s linear infinite paused; pointer-events: none;
}
.telemetry-card:hover::after { opacity: 1; animation-play-state: running; }
@keyframes spinBorder { to { --border-angle: 360deg; } }

.tc-label { color: var(--muted); font-size: 0.76rem; font-weight: 700; display: block; }
.tc-value { display: block; margin-top: 8px; font-size: 1.8rem; font-weight: 700; font-family: var(--display-font), sans-serif; }
.tone-cyan   .tc-value { color: var(--cyan-deep); }
.tone-amber  .tc-value { color: var(--amber-deep); }
.tone-purple .tc-value { color: var(--purple); }
.tone-green  .tc-value { color: var(--green); }

@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
.skeleton-text {
  display: inline-block; width: 60px; height: 22px; border-radius: 6px;
  background: linear-gradient(90deg, rgba(23,30,44,0.06), rgba(23,30,44,0.12), rgba(23,30,44,0.06));
  background-size: 200% 100%; animation: shimmer 1.4s ease-in-out infinite;
}

.jq-filter-section {
  position: relative; z-index: 3;
  width: min(1180px, calc(100% - 36px)); margin: 0 auto 28px;
}
.jq-filter-bar {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px; border-radius: 18px;
}

.jq-search {
  flex: 1; display: flex; align-items: center; gap: 9px;
  padding: 9px 13px; border-radius: 12px;
  background: rgba(23,30,44,0.04); border: 1px solid rgba(23,30,44,0.08);
  transition: border-color 200ms ease;
}
.jq-search:focus-within { border-color: rgba(18,179,160,0.4); }
.jq-search svg { color: var(--muted); flex-shrink: 0; }
.jq-search input { flex: 1; border: 0; outline: 0; background: transparent; font-size: 0.87rem; color: var(--ink); font-family: var(--body-font), sans-serif; }
.jq-search input::placeholder { color: var(--muted); }
.jq-clear { display: grid; place-items: center; color: var(--muted); padding: 2px; transition: color 160ms ease; }
.jq-clear:hover { color: var(--ink); }

.jq-tabs {
  display: flex; gap: 3px; padding: 3px; border-radius: 12px;
  background: rgba(23,30,44,0.04); border: 1px solid rgba(23,30,44,0.08);
}
.jq-tab {
  padding: 7px 13px; border-radius: 9px; font-size: 0.8rem; font-weight: 700;
  color: var(--muted); display: flex; align-items: center; gap: 6px;
  transition: color 160ms ease, background 160ms ease;
}
.jq-tab:hover { color: var(--ink); }
.jq-tab.active { background: rgba(255,255,255,0.7); color: var(--ink); box-shadow: 0 2px 8px rgba(23,30,44,0.08); }
.tab-count {
  font-size: 0.68rem; padding: 1px 5px; border-radius: 999px;
  background: rgba(23,30,44,0.07); color: var(--muted);
}

.jq-refresh {
  width: 38px; height: 38px; display: grid; place-items: center; border-radius: 11px;
  color: var(--muted); background: rgba(23,30,44,0.04); border: 1px solid rgba(23,30,44,0.08);
  flex-shrink: 0; transition: color 160ms ease, border-color 160ms ease, transform 320ms ease;
}
.jq-refresh:hover { color: var(--cyan-deep); border-color: rgba(18,179,160,0.35); }
.jq-refresh:active { transform: rotate(180deg); }

.result-count { margin: 10px 0 0; font-size: 0.78rem; color: var(--muted); }
.result-count strong { color: var(--ink); }
.result-count code { padding: 2px 5px; border-radius: 5px; background: rgba(23,30,44,0.06); color: var(--cyan-deep); }

.jq-grid-section { position: relative; z-index: 3; width: min(1180px, calc(100% - 36px)); margin: 0 auto; }
.jq-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 16px; }

.job-card {
  position: relative; overflow: hidden;
  padding: 22px; border-radius: 22px;
  display: grid; gap: 16px;
  transition: transform 260ms cubic-bezier(.16,1,.3,1), box-shadow 260ms ease;
}
.job-card:hover { transform: translateY(-5px); box-shadow: 0 30px 70px rgba(23,30,44,0.14); }

.job-card.status-active:hover    { box-shadow: 0 28px 70px rgba(18,179,160,0.16); }
.job-card.status-paused:hover    { box-shadow: 0 28px 70px rgba(224,162,74,0.14); }
.job-card.status-completed:hover { box-shadow: 0 28px 70px rgba(5,150,105,0.12); }

.job-card-border {
  content: ""; position: absolute; inset: 0; border-radius: 22px; pointer-events: none;
  padding: 1.5px;
  background: conic-gradient(from var(--border-angle), transparent 0 65%, var(--cyan) 82%, var(--amber) 92%, transparent 100%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor; mask-composite: exclude;
  opacity: 0; transition: opacity 320ms ease;
  animation: spinBorder 3.4s linear infinite paused;
}
.job-card:hover .job-card-border { opacity: 1; animation-play-state: running; }

.jc-head { display: flex; align-items: center; justify-content: space-between; }
.jc-head-left { display: flex; align-items: center; gap: 10px; }
.jc-id { font-size: 1rem; font-weight: 700; font-family: var(--mono-font), monospace; color: var(--ink); }

.status-pill { padding: 3px 9px; border-radius: 999px; font-size: 0.67rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; }
.pill-active    { background: rgba(18,179,160,0.12); color: var(--cyan-deep);   border: 1px solid rgba(18,179,160,0.22); }
.pill-paused    { background: rgba(224,162,74,0.12); color: var(--amber-deep);  border: 1px solid rgba(224,162,74,0.22); }
.pill-completed { background: rgba(5,150,105,0.1);  color: var(--green);        border: 1px solid rgba(5,150,105,0.2); }
.pill-inactive  { background: rgba(23,30,44,0.05);  color: var(--muted);        border: 1px solid rgba(23,30,44,0.1); }

.live-ring { display: flex; align-items: center; }
.live-ring span { width: 6px; height: 6px; border-radius: 50%; background: var(--cyan); animation: pulseDot 1.6s ease-in-out infinite; }

.type-badge { font-size: 0.7rem; font-weight: 700; padding: 3px 9px; border-radius: 999px; border: 1px solid rgba(23,30,44,0.1); color: var(--muted); background: rgba(23,30,44,0.04); }
.type-recurring { color: var(--cyan-deep); border-color: rgba(18,179,160,0.2); background: rgba(18,179,160,0.07); }
.type-onetime   { color: var(--amber-deep); border-color: rgba(224,162,74,0.22); background: rgba(224,162,74,0.07); }

.jc-target {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px; border-radius: 12px;
  background: rgba(23,30,44,0.04); border: 1px solid rgba(23,30,44,0.07);
}
.jc-field-label { font-size: 0.7rem; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
.jc-addr {
  display: inline-flex; align-items: center; gap: 5px;
  color: var(--cyan-deep); font-family: var(--mono-font), monospace;
  font-size: 0.85rem; font-weight: 600; transition: color 160ms ease;
}
.jc-addr:hover { color: var(--cyan); }

.jc-metrics { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; }
.jc-metric {
  padding: 10px 12px; border-radius: 12px; display: grid; gap: 4px;
  background: rgba(23,30,44,0.03); border: 1px solid rgba(23,30,44,0.07);
  transition: background 200ms ease, border-color 200ms ease;
}
.job-card:hover .jc-metric { background: rgba(23,30,44,0.05); }
.jc-m-label { font-size: 0.67rem; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
.jc-m-val { font-size: 0.88rem; font-weight: 700; color: var(--ink); }
.jc-m-val.funded   { color: var(--cyan-deep); }
.jc-m-val.depleted { color: var(--red); }
.jc-m-val.accent-num { color: var(--cyan-deep); }
.jc-m-val.small-txt { font-size: 0.76rem; color: var(--muted); font-weight: 500; }

.jc-foot {
  display: flex; justify-content: space-between; flex-wrap: wrap; gap: 6px;
  font-size: 0.73rem; color: var(--muted);
  border-top: 1px solid var(--line); padding-top: 12px;
}

.pool-track { height: 2px; background: rgba(23,30,44,0.08); border-radius: 2px; overflow: hidden; }
.pool-fill  { height: 100%; background: linear-gradient(90deg, var(--cyan-deep), var(--cyan)); border-radius: 2px; transition: width 600ms ease; }

.skel-card { background: rgba(255,255,255,0.45) !important; }
.skel-row    { height: 22px; border-radius: 8px;  background: rgba(23,30,44,0.07); animation: shimmer 1.4s ease-in-out infinite; background-size: 200% 100%; }
.skel-target { height: 42px; border-radius: 12px; background: rgba(23,30,44,0.05); animation: shimmer 1.4s ease-in-out infinite 80ms;  background-size: 200% 100%; }
.skel-grid   { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; }
.skel-cell   { height: 56px; border-radius: 12px; background: rgba(23,30,44,0.05); animation: shimmer 1.4s ease-in-out infinite 160ms; background-size: 200% 100%; }

.jq-empty {
  display: grid; place-items: center; text-align: center;
  padding: 80px 24px; border-radius: 22px;
}
.empty-icon {
  width: 58px; height: 58px; border-radius: 16px; display: grid; place-items: center;
  background: rgba(18,179,160,0.1); border: 1px solid rgba(18,179,160,0.18); color: var(--cyan-deep);
}
.jq-empty h3 { margin: 18px 0 8px; font-size: 1.1rem; font-family: var(--display-font), sans-serif; }
.jq-empty p { color: var(--muted); font-size: 0.88rem; max-width: 360px; line-height: 1.65; margin: 0; }
.btn-ghost {
  display: inline-flex; align-items: center; gap: 8px;
  margin-top: 18px; padding: 11px 20px; border-radius: 13px;
  font-size: 0.85rem; font-weight: 700; color: var(--ink);
  transition: transform 200ms ease, box-shadow 200ms ease;
}
.btn-ghost:hover { transform: translateY(-2px); box-shadow: 0 10px 30px rgba(23,30,44,0.12); }

.site-footer {
  position: relative; z-index: 3;
  width: min(1180px, calc(100% - 36px)); margin: 0 auto;
  padding: 40px 0 60px; padding-bottom: calc(60px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--line); margin-top: 60px;
}
.footer-top { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 16px; }
.footer-links { display: flex; gap: 20px; }
.footer-links a { color: var(--muted); font-size: 0.85rem; font-weight: 600; transition: color 180ms ease; }
.footer-links a:hover { color: var(--ink); }
.footer-bottom { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-top: 24px; color: var(--muted); font-size: 0.78rem; }
.footer-status { display: inline-flex; align-items: center; gap: 7px; }
.status-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--cyan); box-shadow: 0 0 0 3px rgba(18,179,160,0.16); animation: pulseDot 1.8s ease-in-out infinite; }
.footer-status code { padding: 1px 5px; border-radius: 4px; background: rgba(23,30,44,0.06); color: var(--cyan-deep); font-size: 0.75rem; }

@media (max-width: 1020px) {
  .jq-hero-inner { grid-template-columns: 1fr; }
  .telemetry-stack { grid-template-columns: repeat(2, minmax(0,1fr)); }
  .jq-grid { grid-template-columns: 1fr; }
}
@media (max-width: 680px) {
  .site-header { top: 12px; width: calc(100% - 20px); padding: 8px 10px; }
  .brand strong { display: none; }
  .jq-hero { padding-top: 88px; }
  .jq-hero-copy { padding: 22px; border-radius: 20px; }
  .jq-hero-copy h1 { font-size: clamp(2rem, 10vw, 3rem); }
  .telemetry-stack { grid-template-columns: 1fr 1fr; }
  .jq-filter-bar { flex-wrap: wrap; }
  .jc-metrics { grid-template-columns: repeat(2,1fr); }
  .jc-foot { flex-direction: column; }
  .viewport-frame { inset: 6px; border-radius: 20px; }
  .frame-corner { width: 16px; height: 16px; }
}
`;