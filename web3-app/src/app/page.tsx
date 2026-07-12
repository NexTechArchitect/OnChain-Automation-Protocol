"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useDisconnect, useReadContract } from "wagmi";
import { Bricolage_Grotesque, Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import type * as ThreeNamespace from "three";
import { CONTRACT_ADDRESSES, CONTRACT_ABIS } from "@/constants/contracts";

const displayFont = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--display-font",
});
const bodyFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--body-font",
});
const monoFont = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--mono-font",
});

const shortAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;

/* ======================================================
   NOTE ON REAL DATA
   ------------------------------------------------------
   The two telemetry cards below read live from your actual
   contracts via wagmi (CONTRACT_ADDRESSES / CONTRACT_ABIS).
   `functionName` is still a best guess — paste your ABI json
   and I'll match the real view function names. Until then
   you'll see a loading skeleton or a dash, never a fake number.

   `flow` and `security` stay as static copy on purpose — it's
   descriptive text about how the protocol works, not live data.
   ====================================================== */

type IconName =
  | "lock"
  | "eye"
  | "layers"
  | "check"
  | "shield"
  | "bolt"
  | "star"
  | "box"
  | "gauge"
  | "shieldCheck";

const flow: { step: string; title: string; icon: IconName; body: string }[] = [
  { step: "01", title: "Fund the intent", icon: "lock", body: "registerJob() locks a reward pool and sets the target contract, interval, and max base fee." },
  { step: "02", title: "Simulate offchain", icon: "eye", body: "Keepers call checkUpkeep() through eth_call before a single unit of gas is spent." },
  { step: "03", title: "Execute, isolated", icon: "layers", body: "ExecutionEngine calls performUpkeep() inside isolated error handling, so one bad target can't halt the batch." },
  { step: "04", title: "Settle onchain", icon: "check", body: "Keeper payout, protocol fee, reputation delta, and job state update in a single transaction." },
];

const security: { tag: string; title: string; icon: IconName; body: string }[] = [
  { tag: "Stake", title: "Bonded operators", icon: "shield", body: "Every keeper posts a bond above the protocol minimum before they can touch a single job." },
  { tag: "Slash", title: "Slashing, routed to treasury", icon: "bolt", body: "Bad executions cut the bond directly. Enough strikes and the registry jails the address automatically." },
  { tag: "Reputation", title: "Capped between 0 and 1000", icon: "star", body: "Reputation rises on clean executions and decays on faults, bounded onchain so it can never be gamed to infinity." },
  { tag: "Isolation", title: "Fault-isolated batches", icon: "box", body: "executeBatch() wraps each job in its own error boundary. One malicious target reverts alone, not the whole queue." },
  { tag: "Gas", title: "Base-fee ceiling", icon: "gauge", body: "Every job sets a max base fee, so execution simply waits out gas spikes instead of griefing keepers." },
  { tag: "Guard", title: "Reentrancy-guarded, pausable", icon: "shieldCheck", body: "Strict checks-effects-interactions ordering, a reentrancy guard on every transfer, and an owner-gated pause switch." },
];

/* ======================================================
   ICONS — small hand-drawn SVGs, so the card visuals don't
   need a new npm dependency. Each one is picked to match
   what its card actually describes, not decoration for its
   own sake.
   ====================================================== */

