"use client";

// The real Brain globe (same canvas/data as the /brain page), reused here at
// a smaller size next to Sentinel's Aurum mark — a looping animation, no
// interactivity. Purely visual: appears while the user is engaging Sentinel.

import useSWR from "swr";
import { BrainGlobeCanvas, brainGraphFetcher } from "@/components/brain-graph/BrainGlobeCanvas";
import type { NetworkData } from "@/components/brain-graph/BrainGlobeCanvas";

export function SentinelBrainGlobe({ size = 260, active = false }: { size?: number; active?: boolean }) {
  const { data: network, error, isLoading } = useSWR<NetworkData>(
    "/api/brain-graph/network",
    brainGraphFetcher,
    { refreshInterval: 3_600_000 },
  );

  const hasGraph = Array.isArray(network?.nodes) && network.nodes.length > 0;

  return (
    <div className="sbg-wrap" style={{ width: size, height: size }}>
      {hasGraph && !error && !isLoading ? (
        <BrainGlobeCanvas
          data={network!}
          spinning={active}
          onSelect={() => {}}
          selected={null}
          interactive={false}
          dotScale={0.6}
        />
      ) : null}
      <style jsx>{`
        .sbg-wrap { position:relative;flex-shrink:0; }
      `}</style>
    </div>
  );
}

export function BrainConnector({ active = false }: { active?: boolean }) {
  return (
    <div className={`sbc-wrap${active ? " sbc-active" : ""}`}>
      <svg className="sbc-svg" viewBox="0 0 64 24" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg">
        <line x1="0" y1="12" x2="64" y2="12" stroke="rgba(214,184,108,0.30)" strokeWidth="1" strokeDasharray="2 4" />
        <circle cx="0" cy="12" r="2.4" className="sbc-dot" />
      </svg>
      <style jsx>{`
        .sbc-wrap { position:relative;flex-shrink:0;width:100%;height:100%; }
        .sbc-svg { width:100%;height:100%;display:block; }
        .sbc-dot { fill:#C9A84C;filter:drop-shadow(0 0 4px rgba(214,184,108,0.8));opacity:0; }
        .sbc-active .sbc-dot { animation:sbc-travel 1.8s ease-in-out infinite; }
        @keyframes sbc-travel {
          0%   { opacity:0;   transform:translateX(0); }
          10%  { opacity:1; }
          90%  { opacity:1; }
          100% { opacity:0;   transform:translateX(64px); }
        }
        @media (prefers-reduced-motion:reduce) {
          .sbc-dot { animation:none;opacity:0.7; }
        }
      `}</style>
    </div>
  );
}
