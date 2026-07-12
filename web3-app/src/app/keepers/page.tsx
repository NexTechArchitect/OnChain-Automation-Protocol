"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  useReadContract,
  useSwitchChain,
} from "wagmi";
import { formatEther } from "viem";
import {
  Bricolage_Grotesque,
  Plus_Jakarta_Sans,
  JetBrains_Mono,
} from "next/font/google";
import { BASE_CHAIN_ID, CONTRACT_ADDRESSES, CONTRACT_ABIS } from "@/constants/contracts";
import type * as ThreeNamespace from "three";

/* ─── FONTS ──────────────────────────────────────────────── */
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

/* ─── HELPERS ────────────────────────────────────────────── */
const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function fmtEth(wei: bigint | undefined): string {
  if (wei === undefined || wei === null) return "—";
  const n = parseFloat(formatEther(wei));
  return `${n.toFixed(n < 1 ? 4 : 2)} ETH`;
}

function fmtCount(val: bigint | number | undefined): string {
  if (val === undefined || val === null) return "—";
  return Number(val).toLocaleString();
}

/* ─── ICONS ──────────────────────────────────────────────── */
type IconName =
  | "shield"
  | "lock"
  | "alert"
  | "check"
  | "external"
  | "search"
  | "users"
  | "bolt"
  | "award"
  | "loader"
  | "chevronDown";

const iconPaths: Record<IconName, React.ReactNode> = {
  shield: (
    <path d="M12 3 4 6v6c0 5 3.6 8.4 8 9 4.4-.6 8-4 8-9V6l-8-3Z" />
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3 2 20h20L12 3Z" />
      <path d="M12 10v4" />
      <path d="M12 17h.01" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  external: (
    <>
      <path d="M7 17 17 7" />
      <path d="M9 7h8v8" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  bolt: <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />,
  award: (
    <>
      <circle cx="12" cy="8" r="7" />
      <path d="M8.21 13.89L7 23l5-3 5 3-1.21-9.12" />
    </>
  ),
  loader: (
    <>
      <path d="M12 3v3" />
      <path d="M12 18v3" />
      <path d="M5.6 5.6l2.1 2.1" />
      <path d="M16.3 16.3l2.1 2.1" />
      <path d="M3 12h3" />
      <path d="M18 12h3" />
      <path d="M5.6 18.4l2.1-2.1" />
      <path d="M16.3 7.7l2.1-2.1" />
    </>
  ),
  chevronDown: <path d="m6 9 6 6 6-6" />,
};

function Icon({
  name,
  size = 16,
  className = "",
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={`kp-icon${name === "loader" ? " kp-spin" : ""} ${className}`}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {iconPaths[name]}
    </svg>
  );
}

/* ─── 3D AMBER GLASS BACKDROP ────────────────────────────── */
function AmberGlassScene() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let frameId = 0;
    let cleanup = () => {};

    async function boot() {
      const THREE = await import("three");
      const { EffectComposer } = await import(
        "three/examples/jsm/postprocessing/EffectComposer.js"
      );
      const { RenderPass } = await import(
        "three/examples/jsm/postprocessing/RenderPass.js"
      );
      const { UnrealBloomPass } = await import(
        "three/examples/jsm/postprocessing/UnrealBloomPass.js"
      );

      const host = hostRef.current;
      if (!host || disposed) return;

      const isCompact = window.innerWidth < 720;
      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0xfdf8f0, 0.04);

      const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
      camera.position.set(0, 2, 14);

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
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

      const shardGeo = track(new THREE.IcosahedronGeometry(1, 0));
      const shardColors = [
        0xfff8ee,
        0xfde8c8,
        0xfce4d6,
        0xfef3e2,
      ];
      const shardMats = shardColors.map((color) =>
        track(
          new THREE.MeshPhysicalMaterial({
            color,
            transparent: true,
            opacity: 0.55,
            roughness: 0.08,
            metalness: 0.02,
            transmission: 0.6,
            thickness: 0.8,
          })
        )
      );

      const hexGeo = track(new THREE.CylinderGeometry(0.6, 0.6, 0.15, 6));
      const hexMat = track(
        new THREE.MeshPhysicalMaterial({
          color: 0xf59e0b,
          transparent: true,
          opacity: 0.12,
          roughness: 0.05,
          metalness: 0.1,
          transmission: 0.8,
        })
      );

      const count = isCompact ? 8 : 18;
      const shards: ThreeNamespace.Mesh[] = [];

      for (let i = 0; i < count; i++) {
        const useHex = i < 4;
        const mesh = new THREE.Mesh(
          useHex ? hexGeo : shardGeo,
          useHex ? hexMat : shardMats[i % shardMats.length]
        );
        const scale = 0.2 + Math.random() * 0.65;
        mesh.scale.setScalar(scale);
        mesh.position.set(
          (Math.random() - 0.5) * 18,
          (Math.random() - 0.5) * 8 + 1,
          (Math.random() - 0.5) * 12 - 4
        );
        mesh.rotation.set(
          Math.random() * Math.PI,
          Math.random() * Math.PI,
          Math.random() * Math.PI
        );
        world.add(mesh);
        shards.push(mesh);
      }

      const key = new THREE.DirectionalLight(0xfff5e0, 1.6);
      key.position.set(-5, 8, 6);
      scene.add(key);

      const fill = new THREE.PointLight(0xf59e0b, 1.8, 24);
      fill.position.set(6, -2, 5);
      scene.add(fill);

      const rose = new THREE.PointLight(0xfda4af, 1.2, 20);
      rose.position.set(-8, 4, 2);
      scene.add(rose);

      scene.add(new THREE.AmbientLight(0xfef3e2, 1.0));

      const composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      const bloom = new UnrealBloomPass(
        new THREE.Vector2(1, 1),
        isCompact ? 0.3 : 0.55,
        0.5,
        0.12
      );
      composer.addPass(bloom);

      const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;

      let scrollProgress = 0;
      const updateScroll = () => {
        const max =
          document.documentElement.scrollHeight - window.innerHeight;
        scrollProgress =
          max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      };

      const resize = () => {
        const rect = host.getBoundingClientRect();
        const w = Math.max(rect.width, 1);
        const h = Math.max(rect.height, 1);
        renderer.setSize(w, h, false);
        composer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };

      const onPointer = (e: PointerEvent) => {
        const rect = host.getBoundingClientRect();
        pointer.tx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
        pointer.ty = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
      };

      window.addEventListener("resize", resize, { passive: true });
      window.addEventListener("pointermove", onPointer, { passive: true });
      window.addEventListener("scroll", updateScroll, { passive: true });
      resize();
      updateScroll();

      const clock = new THREE.Clock();

      const animate = () => {
        frameId = window.requestAnimationFrame(animate);
        if (document.hidden) return;

        const elapsed = clock.getElapsedTime();
        const speed = reduceMotion ? 0.08 : 1;

        pointer.x += (pointer.tx - pointer.x) * 0.035;
        pointer.y += (pointer.ty - pointer.y) * 0.035;

        world.rotation.y = 0.06 + pointer.x * 0.08;
        world.rotation.x = pointer.y * 0.04 + scrollProgress * 0.2;

        shards.forEach((mesh, i) => {
          mesh.rotation.x += 0.0018 * speed * ((i % 3) + 1);
          mesh.rotation.y += 0.0014 * speed * ((i % 2) + 1);
          mesh.position.y += Math.sin(elapsed * 0.3 + i * 0.8) * 0.002;
        });

        camera.position.x += (pointer.x * 0.6 - camera.position.x) * 0.025;
        camera.lookAt(0, 0.5, -2);
        composer.render();
      };
      animate();

      cleanup = () => {
        window.cancelAnimationFrame(frameId);
        window.removeEventListener("resize", resize);
        window.removeEventListener("pointermove", onPointer);
        window.removeEventListener("scroll", updateScroll);
        disposables.forEach((d) => d.dispose());
        renderer.dispose();
        renderer.domElement.remove();
      };
    }

    boot().catch(() => {
      if (hostRef.current) hostRef.current.classList.add("kp-scene-fallback");
    });

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  return <div className="kp-glass-scene" ref={hostRef} aria-hidden="true" />;
}

