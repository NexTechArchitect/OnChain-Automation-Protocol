"use client";

import { useEffect, useState, useCallback } from "react";
import { Bricolage_Grotesque, Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";

const displayFont = Bricolage_Grotesque({
  subsets: ["latin"], weight: ["600", "700", "800"], variable: "--df",
});
const bodyFont = Plus_Jakarta_Sans({
  subsets: ["latin"], weight: ["400", "500", "600"], variable: "--bf",
});
const monoFont = JetBrains_Mono({
  subsets: ["latin"], weight: ["400", "500", "700"], variable: "--mf",
});

// ─── DATA ─────────────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: "problem",      label: "The Problem" },
  { id: "architecture", label: "Architecture" },
  { id: "registry",     label: "KeeperRegistry" },
  { id: "jobmanager",   label: "JobManager" },
  { id: "engine",       label: "ExecutionEngine" },
  { id: "lifecycle",    label: "Keeper Lifecycle" },
  { id: "execution",    label: "Execution Flow" },
  { id: "security",     label: "Security Model" },
  { id: "integrate",    label: "Integrating" },
  { id: "deployments",  label: "Deployments" },
];

// ─── SCROLL SPY ───────────────────────────────────────────────────────────────

function useScrollSpy() {
  const [active, setActive] = useState("problem");
  useEffect(() => {
    const ids = SECTIONS.map(s => s.id);
    const handler = () => {
      const offset = window.scrollY + 140;
      let cur = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.offsetTop <= offset) cur = id;
      }
      setActive(cur);
    };
    window.addEventListener("scroll", handler, { passive: true });
    handler();
    return () => window.removeEventListener("scroll", handler);
  }, []);
  return active;
}

// ─── REVEAL ───────────────────────────────────────────────────────────────────

function useReveal() {
  const [vis, setVis] = useState<Set<string>>(new Set());
  useEffect(() => {
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) setVis(p => new Set([...p, e.target.id]));
      }),
      { threshold: 0.05, rootMargin: "0px 0px -40px 0px" }
    );
    document.querySelectorAll("[data-reveal]").forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);
  const rv = useCallback((id: string, delay = 0): React.CSSProperties => ({
    opacity: vis.has(id) ? 1 : 0,
    transform: vis.has(id) ? "none" : "translateY(16px)",
    transition: `opacity 0.55s ease ${delay}ms, transform 0.55s ease ${delay}ms`,
  }), [vis]);
  return rv;
}

// ─── ANCHOR ───────────────────────────────────────────────────────────────────

function A({ id }: { id: string }) {
  return <span id={id} style={{ display: "block", position: "relative", top: -110 }} />;
}

// ─── CONTRACT ADDRESS ─────────────────────────────────────────────────────────

function Addr({ full, href }: { full: string; href: string }) {
  const [copied, setCopied] = useState(false);
  const short = `${full.slice(0, 10)}…${full.slice(-6)}`;
  return (
    <div className="addr-row">
      <a href={href} target="_blank" rel="noreferrer" className="addr-chip">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        Basescan
      </a>
      <code className="addr-text">{short}</code>
      <button
        className="copy-btn"
        onClick={async () => {
          await navigator.clipboard.writeText(full);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        }}
      >{copied ? "✓" : "copy"}</button>
    </div>
  );
}

// ─── CALLOUT BOXES ────────────────────────────────────────────────────────────

