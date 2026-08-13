"use client";

import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { AnalyticsSeriesPoint } from "@/lib/analytics/portfolio-data";
import { computeRolling } from "@/lib/modeling/transforms";

type Props = {
  series: AnalyticsSeriesPoint[];
};

const WINDOWS = [6, 9, 12, 18, 24, 36];

function sharpeColor(sharpe: number): [number, number, number] {
  // Black/gray/white scale — no blue, no green
  // Negative Sharpe → gold; near 0 → dark gray; high → white
  if (sharpe < 0) {
    const t = Math.min(-sharpe / 1.5, 1);
    return [0.35 + t * (0.788 - 0.35), 0.25 + t * (0.659 - 0.25), 0.10 + t * (0.298 - 0.10)];
  }
  // 0..1 → dark gray to mid gray
  if (sharpe < 1.0) {
    const t = sharpe;
    return [0.22 + t * 0.35, 0.22 + t * 0.35, 0.22 + t * 0.35];
  }
  // 1..2 → mid gray to near-white
  const t = Math.min((sharpe - 1.0) / 1.0, 1);
  return [0.57 + t * 0.33, 0.57 + t * 0.33, 0.57 + t * 0.33];
}

function RiskSurfaceMesh({ series }: Props) {
  const geometry = useMemo(() => {
    if (series.length < 37) return null;

    const rollingVol = computeRolling(series, "volatility", 12);
    const rollingSharpe = computeRolling(series, "sharpe", 12);
    const n = rollingVol.length;
    if (n < 4) return null;

    const rows = WINDOWS.length;
    const cols = n;
    const positions = new Float32Array(rows * cols * 3);
    const colors = new Float32Array(rows * cols * 3);

    // Pre-compute rolling vol at each window for each date
    const volByWindow: number[][] = WINDOWS.map((w) => {
      const rolling = computeRolling(series, "volatility", w);
      const map = new Map(rolling.map((p) => [p.date, p.value]));
      return rollingVol.map((p) => map.get(p.date) ?? 0);
    });
    const sharpeByWindow: number[][] = WINDOWS.map((w) => {
      const rolling = computeRolling(series, "sharpe", w);
      const map = new Map(rolling.map((p) => [p.date, p.value]));
      return rollingVol.map((p) => map.get(p.date) ?? 0);
    });

    const maxVol = Math.max(...volByWindow.flat(), 1);

    for (let wi = 0; wi < rows; wi++) {
      for (let ti = 0; ti < cols; ti++) {
        const vol = volByWindow[wi]?.[ti] ?? 0;
        const sharpe = sharpeByWindow[wi]?.[ti] ?? 0;
        const x = (ti / (cols - 1)) * 30;
        const y = (wi / (rows - 1)) * 12;
        const z = (vol / maxVol) * 8;

        const idx = (wi * cols + ti) * 3;
        positions[idx] = x;
        positions[idx + 1] = y;
        positions[idx + 2] = z;

        const [r, g, b] = sharpeColor(sharpe);
        colors[idx] = r;
        colors[idx + 1] = g;
        colors[idx + 2] = b;
      }
    }

    const indices: number[] = [];
    for (let wi = 0; wi < rows - 1; wi++) {
      for (let ti = 0; ti < cols - 1; ti++) {
        const a = wi * cols + ti;
        const b = wi * cols + ti + 1;
        const c = (wi + 1) * cols + ti;
        const d = (wi + 1) * cols + ti + 1;
        indices.push(a, b, c, b, d, c);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }, [series]);

  if (!geometry) return null;

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial vertexColors side={THREE.DoubleSide} />
    </mesh>
  );
}

const FALLBACK: React.CSSProperties = {
  width: "100%", height: "100%",
  display: "flex", alignItems: "center", justifyContent: "center",
  color: "rgba(165,165,165,0.5)",
  fontFamily: "var(--font-montserrat,'Montserrat',sans-serif)",
  fontSize: 11, letterSpacing: "0.1em",
  background: "#0a0a0c",
};

export function RollingRiskSurface3D({ series }: Props) {
  return (
    <Suspense fallback={<div style={FALLBACK}>LOADING 3D</div>}>
      <Canvas style={{ width: "100%", height: "100%" }} camera={{ position: [15, -8, 20], fov: 50 }}>
        <ambientLight intensity={0.6} />
        <pointLight position={[20, 20, 20]} intensity={0.7} />
        <RiskSurfaceMesh series={series} />
        <gridHelper args={[32, 10, 0x888888, 0x444444]} position={[15, -1, 6]} />
        <OrbitControls enablePan enableZoom enableRotate />
      </Canvas>
    </Suspense>
  );
}
