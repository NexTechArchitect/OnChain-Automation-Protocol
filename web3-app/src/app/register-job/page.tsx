"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  useAccount,
  useBalance,
  useChainId,
  useConnect,
  useDisconnect,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { decodeEventLog, isAddress, parseEther, parseUnits } from "viem";
import { Bricolage_Grotesque, Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import { BASE_CHAIN_ID, CONTRACT_ADDRESSES, CONTRACT_ABIS } from "@/constants/contracts";
import type * as ThreeNamespace from "three";

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

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */

const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const basescanTx   = (h: string) => `https://basescan.org/tx/${h}`;

const INTERVAL_UNITS = [
  { id: "minutes", label: "min",  seconds: 60    },
  { id: "hours",   label: "hrs",  seconds: 3600  },
  { id: "days",    label: "days", seconds: 86400 },
] as const;

type IntervalUnit = (typeof INTERVAL_UNITS)[number]["id"];
type JobKind      = "recurring" | "onetime";

function trimNumber(v: number) {
  if (!Number.isFinite(v)) return "0";
  const f = v.toFixed(v < 1 ? 6 : 4);
  const t = f.replace(/0+$/, "").replace(/\.$/, "");
  return t.length ? t : "0";
}

function humanizeInterval(s: number) {
  if (s <= 0) return "—";
  if (s % 86400 === 0) { const n = s / 86400; return `${n} day${n === 1 ? "" : "s"}`; }
  if (s % 3600  === 0) { const n = s / 3600;  return `${n} hour${n === 1 ? "" : "s"}`; }
  if (s % 60    === 0) { const n = s / 60;    return `${n} min${n === 1 ? "" : "s"}`; }
  return `${s}s`;
}

/* ─────────────────────────────────────────────
   ICONS
───────────────────────────────────────────── */

type IconName =
  | "arrowLeft" | "coin" | "gauge" | "bolt"
  | "check" | "alert" | "external" | "loader"
  | "shield" | "zap" | "lock" | "eye" | "layers"
  | "star" | "box" | "shieldCheck";

const iconPaths: Record<IconName, React.ReactNode> = {
  arrowLeft: <><path d="M19 12H5"/><path d="M11 18l-6-6 6-6"/></>,
  coin: (
    <>
      <circle cx="12" cy="12" r="8"/>
      <path d="M9.4 14.6c.4.9 1.4 1.5 2.6 1.5 1.7 0 3-1 3-2.3 0-1.1-.9-1.7-2.6-2.1-1.9-.4-2.9-1-2.9-2.1 0-1.2 1.2-2 2.7-2 1.1 0 2 .5 2.4 1.3"/>
      <path d="M12 6.2v1.3M12 16.5v1.3"/>
    </>
  ),
  gauge: (
    <>
      <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/>
      <path d="M12 14 16 9"/>
      <path d="M4 15a8 8 0 1 1 16 0"/>
    </>
  ),
  bolt:       <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/>,
  check:      <><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></>,
  alert:      <><path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4"/><path d="M12 17h.01"/></>,
  external:   <><path d="M7 17 17 7"/><path d="M9 7h8v8"/></>,
  loader: (
    <>
      <path d="M12 3v3"/><path d="M12 18v3"/>
      <path d="M5.6 5.6l2.1 2.1"/><path d="M16.3 16.3l2.1 2.1"/>
      <path d="M3 12h3"/><path d="M18 12h3"/>
      <path d="M5.6 18.4l2.1-2.1"/><path d="M16.3 7.7l2.1-2.1"/>
    </>
  ),
  shield:     <path d="M12 3 4 6v6c0 5 3.6 8.4 8 9 4.4-.6 8-4 8-9V6l-8-3Z"/>,
  zap:        <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/>,
  lock:       <><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></>,
  eye:        <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></>,
  layers:     <><path d="M12 3 2 8l10 5 10-5-10-5Z"/><path d="M2 16l10 5 10-5"/><path d="M2 12l10 5 10-5"/></>,
  star:       <path d="m12 3 2.6 5.9L21 9.6l-4.6 4.2L17.6 21 12 17.6 6.4 21l1.2-7.2L3 9.6l6.4-.7L12 3Z"/>,
  box:        <><path d="M3 8 12 3l9 5-9 5-9-5Z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></>,
  shieldCheck:<><path d="M12 3 4 6v6c0 5 3.6 8.4 8 9 4.4-.6 8-4 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/></>,
};

function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      className={`rj-icon${name === "loader" ? " rj-spin" : ""}`}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
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
    <svg className="rj-btn-arrow" viewBox="0 0 24 24" width="15" height="15"
      fill="none" stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 17 17 7"/><path d="M8 7h9v9"/>
    </svg>
  );
}

/* ─────────────────────────────────────────────
   BLUE GLASS SCENE
   Same floating-shard concept as landing page GlassScene
   but blue-tinted palette + indigo/blue lights + blue bloom.
   Position: fixed, covers the full page, never scrolls away.
───────────────────────────────────────────── */

function BlueGlassScene() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let frameId  = 0;
    let cleanup  = () => {};

    async function boot() {
      const THREE          = await import("three");
      const { EffectComposer }  = await import("three/examples/jsm/postprocessing/EffectComposer.js");
      const { RenderPass }      = await import("three/examples/jsm/postprocessing/RenderPass.js");
      const { UnrealBloomPass } = await import("three/examples/jsm/postprocessing/UnrealBloomPass.js");

      const host = hostRef.current;
      if (!host || disposed) return;

      const isCompact = window.innerWidth < 720;

      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0xeef3ff, 0.042);

      const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
      camera.position.set(0, 3, 12);

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

      // Blue-white glass shards — icosahedra like landing page
      const shardGeo = track(new THREE.IcosahedronGeometry(1, 0));
      // white, blue-100, indigo-100 tints
      const shardColors  = [0xffffff, 0xdbeafe, 0xe0e7ff];
      const shardMats    = shardColors.map((color) =>
        track(
          new THREE.MeshPhysicalMaterial({
            color,
            transparent: true,
            opacity:      0.42,
            roughness:    0.10,
            metalness:    0.05,
            transmission: 0.58,
            thickness:    0.6,
          })
        )
      );

      const shardCount = isCompact ? 8 : 18;
      const shards: ThreeNamespace.Mesh[] = [];
      for (let i = 0; i < shardCount; i++) {
        const mesh  = new THREE.Mesh(shardGeo, shardMats[i % shardMats.length]);
        const scale = 0.22 + Math.random() * 0.52;
        mesh.scale.setScalar(scale);
        mesh.position.set(
          (Math.random() - 0.5) * 16,
          (Math.random() - 0.5) * 6 + 1,
          (Math.random() - 0.5) * 10 - 3
        );
        mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
        world.add(mesh);
        shards.push(mesh);
      }

      // Lights — white key + indigo fill + blue rim
      const key = new THREE.DirectionalLight(0xffffff, 1.3);
      key.position.set(-4, 6, 6);
      scene.add(key);

      const fill = new THREE.PointLight(0x6366f1, 1.4, 22);  // indigo
      fill.position.set(4, -1, 4);
      scene.add(fill);

      const rim = new THREE.PointLight(0x2563eb, 0.9, 18);   // blue
      rim.position.set(-5, 2, -4);
      scene.add(rim);

      scene.add(new THREE.AmbientLight(0xdbeafe, 0.9));       // blue-100 ambient

      // Post-processing: bloom
      const composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      const bloom = new UnrealBloomPass(
        new THREE.Vector2(1, 1),
        isCompact ? 0.32 : 0.56,   // strength
        0.55,                       // radius
        0.12                        // threshold
      );
      composer.addPass(bloom);

      const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      let scrollProgress = 0;
      const updateScroll = () => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        scrollProgress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      };

      const resize = () => {
        const rect = host.getBoundingClientRect();
        const w    = Math.max(rect.width,  1);
        const h    = Math.max(rect.height, 1);
        renderer.setSize(w, h, false);
        composer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      const onMove = (e: PointerEvent) => {
        const rect = host.getBoundingClientRect();
        pointer.tx = ((e.clientX - rect.left) / rect.width  - 0.5) * 2;
        pointer.ty = ((e.clientY - rect.top)  / rect.height - 0.5) * 2;
      };

      window.addEventListener("resize",      resize,       { passive: true });
      window.addEventListener("pointermove", onMove,       { passive: true });
      window.addEventListener("scroll",      updateScroll, { passive: true });
      resize();
      updateScroll();

      const clock = new THREE.Clock();
      const animate = () => {
        frameId = window.requestAnimationFrame(animate);
        if (document.hidden) return;

        const elapsed = clock.getElapsedTime();
        const speed   = reduceMotion ? 0.1 : 1;

        pointer.x += (pointer.tx - pointer.x) * 0.04;
        pointer.y += (pointer.ty - pointer.y) * 0.04;

        world.rotation.y = 0.08 + pointer.x * 0.1;
        world.rotation.x = scrollProgress * 0.28;

        shards.forEach((mesh, i) => {
          mesh.rotation.x += 0.0022 * speed * ((i % 3) + 1);
          mesh.rotation.y += 0.0017 * speed * ((i % 2) + 1);
          mesh.position.y += Math.sin(elapsed * 0.38 + i) * 0.0024;
        });

        camera.position.x += (pointer.x * 0.5 - camera.position.x) * 0.03;
        camera.lookAt(0, 0.5, -1);

        composer.render();
      };
      animate();

      cleanup = () => {
        window.cancelAnimationFrame(frameId);
        window.removeEventListener("resize",      resize);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("scroll",      updateScroll);
        disposables.forEach((d) => d.dispose());
        renderer.dispose();
        renderer.domElement.remove();
      };
    }

    boot().catch(() => {
      if (hostRef.current) hostRef.current.classList.add("rj-scene-fallback");
    });
    return () => { disposed = true; cleanup(); };
  }, []);

  return <div className="rj-glass-scene" ref={hostRef} aria-hidden="true" />;
}