function Note({ children }: { children: React.ReactNode }) {
  return <div className="callout callout-note">{children}</div>;
}
function Warning({ children }: { children: React.ReactNode }) {
  return <div className="callout callout-warn">{children}</div>;
}
function KeyPoint({ children }: { children: React.ReactNode }) {
  return <blockquote className="key-point">{children}</blockquote>;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

export default function KeeperDocs() {
  const active = useScrollSpy();
  const rv = useReveal();
  const [navScrolled, setNavScrolled] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    const h = () => setNavScrolled(window.scrollY > 30);
    window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
  }, []);

  return (
    <>
      <style>{CSS}</style>
      <div className={`root ${displayFont.variable} ${bodyFont.variable} ${monoFont.variable}`}>

        {/* ── TOP NAV ─────────────────────────────────────────────────────── */}
        <header className={`topnav ${navScrolled ? "topnav--scrolled" : ""}`}>
          <div className="topnav__inner">
            <a href="/" className="topnav__brand">
              <span className="brand-dot" />
              <span className="brand-name">Keeper Network</span>
              <span className="brand-pill">Docs</span>
            </a>

            {/* Desktop links */}
            <nav className="topnav__links">
              <a href="/jobs">Jobs Queue</a>
              <a href="/keepers">Operators</a>
              <a href="/docs" className="is-active">Documentation</a>
              <a href="https://github.com/NexTechArchitect" target="_blank" rel="noreferrer">
                GitHub ↗
              </a>
            </nav>

            <a href="/register-job" className="topnav__cta">
              Register a job →
            </a>

            {/* Hamburger */}
            <button
              className="topnav__ham"
              onClick={() => setMobileNavOpen(v => !v)}
              aria-label="Toggle navigation"
            >
              <span className={mobileNavOpen ? "open" : ""} />
              <span className={mobileNavOpen ? "open" : ""} />
              <span className={mobileNavOpen ? "open" : ""} />
            </button>
          </div>

          {/* Mobile dropdown */}
          {mobileNavOpen && (
            <div className="mobile-nav">
              <div className="mobile-nav__toc">
                <p className="mobile-toc-label">On this page</p>
                {SECTIONS.map(s => (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    className={`mobile-toc-link ${active === s.id ? "is-active" : ""}`}
                    onClick={() => setMobileNavOpen(false)}
                  >{s.label}</a>
                ))}
              </div>
              <div className="mobile-nav__links">
                <a href="/jobs" onClick={() => setMobileNavOpen(false)}>Jobs Queue</a>
                <a href="/keepers" onClick={() => setMobileNavOpen(false)}>Operators</a>
                <a href="/register-job" onClick={() => setMobileNavOpen(false)}>Register a job</a>
                <a href="https://github.com/NexTechArchitect" target="_blank" rel="noreferrer">GitHub ↗</a>
              </div>
            </div>
          )}
        </header>

        {/* ── PAGE BODY ───────────────────────────────────────────────────── */}
        <div className="page">

          {/* LEFT SIDEBAR */}
          <aside className="sidebar">
            <div className="sidebar__inner">
              <p className="toc__label">On this page</p>
              <nav className="toc">
                {SECTIONS.map(s => (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    className={`toc__link ${active === s.id ? "is-active" : ""}`}
                  >
                    {s.label}
                  </a>
                ))}
              </nav>

              <div className="sidebar__card">
                <div className="sidebar__network">
                  <span className="net-dot" />
                  Base Mainnet · 8453
                </div>
                <p>Three contracts. All verified on Basescan. Audit complete — zero critical findings.</p>
              </div>
            </div>
          </aside>

          {/* MAIN CONTENT */}
          <main className="content">

            {/* PAGE HEADER */}
            <div className="page-header">
              <div className="page-header__eyebrow">
                <span className="live-dot" />
                Protocol Documentation · v1.0
              </div>
              <h1 className="page-header__h1">
                Keeper Network
              </h1>
              <p className="page-header__lead">
                A decentralized automation protocol on Base. Bonded operators watch your
                contracts and execute jobs the moment conditions are met — no centralized
                servers, no single points of failure.
              </p>
              <div className="page-header__meta">
                <span>3 contracts</span>
                <span className="meta-dot">·</span>
                <span>Base Mainnet</span>
                <span className="meta-dot">·</span>
                <span>Audit: 0 critical, 0 high</span>
                <span className="meta-dot">·</span>
                <span>July 2026</span>
              </div>
            </div>

            <hr className="divider" />

            {/* ── 1. THE PROBLEM ────────────────────────────────────────── */}
            <section className="section">
              <A id="problem" />
              <div id="problem-hdr" data-reveal style={rv("problem-hdr")}>
                <h2 className="section__h2">The problem with smart contract automation</h2>
              </div>
              <div id="problem-body" data-reveal style={rv("problem-body", 80)} className="prose">
                <p>
                  Smart contracts are passive by nature. They execute only when called — they cannot
                  wake themselves up. Yet most non-trivial protocols depend on time-sensitive external
                  triggers: liquidating undercollateralized positions, compounding yield, distributing
                  rewards, or rebalancing vaults.
                </p>
                <p>
                  The standard industry answer is a company-run server with a cron job. This works
                  until it doesn't. An outage, a compromised key, or a simple deployment error leaves
                  critical functions uncalled — sometimes costing users real money while the engineering
                  team scrambles to restore service.
                </p>
                <KeyPoint>
                  Keeper Network replaces that centralized bot with a permissionless network of
                  bonded operators. Anyone can join as a keeper by posting ETH as collateral. Honest
                  execution earns a reward. Malicious or lazy execution gets that collateral slashed.
                  The incentive design makes the system self-regulating.
                </KeyPoint>
                <p>
                  No protocol team needs to run infrastructure. No single server can fail. The system
                  continues running as long as there are keepers — and keepers show up as long as there
                  are jobs paying rewards.
                </p>
              </div>
            </section>

            <hr className="divider" />

            {/* ── 2. ARCHITECTURE ───────────────────────────────────────── */}
            <section className="section">
              <A id="architecture" />
              <div id="arch-hdr" data-reveal style={rv("arch-hdr")}>
                <h2 className="section__h2">System architecture</h2>
              </div>
              <div id="arch-body" data-reveal style={rv("arch-body", 80)} className="prose">
                <p>
                  The protocol is split across three contracts, each with a single, clearly-bounded
                  responsibility. This separation is not just good engineering hygiene — it's a
                  security requirement. A bug or upgrade in one layer cannot touch the invariants of
                  the others.
                </p>

                <div className="arch-diagram">
                  <div className="arch-layer arch-layer--user">
                    <div className="arch-layer__label">Your Protocol</div>
                    <div className="arch-layer__sub">
                      Implements <code>IAutomatable</code> —
                      <code>checkUpkeep()</code> and <code>performUpkeep()</code>
                    </div>
                  </div>
                  <div className="arch-arrow">↕ Keeper calls checkUpkeep offchain, then routes onchain</div>
                  <div className="arch-layer arch-layer--engine">
                    <div className="arch-layer__label">ExecutionEngine</div>
                    <div className="arch-layer__sub">
                      Stateless router. Validates the keeper and job, calls the target
                      inside a fault-isolated try/catch, settles rewards atomically.
                    </div>
                  </div>
                  <div className="arch-arrow">↕ Reads and writes both registries</div>
                  <div className="arch-layers-split">
                    <div className="arch-layer arch-layer--registry">
                      <div className="arch-layer__label">KeeperRegistry</div>
                      <div className="arch-layer__sub">
                        Operator bonds, slash pipeline, reputation scores, lifecycle states.
                      </div>
                    </div>
                    <div className="arch-layer arch-layer--manager">
                      <div className="arch-layer__label">JobManager</div>
                      <div className="arch-layer__sub">
                        Job intents, reward escrow, interval tracking, fee accumulation.
                      </div>
                    </div>
                  </div>
                </div>

                <p>
                  The Execution Engine is the only contract that calls external code. Everything it
                  touches is wrapped in a <code>try/catch</code> boundary. A malicious target can
                  intentionally throw — the engine catches it, emits a failure event, and the keeper
                  moves on. One bad job cannot stall the queue.
                </p>
                <p>
                  The engine itself holds zero ETH at any point. All value lives in
                  the JobManager's escrow. Even if the engine were somehow compromised, there
                  would be nothing in it to steal.
                </p>
              </div>
            </section>

            <hr className="divider" />

            {/* ── 3. KEEPERREGISTRY ────────────────────────────────────── */}
            <section className="section">
              <A id="registry" />
              <div id="reg-hdr" data-reveal style={rv("reg-hdr")}>
                <h2 className="section__h2">KeeperRegistry</h2>
                <div className="contract-meta">
                  <span className="contract-tag">Ownable2Step</span>
                  <span className="contract-tag">ReentrancyGuard</span>
                  <span className="contract-tag">Pausable</span>
                </div>
                <Addr
                  full="0xcEa37b9CCA6170d43BF133CCfdeaD9CB2A4D61D3"
                  href="https://basescan.org/address/0xcEa37b9CCA6170d43BF133CCfdeaD9CB2A4D61D3"
                />
              </div>
              <div id="reg-body" data-reveal style={rv("reg-body", 80)} className="prose">
                <p>
                  The registry is the protocol's trust anchor. Every operator who wants to execute
                  jobs must post a minimum ETH bond here first. The bond is not a deposit — it is
                  active collateral that the protocol holds against future misbehavior.
                </p>
                <p>
                  Keeper state is stored in a packed two-slot struct: bond amount, registration
                  timestamp, unbonding timestamp, total executions, total slashes, reputation score,
                  and lifecycle status. The packing is deliberate — every read of a keeper's state
                  costs a single SLOAD.
                </p>

                <h3 className="section__h3">Slashing</h3>
                <p>
                  When the Execution Engine determines a keeper behaved badly, it calls
                  <code>slash(keeper, amount)</code>. The registry immediately deducts the
                  slash from the keeper's bond and routes the ETH to treasury. The slash counter
                  increments. If the counter reaches the jail threshold (default: 3), or if the
                  remaining bond drops below the minimum, the registry automatically moves the
                  keeper to the <em>Jailed</em> state without any human intervention.
                </p>
                <Note>
                  <strong>Why autonomous jailing matters.</strong> A system that requires a human
                  admin to manually block bad actors creates a window between the offense and the
                  punishment. Automating this closes that window completely — the third slash and
                  the jail happen in the same transaction.
                </Note>

                <h3 className="section__h3">The 3-day unbonding cooldown</h3>
                <p>
                  A keeper who wants to exit calls <code>initiateUnbond()</code>, which moves them
                  to <em>Exiting</em> and starts a strict 3-day timer. Only after the timer elapses
                  can they call <code>withdrawBond()</code> to receive their ETH back.
                </p>
                <p>
                  This cooldown is not arbitrary bureaucracy. It gives the protocol time to process
                  any executions the keeper made in their final active period, including any slashes
                  those executions might earn. Without it, a keeper could execute maliciously and
                  immediately extract their bond before the slash pipeline catches up.
                </p>

                <h3 className="section__h3">Reputation</h3>
                <p>
                  Every successful execution increments the keeper's reputation score by 5 points,
                  bounded at a hard ceiling of 1000. The score can be decreased by governance if
                  needed. The math is handled by the <code>KeeperMath</code> pure library, which
                  clamps every operation — the score can never overflow or underflow regardless of
                  inputs.
                </p>
              </div>
            </section>

            <hr className="divider" />

            {/* ── 4. JOBMANAGER ────────────────────────────────────────── */}
            <section className="section">
              <A id="jobmanager" />
              <div id="jm-hdr" data-reveal style={rv("jm-hdr")}>
                <h2 className="section__h2">JobManager</h2>
                <div className="contract-meta">
                  <span className="contract-tag">ReentrancyGuard</span>
                  <span className="contract-tag">Pull-Payment</span>
                  <span className="contract-tag">O(1) Queue</span>
                </div>
                <Addr
                  full="0xBAa2B4c250DD6da358e23244C2fa85dA1927718C"
                  href="https://basescan.org/address/0xBAa2B4c250DD6da358e23244C2fa85dA1927718C"
                />
              </div>
              <div id="jm-body" data-reveal style={rv("jm-body", 80)} className="prose">
                <p>
                  JobManager is the accounting ledger and scheduling engine. Every automation
                  intent registered on the protocol lives here as a <code>Job</code> struct,
                  with an associated reward pool in escrow.
                </p>

                <h3 className="section__h3">Registering a job</h3>
                <p>
                  Calling <code>registerJob(target, rewardPerExec, interval, maxBaseFee)</code>
                  with attached ETH creates a new job and locks the sent ETH as the reward pool.
                  The four parameters do exactly what their names suggest:
                </p>
                <ul className="param-list">
                  <li>
                    <code>target</code> — the contract address whose <code>performUpkeep</code>
                    will be called.
                  </li>
                  <li>
                    <code>rewardPerExec</code> — how much ETH a keeper earns for each successful
                    execution. Must be less than or equal to the amount sent.
                  </li>
                  <li>
                    <code>interval</code> — minimum seconds between executions. Set to 0 for
                    a one-time job that self-completes after a single run.
                  </li>
                  <li>
                    <code>maxBaseFee</code> — if <code>block.basefee</code> exceeds this value,
                    the job is considered unready and execution is skipped. Protects job owners
                    from paying wildly elevated gas compensation during network spikes.
                  </li>
                </ul>

                <h3 className="section__h3">The O(1) active job list</h3>
                <p>
                  The contract maintains an array of active job IDs that keepers can enumerate
                  offchain. Adding a job appends to the array. Removing a job — on cancellation,
                  pause, or completion — uses a swap-and-pop technique backed by a 1-indexed
                  position mapping. The job being removed swaps with the last element, then the
                  array is popped. This keeps removal at constant gas cost regardless of queue length.
                </p>
                <Note>
                  <strong>Why this matters at scale.</strong> A naïve implementation that scans the
                  array to find and remove an element costs O(n) gas. At 10,000 active jobs, that
                  becomes unacceptably expensive. The swap-and-pop pattern keeps it flat at any size.
                </Note>

                <h3 className="section__h3">Pull-payment fees</h3>
                <p>
                  When a keeper executes a job, the protocol fee is not immediately pushed to the
                  treasury address. Instead, it accumulates in a <code>s_accumulatedFees</code>
                  counter. The treasury must call <code>withdrawFees()</code> to collect.
                </p>
                <p>
                  This is a deliberate security choice. Push-payment designs — where the contract
                  actively sends ETH on every settlement — are vulnerable to a class of denial-of-service
                  attacks where the treasury address is a contract that intentionally reverts on
                  receive, causing every execution to fail. Pull-payment makes that attack impossible.
                </p>

                <h3 className="section__h3">Pausing and resuming jobs</h3>
                <p>
                  Job owners can call <code>pauseJob(jobId)</code> to temporarily remove a job
                  from the active queue without canceling it or losing the reward pool. Calling
                  <code>resumeJob(jobId)</code> puts it back — as long as the reward pool still
                  has enough ETH to cover at least one execution.
                </p>
              </div>
            </section>

            <hr className="divider" />

            {/* ── 5. EXECUTIONENGINE ───────────────────────────────────── */}
            <section className="section">
              <A id="engine" />
              <div id="eng-hdr" data-reveal style={rv("eng-hdr")}>
                <h2 className="section__h2">ExecutionEngine</h2>
                <div className="contract-meta">
                  <span className="contract-tag">Ownable2Step</span>
                  <span className="contract-tag">ReentrancyGuard</span>
                  <span className="contract-tag">Stateless Router</span>
                </div>
                <Addr
                  full="0x388665c32F9F17E0d5cfEE3Eabe1880A3AEd80e9"
                  href="https://basescan.org/address/0x388665c32F9F17E0d5cfEE3Eabe1880A3AEd80e9"
                />
              </div>
              <div id="eng-body" data-reveal style={rv("eng-body", 80)} className="prose">
                <p>
                  The engine is the narrow bridge between keepers and target contracts. Its job
                  is simple: validate that the keeper is eligible and the job is ready, call the
                  target, and settle atomically. It has no storage of its own beyond the addresses
                  of the Registry and Manager. It holds no ETH.
                </p>

                <h3 className="section__h3">executeJob vs executeBatch</h3>
                <p>
                  <code>executeJob(jobId, performData)</code> handles a single job.
                  <code>executeBatch(jobIds[], performDatas[])</code> handles an array of jobs
                  in one transaction. Both require the caller to be an active keeper.
                </p>
                <p>
                  In batch mode, each job runs inside its own <code>_executeSingle</code> call,
                  which wraps the target invocation in a try/catch. If a job is not ready (wrong
                  interval, empty pool, gas ceiling exceeded), it is silently skipped rather than
                  reverting. If the target's <code>performUpkeep</code> throws, the failure is
                  caught and emitted as a <code>JobExecutionFailed</code> event — the batch continues.
                </p>
                <KeyPoint>
                  Keepers are expected to simulate the batch via <code>eth_call</code> before
                  submitting. A keeper who sends a batch with many broken jobs wastes their own
                  gas — the protocol does not compensate for failed executions.
                </KeyPoint>

                <h3 className="section__h3">Atomic settlement</h3>
                <p>
                  On a successful execution, the engine calls <code>recordExecution</code> on
                  the JobManager in the same transaction. The manager handles everything from
                  there: verifying the interval has elapsed, splitting the reward from the pool,
                  transferring the keeper's share, accumulating the fee, and updating the job
                  state. The keeper's reputation increment happens in the same call via the Registry.
                  By the time the transaction commits, the entire state is consistent.
                </p>

                <h3 className="section__h3">Admin controls</h3>
                <p>
                  The protocol owner can call <code>slashKeeper</code> or <code>jailKeeper</code>
                  directly on the engine, which delegates to the Registry. In Phase 1, this is
                  a trusted admin function. Optimistic dispute resolution with challenge windows
                  is planned for Phase 2 — when this ships, admin slashing will be removed.
                </p>
              </div>
            </section>

            <hr className="divider" />

            {/* ── 6. LIFECYCLE ────────────────────────────────────────── */}
            <section className="section">
              <A id="lifecycle" />
              <div id="lc-hdr" data-reveal style={rv("lc-hdr")}>
                <h2 className="section__h2">Keeper lifecycle</h2>
              </div>
              <div id="lc-body" data-reveal style={rv("lc-body", 80)} className="prose">
                <p>
                  A keeper address lives in exactly one state at any given block.
                  The engine checks this before routing any job.
                </p>

                <div className="states">
                  <div className="state-card">
                    <div className="state-card__dot" style={{ background: "#94a3b8" }} />
                    <div>
                      <h4>Unregistered</h4>
                      <p>
                        Default state for every address. No bond posted. The address is
                        invisible to the protocol — it cannot be assigned jobs or call
                        any execution function.
                      </p>
                    </div>
                  </div>
                  <div className="state-card">
                    <div className="state-card__dot" style={{ background: "#10b981" }} />
                    <div>
                      <h4>Active</h4>
                      <p>
                        Bond meets or exceeds the minimum. The keeper appears in
                        <code>isActive()</code> checks. Eligible to route executions,
                        earn rewards, and accumulate reputation. This is the only state
                        from which execution is possible.
                      </p>
                    </div>
                  </div>
                  <div className="state-card">
                    <div className="state-card__dot" style={{ background: "#f59e0b" }} />
                    <div>
                      <h4>Exiting</h4>
                      <p>
                        <code>initiateUnbond()</code> was called. A 3-day cooldown is
                        running. The keeper is blocked from execution. After the cooldown,
                        <code>withdrawBond()</code> burns the record and returns ETH.
                      </p>
                    </div>
                  </div>
                  <div className="state-card">
                    <div className="state-card__dot" style={{ background: "#ef4444" }} />
                    <div>
                      <h4>Jailed</h4>
                      <p>
                        Triggered automatically: three slashes accumulated, or bond
                        dropped below the minimum floor. Execution is completely blocked.
                        The protocol owner can call <code>unjail()</code> to reinstate —
                        but only if the bond is still at or above the minimum.
                      </p>
                    </div>
                  </div>
                </div>

                <h3 className="section__h3">Transition rules</h3>
                <div className="transitions">
                  <div className="transition">
                    <span className="tr-from">Unregistered</span>
                    <span className="tr-arrow">→</span>
                    <span className="tr-to">Active</span>
                    <span className="tr-cond">Bond deposited via <code>register()</code>, meets minimum</span>
                  </div>
                  <div className="transition">
                    <span className="tr-from">Active</span>
                    <span className="tr-arrow">→</span>
                    <span className="tr-to">Exiting</span>
                    <span className="tr-cond"><code>initiateUnbond()</code> called</span>
                  </div>
                  <div className="transition">
                    <span className="tr-from">Exiting</span>
                    <span className="tr-arrow">→</span>
                    <span className="tr-to">Unregistered</span>
                    <span className="tr-cond">3-day cooldown elapsed, <code>withdrawBond()</code> called</span>
                  </div>
                  <div className="transition">
                    <span className="tr-from">Active</span>
                    <span className="tr-arrow tr-arrow--slash">→</span>
                    <span className="tr-to tr-to--jail">Jailed</span>
                    <span className="tr-cond">3 slashes OR bond falls below minimum — automatic</span>
                  </div>
                  <div className="transition">
                    <span className="tr-from tr-from--jail">Jailed</span>
                    <span className="tr-arrow">→</span>
                    <span className="tr-to">Active</span>
                    <span className="tr-cond"><code>unjail()</code> called by owner, bond ≥ minimum</span>
                  </div>
                </div>
              </div>
            </section>

            <hr className="divider" />

            {/* ── 7. EXECUTION FLOW ───────────────────────────────────── */}
            <section className="section">
              <A id="execution" />
              <div id="ex-hdr" data-reveal style={rv("ex-hdr")}>
                <h2 className="section__h2">Execution flow</h2>
              </div>
              <div id="ex-body" data-reveal style={rv("ex-body", 80)} className="prose">
                <p>
                  Every execution follows the same four-step sequence. The first step costs
                  no gas. The final three happen atomically in a single transaction.
                </p>

                <div className="flow-steps">
                  <div className="flow-step">
                    <div className="flow-step__num">1</div>
                    <div className="flow-step__content">
                      <h4>Offchain simulation</h4>
                      <p>
                        The keeper calls <code>checkUpkeep()</code> on the target via
                        <code>eth_call</code>. This is a read-only simulation that costs
                        zero gas. If it returns <code>false</code>, the keeper ignores
                        the job and moves on. No wasted gas, no failed transactions.
                        The function also returns <code>performData</code> — an encoded
                        payload the keeper will pass to the next step.
                      </p>
                    </div>
                  </div>
                  <div className="flow-step">
                    <div className="flow-step__num">2</div>
                    <div className="flow-step__content">
                      <h4>Onchain validation</h4>
                      <p>
                        The keeper submits <code>executeJob(jobId, performData)</code>
                        to the engine. The engine checks: is the keeper active? Is the
                        job ready? Is the base fee within the job's ceiling? Is the reward
                        pool funded? Any check failing reverts immediately.
                      </p>
                    </div>
                  </div>
                  <div className="flow-step">
                    <div className="flow-step__num">3</div>
                    <div className="flow-step__content">
                      <h4>Isolated execution</h4>
                      <p>
                        The engine calls <code>target.performUpkeep(performData)</code>
                        inside a try/catch. Your contract's logic runs here. If it reverts
                        for any reason, the engine catches the error, emits
                        <code>JobExecutionFailed</code>, and the transaction ends without
                        reverting. The keeper loses only the gas for the attempt.
                      </p>
                    </div>
                  </div>
                  <div className="flow-step">
                    <div className="flow-step__num">4</div>
                    <div className="flow-step__content">
                      <h4>Atomic settlement</h4>
                      <p>
                        On success, <code>recordExecution</code> fires: the job's
                        last-executed timestamp updates, the reward is split between
                        keeper and protocol fee, the keeper's share transfers immediately,
                        and reputation increments by 5. All in one commit.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <hr className="divider" />

            {/* ── 8. SECURITY ─────────────────────────────────────────── */}
            <section className="section">
              <A id="security" />
              <div id="sec-hdr" data-reveal style={rv("sec-hdr")}>
                <h2 className="section__h2">Security model</h2>
              </div>
              <div id="sec-body" data-reveal style={rv("sec-body", 80)} className="prose">
                <p>
                  The security model starts from an adversarial assumption: every keeper might
                  eventually misbehave, and every target contract might try to exploit the engine.
                  Every mechanism below exists because someone has already tried the attack it prevents.
                </p>

                <h3 className="section__h3">Checks-Effects-Interactions, without exception</h3>
                <p>
                  Every state-changing function across all three contracts follows the
                  Checks-Effects-Interactions pattern strictly. Validation happens first.
                  Storage writes happen second. ETH transfers — the only external interaction that
                  matters — happen last. Reentrancy guards wrap the functions that transfer ETH.
                  There is no code path where an external call precedes a storage write.
                </p>

                <h3 className="section__h3">The engine holds no funds</h3>
                <p>
                  The ExecutionEngine is a pure router. It has no balance. On successful execution,
                  reward transfers flow through the JobManager — the engine never touches ETH directly.
                  This means a compromised engine has nothing to drain.
                </p>

                <h3 className="section__h3">Fault isolation in batch execution</h3>
                <p>
                  In <code>executeBatch</code>, each job is wrapped in an independent try/catch.
                  A target contract that intentionally reverts — to trap gas or stall the queue —
                  is caught silently. The failure is logged. The batch continues. One bad actor
                  cannot deny service to legitimate jobs.
                </p>

                <h3 className="section__h3">Gas price ceilings</h3>
                <p>
                  Every job specifies a <code>maxBaseFee</code>. If <code>block.basefee</code>
                  exceeds this at execution time, the job is not considered ready. This protects
                  job owners from paying inflated keeper compensation during network congestion.
                  Jobs naturally pause during spikes and resume when fees normalize.
                </p>

                <h3 className="section__h3">Protocol invariants</h3>
                <p>
                  These invariants were verified with stateful invariant testing across more
                  than 500,000 simulated transactions. None of them broke.
                </p>
                <div className="invariants">
                  <div className="invariant">
                    <span className="invariant__icon">◆</span>
                    <div>
                      <strong>Registry ETH = sum of all active bonds.</strong>
                      <span> No bond has ever leaked by a single wei across 500k simulated transactions.</span>
                    </div>
                  </div>
                  <div className="invariant">
                    <span className="invariant__icon">◆</span>
                    <div>
                      <strong>JobManager ETH = all reward pools + accumulated fees.</strong>
                      <span> Pull-payment ensures the fee counter and balance are always in sync.</span>
                    </div>
                  </div>
                  <div className="invariant">
                    <span className="invariant__icon">◆</span>
                    <div>
                      <strong>ExecutionEngine balance is always zero.</strong>
                      <span> The engine is a stateless router. All value flows through JobManager.</span>
                    </div>
                  </div>
                  <div className="invariant">
                    <span className="invariant__icon">◆</span>
                    <div>
                      <strong>Reputation is always in [0, 1000].</strong>
                      <span> KeeperMath clamps every mutation at both bounds before returning.</span>
                    </div>
                  </div>
                  <div className="invariant">
                    <span className="invariant__icon">◆</span>
                    <div>
                      <strong>Active job list has no duplicates or phantom gaps.</strong>
                      <span> The swap-and-pop technique with 1-indexed position mapping ensures this structurally.</span>
                    </div>
                  </div>
                </div>

                <Warning>
                  These contracts have been thoroughly self-audited and invariant-tested.
                  They have <strong>not</strong> undergone a formal external audit. Do not route
                  significant funds through the protocol until a third-party audit completes.
                  A bug bounty program is planned before that milestone.
                </Warning>
              </div>
            </section>

            <hr className="divider" />

            {/* ── 9. INTEGRATING ──────────────────────────────────────── */}
            <section className="section">
              <A id="integrate" />
              <div id="int-hdr" data-reveal style={rv("int-hdr")}>
                <h2 className="section__h2">Integrating with Keeper Network</h2>
              </div>
              <div id="int-body" data-reveal style={rv("int-body", 80)} className="prose">
                <p>
                  Integration requires two things: implementing the <code>IAutomatable</code>
                  interface in your contract, and registering a job with enough ETH to fund
                  executions. There is no SDK, no proprietary library, no inherited base contract.
                </p>

                <h3 className="section__h3">The IAutomatable interface</h3>
                <p>
                  Your contract must implement exactly two functions:
                </p>
                <ul className="param-list">
                  <li>
                    <code>checkUpkeep(bytes calldata)</code> — a view function that returns
                    <code>(bool upkeepNeeded, bytes memory performData)</code>. This runs
                    offchain. It can be arbitrarily complex — time checks, price oracle reads,
                    vault threshold comparisons — because no gas is spent here.
                  </li>
                  <li>
                    <code>performUpkeep(bytes calldata performData)</code> — the state-changing
                    function called onchain by the engine. This is where your actual automation
                    logic runs.
                  </li>
                </ul>

                <h3 className="section__h3">Access control is your responsibility</h3>
                <p>
                  Your <code>performUpkeep</code> function <strong>must</strong> check that
                  <code>msg.sender</code> is the Execution Engine address. Without this check,
                  anyone can call your function and force execution at an arbitrary time.
                </p>
                <Warning>
                  Do not skip the <code>msg.sender</code> check in <code>performUpkeep</code>.
                  Store the engine address as an immutable at construction time and revert with
                  <code>Automatable__NotExecutionEngine()</code> if the caller is anyone else.
                </Warning>

                <h3 className="section__h3">Double-check your conditions onchain</h3>
                <p>
                  <code>checkUpkeep</code> runs offchain and is not a guarantee of state.
                  Between when a keeper simulates and when the transaction lands, the chain
                  may have moved. Always re-validate your conditions inside
                  <code>performUpkeep</code> and revert with
                  <code>Automatable__UpkeepNotNeeded()</code> if they are no longer met.
                  This prevents front-running and protects the reward pool from being drained
                  on redundant executions.
                </p>

                <h3 className="section__h3">Funding the job</h3>
                <p>
                  Call <code>registerJob</code> on the JobManager with enough ETH to cover
                  at least one execution. The reward pool is the pool of ETH keepers draw
                  from. When it empties, the job automatically becomes "not ready" and
                  keepers stop executing it. Top it up anytime with <code>depositReward</code>.
                </p>

                <h3 className="section__h3">Setting maxBaseFee</h3>
                <p>
                  Set this to a realistic ceiling for your network conditions. On Base,
                  normal base fees are very low — a value of 0.1 gwei is usually sufficient.
                  If you set it too low, keepers will never execute your job during any
                  network activity. If you set it too high, you pay inflated keeper rewards
                  during congestion.
                </p>

                <div className="integration-checklist">
                  <h4>Pre-launch checklist</h4>
                  <div className="check-item">
                    <span className="check">✓</span>
                    <span>Implement both <code>checkUpkeep</code> and <code>performUpkeep</code></span>
                  </div>
                  <div className="check-item">
                    <span className="check">✓</span>
                    <span>Validate <code>msg.sender === executionEngine</code> in <code>performUpkeep</code></span>
                  </div>
                  <div className="check-item">
                    <span className="check">✓</span>
                    <span>Re-validate conditions inside <code>performUpkeep</code>, not just in <code>checkUpkeep</code></span>
                  </div>
                  <div className="check-item">
                    <span className="check">✓</span>
                    <span>Simulate <code>checkUpkeep</code> locally before expecting keepers to pick up the job</span>
                  </div>
                  <div className="check-item">
                    <span className="check">✓</span>
                    <span>Fund the reward pool with enough ETH for multiple executions, not just one</span>
                  </div>
                  <div className="check-item">
                    <span className="check">✓</span>
                    <span>Set <code>maxBaseFee</code> to a realistic value for your chain's conditions</span>
                  </div>
                </div>
              </div>
            </section>

            <hr className="divider" />

            {/* ── 10. DEPLOYMENTS ─────────────────────────────────────── */}
            <section className="section">
              <A id="deployments" />
              <div id="dep-hdr" data-reveal style={rv("dep-hdr")}>
                <h2 className="section__h2">Deployments</h2>
              </div>
              <div id="dep-body" data-reveal style={rv("dep-body", 80)} className="prose">
                <p>
                  All three contracts are live on Base Mainnet (chain ID 8453) and verified
                  on Basescan. Always verify addresses against the official repository before
                  routing funds.
                </p>

                <div className="deployments">
                  <div className="deployment-row">
                    <div className="deployment-row__label">
                      <span className="deployment-row__name">KeeperRegistry</span>
                      <span className="deployment-row__tag">Trust anchor · Operator bonds</span>
                    </div>
                    <Addr
                      full="0xcEa37b9CCA6170d43BF133CCfdeaD9CB2A4D61D3"
                      href="https://basescan.org/address/0xcEa37b9CCA6170d43BF133CCfdeaD9CB2A4D61D3"
                    />
                  </div>
                  <div className="deployment-row">
                    <div className="deployment-row__label">
                      <span className="deployment-row__name">JobManager</span>
                      <span className="deployment-row__tag">Job scheduler · Reward escrow</span>
                    </div>
                    <Addr
                      full="0xBAa2B4c250DD6da358e23244C2fa85dA1927718C"
                      href="https://basescan.org/address/0xBAa2B4c250DD6da358e23244C2fa85dA1927718C"
                    />
                  </div>
                  <div className="deployment-row">
                    <div className="deployment-row__label">
                      <span className="deployment-row__name">ExecutionEngine</span>
                      <span className="deployment-row__tag">Stateless router · Fault-isolated</span>
                    </div>
                    <Addr
                      full="0x388665c32F9F17E0d5cfEE3Eabe1880A3AEd80e9"
                      href="https://basescan.org/address/0x388665c32F9F17E0d5cfEE3Eabe1880A3AEd80e9"
                    />
                  </div>
                </div>

                <h3 className="section__h3">Audit summary</h3>
                <div className="audit-table">
                  <div className="audit-row audit-row--header">
                    <span>Severity</span><span>Findings</span><span>Status</span>
                  </div>
                  <div className="audit-row">
                    <span>Critical</span><span className="audit-zero">0</span><span className="audit-pass">Clear</span>
                  </div>
                  <div className="audit-row">
                    <span>High</span><span className="audit-zero">0</span><span className="audit-pass">Clear</span>
                  </div>
                  <div className="audit-row">
                    <span>Medium</span><span className="audit-zero">0</span><span className="audit-pass">Clear</span>
                  </div>
                  <div className="audit-row">
                    <span>Slither (static)</span><span>41</span><span className="audit-info">All reviewed — no fixes required</span>
                  </div>
                  <div className="audit-row">
                    <span>Invariant tests</span><span>500k+ txns</span><span className="audit-pass">All invariants held</span>
                  </div>
                </div>
                <Note>
                  Self-audited by NexTechArchitect, July 2026. No external audit has been
                  performed yet. Engage a professional firm before routing significant value.
                </Note>
              </div>
            </section>

            {/* BOTTOM CTA */}
            <div className="bottom-cta">
              <div className="bottom-cta__text">
                <h3>Ready to register a job?</h3>
                <p>Fund a reward pool and let the network handle execution from here.</p>
              </div>
              <div className="bottom-cta__actions">
                <a href="/register-job" className="cta-btn cta-btn--primary">Register a job →</a>
                <a href="https://github.com/NexTechArchitect" target="_blank" rel="noreferrer" className="cta-btn cta-btn--ghost">View source ↗</a>
              </div>
            </div>

          </main>
        </div>

        {/* ── FOOTER ────────────────────────────────────────────────────── */}
        <footer className="footer">
          <div className="footer__inner">
            <div className="footer__brand">
              <span className="brand-dot" />
              <span>Keeper Network</span>
              <span className="footer__network">Base Mainnet · 8453</span>
            </div>
            <div className="footer__links">
              <a href="/jobs">Jobs Queue</a>
              <a href="/keepers">Operators</a>
              <a href="/register-job">Register Job</a>
              <a href="https://github.com/NexTechArchitect" target="_blank" rel="noreferrer">GitHub ↗</a>
            </div>
          </div>
          <div className="footer__disclaimer">
            Always verify contract addresses on Basescan before sending funds.
          </div>
        </footer>

      </div>
    </>
  );
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