const iconPaths: Record<IconName, React.ReactNode> = {
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3 2 8l10 5 10-5-10-5Z" />
      <path d="M2 16l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  shield: <path d="M12 3 4 6v6c0 5 3.6 8.4 8 9 4.4-.6 8-4 8-9V6l-8-3Z" />,
  bolt: <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />,
  star: <path d="m12 3 2.6 5.9L21 9.6l-4.6 4.2L17.6 21 12 17.6 6.4 21l1.2-7.2L3 9.6l6.4-.7L12 3Z" />,
  box: (
    <>
      <path d="M3 8 12 3l9 5-9 5-9-5Z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 13v8" />
    </>
  ),
  gauge: (
    <>
      <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
      <path d="M12 14 16 9" />
      <path d="M4 15a8 8 0 1 1 16 0" />
    </>
  ),
  shieldCheck: (
    <>
      <path d="M12 3 4 6v6c0 5 3.6 8.4 8 9 4.4-.6 8-4 8-9V6l-8-3Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
};

function CardIcon({ name }: { name: IconName }) {
  return (
    <svg
      className="card-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {iconPaths[name]}
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      className="btn-arrow"
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </svg>
  );
}

/* ======================================================
   WALLET — real multi-wallet picker via wagmi connectors,
   instead of grabbing whatever last claimed window.ethereum.
   ====================================================== */

function WalletButton() {
  const { address, isConnected, chain } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (isConnected && address) {
    return (
      <div className="wallet-wrap" ref={wrapRef}>
        <button className="wallet-button glass" type="button" onClick={() => setOpen((v) => !v)}>
          <span className="wallet-orb is-live" />
          <span>{shortAddress(address)}</span>
          <em>{chain?.name ?? "Unknown network"}</em>
        </button>
        {open ? (
          <div className="wallet-menu glass">
            <button type="button" onClick={() => disconnect()}>Disconnect</button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="wallet-wrap" ref={wrapRef}>
      <button className="wallet-button glass" type="button" onClick={() => setOpen((v) => !v)}>
        <span className="wallet-orb" />
        <span>{isPending ? "Connecting..." : "Connect wallet"}</span>
      </button>
      {open ? (
        <div className="wallet-menu glass">
          {connectors.length === 0 ? (
            <p className="wallet-empty">No wallets configured yet — add injected, MetaMask, Coinbase Wallet, or WalletConnect connectors in config/wagmi.ts</p>
          ) : (
            connectors.map((connector) => (
              <button
                key={connector.uid}
                type="button"
                onClick={() => {
                  connect({ connector });
                  setOpen(false);
                }}
              >
                <span className="connector-dot">{connector.name.charAt(0)}</span>
                {connector.name}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

/* ======================================================
   METRIC — reads a real value off a contract. Shows a
   skeleton while loading and a dash on failure, never a
   made-up number.
   ====================================================== */

function LiveMetric({
  label,
  address,
  abi,
  functionName,
  suffix = "",
  tone = "cyan",
}: {
  label: string;
  address: `0x${string}`;
  abi: unknown[];
  functionName: string;
  suffix?: string;
  tone?: "cyan" | "amber";
}) {
  const { data, isLoading, isError } = useReadContract({
    address,
    abi: abi as never,
    functionName,
  });

  return (
    <div className="telemetry-card glass" data-tone={tone}>
      <span>{label}</span>
      <strong>
        {isLoading ? <span className="skeleton-text" /> : isError ? "—" : `${String(data)}${suffix}`}
      </strong>
    </div>
  );
}

/* ======================================================
   BACKDROP — a persistent, full-page fixed layer, not just
   the hero. Position: fixed means it never scrolls away, so
   the motion reads as one continuous canvas behind the whole
   page instead of stopping the moment the hero ends.

   Real video first (drop a clip into public/videos), falls
   back to a hand-built WebGL glass scene (bloom + grain),
   falls back again to a static gradient for prefers-reduced-
   motion. The scene also picks up a gentle scroll-linked tilt,
   and pauses its render loop while the tab is hidden so it
   stays cheap on phones over a long session.
   ====================================================== */

function GlassScene() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let frameId = 0;
    let cleanup = () => {};

    async function boot() {
      const THREE = await import("three");
      const { EffectComposer } = await import("three/examples/jsm/postprocessing/EffectComposer.js");
      const { RenderPass } = await import("three/examples/jsm/postprocessing/RenderPass.js");
      const { UnrealBloomPass } = await import("three/examples/jsm/postprocessing/UnrealBloomPass.js");

      const host = hostRef.current;
      if (!host || disposed) return;

      const isCompact = window.innerWidth < 720;

      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0xf3f6fb, 0.045);

      const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
      camera.position.set(0, 3, 12);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, isCompact ? 1 : 2));
      host.appendChild(renderer.domElement);

      const disposables: Array<{ dispose: () => void }> = [];
      const track = <T extends { dispose: () => void }>(item: T) => {
        disposables.push(item);
        return item;
      };

      const world = new THREE.Group();
      scene.add(world);

      // Soft floating glass shards, tinted in three brand hues
      const shardGeo = track(new THREE.IcosahedronGeometry(1, 0));
      const shardColors = [0xffffff, 0xdff7f1, 0xffe9c9];
      const shardMaterials = shardColors.map((color) =>
        track(
          new THREE.MeshPhysicalMaterial({
            color,
            transparent: true,
            opacity: 0.4,
            roughness: 0.12,
            metalness: 0.04,
            transmission: 0.55,
            thickness: 0.6,
          }),
        ),
      );

      const shardCount = isCompact ? 8 : 16;
      const shards: ThreeNamespace.Mesh[] = [];
      for (let i = 0; i < shardCount; i += 1) {
        const mesh = new THREE.Mesh(shardGeo, shardMaterials[i % shardMaterials.length]);
        const scale = 0.25 + Math.random() * 0.55;
        mesh.scale.setScalar(scale);
        mesh.position.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 6 + 1, (Math.random() - 0.5) * 10 - 3);
        mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
        world.add(mesh);
        shards.push(mesh);
      }

      const key = new THREE.DirectionalLight(0xffffff, 1.4);
      key.position.set(-4, 6, 6);
      scene.add(key);
      const fill = new THREE.PointLight(0x7ee6d8, 1.2, 20);
      fill.position.set(4, -1, 4);
      scene.add(fill);
      scene.add(new THREE.AmbientLight(0xffffff, 0.8));

      const composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), isCompact ? 0.28 : 0.5, 0.6, 0.15);
      composer.addPass(bloom);

      const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      let scrollProgress = 0;
      const updateScrollProgress = () => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        scrollProgress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      };

      const resize = () => {
        const rect = host.getBoundingClientRect();
        const width = Math.max(rect.width, 1);
        const height = Math.max(rect.height, 1);
        renderer.setSize(width, height, false);
        composer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };
      const move = (event: PointerEvent) => {
        const rect = host.getBoundingClientRect();
        pointer.tx = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
        pointer.ty = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
      };

      window.addEventListener("resize", resize);
      window.addEventListener("pointermove", move, { passive: true });
      window.addEventListener("scroll", updateScrollProgress, { passive: true });
      resize();
      updateScrollProgress();

      const clock = new THREE.Clock();
      const animate = () => {
        frameId = window.requestAnimationFrame(animate);
        if (document.hidden) return;

        const elapsed = clock.getElapsedTime();
        const speed = reduceMotion ? 0.15 : 1;

        pointer.x += (pointer.tx - pointer.x) * 0.04;
        pointer.y += (pointer.ty - pointer.y) * 0.04;
        world.rotation.y = 0.1 + pointer.x * 0.1;
        world.rotation.x = scrollProgress * 0.3;

        shards.forEach((mesh, index) => {
          mesh.rotation.x += 0.002 * speed * ((index % 3) + 1);
          mesh.rotation.y += 0.0016 * speed * ((index % 2) + 1);
          mesh.position.y += Math.sin(elapsed * 0.4 + index) * 0.0025;
        });

        camera.position.x += (pointer.x * 0.5 - camera.position.x) * 0.03;
        camera.lookAt(0, 0.5, -1);

        composer.render();
      };
      animate();

      cleanup = () => {
        window.cancelAnimationFrame(frameId);
        window.removeEventListener("resize", resize);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("scroll", updateScrollProgress);
        disposables.forEach((item) => item.dispose());
        renderer.dispose();
        renderer.domElement.remove();
      };
    }

    boot().catch(() => {
      hostRef.current?.classList.add("backdrop-fallback-static");
    });

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  return <div className="glass-scene" ref={hostRef} aria-hidden="true" />;
}

function CinematicBackdrop() {
  const [videoUnavailable, setVideoUnavailable] = useState(false);
  const [skipMotion, setSkipMotion] = useState(false);

  useEffect(() => {
    setSkipMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  return (
    <div className="cinematic-backdrop" aria-hidden="true">
      {skipMotion ? (
        <div className="backdrop-static" />
      ) : videoUnavailable ? (
        <GlassScene />
      ) : (
        <video
          className="backdrop-video"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster="/videos/keeper-poster.jpg"
          onError={() => setVideoUnavailable(true)}
        >
          <source src="/videos/keeper-background.webm" type="video/webm" />
          <source src="/videos/keeper-background.mp4" type="video/mp4" />
        </video>
      )}
      <div className="backdrop-veil" />
      <div className="backdrop-grain" />
    </div>
  );
}

/* ======================================================
   FRAME — a fixed, non-interactive border that hugs the
   real edge of the viewport with four corner brackets.
   Pointer-events: none, so it never blocks a click; it sits
   above every section (and the backdrop) purely as a design
   accent, corner to corner, top of the page to the bottom.
   ====================================================== */

function ViewportFrame() {
  return (
    <div className="viewport-frame" aria-hidden="true">
      <span className="frame-corner corner-tl" />
      <span className="frame-corner corner-tr" />
      <span className="frame-corner corner-bl" />
      <span className="frame-corner corner-br" />
    </div>
  );
}

/* ======================================================
   SCROLL REVEAL
   ====================================================== */

function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { ref, visible };
}

function Reveal({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const { ref, visible } = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className={`reveal ${visible ? "is-visible" : ""} ${className}`}>
      {children}
    </div>
  );
}

/* ======================================================
   SECTIONS
   ====================================================== */

function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 1020) setMobileOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <header className={`site-header glass ${scrolled ? "is-scrolled" : ""}`}>
      <a className="brand" href="#top" aria-label="Keeper Network">
        <span className="brand-mark"><span /></span>
        <strong>Keeper Network</strong>
      </a>

      <nav className="nav-links" aria-label="Primary navigation">
        <a href="/jobs">Jobs</a>
        <a href="/keepers">Keepers</a>
        <a href="/docs">Docs</a>
      </nav>

      <div className="header-right">
        <WalletButton />
        <button
          className="nav-toggle"
          type="button"
          aria-label="Toggle menu"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
        >
          <span data-open={mobileOpen} />
          <span data-open={mobileOpen} />
          <span data-open={mobileOpen} />
        </button>
      </div>

      {mobileOpen ? (
        <div className="nav-mobile-panel glass">
          <a href="/jobs" onClick={() => setMobileOpen(false)}>Jobs</a>
          <a href="/keepers" onClick={() => setMobileOpen(false)}>Keepers</a>
          <a href="/docs" onClick={() => setMobileOpen(false)}>Docs</a>
        </div>
      ) : null}
    </header>
  );
}

function Hero() {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setEntered(true);
      return;
    }
    const id = window.setTimeout(() => setEntered(true), 80);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <section id="top" className="hero">
      <div className="hero-body">
        <div className={`hero-copy glass hero-enter ${entered ? "is-entered" : ""}`}>
          <span className="eyebrow"><i /> Live and running on Base mainnet</span>
          <h1>
            Autonomous execution,
            <span>enforced by stake.</span>
          </h1>
          <p>
            Keeper Network watches your contracts around the clock and calls{" "}
            <code>performUpkeep</code> the moment conditions clear. No cron job, no
            centralized bot, no permission needed.
          </p>
          <div className="hero-actions">
            <a className="btn-primary" href="/register-job">
              Register a job <ArrowIcon />
            </a>
            <a className="btn-ghost glass" href="/jobs">View live queue</a>
          </div>
        </div>

        <aside className={`telemetry-stack hero-enter hero-enter-delay ${entered ? "is-entered" : ""}`}>
          <LiveMetric
            label="Active operators"
            address={CONTRACT_ADDRESSES.KEEPER_REGISTRY}
            abi={CONTRACT_ABIS.KEEPER_REGISTRY as unknown[]}
            functionName="activeOperatorCount"
            tone="cyan"
          />
          <LiveMetric
            label="Live jobs"
            address={CONTRACT_ADDRESSES.JOB_MANAGER}
            abi={CONTRACT_ABIS.JOB_MANAGER as unknown[]}
            functionName="liveJobCount"
            tone="amber"
          />
        </aside>
      </div>
    </section>
  );
}