function LightBackdrop() {
  const [skipMotion, setSkipMotion] = useState(false);
  useEffect(() => {
    setSkipMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  return (
    <div className="rj-backdrop" aria-hidden="true">
      {skipMotion ? (
        <div className="rj-backdrop-static" />
      ) : (
        <BlueGlassScene />
      )}
      <div className="rj-glow-orb rj-glow-1" />
      <div className="rj-glow-orb rj-glow-2" />
      <div className="rj-backdrop-grain" />
      <div className="rj-veil" />
    </div>
  );
}

/* ─────────────────────────────────────────────
   FRAME
───────────────────────────────────────────── */

function Frame() {
  return (
    <div className="rj-frame" aria-hidden="true">
      <span className="rj-corner c-tl" />
      <span className="rj-corner c-tr" />
      <span className="rj-corner c-bl" />
      <span className="rj-corner c-br" />
    </div>
  );
}

/* ─────────────────────────────────────────────
   WALLET CONTROL
───────────────────────────────────────────── */

function WalletControl() {
  const { address, isConnected }                = useAccount();
  const chainId                                 = useChainId();
  const { connectors, connect, isPending: isConnecting } = useConnect();
  const { disconnect }                          = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const [open, setOpen]                         = useState(false);
  const wrapRef                                 = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const wrongNetwork = isConnected && chainId !== BASE_CHAIN_ID;

  if (isConnected && address) {
    return (
      <div className="rj-wallet-wrap" ref={wrapRef}>
        <button className="rj-wallet-pill glass" type="button" onClick={() => setOpen((v) => !v)}>
          <span className={`rj-orb-dot ${wrongNetwork ? "is-warn" : "is-live"}`} />
          <span>{shortAddress(address)}</span>
          {wrongNetwork && <span className="rj-warn-badge">Wrong network</span>}
        </button>
        {open && (
          <div className="rj-wallet-menu glass">
            {wrongNetwork ? (
              <button type="button" className="rj-wallet-action is-warn"
                onClick={() => switchChain({ chainId: BASE_CHAIN_ID })}>
                <Icon name="zap" />{isSwitching ? "Switching…" : "Switch to Base"}
              </button>
            ) : (
              <div className="rj-wallet-chain"><Icon name="check" /> Base Mainnet</div>
            )}
            <button type="button" className="rj-wallet-action"
              onClick={() => { disconnect(); setOpen(false); }}>
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rj-wallet-wrap" ref={wrapRef}>
      <button className="rj-wallet-pill glass" type="button" onClick={() => setOpen((v) => !v)}>
        <span className="rj-orb-dot" />
        <span>{isConnecting ? "Connecting…" : "Connect wallet"}</span>
      </button>
      {open && (
        <div className="rj-wallet-menu glass">
          {connectors.length === 0 ? (
            <p className="rj-wallet-empty">No connectors configured — add one in config/wagmi.ts</p>
          ) : (
            connectors.map((c) => (
              <button key={c.uid} type="button" className="rj-wallet-action"
                onClick={() => { connect({ connector: c }); setOpen(false); }}>
                <span className="rj-connector-dot">{c.name.charAt(0)}</span>
                {c.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   LIVE STAT
───────────────────────────────────────────── */

function LiveStat({ label, address, abi, functionName, accent = "blue" }: {
  label: string; address: `0x${string}`; abi: unknown[];
  functionName: string; accent?: "blue" | "indigo";
}) {
  const { data, isLoading, isError } = useReadContract({
    address, abi: abi as never, functionName, chainId: BASE_CHAIN_ID,
  });
  return (
    <div className="rj-stat glass" data-accent={accent}>
      <div className="rj-stat-icon-wrap">
        <Icon name={accent === "blue" ? "shield" : "box"} size={17} />
      </div>
      <span className="rj-stat-label">{label}</span>
      <strong className="rj-stat-value">
        {isLoading ? <span className="rj-skeleton" /> : isError ? "—" : String(data)}
      </strong>
    </div>
  );
}

/* ─────────────────────────────────────────────
   FIELD LABEL
───────────────────────────────────────────── */

function FieldLabel({ htmlFor, children, hint }: {
  htmlFor?: string; children: React.ReactNode; hint?: string;
}) {
  return (
    <div className="rj-field-label">
      {htmlFor ? <label htmlFor={htmlFor}>{children}</label> : <span>{children}</span>}
      {hint && <span className="rj-field-label-hint">{hint}</span>}
    </div>
  );
}

/* ─────────────────────────────────────────────
   STEP CARD
───────────────────────────────────────────── */

function StepCard({ icon, step, title, children }: {
  icon: IconName; step: string; title: string; children: React.ReactNode;
}) {
  return (
    <div className="rj-step-card glass">
      <div className="rj-step-head">
        <span className="rj-step-icon-wrap"><Icon name={icon} size={18} /></span>
        <em className="rj-step-num">{step}</em>
      </div>
      <h3>{title}</h3>
      <div className="rj-step-body">{children}</div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   PAGE
───────────────────────────────────────────── */

export default function RegisterJobPage() {
  const { address, isConnected }               = useAccount();
  const chainId                                = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { data: balanceData }                  = useBalance({ address, chainId: BASE_CHAIN_ID });

  const wrongNetwork = isConnected && chainId !== BASE_CHAIN_ID;

  const [target,         setTarget]         = useState("");
  const [jobType,        setJobType]        = useState<JobKind>("recurring");
  const [intervalValue,  setIntervalValue]  = useState("5");
  const [intervalUnit,   setIntervalUnit]   = useState<IntervalUnit>("minutes");
  const [reward,         setReward]         = useState("");
  const [maxBaseFeeGwei, setMaxBaseFeeGwei] = useState("5");
  const [funding,        setFunding]        = useState("");
  const [confirmed,      setConfirmed]      = useState(false);
  const [formError,      setFormError]      = useState<string | null>(null);
  const [jobId,          setJobId]          = useState<bigint | null>(null);

  const intervalSeconds = useMemo(() => {
    if (jobType === "onetime") return 0;
    const n    = Number(intervalValue) || 0;
    const unit = INTERVAL_UNITS.find((u) => u.id === intervalUnit);
    return Math.max(0, Math.floor(n * (unit?.seconds ?? 60)));
  }, [jobType, intervalValue, intervalUnit]);

  const targetValid     = target.trim() !== "" && isAddress(target.trim());
  const rewardNum       = Number(reward);
  const rewardValid     = reward.trim() !== "" && Number.isFinite(rewardNum) && rewardNum > 0;
  const fundingNum      = Number(funding);
  const fundingValid    = funding.trim() !== "" && Number.isFinite(fundingNum) && rewardValid && fundingNum >= rewardNum;
  const maxBaseFeeNum   = Number(maxBaseFeeGwei);
  const maxBaseFeeValid = maxBaseFeeGwei.trim() !== "" && Number.isFinite(maxBaseFeeNum) && maxBaseFeeNum > 0;
  const intervalValid   = jobType === "onetime" || intervalSeconds > 0;
  const formValid       = targetValid && rewardValid && fundingValid && maxBaseFeeValid && intervalValid;

  const { data: feeBpsRaw } = useReadContract({
    address: CONTRACT_ADDRESSES.JOB_MANAGER,
    abi: CONTRACT_ABIS.JOB_MANAGER as never,
    functionName: "getProtocolFeeBps",
    chainId: BASE_CHAIN_ID,
  });
  const feeBps              = typeof feeBpsRaw === "number" || typeof feeBpsRaw === "bigint" ? Number(feeBpsRaw) : 0;
  const protocolFeePerExec  = rewardValid ? (rewardNum * feeBps) / 10_000 : 0;
  const keeperRewardPerExec = rewardValid ? rewardNum - protocolFeePerExec : 0;
  const executionsFunded    = rewardValid && fundingValid && rewardNum > 0 ? Math.floor(fundingNum / rewardNum) : 0;

  const { writeContract, data: hash, isPending, error: writeError, reset: resetWrite } = useWriteContract();
  const { data: receipt, isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (!receipt) return;
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi:    CONTRACT_ABIS.JOB_MANAGER as any,
          data:   log.data,
          topics: log.topics as any,
        }) as any;
        if (decoded.eventName === "JobRegistered") {
          setJobId((decoded.args as { jobId: bigint }).jobId);
          break;
        }
      } catch { /* keep scanning */ }
    }
  }, [receipt]);

  function handleSubmit() {
    setFormError(null);
    if (wrongNetwork) { switchChain({ chainId: BASE_CHAIN_ID }); return; }
    if (!formValid || !confirmed) return;
    let rewardWei: bigint, fundingWei: bigint, maxBaseFeeWei: bigint;
    try {
      rewardWei     = parseEther(reward.trim());
      fundingWei    = parseEther(funding.trim());
      maxBaseFeeWei = parseUnits(maxBaseFeeGwei.trim(), 9);
    } catch {
      setFormError("Check your amounts — plain decimal numbers only, like 0.01.");
      return;
    }
    if (fundingWei < rewardWei) { setFormError("Funding must cover at least one execution."); return; }
    resetWrite();
    setJobId(null);
    writeContract({
      address:      CONTRACT_ADDRESSES.JOB_MANAGER,
      abi:          CONTRACT_ABIS.JOB_MANAGER as never,
      functionName: "registerJob",
      args:         [target.trim() as `0x${string}`, rewardWei, BigInt(intervalSeconds), maxBaseFeeWei],
      value:        fundingWei,
      chainId:      BASE_CHAIN_ID,
    });
  }

  function handleReset() {
    resetWrite(); setJobId(null); setTarget(""); setReward("");
    setFunding(""); setConfirmed(false); setFormError(null);
  }

  const busy           = isPending || isConfirming;
  const submitDisabled = !isConnected || busy || (!wrongNetwork && (!formValid || !confirmed));

  let submitLabel = "Register job";
  if (isPending)         submitLabel = "Confirm in wallet…";
  else if (isConfirming) submitLabel = "Registering on-chain…";
  else if (wrongNetwork) submitLabel = isSwitching ? "Switching…" : "Switch to Base mainnet";

  return (
    <>
      <style>{styles}</style>
      <main className={`rj-page ${displayFont.variable} ${bodyFont.variable} ${monoFont.variable}`}>
        <LightBackdrop />
        <Frame />

        {/* ── HEADER ── */}
        <header className="rj-header glass">
          <a className="rj-brand" href="/">
            <Icon name="arrowLeft" />
            <span className="rj-brand-mark"><span /></span>
            <strong>Keeper Network</strong>
          </a>
          <span className="rj-page-badge">Register job</span>
          <div className="rj-header-right">
            <WalletControl />
          </div>
        </header>

        {/* ── HERO ── */}
        <section className="rj-hero">
          <div className="rj-hero-body">
            <div className="rj-hero-copy glass rj-enter">
              <span className="rj-eyebrow"><i className="rj-pulse-dot" /> Base mainnet · chain 8453</span>
              <h1>Put a contract<span>on autopilot.</span></h1>
              <p>
                Fund a job once. Bonded keepers simulate it off-chain, execute the moment
                conditions clear, and settle payout, fee, and reputation in one transaction.
              </p>
            </div>
            <div className="rj-hero-stats rj-enter rj-enter-delay">
              <LiveStat
                label="Bonded keepers"
                address={CONTRACT_ADDRESSES.KEEPER_REGISTRY}
                abi={CONTRACT_ABIS.KEEPER_REGISTRY as unknown[]}
                functionName="getTotalKeepers"
                accent="blue"
              />
              <LiveStat
                label="Jobs registered"
                address={CONTRACT_ADDRESSES.JOB_MANAGER}
                abi={CONTRACT_ABIS.JOB_MANAGER as unknown[]}
                functionName="getTotalJobs"
                accent="indigo"
              />
            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS ── */}
        <section className="rj-section rj-how-section">
          <div className="rj-section-head">
            <span className="rj-section-tag">How registration works</span>
            <h2>Four parameters. One transaction. Autonomous execution.</h2>
          </div>
          <div className="rj-step-grid">
            <StepCard icon="lock" step="01" title="Set the target">
              The contract address that implements <code>IAutomatable</code>. Keepers will call{" "}
              <code>checkUpkeep</code> before touching anything.
            </StepCard>
            <StepCard icon="gauge" step="02" title="Cap the gas">
              Set a max base fee in Gwei. Execution simply waits out any block whose base fee
              exceeds this — no griefing your reward pool.
            </StepCard>
            <StepCard icon="coin" step="03" title="Define the reward">
              The ETH paid to the keeper per successful <code>performUpkeep</code>. The protocol
              fee is deducted from this at settlement.
            </StepCard>
            <StepCard icon="bolt" step="04" title="Fund and launch">
              Send ETH as the initial pool. Keepers start competing for your job the moment
              the transaction confirms.
            </StepCard>
          </div>
        </section>

        {/* ── FORM ── */}
        <section className="rj-section rj-form-section">
          <div className="rj-form-layout">

            {/* LEFT: FORM PANEL */}
            <div className="rj-form-panel glass">
              <div className="rj-panel-head">
                <span className="rj-panel-tag">Job details</span>
                <h2>Configure your job</h2>
                <p>Every field maps directly to a parameter in <code>registerJob()</code>.</p>
              </div>

              {/* BANNERS */}
              <div aria-live="polite" className="rj-banners">
                {(formError || writeError) && (
                  <div className="rj-banner rj-banner-error">
                    <Icon name="alert" />
                    <span>{formError ?? writeError?.message ?? "Something went wrong."}</span>
                  </div>
                )}
                {isPending && (
                  <div className="rj-banner rj-banner-pending">
                    <Icon name="loader" />
                    <span>Confirm the transaction in your wallet…</span>
                  </div>
                )}
                {isConfirming && hash && (
                  <div className="rj-banner rj-banner-info">
                    <Icon name="loader" />
                    <span>
                      Waiting for confirmation —{" "}
                      <a href={basescanTx(hash)} target="_blank" rel="noreferrer">
                        Basescan <Icon name="external" />
                      </a>
                    </span>
                  </div>
                )}
                {isConfirmed && hash && (
                  <div className="rj-banner rj-banner-success">
                    <Icon name="check" />
                    <span>
                      {jobId !== null ? `Job #${jobId.toString()} is live. ` : "Job registered. "}
                      <a href={basescanTx(hash)} target="_blank" rel="noreferrer">
                        View on Basescan <Icon name="external" />
                      </a>
                    </span>
                  </div>
                )}
              </div>

              <fieldset className="rj-fieldset" disabled={busy}>
                {/* Target */}
                <div className="rj-field">
                  <FieldLabel htmlFor="target">Target contract</FieldLabel>
                  <div className="rj-input-shell">
                    <Icon name="eye" size={15} />
                    <input
                      id="target" placeholder="0x…" value={target} spellCheck={false}
                      aria-invalid={target !== "" && !targetValid}
                      onChange={(e) => setTarget(e.target.value.trim())}
                    />
                    {target && <Icon name={targetValid ? "check" : "alert"} size={15} />}
                  </div>
                  <p className="rj-field-hint">
                    Must implement <code>IAutomatable</code> — expose <code>checkUpkeep</code> and <code>performUpkeep</code>.
                  </p>
                </div>

                {/* Job type */}
                <div className="rj-field">
                  <FieldLabel>Automation type</FieldLabel>
                  <div className="rj-segmented" role="tablist">
                    <button type="button" role="tab" aria-selected={jobType === "recurring"}
                      className={jobType === "recurring" ? "is-active" : ""}
                      onClick={() => setJobType("recurring")}>
                      Recurring
                    </button>
                    <button type="button" role="tab" aria-selected={jobType === "onetime"}
                      className={jobType === "onetime" ? "is-active" : ""}
                      onClick={() => setJobType("onetime")}>
                      One-time
                    </button>
                  </div>
                </div>

                {/* Interval */}
                {jobType === "recurring" ? (
                  <div className="rj-field rj-field-fade">
                    <FieldLabel htmlFor="interval">Runs every</FieldLabel>
                    <div className="rj-input-row">
                      <div className="rj-input-shell rj-input-shell-num">
                        <input
                          id="interval" type="number" min="1" inputMode="numeric"
                          value={intervalValue}
                          onChange={(e) => setIntervalValue(e.target.value)}
                        />
                      </div>
                      <div className="rj-unit-toggle">
                        {INTERVAL_UNITS.map((u) => (
                          <button key={u.id} type="button"
                            className={intervalUnit === u.id ? "is-active" : ""}
                            onClick={() => setIntervalUnit(u.id)}>
                            {u.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <p className="rj-field-hint">Keepers won&apos;t re-execute until this interval passes.</p>
                  </div>
                ) : (
                  <p className="rj-field-hint rj-field-fade">This job settles once, then marks itself completed.</p>
                )}

                {/* Reward */}
                <div className="rj-field">
                  <FieldLabel htmlFor="reward"
                    hint={feeBps > 0 ? `${(feeBps / 100).toFixed(2)}% protocol fee` : undefined}>
                    Reward per execution
                  </FieldLabel>
                  <div className="rj-input-shell">
                    <Icon name="coin" size={15} />
                    <input
                      id="reward" inputMode="decimal" placeholder="0.01" value={reward}
                      aria-invalid={reward !== "" && !rewardValid}
                      onChange={(e) => setReward(e.target.value)}
                    />
                    <span className="rj-suffix">ETH</span>
                  </div>
                  <p className="rj-field-hint">Paid to the keeper the moment <code>performUpkeep</code> settles.</p>
                </div>

                {/* Max base fee */}
                <div className="rj-field">
                  <FieldLabel htmlFor="basefee">Max base fee</FieldLabel>
                  <div className="rj-input-shell">
                    <Icon name="gauge" size={15} />
                    <input
                      id="basefee" inputMode="decimal" placeholder="5" value={maxBaseFeeGwei}
                      aria-invalid={maxBaseFeeGwei !== "" && !maxBaseFeeValid}
                      onChange={(e) => setMaxBaseFeeGwei(e.target.value)}
                    />
                    <span className="rj-suffix">Gwei</span>
                  </div>
                  <p className="rj-field-hint">Execution waits out any block whose base fee exceeds this.</p>
                </div>

                {/* Funding */}
                <div className="rj-field">
                  <FieldLabel htmlFor="funding"
                    hint={rewardValid ? `≥ ${trimNumber(rewardNum)} ETH` : undefined}>
                    Initial funding
                  </FieldLabel>
                  <div className="rj-input-shell">
                    <Icon name="bolt" size={15} />
                    <input
                      id="funding" inputMode="decimal" placeholder="0.05" value={funding}
                      aria-invalid={funding !== "" && !fundingValid}
                      onChange={(e) => setFunding(e.target.value)}
                    />
                    <span className="rj-suffix">ETH</span>
                  </div>
                  <div className="rj-chip-row">
                    {[1, 5, 10, 25].map((n) => (
                      <button key={n} type="button" disabled={!rewardValid}
                        onClick={() => setFunding(trimNumber(rewardNum * n))}>
                        ×{n} run{n === 1 ? "" : "s"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Confirm */}
                <label className="rj-checkbox">
                  <input type="checkbox" checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)} />
                  <span>
                    I&apos;ve verified{" "}
                    <span className="rj-mono">{target ? shortAddress(target.trim()) : "this address"}</span>{" "}
                    on Basescan and it implements <code>IAutomatable</code>.
                  </span>
                </label>
              </fieldset>

              <button type="button" className="rj-submit" disabled={submitDisabled} onClick={handleSubmit}>
                {busy && <Icon name="loader" />}
                {submitLabel}
                {!busy && <ArrowIcon />}
              </button>

              {!isConnected && (
                <p className="rj-field-hint rj-center">Connect your wallet above to continue.</p>
              )}
              {isConnected && balanceData && (
                <p className="rj-field-hint rj-center">
                  Balance: {trimNumber(Number(balanceData.formatted))} {balanceData.symbol}
                </p>
              )}
              {isConfirmed && (
                <button type="button" className="rj-btn-ghost" onClick={handleReset}>
                  Register another job
                </button>
              )}
            </div>

            {/* RIGHT: SIDEBAR */}
            <aside className="rj-sidebar">

              {/* JOB TICKET */}
              <div className="rj-ticket glass">
                {isConfirmed && jobId !== null && <span className="rj-stamp">Issued</span>}
                <div className="rj-ticket-top-accent" />
                <div className="rj-ticket-head">
                  <span className="rj-ticket-tag">Job ticket</span>
                  <span className="rj-ticket-id">{jobId !== null ? `#${jobId.toString()}` : "—"}</span>
                </div>
                <dl className="rj-ticket-rows">
                  <div><dt>Target</dt><dd>{targetValid ? shortAddress(target.trim()) : "—"}</dd></div>
                  <div><dt>Type</dt><dd>{jobType === "recurring" ? "Recurring" : "One-time"}</dd></div>
                  <div>
                    <dt>Runs every</dt>
                    <dd>{jobType === "recurring" ? (intervalSeconds > 0 ? humanizeInterval(intervalSeconds) : "—") : "Once"}</dd>
                  </div>
                </dl>
                <div className="rj-ticket-divider">
                  <span className="rj-notch" />
                  <span className="rj-dashes" />
                  <span className="rj-notch" />
                </div>
                <dl className="rj-ticket-rows">
                  <div><dt>Reward / exec</dt><dd>{rewardValid ? `${trimNumber(rewardNum)} ETH` : "—"}</dd></div>
                  <div><dt>Protocol fee / exec</dt><dd>{rewardValid ? `${trimNumber(protocolFeePerExec)} ETH` : "—"}</dd></div>
                  <div><dt>Keeper receives</dt><dd>{rewardValid ? `${trimNumber(keeperRewardPerExec)} ETH` : "—"}</dd></div>
                  <div><dt>Funding</dt><dd>{fundingValid ? `${trimNumber(fundingNum)} ETH` : "—"}</dd></div>
                  <div className="rj-ticket-highlight">
                    <dt>Executions funded</dt>
                    <dd>{executionsFunded > 0 ? executionsFunded : "—"}</dd>
                  </div>
                </dl>
              </div>

              {/* SECURITY CARDS */}
              <div className="rj-security-cards">
                <div className="rj-sec-card glass">
                  <div className="rj-sec-card-head">
                    <span className="rj-sec-icon-wrap"><Icon name="shield" size={17} /></span>
                    <span className="rj-sec-badge">Bond</span>
                  </div>
                  <h3>Bonded operators only</h3>
                  <p>Every keeper posts a bond above the protocol minimum before touching a single job.</p>
                </div>
                <div className="rj-sec-card glass">
                  <div className="rj-sec-card-head">
                    <span className="rj-sec-icon-wrap"><Icon name="layers" size={17} /></span>
                    <span className="rj-sec-badge">Isolation</span>
                  </div>
                  <h3>Fault-isolated execution</h3>
                  <p>Each job runs in its own error boundary — one bad target reverts alone, not the whole queue.</p>
                </div>
                <div className="rj-sec-card glass">
                  <div className="rj-sec-card-head">
                    <span className="rj-sec-icon-wrap"><Icon name="star" size={17} /></span>
                    <span className="rj-sec-badge">Reputation</span>
                  </div>
                  <h3>Capped reputation score</h3>
                  <p>Reputation rises on clean executions and decays on faults, bounded 0–1000 onchain.</p>
                </div>
              </div>

              <p className="rj-fineprint glass">
                <Icon name="alert" />
                Double-check the target on Basescan — funding goes straight into an on-chain
                reward pool the moment you confirm.
              </p>
            </aside>

          </div>
        </section>

        {/* FOOTER */}
        <footer className="rj-footer">
          <span><Icon name="shield" /> Base mainnet, chain ID 8453</span>
          <span>Verify every address on Basescan before you send funds.</span>
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
    background: #eef3ff !important;
    color: #1a2540 !important;
  }

  .rj-page, .rj-page * { box-sizing: border-box; }

  .rj-page {
    --ink:          #1a2540;
    --muted:        #556080;
    --blue:         #2563eb;
    --blue-deep:    #1d4ed8;
    --blue-light:   #eff6ff;
    --blue-mid:     #93c5fd;
    --indigo:       #6366f1;
    --amber:        #d97706;
    --line:         rgba(26, 37, 64, 0.09);
    --glass-bg:     rgba(255, 255, 255, 0.62);
    --glass-border: rgba(255, 255, 255, 0.82);
    --shadow:       0 20px 60px rgba(26, 37, 64, 0.10);

    position: relative;
    min-height: 100vh;
    overflow-x: hidden;
    background: linear-gradient(180deg, #eef3ff 0%, #f4f7ff 100%);
    font-family: var(--body-font), sans-serif;
    color: var(--ink);
    -webkit-tap-highlight-color: transparent;
  }

  .rj-page a, .rj-page button { color: inherit; font: inherit; text-decoration: none; touch-action: manipulation; }
  .rj-page button { border: 0; cursor: pointer; background: none; }
  .rj-page code {
    font-family: var(--mono-font), monospace;
    padding: 2px 6px; border-radius: 5px;
    background: rgba(37,99,235,0.08); color: var(--blue-deep); font-size: 0.83em;
  }
  .rj-page h1, .rj-page h2, .rj-page h3,
  .rj-eyebrow, .rj-section-tag, .rj-panel-tag, .rj-ticket-tag, .rj-page-badge {
    font-family: var(--display-font), sans-serif; letter-spacing: -0.01em;
  }

  .glass {
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    backdrop-filter: blur(20px) saturate(160%);
    -webkit-backdrop-filter: blur(20px) saturate(160%);
    box-shadow: var(--shadow);
  }

  @property --border-angle {
    syntax: '<angle>';
    inherits: false;
    initial-value: 0deg;
  }

  /* ── BACKDROP ── */
  .rj-backdrop {
    position: fixed;
    inset: 0;
    z-index: 0;
    overflow: hidden;
  }

  /* Glass scene sits full-page, fixed */
  .rj-glass-scene {
    position: absolute;
    inset: 0;
  }
  .rj-glass-scene canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
  .rj-scene-fallback,
  .rj-backdrop-static {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(ellipse at 50% 30%, rgba(37,99,235,0.14), transparent 58%),
      #eef3ff;
  }

  /* Soft floating glow orbs — blue + indigo */
  .rj-glow-orb {
    position: absolute;
    border-radius: 50%;
    pointer-events: none;
  }
  .rj-glow-1 {
    width: 700px; height: 700px;
    top: -220px; left: -140px;
    background: radial-gradient(circle, rgba(37,99,235,0.11), transparent 65%);
    animation: rjFloat 11s ease-in-out infinite;
  }
  .rj-glow-2 {
    width: 560px; height: 560px;
    bottom: -120px; right: -100px;
    background: radial-gradient(circle, rgba(99,102,241,0.10), transparent 65%);
    animation: rjFloat 14s ease-in-out infinite reverse;
  }
  @keyframes rjFloat { 0%,100%{transform:translate(0,0)} 50%{transform:translate(30px,20px)} }

  .rj-backdrop-grain {
    position: absolute; inset: 0; z-index: 2; pointer-events: none;
    opacity: 0.04; mix-blend-mode: multiply;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E");
    background-size: 140px 140px;
  }

  /* Veil — fades backdrop into page bg so content is readable */
  .rj-veil {
    position: absolute; inset: 0; z-index: 3; pointer-events: none;
    background: linear-gradient(
      180deg,
      rgba(238,243,255,0.18) 0%,
      rgba(238,243,255,0.42) 50%,
      rgba(238,243,255,0.70) 100%
    );
  }

  /* ── FRAME ── */
  .rj-frame {
    position: fixed; inset: 10px; z-index: 60; pointer-events: none;
    border-radius: 26px; border: 1px solid rgba(37,99,235,0.08);
  }
  .rj-corner { position: absolute; width: 22px; height: 22px; }
  .rj-corner.c-tl { top:-1px; left:-1px; border-top:2px solid rgba(37,99,235,0.55); border-left:2px solid rgba(37,99,235,0.55); border-radius:14px 0 0 0; }
  .rj-corner.c-tr { top:-1px; right:-1px; border-top:2px solid rgba(37,99,235,0.55); border-right:2px solid rgba(37,99,235,0.55); border-radius:0 14px 0 0; }
  .rj-corner.c-bl { bottom:-1px; left:-1px; border-bottom:2px solid var(--blue-mid); border-left:2px solid var(--blue-mid); border-radius:0 0 0 14px; }
  .rj-corner.c-br { bottom:-1px; right:-1px; border-bottom:2px solid var(--blue-mid); border-right:2px solid var(--blue-mid); border-radius:0 0 14px 0; }

  /* ── HEADER ── */
  .rj-header {
    position: fixed; top: 18px; left: 50%; transform: translateX(-50%); z-index: 50;
    display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 16px;
    width: min(1180px, calc(100% - 36px)); padding: 10px 16px;
    padding-top: max(10px, env(safe-area-inset-top)); border-radius: 20px;
  }
  .rj-brand { display: flex; align-items: center; gap: 10px; }
  .rj-brand svg { color: var(--muted); }
  .rj-brand strong { font-size: 0.92rem; font-weight: 700; }
  .rj-brand-mark {
    width: 32px; aspect-ratio: 1; display: grid; place-items: center;
    border-radius: 9px; overflow: hidden; position: relative;
    background: linear-gradient(135deg, rgba(37,99,235,0.2), rgba(99,102,241,0.16));
  }
  .rj-brand-mark::before {
    content: ""; position: absolute; inset: -60%;
    background: conic-gradient(from 0deg, transparent, rgba(37,99,235,0.6), transparent 55%);
    animation: spinSlow 5s linear infinite;
  }
  .rj-brand-mark span { position: relative; z-index: 1; width: 7px; aspect-ratio: 1; border-radius: 50%; background: var(--blue); }
  @keyframes spinSlow { to { transform: rotate(360deg); } }

  .rj-page-badge {
    justify-self: center; padding: 7px 16px; border-radius: 999px;
    background: rgba(37,99,235,0.1); border: 1px solid rgba(37,99,235,0.2);
    color: var(--blue-deep); font-size: 0.72rem; font-weight: 700; letter-spacing: 0.04em;
  }
  .rj-header-right { justify-self: end; display: flex; align-items: center; }

  /* ── WALLET ── */
  .rj-wallet-wrap { position: relative; }
  .rj-wallet-pill {
    display: flex; align-items: center; gap: 9px; padding: 10px 14px; border-radius: 14px;
    font-weight: 700; font-size: 0.84rem; color: var(--blue-deep);
    transition: transform 180ms ease;
  }
  .rj-wallet-pill:hover { transform: translateY(-1px); }
  .rj-orb-dot { width: 8px; aspect-ratio: 1; border-radius: 50%; background: rgba(26,37,64,0.2); flex-shrink: 0; }
  .rj-orb-dot.is-live { background: #16a34a; box-shadow: 0 0 0 3px rgba(22,163,74,0.15); }
  .rj-orb-dot.is-warn { background: #dc2626; box-shadow: 0 0 0 3px rgba(220,38,38,0.15); }
  .rj-warn-badge { padding: 2px 8px; border-radius: 6px; background: rgba(220,38,38,0.08); color: #dc2626; font-size: 0.66rem; font-weight: 700; }
  .rj-wallet-menu {
    position: absolute; top: calc(100% + 8px); right: 0; min-width: 230px;
    border-radius: 14px; padding: 6px; display: grid; gap: 2px;
  }
  .rj-wallet-action { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px; font-size: 0.84rem; font-weight: 600; }
  .rj-wallet-action:hover { background: rgba(37,99,235,0.07); }
  .rj-wallet-action.is-warn { color: #dc2626; }
  .rj-wallet-chain { display: flex; align-items: center; gap: 10px; padding: 10px 12px; font-size: 0.84rem; font-weight: 600; color: #16a34a; }
  .rj-wallet-empty { padding: 10px 12px; font-size: 0.76rem; color: var(--muted); }
  .rj-connector-dot { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; background: rgba(37,99,235,0.1); color: var(--blue-deep); font-weight: 800; font-size: 0.7rem; }

  /* ── HERO ── */
  .rj-hero { position: relative; z-index: 3; min-height: 78svh; padding-top: 100px; }
  .rj-hero-body {
    display: grid; grid-template-columns: minmax(0,1fr) 300px; gap: 28px; align-items: end;
    width: min(1180px, calc(100% - 36px)); margin: 0 auto;
    min-height: calc(78svh - 120px); padding-bottom: 52px;
  }

  .rj-enter {
    opacity: 0; transform: translateY(22px);
    animation: rjEnter 760ms cubic-bezier(.16,1,.3,1) 80ms forwards;
  }
  .rj-enter-delay { animation-delay: 200ms; }
  @keyframes rjEnter { to { opacity: 1; transform: none; } }

  .rj-hero-copy { padding: 28px 32px; border-radius: 24px; }
  .rj-eyebrow {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 6px 12px; border-radius: 999px;
    background: rgba(37,99,235,0.1); color: var(--blue-deep);
    font-size: 0.74rem; font-weight: 700;
  }
  .rj-pulse-dot {
    display: block; width: 6px; aspect-ratio: 1; border-radius: 50%; background: var(--blue);
    animation: rjPulse 2s ease-in-out infinite;
  }
  @keyframes rjPulse { 0%{box-shadow:0 0 0 0 rgba(37,99,235,0.4)} 70%{box-shadow:0 0 0 6px rgba(37,99,235,0)} 100%{box-shadow:0 0 0 0 rgba(37,99,235,0)} }

  .rj-hero-copy h1 { font-size: clamp(2.4rem, 5vw, 4.2rem); font-weight: 700; line-height: 1.02; margin: 18px 0 0; letter-spacing: -0.018em; }
  .rj-hero-copy h1 span { display: block; color: var(--blue-deep); }
  .rj-hero-copy p { margin: 18px 0 0; color: var(--muted); font-size: 0.98rem; line-height: 1.74; max-width: 580px; }

  .rj-hero-stats { display: grid; gap: 12px; }
  .rj-stat {
    padding: 18px; border-radius: 18px; position: relative; overflow: hidden;
    display: grid; gap: 6px; transition: transform 260ms cubic-bezier(.16,1,.3,1);
  }
  .rj-stat:hover { transform: translateY(-4px); }
  .rj-stat::before { content: ""; position: absolute; inset: 0; border-left: 3px solid var(--blue); opacity: 0.9; }
  .rj-stat[data-accent="indigo"]::before { border-left-color: var(--indigo); }
  .rj-stat-icon-wrap { display: flex; align-items: center; gap: 8px; color: var(--blue-deep); }
  .rj-stat[data-accent="indigo"] .rj-stat-icon-wrap { color: var(--indigo); }
  .rj-stat-label { font-size: 0.72rem; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
  .rj-stat-value { font-size: 1.7rem; font-weight: 700; font-family: var(--display-font), sans-serif; }

  .rj-skeleton {
    display: inline-block; width: 50px; height: 22px; border-radius: 5px;
    background: linear-gradient(90deg, rgba(26,37,64,0.06), rgba(37,99,235,0.1), rgba(26,37,64,0.06));
    background-size: 200% 100%; animation: rjShimmer 1.4s ease-in-out infinite;
  }
  @keyframes rjShimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }

  /* ── SECTIONS ── */
  .rj-section { position: relative; z-index: 3; width: min(1180px, calc(100% - 36px)); margin: 0 auto; padding: 80px 0; }
  .rj-section-head { max-width: 680px; margin-bottom: 40px; }
  .rj-section-tag { color: var(--blue-deep); font-size: 0.76rem; font-weight: 700; }
  .rj-section-head h2 { margin: 10px 0 0; font-size: clamp(1.8rem, 3.2vw, 3rem); font-weight: 700; letter-spacing: -0.015em; }

  /* ── STEP CARDS ── */
  .rj-step-grid { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 14px; }
  .rj-step-card {
    padding: 22px; border-radius: 20px; position: relative;
    transition: transform 260ms cubic-bezier(.16,1,.3,1), box-shadow 260ms ease;
  }
  .rj-step-card:hover { transform: translateY(-6px); box-shadow: 0 28px 60px rgba(26,37,64,0.14); }
  .rj-step-card::before {
    content: ""; position: absolute; inset: 0; border-radius: inherit; padding: 1.5px;
    background: conic-gradient(from var(--border-angle), transparent 0 65%, var(--blue) 82%, var(--blue-mid) 92%, transparent 100%);
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    -webkit-mask-composite: xor; mask-composite: exclude;
    opacity: 0; transition: opacity 320ms ease;
    animation: spinBorder 3.4s linear infinite paused; pointer-events: none;
  }
  .rj-step-card:hover::before { opacity: 1; animation-play-state: running; }
  @keyframes spinBorder { to { --border-angle: 360deg; } }
  .rj-step-card:hover .rj-step-icon-wrap { transform: scale(1.06) rotate(-4deg); }

  .rj-step-head { display: flex; align-items: center; justify-content: space-between; }
  .rj-step-icon-wrap {
    width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; flex-shrink: 0;
    background: linear-gradient(135deg, rgba(37,99,235,0.16), rgba(99,102,241,0.12));
    color: var(--blue-deep); transition: transform 260ms cubic-bezier(.16,1,.3,1);
  }
  .rj-step-num { font-style: normal; font-weight: 700; color: var(--muted); opacity: 0.45; font-size: 0.78rem; font-family: var(--display-font); }
  .rj-step-card h3 { margin: 16px 0 0; font-size: 1.02rem; }
  .rj-step-body { margin: 8px 0 0; color: var(--muted); font-size: 0.84rem; line-height: 1.62; }

  /* ── FORM SECTION ── */
  .rj-form-section { padding-top: 0; padding-bottom: 100px; }
  .rj-form-layout { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 22px; align-items: start; }

  /* ── FORM PANEL ── */
  .rj-form-panel { padding: 32px; border-radius: 26px; display: grid; gap: 22px; }
  .rj-panel-tag { color: var(--blue-deep); font-size: 0.74rem; font-weight: 700; }
  .rj-panel-head h2 { margin: 8px 0 0; font-size: 1.5rem; font-weight: 700; }
  .rj-panel-head p { margin: 6px 0 0; color: var(--muted); font-size: 0.86rem; line-height: 1.6; }

  /* Banners */
  .rj-banners { display: grid; gap: 10px; }
  .rj-banner { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: 14px; font-size: 0.83rem; font-weight: 600; line-height: 1.5; }
  .rj-banner svg { flex-shrink: 0; margin-top: 1px; }
  .rj-banner a { text-decoration: underline; display: inline-flex; align-items: center; gap: 4px; }
  .rj-banner-error   { background: rgba(220,38,38,0.07);  color: #b91c1c; border: 1px solid rgba(220,38,38,0.2); }
  .rj-banner-pending { background: rgba(217,119,6,0.08);  color: #92400e; border: 1px solid rgba(217,119,6,0.2); }
  .rj-banner-info    { background: rgba(37,99,235,0.07);  color: var(--blue-deep); border: 1px solid rgba(37,99,235,0.2); }
  .rj-banner-success { background: rgba(22,163,74,0.07);  color: #15803d; border: 1px solid rgba(22,163,74,0.22); }

  /* Fieldset */
  .rj-fieldset { border: 0; margin: 0; padding: 0; display: grid; gap: 22px; }
  .rj-fieldset:disabled { opacity: 0.48; pointer-events: none; }
  .rj-field { display: grid; gap: 8px; }
  .rj-field-label { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .rj-field-label label, .rj-field-label > span:first-child { font-size: 0.79rem; font-weight: 700; color: var(--ink); }
  .rj-field-label-hint { font-size: 0.71rem; color: var(--blue-deep); font-weight: 600; }
  .rj-field-hint { margin: 0; font-size: 0.76rem; color: var(--muted); line-height: 1.55; }
  .rj-field-fade { animation: rjFadeIn 240ms ease; }
  @keyframes rjFadeIn { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:none} }

  /* Input shells */
  .rj-input-shell {
    display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: 14px;
    background: rgba(255,255,255,0.85); border: 1.5px solid rgba(26,37,64,0.1);
    transition: border-color 160ms ease, box-shadow 160ms ease;
  }
  .rj-input-shell:focus-within { border-color: var(--blue); box-shadow: 0 0 0 3px rgba(37,99,235,0.12); }
  .rj-input-shell svg { flex-shrink: 0; color: var(--muted); }
  .rj-input-shell input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; font-size: 0.92rem; color: var(--ink); font-family: var(--mono-font), monospace; }
  .rj-input-shell input::placeholder { color: rgba(85,96,128,0.38); }
  .rj-suffix { font-size: 0.7rem; font-weight: 700; color: var(--muted); flex-shrink: 0; }
  .rj-input-row { display: flex; gap: 10px; }
  .rj-input-shell-num { max-width: 140px; }

  /* Unit toggle */
  .rj-unit-toggle { display: flex; gap: 3px; padding: 4px; border-radius: 13px; background: rgba(255,255,255,0.6); border: 1.5px solid rgba(26,37,64,0.1); }
  .rj-unit-toggle button { padding: 8px 13px; border-radius: 9px; font-size: 0.76rem; font-weight: 700; color: var(--muted); transition: background 150ms ease, color 150ms ease; }
  .rj-unit-toggle button.is-active { background: var(--blue); color: #fff; box-shadow: 0 2px 8px rgba(37,99,235,0.3); }

  /* Segmented */
  .rj-segmented { display: flex; gap: 5px; padding: 5px; border-radius: 16px; background: rgba(255,255,255,0.6); border: 1.5px solid rgba(26,37,64,0.1); }
  .rj-segmented button { flex: 1; padding: 10px; border-radius: 11px; font-size: 0.84rem; font-weight: 700; color: var(--muted); transition: background 160ms ease, color 160ms ease; }
  .rj-segmented button.is-active { background: #fff; color: var(--blue-deep); border: 1.5px solid rgba(37,99,235,0.2); box-shadow: 0 2px 8px rgba(37,99,235,0.1); }

  /* Chips */
  .rj-chip-row { display: flex; gap: 7px; flex-wrap: wrap; }
  .rj-chip-row button { padding: 6px 12px; border-radius: 999px; font-size: 0.73rem; font-weight: 700; background: rgba(255,255,255,0.7); border: 1.5px solid rgba(26,37,64,0.1); color: var(--muted); transition: background 150ms ease, border-color 150ms ease, color 150ms ease; }
  .rj-chip-row button:hover:not(:disabled) { background: rgba(37,99,235,0.08); border-color: rgba(37,99,235,0.3); color: var(--blue-deep); }
  .rj-chip-row button:disabled { opacity: 0.32; cursor: not-allowed; }

  /* Checkbox */
  .rj-checkbox { display: flex; align-items: flex-start; gap: 10px; font-size: 0.82rem; color: var(--muted); line-height: 1.55; cursor: pointer; }
  .rj-checkbox input { margin-top: 2px; width: 16px; height: 16px; accent-color: var(--blue); flex-shrink: 0; }
  .rj-mono { font-family: var(--mono-font), monospace; color: var(--blue-deep); }

  /* Submit */
  .rj-submit {
    display: flex; align-items: center; justify-content: center; gap: 9px; width: 100%;
    padding: 16px; border-radius: 16px; font-size: 0.92rem; font-weight: 700;
    background: linear-gradient(135deg, var(--blue), var(--blue-deep));
    color: #fff; box-shadow: 0 6px 20px rgba(37,99,235,0.35);
    transition: transform 200ms cubic-bezier(.16,1,.3,1), box-shadow 200ms ease, opacity 200ms ease;
  }
  .rj-submit:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 10px 30px rgba(37,99,235,0.45); }
  .rj-submit:disabled { opacity: 0.33; cursor: not-allowed; box-shadow: none; }
  .rj-btn-arrow { transition: transform 200ms ease; }
  .rj-submit:hover:not(:disabled) .rj-btn-arrow { transform: translate(2px,-2px); }

  .rj-btn-ghost { justify-self: start; padding: 10px 16px; border-radius: 12px; font-size: 0.82rem; font-weight: 700; color: var(--muted); border: 1.5px solid rgba(26,37,64,0.1); transition: border-color 160ms ease, color 160ms ease; }
  .rj-btn-ghost:hover { border-color: rgba(37,99,235,0.3); color: var(--blue-deep); }
  .rj-center { text-align: center; }

  /* ── SIDEBAR ── */
  .rj-sidebar { display: grid; gap: 14px; position: sticky; top: 108px; }

  /* ── TICKET ── */
  .rj-ticket { padding: 24px 26px; border-radius: 22px; position: relative; overflow: hidden; }
  .rj-ticket-top-accent { position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, var(--blue), var(--indigo), var(--blue-mid)); }
  .rj-stamp {
    position: absolute; top: 20px; right: 20px; padding: 5px 12px;
    border: 2px solid var(--blue); border-radius: 8px;
    color: var(--blue); font-family: var(--mono-font), monospace;
    font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; font-size: 0.62rem;
    transform: rotate(-8deg);
    opacity: 0; animation: rjStampIn 420ms cubic-bezier(.16,1,.3,1) 100ms forwards;
  }
  @keyframes rjStampIn { from{opacity:0;transform:rotate(-8deg) scale(1.6)} to{opacity:1;transform:rotate(-8deg) scale(1)} }

  .rj-ticket-head { display: flex; align-items: center; justify-content: space-between; padding-top: 4px; }
  .rj-ticket-tag { font-size: 0.67rem; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.1em; }
  .rj-ticket-id { font-family: var(--mono-font), monospace; font-weight: 700; color: var(--blue-deep); font-size: 0.88rem; }

  .rj-ticket-rows { display: grid; gap: 10px; margin: 14px 0 0; }
  .rj-ticket-rows > div { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
  .rj-ticket-rows dt { margin: 0; font-size: 0.76rem; color: var(--muted); font-weight: 600; }
  .rj-ticket-rows dd { margin: 0; font-size: 0.84rem; font-weight: 700; color: var(--ink); font-family: var(--mono-font), monospace; text-align: right; }
  .rj-ticket-highlight dd { color: var(--blue-deep); }

  .rj-ticket-divider { display: flex; align-items: center; margin: 18px -26px; }
  .rj-notch { width: 20px; height: 20px; border-radius: 50%; background: linear-gradient(180deg, #eef3ff, #f4f7ff); flex-shrink: 0; border: 1px solid rgba(26,37,64,0.08); }
  .rj-notch:first-child { margin-left: -10px; border-left-color: transparent; }
  .rj-notch:last-child  { margin-right: -10px; border-right-color: transparent; }
  .rj-dashes { flex: 1; height: 0; border-top: 1.5px dashed rgba(37,99,235,0.18); margin: 0 4px; }

  /* ── SECURITY CARDS ── */
  .rj-security-cards { display: grid; gap: 12px; }
  .rj-sec-card {
    padding: 18px 20px; border-radius: 18px; position: relative; overflow: hidden;
    transition: transform 260ms cubic-bezier(.16,1,.3,1);
  }
  .rj-sec-card:hover { transform: translateY(-4px); }
  .rj-sec-card::before {
    content: ""; position: absolute; inset: 0; border-radius: inherit; padding: 1.5px;
    background: conic-gradient(from var(--border-angle), transparent 0 65%, var(--blue) 82%, var(--blue-mid) 92%, transparent 100%);
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    -webkit-mask-composite: xor; mask-composite: exclude;
    opacity: 0; transition: opacity 320ms ease;
    animation: spinBorder 3.4s linear infinite paused; pointer-events: none;
  }
  .rj-sec-card:hover::before { opacity: 1; animation-play-state: running; }
  .rj-sec-card:hover .rj-sec-icon-wrap { transform: scale(1.06) rotate(-4deg); }

  .rj-sec-card-head { display: flex; align-items: center; justify-content: space-between; }
  .rj-sec-icon-wrap {
    width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center;
    background: linear-gradient(135deg, rgba(37,99,235,0.14), rgba(99,102,241,0.1));
    color: var(--blue-deep); transition: transform 260ms cubic-bezier(.16,1,.3,1);
  }
  .rj-sec-badge { padding: 4px 9px; border-radius: 999px; background: rgba(37,99,235,0.09); color: var(--blue-deep); font-size: 0.68rem; font-weight: 700; }
  .rj-sec-card h3 { margin: 12px 0 0; font-size: 0.92rem; font-weight: 700; font-family: var(--display-font), sans-serif; }
  .rj-sec-card p { margin: 6px 0 0; color: var(--muted); font-size: 0.8rem; line-height: 1.58; }

  /* Fineprint */
  .rj-fineprint { display: flex; align-items: flex-start; gap: 9px; padding: 14px 16px; border-radius: 14px; font-size: 0.76rem; color: var(--muted); line-height: 1.6; }
  .rj-fineprint svg { flex-shrink: 0; margin-top: 2px; color: var(--amber); }

  /* Icons */
  .rj-icon { flex-shrink: 0; }
  .rj-spin { animation: rjSpin 900ms linear infinite; }
  @keyframes rjSpin { to { transform: rotate(360deg); } }

  /* ── FOOTER ── */
  .rj-footer {
    position: relative; z-index: 3;
    width: min(1180px, calc(100% - 36px)); margin: 0 auto;
    display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px;
    color: var(--muted); font-size: 0.76rem;
    border-top: 1px solid var(--line);
    padding: 22px 0 60px; padding-bottom: calc(60px + env(safe-area-inset-bottom));
  }
  .rj-footer span { display: inline-flex; align-items: center; gap: 7px; }
  .rj-footer svg { color: var(--blue); }

  /* ── REDUCED MOTION ── */
  @media (prefers-reduced-motion: reduce) {
    .rj-enter, .rj-pulse-dot, .rj-glow-1, .rj-glow-2, .rj-spin, .rj-stamp {
      animation: none !important; opacity: 1 !important; transform: none !important;
    }
  }

  /* ── RESPONSIVE ── */
  @media (max-width: 1020px) {
    .rj-step-grid { grid-template-columns: repeat(2, minmax(0,1fr)); }
    .rj-hero-body { grid-template-columns: 1fr; }
    .rj-hero-stats { grid-template-columns: repeat(2, minmax(0,1fr)); }
    .rj-form-layout { grid-template-columns: 1fr; }
    .rj-sidebar { position: static; }
    .rj-security-cards { grid-template-columns: repeat(2, minmax(0,1fr)); }
  }

  @media (max-width: 680px) {
    .rj-header { top: 12px; width: calc(100% - 20px); padding: 8px 10px; }
    .rj-brand strong, .rj-page-badge { display: none; }
    .rj-hero { padding-top: 84px; min-height: unset; }
    .rj-hero-body { padding-bottom: 36px; }
    .rj-hero-copy { padding: 20px; }
    .rj-hero-copy h1 { font-size: clamp(2rem, 10vw, 3rem); }
    .rj-step-grid { grid-template-columns: 1fr; }
    .rj-form-panel { padding: 22px; border-radius: 20px; }
    .rj-input-row { flex-direction: column; }
    .rj-input-shell-num { max-width: none; }
    .rj-security-cards { grid-template-columns: 1fr; }
    .rj-frame { inset: 6px; border-radius: 20px; }
    .rj-corner { width: 16px; height: 16px; }
  }
`;