function WarmBackdrop() {
  const [skip, setSkip] = useState(false);
  useEffect(() => {
    setSkip(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  return (
    <div className="kp-backdrop" aria-hidden="true">
      {skip ? (
        <div className="kp-backdrop-static" />
      ) : (
        <AmberGlassScene />
      )}
      <div className="kp-orb kp-orb-1" />
      <div className="kp-orb kp-orb-2" />
      <div className="kp-orb kp-orb-3" />
      <div className="kp-grain" />
      <div className="kp-veil" />
    </div>
  );
}

/* ─── VIEWPORT FRAME ─────────────────────────────────────── */
function Frame() {
  return (
    <div className="kp-frame" aria-hidden="true">
      <span className="kp-corner kp-c-tl" />
      <span className="kp-corner kp-c-tr" />
      <span className="kp-corner kp-c-bl" />
      <span className="kp-corner kp-c-br" />
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
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.12 }
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, []);
  return { ref, visible };
}

function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const { ref, visible } = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`kp-reveal ${visible ? "is-visible" : ""} ${className}`}
      style={{ transitionDelay: visible ? `${delay}ms` : "0ms" }}
    >
      {children}
    </div>
  );
}

/* ─── WALLET ─────────────────────────────────────────────── */
function WalletControl() {
  const { address, isConnected, chain } = useAccount();
  const chainId = useChainId();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const wrongNet = isConnected && chainId !== BASE_CHAIN_ID;

  if (isConnected && address) {
    return (
      <div className="kp-wallet-wrap" ref={wrapRef}>
        <button
          className="kp-wallet-pill glass"
          type="button"
          onClick={() => setOpen((v) => !v)}
        >
          <span className={`kp-orb-dot ${wrongNet ? "is-warn" : "is-live"}`} />
          <span>{shortAddr(address)}</span>
          <em>{wrongNet ? "Wrong network" : (chain?.name ?? "Base")}</em>
          <Icon name="chevronDown" size={13} />
        </button>
        {open && (
          <div className="kp-wallet-menu glass">
            {wrongNet ? (
              <button
                type="button"
                className="kp-wallet-action is-warn"
                onClick={() => switchChain({ chainId: BASE_CHAIN_ID })}
              >
                <Icon name="alert" size={14} />
                {isSwitching ? "Switching…" : "Switch to Base"}
              </button>
            ) : (
              <div className="kp-wallet-chain">
                <Icon name="check" size={14} /> Base Mainnet
              </div>
            )}
            <button
              type="button"
              className="kp-wallet-action"
              onClick={() => {
                disconnect();
                setOpen(false);
              }}
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="kp-wallet-wrap" ref={wrapRef}>
      <button
        className="kp-wallet-pill glass"
        type="button"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="kp-orb-dot" />
        <span>{isPending ? "Connecting…" : "Connect wallet"}</span>
      </button>
      {open && (
        <div className="kp-wallet-menu glass">
          {connectors.length === 0 ? (
            <p className="kp-wallet-empty">No connectors configured.</p>
          ) : (
            connectors.map((c) => (
              <button
                key={c.uid}
                type="button"
                className="kp-wallet-action"
                onClick={() => {
                  connect({ connector: c });
                  setOpen(false);
                }}
              >
                <span className="kp-connector-dot">{c.name.charAt(0)}</span>
                {c.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ─── LIVE STAT CARD ─────────────────────────────────────── */
function LiveStatCard({
  label,
  icon,
  address,
  abi,
  functionName,
  format,
  tone,
}: {
  label: string;
  icon: IconName;
  address: `0x${string}`;
  abi: unknown[];
  functionName: string;
  format: (v: bigint) => string;
  tone: "amber" | "rose" | "gold" | "ink";
}) {
  const { data, isLoading, isError } = useReadContract({
    address,
    abi: abi as never,
    functionName,
    chainId: BASE_CHAIN_ID,
  });

  // Fix: cast through unknown to avoid TypeScript overlap error
  const display = isLoading
    ? null
    : isError
    ? "—"
    : format(data as unknown as bigint);

  return (
    <div className={`kp-stat-card glass tone-${tone}`}>
      <div className="kp-stat-icon-wrap">
        <Icon name={icon} size={18} />
      </div>
      <span className="kp-stat-label">{label}</span>
      <strong className="kp-stat-value">
        {display === null ? <span className="kp-skeleton" /> : display}
      </strong>
    </div>
  );
}

/* ─── STATIC STAT ────────────────────────────────────────── */
function StatCard({
  label,
  icon,
  value,
  tone,
}: {
  label: string;
  icon: IconName;
  value: string;
  tone: "amber" | "rose" | "gold" | "ink";
}) {
  return (
    <div className={`kp-stat-card glass tone-${tone}`}>
      <div className="kp-stat-icon-wrap">
        <Icon name={icon} size={18} />
      </div>
      <span className="kp-stat-label">{label}</span>
      <strong className="kp-stat-value">{value}</strong>
    </div>
  );
}

/* ─── INDIVIDUAL KEEPER CARD ─────────────────────────────── */
function KeeperDetailCard({ address: keeperAddr }: { address: `0x${string}` }) {
  const { data: keeperData, isLoading } = useReadContract({
    address: CONTRACT_ADDRESSES.KEEPER_REGISTRY,
    abi: CONTRACT_ABIS.KEEPER_REGISTRY as never,
    functionName: "getKeeper",
    args: [keeperAddr],
    chainId: BASE_CHAIN_ID,
  });

  const statusMap: Record<number, { label: string; cls: string }> = {
    0: { label: "Unregistered", cls: "status-inactive" },
    1: { label: "Active", cls: "status-active" },
    2: { label: "Jailed", cls: "status-jailed" },
    3: { label: "Exiting", cls: "status-exiting" },
  };

  if (isLoading) {
    return (
      <div className="kp-keeper-card glass is-loading">
        <div className="kp-card-shimmer" />
      </div>
    );
  }

  if (!keeperData) return null;

  const k = keeperData as {
    bondAmount: bigint;
    registeredAt: bigint;
    unbondInitiatedAt: bigint;
    totalJobsExecuted: number;
    totalSlashes: number;
    reputationScore: number;
    status: number;
  };

  const st = statusMap[k.status] ?? { label: "Unknown", cls: "status-inactive" };
  const repPct = Math.round((k.reputationScore / 1000) * 100);
  const isJailed = k.status === 2;
  const isExiting = k.status === 3;
  const successRate =
    k.totalJobsExecuted + k.totalSlashes > 0
      ? (
          (k.totalJobsExecuted / (k.totalJobsExecuted + k.totalSlashes)) *
          100
        ).toFixed(1)
      : "—";

  const repColor =
    k.reputationScore >= 800
      ? "#f59e0b"
      : k.reputationScore >= 500
      ? "#fb923c"
      : k.reputationScore >= 200
      ? "#fda4af"
      : "#ef4444";

  const joinDate = k.registeredAt
    ? new Date(Number(k.registeredAt) * 1000).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";

  return (
    <div className={`kp-keeper-card glass ${isJailed ? "is-jailed" : ""} ${isExiting ? "is-exiting" : ""}`}>
      <div className="kp-card-ring" />

      <div className="kp-card-head">
        <div className="kp-card-addr-block">
          <a
            href={`https://basescan.org/address/${keeperAddr}`}
            target="_blank"
            rel="noreferrer"
            className="kp-addr-link"
          >
            <code>{shortAddr(keeperAddr)}</code>
            <Icon name="external" size={11} />
          </a>
          <span className={`kp-status-badge ${st.cls}`}>{st.label}</span>
        </div>
        <span className="kp-join-date">Since {joinDate}</span>
      </div>

      <div className="kp-metrics">
        <div className="kp-metric">
          <span className="kp-metric-label">
            <Icon name="lock" size={11} /> Bonded
          </span>
          <span className="kp-metric-val">{fmtEth(k.bondAmount)}</span>
        </div>
        <div className="kp-metric">
          <span className="kp-metric-label">
            <Icon name="bolt" size={11} /> Jobs Executed
          </span>
          <span className="kp-metric-val">{fmtCount(k.totalJobsExecuted)}</span>
        </div>
        <div className="kp-metric">
          <span className="kp-metric-label">
            <Icon name="shield" size={11} /> Slashes
          </span>
          <span className={`kp-metric-val ${k.totalSlashes > 0 ? "is-warn" : ""}`}>
            {k.totalSlashes}
          </span>
        </div>
        <div className="kp-metric">
          <span className="kp-metric-label">
            <Icon name="check" size={11} /> Success Rate
          </span>
          <span className="kp-metric-val kp-success-rate">
            {successRate !== "—" ? `${successRate}%` : "—"}
          </span>
        </div>
      </div>

      <div className="kp-rep-wrap">
        <div className="kp-rep-head">
          <span className="kp-metric-label">
            <Icon name="award" size={11} /> Reputation
          </span>
          <strong className="kp-rep-score" style={{ color: repColor }}>
            {k.reputationScore} <span>/ 1000</span>
          </strong>
        </div>
        <div className="kp-rep-track">
          <div
            className="kp-rep-bar"
            style={{
              width: `${repPct}%`,
              background: `linear-gradient(90deg, ${repColor}99, ${repColor})`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

/* ─── KEEPER ADDRESSES ───────────────────────────────────── */
const KEEPER_ADDRESSES: `0x${string}`[] = [
  // Add real keeper addresses here e.g. "0xABC..."
];

function KeeperGrid({
  searchQuery,
  filter,
}: {
  searchQuery: string;
  filter: "all" | "active" | "jailed";
}) {
  if (KEEPER_ADDRESSES.length === 0) {
    return (
      <div className="kp-empty-state glass">
        <Icon name="users" size={32} className="kp-empty-icon" />
        <h3>No operators indexed yet</h3>
        <p>
          Add registered keeper addresses to <code>KEEPER_ADDRESSES</code> in
          this file, or pipe them in from an events indexer. Every card reads
          live from your <code>KeeperRegistry</code> contract.
        </p>
      </div>
    );
  }

  const filtered = KEEPER_ADDRESSES.filter((addr) => {
    if (!searchQuery) return true;
    return addr.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div className="kp-grid">
      {filtered.map((addr, i) => (
        <Reveal key={addr} delay={i * 60}>
          <KeeperDetailCard address={addr} />
        </Reveal>
      ))}
    </div>
  );
}

/* ─── MAIN PAGE ──────────────────────────────────────────── */
export default function KeepersPage() {
  const [scrolled, setScrolled] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "jailed">("all");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 12);
    h();
    window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
  }, []);

  return (
    <>
      <style>{styles}</style>
      <main
        className={`kp-page ${displayFont.variable} ${bodyFont.variable} ${monoFont.variable}`}
      >
        <WarmBackdrop />
        <Frame />

        {/* ── NAV ── */}
        <header className={`kp-nav glass ${scrolled ? "is-scrolled" : ""}`}>
          <a className="kp-brand" href="/">
            <span className="kp-brand-mark">
              <span />
            </span>
            <strong>Keeper Network</strong>
          </a>

          <nav className="kp-nav-links" aria-label="Primary">
            <a href="/jobs">Jobs</a>
            <a href="/keepers" className="kp-nav-active">
              Keepers
            </a>
            <a href="/docs">Docs</a>
          </nav>

          <div className="kp-nav-right">
            <WalletControl />
            <button
              className="kp-mobile-toggle"
              type="button"
              aria-label="Menu"
              onClick={() => setMobileNavOpen((v) => !v)}
            >
              <span data-open={mobileNavOpen} />
              <span data-open={mobileNavOpen} />
              <span data-open={mobileNavOpen} />
            </button>
          </div>

          {mobileNavOpen && (
            <div className="kp-mobile-panel glass">
              <a href="/jobs" onClick={() => setMobileNavOpen(false)}>
                Jobs
              </a>
              <a href="/keepers" onClick={() => setMobileNavOpen(false)}>
                Keepers
              </a>
              <a href="/docs" onClick={() => setMobileNavOpen(false)}>
                Docs
              </a>
            </div>
          )}
        </header>

        {/* ── HERO ── */}
        <section className="kp-hero">
          <div className="kp-hero-inner">
            <Reveal className="kp-hero-copy glass">
              <span className="kp-eyebrow">
                <i className="kp-pulse-dot" />
                Registry · Base Mainnet
              </span>
              <h1>
                Operator
                <em> Registry.</em>
              </h1>
              <p>
                Every keeper here has posted a bond to the{" "}
                <code>KeeperRegistry</code> contract. Honest executions build
                reputation; faults are slashed on-chain immediately. All data
                reads live from the chain — no approximations.
              </p>
              <a
                href={`https://basescan.org/address/${CONTRACT_ADDRESSES.KEEPER_REGISTRY}`}
                target="_blank"
                rel="noreferrer"
                className="kp-contract-link"
              >
                <Icon name="external" size={13} />
                View contract on Basescan
              </a>
            </Reveal>

            <div className="kp-stats-column">
              <Reveal delay={0}>
                <LiveStatCard
                  label="Registered Operators"
                  icon="users"
                  address={CONTRACT_ADDRESSES.KEEPER_REGISTRY}
                  abi={CONTRACT_ABIS.KEEPER_REGISTRY as unknown[]}
                  functionName="getTotalKeepers"
                  format={(v) => fmtCount(v)}
                  tone="amber"
                />
              </Reveal>
              <Reveal delay={80}>
                <LiveStatCard
                  label="Minimum Bond"
                  icon="lock"
                  address={CONTRACT_ADDRESSES.KEEPER_REGISTRY}
                  abi={CONTRACT_ABIS.KEEPER_REGISTRY as unknown[]}
                  functionName="getMinBond"
                  format={(v) => fmtEth(v)}
                  tone="gold"
                />
              </Reveal>
              <Reveal delay={160}>
                <LiveStatCard
                  label="Unbond Cooldown"
                  icon="shield"
                  address={CONTRACT_ADDRESSES.KEEPER_REGISTRY}
                  abi={CONTRACT_ABIS.KEEPER_REGISTRY as unknown[]}
                  functionName="getUnbondCooldown"
                  format={(v) => {
                    const secs = Number(v);
                    const days = Math.floor(secs / 86400);
                    return days > 0 ? `${days} days` : `${secs}s`;
                  }}
                  tone="rose"
                />
              </Reveal>
              <Reveal delay={240}>
                <LiveStatCard
                  label="Jail Threshold"
                  icon="alert"
                  address={CONTRACT_ADDRESSES.KEEPER_REGISTRY}
                  abi={CONTRACT_ABIS.KEEPER_REGISTRY as unknown[]}
                  functionName="getJailThreshold"
                  format={(v) => `${Number(v)} slashes`}
                  tone="ink"
                />
              </Reveal>
            </div>
          </div>
        </section>

        {/* ── FILTER BAR ── */}
        <section className="kp-filter-wrap">
          <Reveal className="kp-filter-bar glass">
            <div className="kp-search">
              <Icon name="search" size={15} />
              <input
                type="text"
                placeholder="Search by wallet address…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="kp-tabs">
              {(
                [
                  { key: "all", label: "All" },
                  { key: "active", label: "Active" },
                  { key: "jailed", label: "Jailed" },
                ] as const
              ).map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  className={`kp-tab ${filter === key ? "is-active" : ""}`}
                  onClick={() => setFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </Reveal>
        </section>

        {/* ── KEEPER GRID ── */}
        <section className="kp-grid-section">
          <KeeperGrid searchQuery={search} filter={filter} />
        </section>

        {/* ── REGISTER CTA ── */}
        <section className="kp-cta-section">
          <Reveal className="kp-cta-panel glass">
            <div className="kp-cta-text">
              <span className="kp-eyebrow kp-eyebrow-sm">
                Become an Operator
              </span>
              <h2>
                Post a bond. Earn rewards for every clean execution.
              </h2>
              <p>
                Operators stake ETH as collateral and call{" "}
                <code>register()</code> on the <code>KeeperRegistry</code>.
                Reputation rises with every successful job; faults are slashed
                directly from the bond.
              </p>
            </div>
            <div className="kp-cta-actions">
              <a
                href={`https://basescan.org/address/${CONTRACT_ADDRESSES.KEEPER_REGISTRY}#writeContract`}
                target="_blank"
                rel="noreferrer"
                className="kp-btn-primary"
              >
                Register on Basescan
                <Icon name="external" size={14} />
              </a>
              <a href="/docs" className="kp-btn-ghost glass">
                Read the docs
              </a>
            </div>
          </Reveal>
        </section>

        {/* ── FOOTER ── */}
        <footer className="kp-footer">
          <div className="kp-footer-inner">
            <div className="kp-brand">
              <span className="kp-brand-mark">
                <span />
              </span>
              <strong>Keeper Network</strong>
            </div>
            <div className="kp-footer-links">
              <a href="/jobs">Jobs</a>
              <a href="/keepers">Keepers</a>
              <a href="/docs">Docs</a>
              <a href="/register-job">Register job</a>
            </div>
          </div>
          <div className="kp-footer-bottom">
            <span>
              <i className="kp-status-dot" /> KeeperRegistry active · Base
              Mainnet · chain 8453
            </span>
            <span>Verify every address on Basescan before sending funds.</span>
          </div>
        </footer>
      </main>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   STYLES
═══════════════════════════════════════════════════════════ */
const styles = `
html, body {
  margin: 0 !important;
  background: #fdf8f0 !important;
  color: #1c1108 !important;
}

.kp-page, .kp-page * { box-sizing: border-box; }

.kp-page {
  --ink:          #1c1108;
  --ink-2:        #3d2c0f;
  --muted:        #7c6340;
  --amber:        #f59e0b;
  --amber-deep:   #d97706;
  --amber-light:  #fde68a;
  --rose:         #fda4af;
  --rose-deep:    #f43f5e;
  --gold:         #eab308;
  --cream:        #fef9f0;
  --line:         rgba(28, 17, 8, 0.07);
  --glass-bg:     rgba(255, 252, 245, 0.72);
  --glass-border: rgba(255, 248, 230, 0.9);
  --shadow-warm:  0 20px 60px rgba(245, 158, 11, 0.10);
  --shadow-deep:  0 30px 80px rgba(28, 17, 8, 0.09);

  position: relative;
  min-height: 100vh;
  overflow-x: hidden;
  background: linear-gradient(160deg, #fdf8f0 0%, #fffaf4 60%, #fff8ef 100%);
  font-family: var(--body-font), sans-serif;
  color: var(--ink);
  -webkit-tap-highlight-color: transparent;
}

.kp-page a, .kp-page button { color: inherit; font: inherit; text-decoration: none; touch-action: manipulation; }
.kp-page button { border: 0; cursor: pointer; background: none; }
.kp-page code { font-family: var(--mono-font), monospace; font-size: 0.88em; padding: 2px 6px; border-radius: 5px; background: rgba(245,158,11,0.12); color: var(--amber-deep); }
.kp-page h1, .kp-page h2, .kp-page h3, .kp-eyebrow { font-family: var(--display-font), sans-serif; }

.glass {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  backdrop-filter: blur(22px) saturate(160%);
  -webkit-backdrop-filter: blur(22px) saturate(160%);
  box-shadow: var(--shadow-warm), var(--shadow-deep);
}

@property --border-angle { syntax: '<angle>'; inherits: false; initial-value: 0deg; }
@keyframes spinBorder { to { --border-angle: 360deg; } }
@keyframes float0 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(30px,20px) scale(1.04)} }
@keyframes float1 { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-22px,28px)} }
@keyframes float2 { 0%,100%{transform:translate(0,0)} 50%{transform:translate(18px,-16px)} }
@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
@keyframes pulseDot { 0%,100%{box-shadow:0 0 0 0 rgba(245,158,11,0.5)} 70%{box-shadow:0 0 0 7px rgba(245,158,11,0)} }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes kp-fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:none} }

.kp-backdrop { position: fixed; inset: 0; z-index: 0; overflow: hidden; }
.kp-glass-scene { position: absolute; inset: 0; }
.kp-glass-scene canvas { display: block; width: 100%; height: 100%; }
.kp-scene-fallback, .kp-backdrop-static {
  position: absolute; inset: 0;
  background: radial-gradient(ellipse at 60% 20%, rgba(245,158,11,0.12) 0%, transparent 55%),
              radial-gradient(ellipse at 20% 80%, rgba(253,164,175,0.1) 0%, transparent 55%),
              #fdf8f0;
}

.kp-orb { position: absolute; border-radius: 50%; pointer-events: none; filter: blur(40px); }
.kp-orb-1 { width: 560px; height: 560px; top: -160px; left: -100px; background: radial-gradient(circle, rgba(245,158,11,0.14), transparent 65%); animation: float0 14s ease-in-out infinite; }
.kp-orb-2 { width: 480px; height: 480px; bottom: -80px; right: -80px; background: radial-gradient(circle, rgba(253,164,175,0.12), transparent 65%); animation: float1 18s ease-in-out infinite; }
.kp-orb-3 { width: 360px; height: 360px; top: 40%; left: 50%; background: radial-gradient(circle, rgba(234,179,8,0.08), transparent 65%); animation: float2 11s ease-in-out infinite; }

.kp-grain {
  position: absolute; inset: 0; z-index: 2; pointer-events: none;
  opacity: 0.028; mix-blend-mode: multiply;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E");
  background-size: 140px;
}
.kp-veil {
  position: absolute; inset: 0; z-index: 3; pointer-events: none;
  background: linear-gradient(180deg,
    rgba(253,248,240,0.1) 0%,
    rgba(253,248,240,0.42) 50%,
    rgba(253,248,240,0.82) 100%
  );
}

.kp-frame { position: fixed; inset: 10px; z-index: 60; pointer-events: none; border-radius: 26px; border: 1px solid rgba(245,158,11,0.1); }
.kp-corner { position: absolute; width: 20px; height: 20px; }
.kp-c-tl { top:-1px; left:-1px; border-top:2px solid rgba(245,158,11,0.55); border-left:2px solid rgba(245,158,11,0.55); border-radius:14px 0 0 0; }
.kp-c-tr { top:-1px; right:-1px; border-top:2px solid rgba(253,164,175,0.55); border-right:2px solid rgba(253,164,175,0.55); border-radius:0 14px 0 0; }
.kp-c-bl { bottom:-1px; left:-1px; border-bottom:2px solid rgba(234,179,8,0.5); border-left:2px solid rgba(234,179,8,0.5); border-radius:0 0 0 14px; }
.kp-c-br { bottom:-1px; right:-1px; border-bottom:2px solid rgba(234,179,8,0.5); border-right:2px solid rgba(234,179,8,0.5); border-radius:0 0 14px 0; }

.kp-nav {
  position: fixed; top: 18px; left: 50%; transform: translateX(-50%); z-index: 50;
  display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 16px;
  width: min(1180px, calc(100% - 36px)); padding: 10px 16px; border-radius: 20px;
  transition: box-shadow 260ms ease;
}
.kp-nav.is-scrolled { box-shadow: 0 28px 72px rgba(28,17,8,0.11); }

.kp-brand { display: flex; align-items: center; gap: 10px; }
.kp-brand strong { font-family: var(--display-font); font-size: 0.95rem; font-weight: 700; color: var(--ink); }
.kp-brand-mark {
  position: relative; width: 36px; height: 36px; border-radius: 10px;
  display: grid; place-items: center; overflow: hidden;
  background: linear-gradient(135deg, rgba(245,158,11,0.25), rgba(253,164,175,0.2));
}
.kp-brand-mark::before {
  content: ""; position: absolute; inset: -60%;
  background: conic-gradient(from 0deg, transparent, rgba(245,158,11,0.65), transparent 55%);
  animation: spin 5s linear infinite;
}
.kp-brand-mark span { position: relative; z-index: 1; width: 8px; height: 8px; border-radius: 50%; background: var(--amber); box-shadow: 0 0 8px var(--amber); }

.kp-nav-links { display: flex; gap: 4px; justify-self: center; }
.kp-nav-links a {
  position: relative; padding: 10px 14px; border-radius: 12px;
  color: var(--muted); font-size: 0.85rem; font-weight: 600;
  transition: color 180ms ease, background 180ms ease;
}
.kp-nav-links a:hover { color: var(--ink); background: rgba(28,17,8,0.04); }
.kp-nav-links a.kp-nav-active { color: var(--ink-2); }
.kp-nav-links a::after {
  content: ""; position: absolute; left: 14px; right: 14px; bottom: 7px;
  height: 2px; border-radius: 2px;
  background: linear-gradient(90deg, var(--amber), var(--rose));
  transform: scaleX(0); transform-origin: left; transition: transform 260ms ease;
}
.kp-nav-links a:hover::after, .kp-nav-links a.kp-nav-active::after { transform: scaleX(1); }

.kp-nav-right { display: flex; align-items: center; gap: 10px; justify-self: end; }

.kp-mobile-toggle { display: none; flex-direction: column; gap: 4px; width: 40px; height: 40px; align-items: center; justify-content: center; border-radius: 12px; }
.kp-mobile-toggle:hover { background: rgba(28,17,8,0.05); }
.kp-mobile-toggle span { width: 18px; height: 2px; border-radius: 2px; background: var(--ink); transition: transform 220ms ease, opacity 220ms ease; }
.kp-mobile-toggle span[data-open="true"]:nth-child(1) { transform: translateY(6px) rotate(45deg); }
.kp-mobile-toggle span[data-open="true"]:nth-child(2) { opacity: 0; }
.kp-mobile-toggle span[data-open="true"]:nth-child(3) { transform: translateY(-6px) rotate(-45deg); }

.kp-mobile-panel {
  position: absolute; top: calc(100% + 10px); left: 12px; right: 12px;
  border-radius: 18px; padding: 8px; display: grid; gap: 2px;
  animation: kp-fadeUp 200ms ease;
}
.kp-mobile-panel a { padding: 12px 14px; border-radius: 12px; font-weight: 700; font-size: 0.9rem; }
.kp-mobile-panel a:hover { background: rgba(245,158,11,0.08); }

.kp-wallet-wrap { position: relative; }
.kp-wallet-pill {
  display: flex; align-items: center; gap: 9px;
  padding: 9px 14px; border-radius: 14px; font-weight: 700; font-size: 0.83rem;
  color: var(--amber-deep); transition: transform 180ms ease;
}
.kp-wallet-pill:hover { transform: translateY(-1px); }
.kp-orb-dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(28,17,8,0.15); flex-shrink: 0; }
.kp-orb-dot.is-live { background: var(--amber); box-shadow: 0 0 0 3px rgba(245,158,11,0.22); animation: pulseDot 2s infinite; }
.kp-orb-dot.is-warn { background: var(--rose-deep); box-shadow: 0 0 0 3px rgba(244,63,94,0.2); }
.kp-wallet-pill em { font-style: normal; font-size: 0.7rem; color: var(--muted); }
.kp-wallet-menu { position: absolute; top: calc(100% + 8px); right: 0; min-width: 220px; border-radius: 14px; padding: 6px; display: grid; gap: 2px; z-index: 99; }
.kp-wallet-action { display: flex; align-items: center; gap: 9px; padding: 10px 12px; border-radius: 10px; font-size: 0.84rem; font-weight: 600; width: 100%; text-align: left; }
.kp-wallet-action:hover { background: rgba(245,158,11,0.08); }
.kp-wallet-action.is-warn { color: var(--rose-deep); }
.kp-wallet-chain { padding: 10px 12px; font-size: 0.84rem; color: var(--amber-deep); font-weight: 600; display: flex; align-items: center; gap: 8px; }
.kp-connector-dot { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; background: rgba(245,158,11,0.15); color: var(--amber-deep); font-size: 0.7rem; font-weight: 800; }
.kp-wallet-empty { padding: 10px 12px; font-size: 0.8rem; color: var(--muted); }

.kp-reveal { opacity: 0; transform: translateY(16px); transition: opacity 580ms cubic-bezier(.16,1,.3,1), transform 580ms cubic-bezier(.16,1,.3,1); }
.kp-reveal.is-visible { opacity: 1; transform: none; }
@media (prefers-reduced-motion: reduce) {
  .kp-reveal, .kp-brand-mark::before { transition: none !important; animation: none !important; opacity: 1 !important; transform: none !important; }
}

.kp-hero { position: relative; z-index: 3; padding-top: 120px; }
.kp-hero-inner {
  display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 28px; align-items: start;
  width: min(1180px, calc(100% - 36px)); margin: 0 auto; padding-bottom: 56px;
}

.kp-hero-copy { padding: 34px 36px; border-radius: 26px; }

.kp-eyebrow {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 6px 13px; border-radius: 999px;
  background: rgba(245,158,11,0.1); color: var(--amber-deep);
  font-size: 0.74rem; font-weight: 700; letter-spacing: 0.01em;
}
.kp-eyebrow-sm { font-size: 0.72rem; }
.kp-pulse-dot {
  width: 6px; height: 6px; border-radius: 50%; background: var(--amber);
  animation: pulseDot 2s infinite;
}

.kp-hero-copy h1 {
  font-size: clamp(2.6rem, 5.5vw, 4.8rem);
  font-weight: 700; line-height: 1.02;
  margin: 20px 0 0; letter-spacing: -0.02em; color: var(--ink);
}
.kp-hero-copy h1 em {
  font-style: normal;
  background: linear-gradient(110deg, var(--amber-deep) 20%, var(--rose-deep) 80%);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  background-clip: text;
}

.kp-hero-copy p { margin: 18px 0 0; color: var(--muted); font-size: 1rem; line-height: 1.72; max-width: 560px; }

.kp-contract-link {
  display: inline-flex; align-items: center; gap: 7px;
  margin-top: 22px; padding: 9px 16px; border-radius: 11px;
  background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.2);
  color: var(--amber-deep); font-size: 0.82rem; font-weight: 700;
  transition: background 200ms ease, border-color 200ms ease;
}
.kp-contract-link:hover { background: rgba(245,158,11,0.14); border-color: rgba(245,158,11,0.35); }

.kp-stats-column { display: grid; gap: 12px; }

.kp-stat-card {
  padding: 18px 20px; border-radius: 18px; display: grid; gap: 6px;
  position: relative; overflow: hidden;
  transition: transform 250ms cubic-bezier(.16,1,.3,1), box-shadow 250ms ease;
}
.kp-stat-card:hover { transform: translateY(-4px); box-shadow: 0 28px 60px rgba(245,158,11,0.15); }

.kp-stat-card::before {
  content: ""; position: absolute; top: 0; left: 0; bottom: 0;
  width: 3px; border-radius: 0 2px 2px 0;
}
.kp-stat-card.tone-amber::before { background: var(--amber); }
.kp-stat-card.tone-gold::before { background: var(--gold); }
.kp-stat-card.tone-rose::before { background: var(--rose); }
.kp-stat-card.tone-ink::before { background: var(--muted); }

.kp-stat-card::after {
  content: ""; position: absolute; inset: 0; border-radius: inherit; padding: 1.5px;
  background: conic-gradient(from var(--border-angle), transparent 0 60%, var(--amber) 78%, var(--rose) 90%, transparent 100%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor; mask-composite: exclude;
  opacity: 0; transition: opacity 280ms ease;
  animation: spinBorder 3.2s linear infinite paused; pointer-events: none;
}
.kp-stat-card:hover::after { opacity: 1; animation-play-state: running; }

.kp-stat-icon-wrap {
  width: 34px; height: 34px; border-radius: 10px;
  display: grid; place-items: center;
  background: rgba(245,158,11,0.1); color: var(--amber-deep);
}
.tone-rose .kp-stat-icon-wrap { background: rgba(253,164,175,0.15); color: var(--rose-deep); }
.tone-ink .kp-stat-icon-wrap { background: rgba(28,17,8,0.06); color: var(--muted); }
.tone-gold .kp-stat-icon-wrap { background: rgba(234,179,8,0.1); color: #a16207; }

.kp-stat-label { font-size: 0.7rem; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
.kp-stat-value { font-family: var(--display-font); font-size: 1.55rem; font-weight: 700; color: var(--ink-2); line-height: 1.1; }

.kp-skeleton {
  display: inline-block; width: 80px; height: 24px; border-radius: 6px;
  background: linear-gradient(90deg, rgba(28,17,8,0.05), rgba(245,158,11,0.1), rgba(28,17,8,0.05));
  background-size: 200% 100%; animation: shimmer 1.4s ease-in-out infinite;
}

.kp-filter-wrap { position: relative; z-index: 3; width: min(1180px, calc(100% - 36px)); margin: 0 auto 28px; }
.kp-filter-bar { display: flex; gap: 10px; padding: 10px 12px; border-radius: 18px; flex-wrap: wrap; }

.kp-search {
  flex: 1; min-width: 240px; display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; border-radius: 12px;
  background: rgba(255,255,255,0.6); border: 1px solid rgba(245,158,11,0.12);
  color: var(--muted);
}
.kp-search input { flex: 1; border: 0; outline: 0; background: transparent; font-size: 0.87rem; color: var(--ink); font-family: var(--body-font); }
.kp-search input::placeholder { color: rgba(124,99,64,0.55); }

.kp-tabs { display: flex; gap: 4px; padding: 4px; border-radius: 12px; background: rgba(255,255,255,0.5); border: 1px solid rgba(245,158,11,0.1); }
.kp-tab { padding: 8px 16px; border-radius: 9px; font-size: 0.8rem; font-weight: 700; color: var(--muted); transition: all 140ms ease; }
.kp-tab.is-active { background: #fff; color: var(--amber-deep); box-shadow: 0 2px 8px rgba(245,158,11,0.1); }

.kp-grid-section { position: relative; z-index: 3; width: min(1180px, calc(100% - 36px)); margin: 0 auto 80px; }
.kp-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 18px; }

.kp-keeper-card {
  padding: 26px; border-radius: 22px; display: grid; gap: 22px;
  position: relative; overflow: hidden;
  transition: transform 260ms cubic-bezier(.16,1,.3,1), box-shadow 260ms ease;
}
.kp-keeper-card:hover { transform: translateY(-5px); box-shadow: 0 32px 70px rgba(245,158,11,0.14); }

.kp-keeper-card.is-jailed { background: rgba(255,245,245,0.75); border-color: rgba(244,63,94,0.18); }
.kp-keeper-card.is-exiting { background: rgba(255,251,240,0.75); border-color: rgba(245,158,11,0.2); }

.kp-keeper-card.is-loading { min-height: 220px; }
.kp-card-shimmer {
  position: absolute; inset: 0; border-radius: inherit;
  background: linear-gradient(105deg, rgba(245,158,11,0.04) 0%, rgba(253,164,175,0.05) 50%, rgba(245,158,11,0.04) 100%);
  background-size: 200% 100%; animation: shimmer 1.6s ease-in-out infinite;
}

.kp-card-ring {
  position: absolute; inset: 0; border-radius: inherit; padding: 1.5px; pointer-events: none;
  background: conic-gradient(from var(--border-angle), transparent 0 55%, var(--amber) 75%, var(--rose) 88%, transparent 100%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor; mask-composite: exclude;
  opacity: 0; transition: opacity 300ms ease;
  animation: spinBorder 3.5s linear infinite paused;
}
.kp-keeper-card:hover .kp-card-ring { opacity: 1; animation-play-state: running; }
.kp-keeper-card.is-jailed .kp-card-ring { background: conic-gradient(from var(--border-angle), transparent 0 55%, var(--rose-deep) 75%, #fb7185 88%, transparent 100%); }

.kp-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.kp-card-addr-block { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }

.kp-addr-link {
  display: inline-flex; align-items: center; gap: 5px;
  font-family: var(--mono-font); font-size: 0.9rem; font-weight: 600;
  color: var(--amber-deep); padding: 5px 10px;
  border-radius: 8px; background: rgba(245,158,11,0.08);
  border: 1px solid rgba(245,158,11,0.15);
  transition: background 180ms ease;
}
.kp-addr-link:hover { background: rgba(245,158,11,0.15); text-decoration: underline; }

.kp-status-badge {
  padding: 4px 10px; border-radius: 999px;
  font-size: 0.67rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;
}
.status-active { background: rgba(245,158,11,0.12); color: var(--amber-deep); }
.status-jailed { background: rgba(244,63,94,0.12); color: var(--rose-deep); }
.status-exiting { background: rgba(234,179,8,0.12); color: #a16207; }
.status-inactive { background: rgba(28,17,8,0.06); color: var(--muted); }

.kp-join-date { font-size: 0.72rem; color: var(--muted); font-weight: 600; white-space: nowrap; }

.kp-metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.kp-metric {
  padding: 12px 14px; border-radius: 14px;
  background: rgba(255,255,255,0.55); border: 1px solid rgba(245,158,11,0.08);
  display: grid; gap: 5px;
}
.kp-metric-label {
  display: flex; align-items: center; gap: 5px;
  font-size: 0.69rem; font-weight: 700; color: var(--muted);
  text-transform: uppercase; letter-spacing: 0.04em;
}
.kp-metric-val { font-family: var(--display-font); font-size: 1.15rem; font-weight: 700; color: var(--ink-2); }
.kp-metric-val.is-warn { color: var(--rose-deep); }
.kp-metric-val.kp-success-rate { color: var(--amber-deep); }

.kp-rep-wrap {
  padding: 14px 16px; border-radius: 14px;
  background: rgba(255,255,255,0.65); border: 1px solid rgba(245,158,11,0.1);
  display: grid; gap: 10px;
}
.kp-rep-head { display: flex; align-items: center; justify-content: space-between; }
.kp-rep-score { font-family: var(--mono-font); font-size: 0.92rem; font-weight: 700; }
.kp-rep-score span { font-size: 0.7rem; color: var(--muted); font-weight: 500; }
.kp-rep-track { height: 6px; border-radius: 3px; background: rgba(28,17,8,0.08); overflow: hidden; }
.kp-rep-bar { height: 100%; border-radius: 3px; transition: width 800ms cubic-bezier(.16,1,.3,1); }

.kp-empty-state {
  padding: 64px 24px; text-align: center; border-radius: 24px;
  display: grid; place-items: center; gap: 12px;
}
.kp-empty-icon { color: var(--amber); opacity: 0.45; }
.kp-empty-state h3 { font-family: var(--display-font); font-size: 1.3rem; font-weight: 700; margin: 0; }
.kp-empty-state p { color: var(--muted); font-size: 0.9rem; line-height: 1.65; max-width: 500px; margin: 0; }
.kp-empty-state code { font-size: 0.82rem; }

.kp-cta-section { position: relative; z-index: 3; width: min(1180px, calc(100% - 36px)); margin: 0 auto 80px; }
.kp-cta-panel {
  display: flex; align-items: center; justify-content: space-between; gap: 40px;
  padding: 44px 48px; border-radius: 28px; overflow: hidden; position: relative;
}
.kp-cta-panel::after {
  content: ""; position: absolute; width: 400px; height: 400px;
  top: -180px; right: -100px; border-radius: 50%; pointer-events: none;
  background: radial-gradient(circle, rgba(245,158,11,0.14), transparent 65%);
  filter: blur(8px); animation: float0 12s ease-in-out infinite;
}
.kp-cta-text { max-width: 600px; display: grid; gap: 14px; }
.kp-cta-text h2 { font-size: clamp(1.5rem, 3vw, 2.2rem); font-weight: 700; margin: 0; letter-spacing: -0.01em; }
.kp-cta-text p { color: var(--muted); font-size: 0.95rem; line-height: 1.68; margin: 0; }
.kp-cta-actions { display: flex; flex-direction: column; gap: 12px; flex-shrink: 0; }

.kp-btn-primary {
  display: inline-flex; align-items: center; gap: 9px;
  padding: 14px 22px; border-radius: 14px; font-size: 0.87rem; font-weight: 700;
  background: linear-gradient(135deg, var(--amber), var(--amber-deep));
  color: #fff; box-shadow: 0 16px 44px rgba(245,158,11,0.32);
  transition: transform 220ms ease, box-shadow 220ms ease; white-space: nowrap;
}
.kp-btn-primary:hover { transform: translateY(-3px); box-shadow: 0 22px 56px rgba(245,158,11,0.42); }

.kp-btn-ghost {
  display: inline-flex; align-items: center; justify-content: center; gap: 9px;
  padding: 13px 22px; border-radius: 14px; font-size: 0.87rem; font-weight: 700;
  color: var(--ink); transition: transform 220ms ease, border-color 220ms ease; white-space: nowrap;
}
.kp-btn-ghost:hover { transform: translateY(-2px); border-color: rgba(245,158,11,0.4); }

.kp-footer { position: relative; z-index: 3; width: min(1180px, calc(100% - 36px)); margin: 0 auto; padding: 40px 0 60px; border-top: 1px solid var(--line); }
.kp-footer-inner { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; margin-bottom: 20px; }
.kp-footer-links { display: flex; gap: 22px; }
.kp-footer-links a { color: var(--muted); font-size: 0.84rem; font-weight: 600; transition: color 180ms ease; }
.kp-footer-links a:hover { color: var(--ink); }
.kp-footer-bottom { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; color: var(--muted); font-size: 0.76rem; }
.kp-status-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--amber); box-shadow: 0 0 0 3px rgba(245,158,11,0.2); margin-right: 7px; animation: pulseDot 2s infinite; }

.kp-spin { animation: spin 1s linear infinite; }
.kp-icon { flex-shrink: 0; }

@media (max-width: 1020px) {
  .kp-hero-inner { grid-template-columns: 1fr; }
  .kp-stats-column { grid-template-columns: repeat(2, 1fr); }
  .kp-nav-links { display: none; }
  .kp-mobile-toggle { display: flex; }
  .kp-grid { grid-template-columns: 1fr; }
}

@media (max-width: 720px) {
  .kp-hero { padding-top: 96px; }
  .kp-hero-copy { padding: 24px; border-radius: 20px; }
  .kp-hero-copy h1 { font-size: clamp(2.2rem, 11vw, 3rem); }
  .kp-stats-column { grid-template-columns: 1fr 1fr; }
  .kp-cta-panel { flex-direction: column; align-items: flex-start; padding: 28px; }
  .kp-cta-actions { flex-direction: row; flex-wrap: wrap; }
  .kp-filter-bar { flex-direction: column; }
  .kp-metrics { grid-template-columns: 1fr; }
  .kp-nav { width: calc(100% - 20px); top: 10px; }
  .kp-brand strong { display: none; }
  .kp-viewport-frame { inset: 6px; border-radius: 20px; }
}

@media (max-width: 480px) {
  .kp-stats-column { grid-template-columns: 1fr; }
}
`;