const CSS = `
/* ── RESET & BASE ──────────────────────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html {
  scroll-behavior: smooth;
  font-size: 16px;
  -webkit-text-size-adjust: 100%;
}

body {
  background: #fafafa;
  color: #0f172a;
  font-family: var(--bf), system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(15,23,42,0.15); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: rgba(15,23,42,0.25); }

::selection { background: rgba(12,179,160,0.15); }

.root {
  --cyan:    #0ca5a0;
  --cyan-d:  #087a76;
  --cyan-l:  #e6f7f7;
  --ink:     #0f172a;
  --ink-2:   #334155;
  --ink-3:   #64748b;
  --line:    #e2e8f0;
  --bg:      #fafafa;
  --bg-2:    #f1f5f9;
  --white:   #ffffff;
  min-height: 100vh;
  background: var(--bg);
  color: var(--ink);
}

.root a { text-decoration: none; color: inherit; }
.root button { border: none; background: none; cursor: pointer; font: inherit; color: inherit; }

/* ── TOP NAV ───────────────────────────────────────────────────────────────── */
.topnav {
  position: fixed;
  top: 0; left: 0; right: 0;
  z-index: 200;
  background: rgba(250,250,250,0.92);
  border-bottom: 1px solid transparent;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  transition: border-color 0.25s ease, box-shadow 0.25s ease;
}
.topnav--scrolled {
  border-bottom-color: var(--line);
  box-shadow: 0 1px 16px rgba(15,23,42,0.06);
}
.topnav__inner {
  max-width: 1360px;
  margin: 0 auto;
  padding: 0 28px;
  height: 64px;
  display: flex;
  align-items: center;
  gap: 32px;
}
.topnav__brand {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.brand-dot {
  width: 10px; height: 10px;
  border-radius: 50%;
  background: var(--cyan);
  box-shadow: 0 0 0 3px rgba(12,165,160,0.2);
  animation: livePulse 2.4s ease-in-out infinite;
}
@keyframes livePulse {
  0%, 100% { box-shadow: 0 0 0 3px rgba(12,165,160,0.2); }
  50%       { box-shadow: 0 0 0 6px rgba(12,165,160,0.05); }
}
.brand-name {
  font-family: var(--df), sans-serif;
  font-weight: 800;
  font-size: 0.95rem;
  color: var(--ink);
  letter-spacing: -0.01em;
}
.brand-pill {
  font-family: var(--mf), monospace;
  font-size: 0.6rem;
  font-weight: 700;
  color: var(--cyan-d);
  background: var(--cyan-l);
  border: 1px solid rgba(12,165,160,0.25);
  padding: 2px 7px;
  border-radius: 5px;
  letter-spacing: 0.08em;
}
.topnav__links {
  display: flex;
  gap: 2px;
  margin-left: auto;
}
.topnav__links a {
  padding: 7px 13px;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ink-3);
  transition: color 0.15s ease, background 0.15s ease;
}
.topnav__links a:hover { color: var(--ink); background: var(--bg-2); }
.topnav__links a.is-active { color: var(--cyan-d); background: var(--cyan-l); }
.topnav__cta {
  flex-shrink: 0;
  padding: 8px 16px;
  border-radius: 9px;
  background: var(--ink);
  color: #fff;
  font-size: 0.83rem;
  font-weight: 700;
  white-space: nowrap;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.topnav__cta:hover { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(15,23,42,0.2); }
.topnav__ham {
  display: none;
  flex-direction: column;
  gap: 5px;
  width: 36px; height: 36px;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  border: 1px solid var(--line);
  transition: background 0.15s ease;
}
.topnav__ham:hover { background: var(--bg-2); }
.topnav__ham span {
  width: 16px; height: 1.5px;
  background: var(--ink-2);
  border-radius: 2px;
  transition: transform 0.22s ease, opacity 0.22s ease;
}
.topnav__ham span.open:nth-child(1) { transform: translateY(6.5px) rotate(45deg); }
.topnav__ham span.open:nth-child(2) { opacity: 0; }
.topnav__ham span.open:nth-child(3) { transform: translateY(-6.5px) rotate(-45deg); }

/* ── MOBILE NAV ────────────────────────────────────────────────────────────── */
.mobile-nav {
  border-top: 1px solid var(--line);
  background: var(--white);
  padding: 20px 24px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 28px;
}
.mobile-toc-label {
  font-family: var(--mf), monospace;
  font-size: 0.62rem;
  font-weight: 700;
  color: var(--ink-3);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  margin-bottom: 10px;
}
.mobile-toc-link {
  display: block;
  font-size: 0.88rem;
  font-weight: 500;
  color: var(--ink-3);
  padding: 5px 0;
  border-bottom: 1px solid var(--line);
  transition: color 0.15s ease;
}
.mobile-toc-link:last-child { border-bottom: none; }
.mobile-toc-link.is-active { color: var(--cyan-d); font-weight: 700; }
.mobile-nav__links {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.mobile-nav__links a {
  font-size: 1rem;
  font-weight: 600;
  color: var(--ink-2);
  padding: 8px 0;
  border-bottom: 1px solid var(--line);
}
.mobile-nav__links a:last-child { border-bottom: none; }

/* ── PAGE LAYOUT ───────────────────────────────────────────────────────────── */
.page {
  max-width: 1360px;
  margin: 0 auto;
  padding: 0 28px;
  padding-top: 64px; /* nav height */
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 64px;
  align-items: start;
}

/* ── SIDEBAR ───────────────────────────────────────────────────────────────── */
.sidebar {
  position: sticky;
  top: 80px;
  max-height: calc(100vh - 96px);
  overflow-y: auto;
  scrollbar-width: none;
  padding: 32px 0 32px;
}
.sidebar::-webkit-scrollbar { display: none; }
.sidebar__inner { display: flex; flex-direction: column; gap: 28px; }

.toc__label {
  font-family: var(--mf), monospace;
  font-size: 0.62rem;
  font-weight: 700;
  color: var(--ink-3);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  margin-bottom: 2px;
}
.toc {
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--line);
}
.toc__link {
  padding: 6px 0 6px 14px;
  font-size: 0.84rem;
  font-weight: 500;
  color: var(--ink-3);
  border-left: 2px solid transparent;
  margin-left: -1px;
  line-height: 1.4;
  transition: color 0.15s ease, border-color 0.15s ease;
}
.toc__link:hover { color: var(--ink-2); }
.toc__link.is-active {
  color: var(--cyan-d);
  border-left-color: var(--cyan);
  font-weight: 700;
}

.sidebar__card {
  background: var(--bg-2);
  border-radius: 10px;
  padding: 14px 16px;
  border: 1px solid var(--line);
}
.sidebar__network {
  display: flex;
  align-items: center;
  gap: 7px;
  font-family: var(--mf), monospace;
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--cyan-d);
  margin-bottom: 8px;
}
.net-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: #10b981;
  flex-shrink: 0;
}
.sidebar__card p {
  font-size: 0.78rem;
  color: var(--ink-3);
  line-height: 1.5;
}

/* ── CONTENT ───────────────────────────────────────────────────────────────── */
.content {
  min-width: 0;
  padding: 32px 0 80px;
  max-width: 760px;
}

/* ── PAGE HEADER ───────────────────────────────────────────────────────────── */
.page-header { margin-bottom: 40px; }
.page-header__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: var(--mf), monospace;
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--cyan-d);
  background: var(--cyan-l);
  border: 1px solid rgba(12,165,160,0.22);
  padding: 5px 12px;
  border-radius: 6px;
  letter-spacing: 0.06em;
  margin-bottom: 20px;
}
.live-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: #10b981;
  animation: livePulse 2.4s ease-in-out infinite;
}
.page-header__h1 {
  font-family: var(--df), sans-serif;
  font-size: clamp(2rem, 4vw, 3rem);
  font-weight: 800;
  color: var(--ink);
  letter-spacing: -0.025em;
  line-height: 1.1;
  margin-bottom: 16px;
}
.page-header__lead {
  font-size: 1.1rem;
  color: var(--ink-2);
  line-height: 1.7;
  max-width: 640px;
  margin-bottom: 18px;
}
.page-header__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--mf), monospace;
  font-size: 0.72rem;
  color: var(--ink-3);
  flex-wrap: wrap;
}
.meta-dot { opacity: 0.4; }

.divider {
  border: none;
  border-top: 1px solid var(--line);
  margin: 0;
}

/* ── SECTIONS ──────────────────────────────────────────────────────────────── */
.section {
  padding: 52px 0;
}
.section__h2 {
  font-family: var(--df), sans-serif;
  font-size: clamp(1.5rem, 2.5vw, 2rem);
  font-weight: 800;
  color: var(--ink);
  letter-spacing: -0.02em;
  line-height: 1.2;
  margin-bottom: 8px;
  scroll-margin-top: 110px;
}
.section__h3 {
  font-family: var(--df), sans-serif;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--ink);
  letter-spacing: -0.01em;
  margin: 32px 0 10px;
}

/* Contract meta line */
.contract-meta {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin: 10px 0 12px;
}
.contract-tag {
  font-family: var(--mf), monospace;
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--cyan-d);
  background: var(--cyan-l);
  border: 1px solid rgba(12,165,160,0.22);
  padding: 3px 8px;
  border-radius: 5px;
  letter-spacing: 0.04em;
}

/* ── PROSE ─────────────────────────────────────────────────────────────────── */
.prose p {
  font-size: 0.985rem;
  line-height: 1.82;
  color: var(--ink-2);
  margin-bottom: 18px;
}
.prose p:last-child { margin-bottom: 0; }
.prose code {
  font-family: var(--mf), monospace;
  font-size: 0.84em;
  color: var(--cyan-d);
  background: var(--cyan-l);
  padding: 1px 5px;
  border-radius: 4px;
  font-weight: 600;
}
.prose strong { color: var(--ink); font-weight: 700; }
.prose em { color: var(--ink-3); font-style: italic; }

.param-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 12px 0 20px;
  padding-left: 0;
}
.param-list li {
  font-size: 0.95rem;
  line-height: 1.7;
  color: var(--ink-2);
  padding-left: 16px;
  border-left: 2px solid var(--line);
}
.param-list li code {
  font-family: var(--mf), monospace;
  font-size: 0.84em;
  color: var(--cyan-d);
  background: var(--cyan-l);
  padding: 1px 5px;
  border-radius: 4px;
  font-weight: 600;
}

/* ── CALLOUTS ──────────────────────────────────────────────────────────────── */
.callout {
  margin: 24px 0;
  padding: 16px 18px;
  border-radius: 10px;
  font-size: 0.9rem;
  line-height: 1.68;
}
.callout code {
  font-family: var(--mf), monospace;
  font-size: 0.84em;
  padding: 1px 5px;
  border-radius: 4px;
  font-weight: 600;
}
.callout-note {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1e40af;
}
.callout-note code { background: #dbeafe; color: #1d4ed8; }
.callout-warn {
  background: #fff7ed;
  border: 1px solid #fed7aa;
  color: #92400e;
}
.callout-warn code { background: #fde8d3; color: #b45309; }
.callout strong { font-weight: 700; }

.key-point {
  margin: 24px 0;
  padding: 20px 24px;
  border-left: 3px solid var(--cyan);
  background: rgba(12,179,160,0.04);
  border-radius: 0 10px 10px 0;
  font-size: 1rem;
  font-style: italic;
  color: var(--ink-2);
  line-height: 1.7;
}

/* ── ADDRESS ROW ───────────────────────────────────────────────────────────── */
.addr-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin: 4px 0 16px;
}
.addr-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family: var(--mf), monospace;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--cyan-d);
  background: var(--cyan-l);
  border: 1px solid rgba(12,165,160,0.25);
  padding: 4px 10px;
  border-radius: 6px;
  transition: background 0.15s ease;
}
.addr-chip:hover { background: rgba(12,165,160,0.12); }
.addr-text {
  font-family: var(--mf), monospace;
  font-size: 0.78rem;
  color: var(--ink-3);
  background: var(--bg-2);
  border: 1px solid var(--line);
  padding: 4px 10px;
  border-radius: 6px;
}
.copy-btn {
  font-family: var(--mf), monospace;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--ink-3);
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--line);
  background: var(--white);
  transition: color 0.15s ease, border-color 0.15s ease;
}
.copy-btn:hover { color: var(--cyan-d); border-color: rgba(12,165,160,0.3); }

/* ── ARCHITECTURE DIAGRAM ──────────────────────────────────────────────────── */
.arch-diagram {
  margin: 28px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
}
.arch-layer {
  width: 100%;
  max-width: 580px;
  padding: 14px 18px;
  border-radius: 10px;
  border: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.arch-layer__label {
  font-family: var(--mf), monospace;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.arch-layer__sub {
  font-size: 0.85rem;
  color: var(--ink-3);
  line-height: 1.4;
}
.arch-layer__sub code {
  font-family: var(--mf), monospace;
  font-size: 0.82em;
  color: var(--cyan-d);
  background: var(--cyan-l);
  padding: 1px 4px;
  border-radius: 3px;
}
.arch-layer--user {
  background: var(--bg-2);
}
.arch-layer--user .arch-layer__label { color: var(--ink-2); }
.arch-layer--engine {
  background: #f0f9ff;
  border-color: rgba(12,165,160,0.2);
}
.arch-layer--engine .arch-layer__label { color: var(--cyan-d); }
.arch-layers-split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  width: 100%;
  max-width: 580px;
}
.arch-layer--registry {
  background: #f8fafc;
  border-color: #cbd5e1;
}
.arch-layer--registry .arch-layer__label { color: #0369a1; }
.arch-layer--manager {
  background: #f8fafc;
  border-color: #cbd5e1;
}
.arch-layer--manager .arch-layer__label { color: #0369a1; }
.arch-arrow {
  font-family: var(--mf), monospace;
  font-size: 0.68rem;
  color: var(--ink-3);
  text-align: center;
  padding: 8px 0;
  letter-spacing: 0.04em;
  width: 100%;
  max-width: 580px;
}

/* ── LIFECYCLE STATES ──────────────────────────────────────────────────────── */
.states {
  display: flex;
  flex-direction: column;
  gap: 0;
  border: 1px solid var(--line);
  border-radius: 12px;
  overflow: hidden;
  margin: 20px 0;
}
.state-card {
  display: flex;
  gap: 16px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--line);
  background: var(--white);
  align-items: flex-start;
}
.state-card:last-child { border-bottom: none; }
.state-card__dot {
  width: 10px; height: 10px;
  border-radius: 50%;
  margin-top: 6px;
  flex-shrink: 0;
}
.state-card h4 {
  font-family: var(--df), sans-serif;
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--ink);
  margin-bottom: 5px;
}
.state-card p {
  font-size: 0.88rem;
  color: var(--ink-3);
  line-height: 1.6;
  margin: 0;
}
.state-card p code {
  font-family: var(--mf), monospace;
  font-size: 0.82em;
  color: var(--cyan-d);
  background: var(--cyan-l);
  padding: 1px 4px;
  border-radius: 3px;
}

/* ── TRANSITIONS ───────────────────────────────────────────────────────────── */
.transitions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 16px 0 20px;
}
.transition {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  background: var(--bg-2);
  border: 1px solid var(--line);
  padding: 12px 16px;
  border-radius: 9px;
  font-size: 0.88rem;
}
.tr-from, .tr-to {
  font-family: var(--mf), monospace;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--ink-2);
  background: var(--white);
  border: 1px solid var(--line);
  padding: 3px 9px;
  border-radius: 6px;
}
.tr-to--jail { color: #ef4444; border-color: #fca5a5; background: #fef2f2; }
.tr-from--jail { color: #ef4444; border-color: #fca5a5; background: #fef2f2; }
.tr-arrow {
  font-size: 0.9rem;
  color: var(--ink-3);
}
.tr-arrow--slash { color: #ef4444; }
.tr-cond {
  color: var(--ink-3);
  font-size: 0.84rem;
  margin-left: 4px;
}
.tr-cond code {
  font-family: var(--mf), monospace;
  font-size: 0.8em;
  color: var(--cyan-d);
  background: var(--cyan-l);
  padding: 1px 4px;
  border-radius: 3px;
  font-weight: 600;
}

/* ── EXECUTION FLOW ────────────────────────────────────────────────────────── */
.flow-steps {
  margin: 20px 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}
.flow-step {
  display: flex;
  gap: 20px;
  align-items: flex-start;
  padding: 22px 0;
  border-bottom: 1px solid var(--line);
}
.flow-step:last-child { border-bottom: none; }
.flow-step__num {
  width: 32px; height: 32px;
  border-radius: 8px;
  background: var(--ink);
  color: #fff;
  font-family: var(--df), sans-serif;
  font-weight: 800;
  font-size: 0.85rem;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  margin-top: 2px;
}
.flow-step__content h4 {
  font-family: var(--df), sans-serif;
  font-size: 1rem;
  font-weight: 700;
  color: var(--ink);
  margin-bottom: 8px;
}
.flow-step__content p {
  font-size: 0.9rem;
  line-height: 1.72;
  color: var(--ink-2);
  margin: 0;
}
.flow-step__content code {
  font-family: var(--mf), monospace;
  font-size: 0.82em;
  color: var(--cyan-d);
  background: var(--cyan-l);
  padding: 1px 4px;
  border-radius: 3px;
  font-weight: 600;
}

/* ── INVARIANTS ────────────────────────────────────────────────────────────── */
.invariants {
  display: flex;
  flex-direction: column;
  gap: 0;
  border: 1px solid var(--line);
  border-radius: 12px;
  overflow: hidden;
  margin: 16px 0 20px;
}
.invariant {
  display: flex;
  gap: 14px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--line);
  background: var(--white);
  font-size: 0.9rem;
  line-height: 1.6;
  color: var(--ink-2);
  align-items: flex-start;
}
.invariant:last-child { border-bottom: none; }
.invariant__icon {
  color: var(--cyan);
  font-size: 0.7rem;
  margin-top: 5px;
  flex-shrink: 0;
}
.invariant strong { color: var(--ink); font-weight: 700; }

/* ── INTEGRATION CHECKLIST ─────────────────────────────────────────────────── */
.integration-checklist {
  margin: 28px 0;
  border: 1px solid #d1fae5;
  border-radius: 12px;
  overflow: hidden;
}
.integration-checklist h4 {
  font-family: var(--df), sans-serif;
  font-size: 0.85rem;
  font-weight: 700;
  color: #065f46;
  background: #ecfdf5;
  padding: 12px 18px;
  border-bottom: 1px solid #d1fae5;
}
.check-item {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 13px 18px;
  border-bottom: 1px solid #d1fae5;
  font-size: 0.9rem;
  color: var(--ink-2);
  line-height: 1.6;
}
.check-item:last-child { border-bottom: none; }
.check { color: #059669; font-weight: 800; flex-shrink: 0; margin-top: 1px; }
.check-item code {
  font-family: var(--mf), monospace;
  font-size: 0.82em;
  color: var(--cyan-d);
  background: var(--cyan-l);
  padding: 1px 4px;
  border-radius: 3px;
  font-weight: 600;
}

/* ── DEPLOYMENTS ───────────────────────────────────────────────────────────── */
.deployments {
  display: flex;
  flex-direction: column;
  gap: 0;
  border: 1px solid var(--line);
  border-radius: 12px;
  overflow: hidden;
  margin: 16px 0 24px;
}
.deployment-row {
  padding: 18px 20px;
  border-bottom: 1px solid var(--line);
  background: var(--white);
}
.deployment-row:last-child { border-bottom: none; }
.deployment-row__label {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 8px;
}
.deployment-row__name {
  font-family: var(--df), sans-serif;
  font-size: 1rem;
  font-weight: 700;
  color: var(--ink);
}
.deployment-row__tag {
  font-size: 0.78rem;
  color: var(--ink-3);
}

/* ── AUDIT TABLE ───────────────────────────────────────────────────────────── */
.audit-table {
  border: 1px solid var(--line);
  border-radius: 10px;
  overflow: hidden;
  margin: 16px 0 20px;
  font-size: 0.88rem;
}
.audit-row {
  display: grid;
  grid-template-columns: 140px 80px 1fr;
  gap: 0;
  padding: 11px 16px;
  border-bottom: 1px solid var(--line);
  background: var(--white);
  color: var(--ink-2);
}
.audit-row:last-child { border-bottom: none; }
.audit-row--header {
  background: var(--bg-2);
  font-family: var(--mf), monospace;
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--ink-3);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.audit-zero { font-family: var(--mf), monospace; font-weight: 700; color: #10b981; }
.audit-pass { color: #10b981; font-weight: 600; }
.audit-info { color: var(--ink-3); }

/* ── BOTTOM CTA ────────────────────────────────────────────────────────────── */
.bottom-cta {
  margin-top: 64px;
  padding: 36px 32px;
  background: var(--ink);
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  flex-wrap: wrap;
}
.bottom-cta__text h3 {
  font-family: var(--df), sans-serif;
  font-size: 1.3rem;
  font-weight: 800;
  color: #fff;
  margin-bottom: 6px;
}
.bottom-cta__text p {
  font-size: 0.9rem;
  color: rgba(255,255,255,0.6);
  line-height: 1.5;
  margin: 0;
}
.bottom-cta__actions { display: flex; gap: 10px; flex-wrap: wrap; }
.cta-btn {
  padding: 11px 20px;
  border-radius: 9px;
  font-size: 0.88rem;
  font-weight: 700;
  transition: transform 0.15s ease;
}
.cta-btn:hover { transform: translateY(-1px); }
.cta-btn--primary {
  background: var(--cyan);
  color: #fff;
  box-shadow: 0 4px 16px rgba(12,179,160,0.35);
}
.cta-btn--ghost {
  background: rgba(255,255,255,0.1);
  color: rgba(255,255,255,0.8);
  border: 1px solid rgba(255,255,255,0.15);
}

/* ── FOOTER ────────────────────────────────────────────────────────────────── */
.footer {
  border-top: 1px solid var(--line);
  padding: 24px 28px;
  background: var(--white);
}
.footer__inner {
  max-width: 1360px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 14px;
}
.footer__brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--ink-2);
}
.footer__network {
  font-family: var(--mf), monospace;
  font-size: 0.68rem;
  color: var(--ink-3);
  border-left: 1px solid var(--line);
  padding-left: 10px;
  margin-left: 2px;
}
.footer__links {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
}
.footer__links a {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ink-3);
  transition: color 0.15s ease;
}
.footer__links a:hover { color: var(--ink); }
.footer__disclaimer {
  max-width: 1360px;
  margin: 0 auto;
  font-size: 0.78rem;
  color: var(--ink-3);
}

/* ── RESPONSIVE ────────────────────────────────────────────────────────────── */
@media (max-width: 1080px) {
  .page { grid-template-columns: 200px 1fr; gap: 48px; padding: 0 20px; padding-top: 64px; }
  .topnav__inner { padding: 0 20px; gap: 20px; }
}
@media (max-width: 860px) {
  .page { grid-template-columns: 1fr; gap: 0; padding: 0 20px; padding-top: 64px; }
  .sidebar { display: none; }
  .topnav__links { display: none; }
  .topnav__cta { display: none; }
  .topnav__ham { display: flex; }
  .topnav__inner { gap: 12px; }
  .content { padding-top: 24px; }
}
@media (max-width: 640px) {
  .topnav__inner { padding: 0 16px; }
  .page { padding: 0 16px; padding-top: 64px; }
  .content { max-width: 100%; }
  .arch-layers-split { grid-template-columns: 1fr; }
  .mobile-nav { grid-template-columns: 1fr; }
  .footer__inner { flex-direction: column; align-items: flex-start; }
  .bottom-cta { padding: 24px 20px; flex-direction: column; align-items: flex-start; }
  .page-header__h1 { font-size: 1.8rem; }
  .section__h2 { font-size: 1.4rem; }
  .audit-row { grid-template-columns: 120px 60px 1fr; font-size: 0.8rem; }
}
@media (max-width: 420px) {
  .addr-row { flex-direction: column; align-items: flex-start; }
  .transition { flex-direction: column; gap: 6px; align-items: flex-start; }
  .flow-step { flex-direction: row; gap: 14px; }
}

/* ── REDUCED MOTION ────────────────────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}

/* ── DARK MODE (system) ────────────────────────────────────────────────────── */
@media (prefers-color-scheme: dark) {
  .root {
    --ink:   #f1f5f9;
    --ink-2: #cbd5e1;
    --ink-3: #94a3b8;
    --line:  rgba(255,255,255,0.08);
    --bg:    #0f172a;
    --bg-2:  #1e293b;
    --white: #1e293b;
    --cyan-l: rgba(12,165,160,0.12);
  }
  .topnav { background: rgba(15,23,42,0.92); }
  .mobile-nav { background: #1e293b; }
  .states .state-card { background: #1e293b; }
  .invariant { background: #1e293b; }
  .deployment-row { background: #1e293b; }
  .audit-row { background: #1e293b; }
  .check-item { background: #1e293b; }
  .audit-row--header { background: #0f172a; }
  .integration-checklist { border-color: rgba(12,165,160,0.2); }
  .integration-checklist h4 { background: rgba(12,165,160,0.1); color: #6ee7b7; border-color: rgba(12,165,160,0.2); }
  .sidebar__card { background: #1e293b; }
  .transition { background: #1e293b; }
  .tr-from, .tr-to { background: #0f172a; }
  .topnav__cta { background: #f1f5f9; color: #0f172a; }
  .bottom-cta { background: #1e293b; border: 1px solid rgba(255,255,255,0.06); }
  .footer { background: #0f172a; }
  .callout-note { background: rgba(30,64,175,0.15); border-color: rgba(59,130,246,0.25); color: #93c5fd; }
  .callout-note code { background: rgba(59,130,246,0.15); color: #93c5fd; }
  .callout-warn { background: rgba(146,64,14,0.15); border-color: rgba(251,146,60,0.25); color: #fdba74; }
  .callout-warn code { background: rgba(251,146,60,0.1); color: #fdba74; }
}
`;