function FlowSection() {
  return (
    <section className="section flow-section">
      <Reveal className="section-head">
        <span className="section-tag">How it works</span>
        <h2>From a funded intent to a settled transaction.</h2>
        <p>Four steps, in this exact order, every single time a job runs.</p>
      </Reveal>
      <div className="flow-grid stagger-grid">
        {flow.map((item) => (
          <Reveal key={item.step} className="flow-card glass">
            <div className="flow-card-head">
              <span className="card-icon-wrap">
                <CardIcon name={item.icon} />
              </span>
              <em className="flow-index-num">{item.step}</em>
            </div>
            <h3>{item.title}</h3>
            <p>{item.body}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function SecuritySection() {
  return (
    <section className="section security-section">
      <Reveal className="section-head">
        <span className="section-tag">Security model</span>
        <h2>Built for keepers who might misbehave.</h2>
        <p>The protocol assumes operators will occasionally act badly, and prices that in.</p>
      </Reveal>
      <div className="security-grid stagger-grid">
        {security.map((item) => (
          <Reveal key={item.tag} className="security-card glass">
            <div className="security-card-head">
              <span className="card-icon-wrap">
                <CardIcon name={item.icon} />
              </span>
              <span className="security-tag">{item.tag}</span>
            </div>
            <h3>{item.title}</h3>
            <p>{item.body}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function CtaSection() {
  return (
    <section className="section cta-section">
      <Reveal className="cta-panel glass">
        <div>
          <span className="section-tag">Get started</span>
          <h2>Fund a job and let bonded keepers execute the moment it&apos;s ready.</h2>
        </div>
        <a className="btn-primary" href="/register-job">
          Launch a keeper job <ArrowIcon />
        </a>
      </Reveal>
    </section>
  );
}

function SiteFooter() {
  return (
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
        <span className="footer-status"><i className="status-dot" /> Base mainnet, chain ID 8453</span>
        <span>Always verify each address on Basescan before you send funds.</span>
      </div>
    </footer>
  );
}

export default function Home() {
  return (
    <>
      <style>{styles}</style>
      <main className={`keeper-page ${displayFont.variable} ${bodyFont.variable} ${monoFont.variable}`}>
        <CinematicBackdrop />
        <ViewportFrame />
        <SiteNav />
        <Hero />
        <FlowSection />
        <SecuritySection />
        <CtaSection />
        <SiteFooter />
      </main>
    </>
  );
}

const styles = `
  html, body {
    margin: 0 !important;
    background: #eef2fb !important;
    color: #171e2c !important;
  }

  .keeper-page, .keeper-page * { box-sizing: border-box; }

  .keeper-page {
    --ink: #171e2c;
    --muted: #5b6478;
    --cyan: #12b3a0;
    --cyan-deep: #0c8676;
    --amber: #e0a24a;
    --line: rgba(23, 30, 44, 0.08);
    --glass-bg: rgba(255, 255, 255, 0.58);
    --glass-border: rgba(255, 255, 255, 0.78);
    --shadow: 0 20px 60px rgba(23, 30, 44, 0.10);
    position: relative;
    min-height: 100vh;
    overflow-x: hidden;
    background: linear-gradient(180deg, #eef2fb 0%, #f7f9ff 100%);
    font-family: var(--body-font), sans-serif;
    color: var(--ink);
    -webkit-tap-highlight-color: transparent;
  }

  .keeper-page a, .keeper-page button { color: inherit; font: inherit; text-decoration: none; touch-action: manipulation; }
  .keeper-page button { border: 0; cursor: pointer; background: none; }
  .keeper-page code { font-family: var(--mono-font), monospace; }
  .keeper-page h1, .keeper-page h2, .keeper-page h3, .eyebrow, .section-tag, .security-tag {
    font-family: var(--display-font), sans-serif;
    letter-spacing: -0.01em;
  }

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

  /* ---------- Backdrop (full page, fixed) ---------- */

  .cinematic-backdrop { position: fixed; inset: 0; z-index: 0; overflow: hidden; }
  .backdrop-video, .glass-scene, .backdrop-static { position: absolute; inset: 0; width: 100%; height: 100%; }
  .backdrop-video { object-fit: cover; }
  .glass-scene canvas { display: block; width: 100%; height: 100%; }
  .backdrop-fallback-static, .backdrop-static {
    background: radial-gradient(circle at 60% 30%, rgba(18,179,160,0.18), transparent 40%), linear-gradient(160deg, #eef2fb, #f7f9ff);
  }
  .backdrop-veil {
    position: absolute; inset: 0; z-index: 1;
    background: linear-gradient(180deg, rgba(238,242,251,0.3) 0%, rgba(238,242,251,0.5) 45%, rgba(238,242,251,0.78) 100%);
  }
  .backdrop-grain {
    position: absolute; inset: 0; z-index: 2; pointer-events: none;
    opacity: 0.045; mix-blend-mode: multiply;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E");
    background-size: 140px 140px;
  }

  /* ---------- Viewport frame ---------- */

  .viewport-frame {
    position: fixed;
    inset: 10px;
    z-index: 60;
    pointer-events: none;
    border-radius: 26px;
    border: 1px solid rgba(23, 30, 44, 0.07);
  }
  .frame-corner { position: absolute; width: 22px; height: 22px; }
  .frame-corner.corner-tl { top: -1px; left: -1px; border-top: 2px solid rgba(18,179,160,0.5); border-left: 2px solid rgba(18,179,160,0.5); border-radius: 14px 0 0 0; }
  .frame-corner.corner-tr { top: -1px; right: -1px; border-top: 2px solid rgba(18,179,160,0.5); border-right: 2px solid rgba(18,179,160,0.5); border-radius: 0 14px 0 0; }
  .frame-corner.corner-bl { bottom: -1px; left: -1px; border-bottom: 2px solid rgba(18,179,160,0.5); border-left: 2px solid rgba(18,179,160,0.5); border-radius: 0 0 0 14px; }
  .frame-corner.corner-br { bottom: -1px; right: -1px; border-bottom: 2px solid rgba(18,179,160,0.5); border-right: 2px solid rgba(18,179,160,0.5); border-radius: 0 0 14px 0; }

  /* ---------- Header ---------- */

  .site-header {
    position: fixed;
    top: 18px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 50;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 18px;
    width: min(1180px, calc(100% - 36px));
    padding: 10px 16px;
    padding-top: max(10px, env(safe-area-inset-top));
    border-radius: 20px;
    transition: box-shadow 260ms ease, background 260ms ease;
  }

  .site-header.is-scrolled {
    box-shadow: 0 26px 70px rgba(23, 30, 44, 0.16);
  }

  .brand { display: flex; align-items: center; gap: 10px; }
  .brand strong { font-size: 0.95rem; font-weight: 700; }
  .brand-mark {
    position: relative;
    width: 36px; aspect-ratio: 1; display: grid; place-items: center;
    border-radius: 10px;
    overflow: hidden;
    background: linear-gradient(135deg, rgba(18,179,160,0.25), rgba(224,162,74,0.2));
  }
  .brand-mark::before {
    content: "";
    position: absolute;
    inset: -60%;
    background: conic-gradient(from 0deg, transparent, rgba(18,179,160,0.55), transparent 55%);
    animation: spinSlow 5s linear infinite;
  }
  .brand-mark span { position: relative; z-index: 1; width: 7px; aspect-ratio: 1; border-radius: 50%; background: var(--amber); }
  @keyframes spinSlow { to { transform: rotate(360deg); } }

  .nav-links { justify-self: center; display: flex; gap: 4px; }
  .nav-links a { position: relative; padding: 10px 14px; border-radius: 12px; color: var(--muted); font-size: 0.85rem; font-weight: 600; transition: color 180ms ease, background 180ms ease; }
  .nav-links a:hover { color: var(--ink); background: rgba(23,30,44,0.05); }
  .nav-links a::after {
    content: "";
    position: absolute;
    left: 14px; right: 14px; bottom: 7px;
    height: 2px; border-radius: 2px;
    background: linear-gradient(90deg, var(--cyan), var(--amber));
    transform: scaleX(0);
    transform-origin: left;
    transition: transform 260ms cubic-bezier(.16,1,.3,1);
  }
  .nav-links a:hover::after { transform: scaleX(1); }

  .header-right { display: flex; align-items: center; gap: 10px; justify-self: end; }

  .nav-toggle {
    display: none;
    flex-direction: column;
    gap: 4px;
    width: 44px; height: 44px;
    align-items: center; justify-content: center;
    border-radius: 12px;
  }
  .nav-toggle:hover { background: rgba(23,30,44,0.05); }
  .nav-toggle span {
    width: 18px; height: 2px; border-radius: 2px; background: var(--ink);
    transition: transform 220ms ease, opacity 220ms ease;
  }
  .nav-toggle span[data-open="true"]:nth-child(1) { transform: translateY(6px) rotate(45deg); }
  .nav-toggle span[data-open="true"]:nth-child(2) { opacity: 0; }
  .nav-toggle span[data-open="true"]:nth-child(3) { transform: translateY(-6px) rotate(-45deg); }

  .nav-mobile-panel {
    position: absolute;
    top: calc(100% + 10px);
    left: 12px;
    right: 12px;
    border-radius: 18px;
    padding: 8px;
    display: grid;
    gap: 2px;
    animation: navPanelIn 220ms cubic-bezier(.16,1,.3,1);
  }
  .nav-mobile-panel a { padding: 13px 14px; border-radius: 12px; font-weight: 700; font-size: 0.92rem; }
  .nav-mobile-panel a:hover { background: rgba(23,30,44,0.06); }
  @keyframes navPanelIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }

  @media (min-width: 1021px) {
    .nav-mobile-panel { display: none !important; }
  }

  /* ---------- Wallet ---------- */

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
    position: absolute; top: calc(100% + 8px); right: 0; min-width: 240px;
    border-radius: 14px; padding: 6px; display: grid; gap: 2px;
  }
  .wallet-menu button { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px; text-align: left; font-size: 0.85rem; font-weight: 600; }
  .wallet-menu button:hover { background: rgba(23,30,44,0.06); }
  .wallet-empty { padding: 10px 12px; font-size: 0.78rem; color: var(--muted); max-width: 230px; }
  .connector-dot {
    display: inline-flex; align-items: center; justify-content: center;
    width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0;
    background: linear-gradient(135deg, rgba(18,179,160,0.2), rgba(224,162,74,0.18));
    color: var(--cyan-deep); font-weight: 800; font-size: 0.72rem;
  }

  /* ---------- Hero ---------- */

  .hero { position: relative; min-height: 92svh; padding-top: 120px; }

  .hero-body {
    position: relative; z-index: 3;
    display: grid; grid-template-columns: minmax(0,1fr) 320px; gap: 32px; align-items: end;
    width: min(1180px, calc(100% - 36px)); margin: 0 auto; min-height: calc(92svh - 140px); padding-bottom: 60px;
  }

  .hero-enter { opacity: 0; transform: translateY(22px); transition: opacity 760ms cubic-bezier(.16,1,.3,1), transform 760ms cubic-bezier(.16,1,.3,1); }
  .hero-enter.is-entered { opacity: 1; transform: none; }
  .hero-enter-delay { transition-delay: 140ms; }

  .hero-copy { max-width: 760px; padding: 32px; border-radius: 24px; }
  .eyebrow { display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 999px; background: rgba(18,179,160,0.1); color: var(--cyan-deep); font-size: 0.76rem; font-weight: 700; }
  .eyebrow i { width: 6px; aspect-ratio: 1; border-radius: 50%; background: var(--cyan); box-shadow: 0 0 0 4px rgba(18,179,160,0.16); animation: pulseDot 1.8s ease-in-out infinite; }
  @keyframes pulseDot { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

  .hero h1 { font-size: clamp(2.8rem, 6vw, 5.4rem); font-weight: 700; line-height: 1; margin: 22px 0 0; letter-spacing: -0.015em; }
  .hero h1 span { display: block; color: var(--cyan-deep); }
  .hero-copy p { max-width: 600px; margin: 22px 0 0; color: var(--muted); font-size: 1.02rem; line-height: 1.72; }
  .hero-copy p code { padding: 2px 6px; border-radius: 6px; background: rgba(23,30,44,0.06); color: var(--cyan-deep); }
  .hero-actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 30px; }

  .btn-primary, .btn-ghost {
    display: inline-flex; align-items: center; gap: 8px; padding: 14px 20px; border-radius: 14px;
    font-size: 0.88rem; font-weight: 700;
    transition: transform 220ms cubic-bezier(.16,1,.3,1), box-shadow 220ms ease, border-color 220ms ease;
  }
  .btn-primary { color: #fff; background: linear-gradient(135deg, var(--cyan), var(--cyan-deep)); box-shadow: 0 18px 50px rgba(18,179,160,0.28); }
  .btn-primary:hover { transform: translateY(-3px); box-shadow: 0 24px 60px rgba(18,179,160,0.4); }
  .btn-primary .btn-arrow { display: inline-flex; transition: transform 220ms ease; }
  .btn-primary:hover .btn-arrow { transform: translate(3px, -3px); }
  .btn-ghost { color: var(--ink); }
  .btn-ghost:hover { transform: translateY(-3px); border-color: rgba(18,179,160,0.4); }

  .telemetry-stack { display: grid; gap: 12px; }
  .telemetry-card { padding: 18px; border-radius: 18px; position: relative; overflow: hidden; transition: transform 260ms cubic-bezier(.16,1,.3,1), box-shadow 260ms ease; }
  .telemetry-card:hover { transform: translateY(-4px); box-shadow: 0 28px 60px rgba(23,30,44,0.14); }
  .telemetry-card::before { content: ""; position: absolute; inset: 0; border-left: 3px solid var(--cyan); opacity: 0.9; }
  .telemetry-card[data-tone="amber"]::before { border-left-color: var(--amber); }
  .telemetry-card span { color: var(--muted); font-size: 0.78rem; font-weight: 700; }
  .telemetry-card strong { display: block; margin-top: 8px; font-size: 1.7rem; }
  .skeleton-text {
    display: inline-block; width: 60px; height: 22px; border-radius: 6px;
    background: linear-gradient(90deg, rgba(23,30,44,0.06), rgba(23,30,44,0.12), rgba(23,30,44,0.06));
    background-size: 200% 100%; animation: shimmer 1.4s ease-in-out infinite;
  }
  @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

  /* ---------- Reveal / sections ---------- */

  .reveal { opacity: 0; transform: translateY(18px); transition: opacity 640ms cubic-bezier(.16,1,.3,1), transform 640ms cubic-bezier(.16,1,.3,1); }
  .reveal.is-visible { opacity: 1; transform: none; }

  @media (prefers-reduced-motion: reduce) {
    .reveal, .hero-enter, .brand-mark::before, .nav-mobile-panel { transition: none !important; animation: none !important; opacity: 1 !important; transform: none !important; }
  }

  .stagger-grid > .reveal:nth-child(1) { transition-delay: 0ms; }
  .stagger-grid > .reveal:nth-child(2) { transition-delay: 80ms; }
  .stagger-grid > .reveal:nth-child(3) { transition-delay: 160ms; }
  .stagger-grid > .reveal:nth-child(4) { transition-delay: 240ms; }
  .stagger-grid > .reveal:nth-child(5) { transition-delay: 320ms; }
  .stagger-grid > .reveal:nth-child(6) { transition-delay: 400ms; }

  .section { position: relative; z-index: 3; width: min(1180px, calc(100% - 36px)); margin: 0 auto; padding: 100px 0; }
  .section-head { max-width: 720px; }
  .section-tag { color: var(--cyan-deep); font-size: 0.78rem; font-weight: 700; }
  .section-head h2, .cta-panel h2 { margin: 12px 0 0; font-size: clamp(2rem, 3.8vw, 3.6rem); font-weight: 700; letter-spacing: -0.015em; }
  .section-head p { margin: 14px 0 0; color: var(--muted); font-size: 1rem; line-height: 1.7; }

  /* ---------- Card icon + animated border (shared) ---------- */

  .card-icon-wrap {
    width: 42px; height: 42px; border-radius: 13px; flex-shrink: 0;
    display: grid; place-items: center;
    background: linear-gradient(135deg, rgba(18,179,160,0.18), rgba(224,162,74,0.14));
    color: var(--cyan-deep);
    transition: transform 260ms cubic-bezier(.16,1,.3,1);
  }
  .card-icon { width: 19px; height: 19px; }

  .flow-card, .security-card, .cta-panel { position: relative; }
  .flow-card::before, .security-card::before, .cta-panel::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    padding: 1.5px;
    background: conic-gradient(from var(--border-angle), transparent 0 65%, var(--cyan) 82%, var(--amber) 92%, transparent 100%);
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    opacity: 0;
    transition: opacity 320ms ease;
    animation: spinBorder 3.4s linear infinite paused;
    pointer-events: none;
  }
  .flow-card:hover::before, .security-card:hover::before, .cta-panel:hover::before {
    opacity: 1;
    animation-play-state: running;
  }
  .flow-card:hover .card-icon-wrap, .security-card:hover .card-icon-wrap { transform: scale(1.06) rotate(-4deg); }
  @keyframes spinBorder { to { --border-angle: 360deg; } }

  /* ---------- Flow ---------- */

  .flow-grid { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 14px; margin-top: 44px; }
  .flow-card { padding: 24px; border-radius: 20px; transition: transform 260ms cubic-bezier(.16,1,.3,1), box-shadow 260ms ease; }
  .flow-card:hover { transform: translateY(-6px); box-shadow: 0 30px 70px rgba(23,30,44,0.14); }
  .flow-card-head { display: flex; align-items: center; justify-content: space-between; }
  .flow-index-num { font-style: normal; font-weight: 700; color: var(--muted); opacity: 0.55; font-family: var(--display-font); font-size: 0.82rem; letter-spacing: 0.02em; }
  .flow-card h3 { margin: 20px 0 0; font-size: 1.08rem; }
  .flow-card p { margin: 10px 0 0; color: var(--muted); font-size: 0.86rem; line-height: 1.62; }

  /* ---------- Security ---------- */

  .security-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 14px; margin-top: 44px; }
  .security-card { padding: 22px; border-radius: 18px; transition: transform 260ms cubic-bezier(.16,1,.3,1), box-shadow 260ms ease; }
  .security-card:hover { transform: translateY(-6px); box-shadow: 0 28px 64px rgba(23,30,44,0.13); }
  .security-card-head { display: flex; align-items: center; justify-content: space-between; }
  .security-tag { display: inline-block; padding: 5px 10px; border-radius: 999px; background: rgba(18,179,160,0.1); color: var(--cyan-deep); font-size: 0.7rem; font-weight: 700; }
  .security-card h3 { margin: 15px 0 0; font-size: 1.02rem; }
  .security-card p { margin: 8px 0 0; color: var(--muted); font-size: 0.85rem; line-height: 1.6; }

  /* ---------- CTA ---------- */

  .cta-panel { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 36px; border-radius: 26px; overflow: hidden; }
  .cta-panel h2 { max-width: 640px; }
  .cta-panel::after {
    content: "";
    position: absolute;
    width: 340px; height: 340px;
    top: -140px; right: -90px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(18,179,160,0.2), transparent 70%);
    filter: blur(6px);
    animation: floatGlow 7s ease-in-out infinite;
    pointer-events: none;
  }
  @keyframes floatGlow { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(-24px, 20px); } }

  /* ---------- Footer ---------- */

  .site-footer { position: relative; z-index: 3; width: min(1180px, calc(100% - 36px)); margin: 0 auto; padding: 40px 0 60px; padding-bottom: calc(60px + env(safe-area-inset-bottom)); border-top: 1px solid var(--line); }
  .footer-top { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 16px; }
  .footer-links { display: flex; gap: 20px; }
  .footer-links a { color: var(--muted); font-size: 0.85rem; font-weight: 600; transition: color 180ms ease; }
  .footer-links a:hover { color: var(--ink); }
  .footer-bottom { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-top: 24px; color: var(--muted); font-size: 0.78rem; }
  .footer-status { display: inline-flex; align-items: center; gap: 7px; }
  .status-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--cyan); box-shadow: 0 0 0 3px rgba(18,179,160,0.16); animation: pulseDot 1.8s ease-in-out infinite; }

  /* ---------- Responsive ---------- */

  @media (max-width: 1020px) {
    .nav-links { display: none; }
    .nav-toggle { display: flex; }
    .hero-body { grid-template-columns: 1fr; }
    .telemetry-stack { grid-template-columns: repeat(2, minmax(0,1fr)); }
    .flow-grid, .security-grid { grid-template-columns: repeat(2, minmax(0,1fr)); }
  }

  @media (max-width: 680px) {
    .site-header { top: 12px; width: calc(100% - 20px); padding: 8px 10px; }
    .brand strong { display: none; }
    .hero { padding-top: 92px; }
    .hero-copy { padding: 22px; border-radius: 20px; }
    .hero h1 { font-size: clamp(2.3rem, 11vw, 3.4rem); }
    .hero-actions { flex-direction: column; }
    .btn-primary, .btn-ghost { width: 100%; justify-content: center; }
    .telemetry-stack { grid-template-columns: repeat(2, minmax(0,1fr)); }
    .section { padding: 64px 0; }
    .flow-grid, .security-grid { grid-template-columns: 1fr; }
    .cta-panel { flex-direction: column; align-items: flex-start; padding: 26px; }
    .cta-panel::after { width: 220px; height: 220px; top: -90px; right: -60px; }
    .viewport-frame { inset: 6px; border-radius: 20px; }
    .frame-corner { width: 16px; height: 16px; }
    .footer-top { gap: 20px; }
  }
`