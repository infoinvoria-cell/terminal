"use client";

/**
 * MCDensitySurface — Monte Carlo Probability Density Surface
 *
 * Axes:
 *   X = horizon / time (months)
 *   Y = equity level (indexed 100 = start)
 *   Z = probability density (histogram count / total paths)
 *
 * Construction: for each horizon t, bin the 10,000 equity values into
 * EQUITY_BINS fixed bins spanning the full equity range. Z = normalized
 * frequency per bin. This is a robust histogram density — no KDE smoothing
 * that could mask multimodality.
 *
 * Color: near-black base → gray → white for high-gain territory,
 *        gray → gold for loss territory (equity < 100).
 * No rainbow heatmap.
 */

import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { MonteCarloResult } from "@/lib/modeling/types";
import { FONT_LABEL } from "@/lib/modeling/colors";

const EQUITY_BINS = 40;
const EQUITY_MIN = 40;
const EQUITY_MAX = 320;
const BIN_SIZE = (EQUITY_MAX - EQUITY_MIN) / EQUITY_BINS;

function densityColor(equity: number, density: number): [number, number, number] {
  // Base intensity from density (0→1 normalized later per-horizon)
  const i = Math.min(density, 1);
  if (equity < 100) {
    // Loss zone: dark → gold
    return [
      0.30 + 0.49 * i,  // R
      0.25 + 0.41 * i,  // G
      0.08 + 0.11 * i,  // B
    ];
  } else {
    // Gain zone: dark → white/gray
    return [
      0.14 + 0.72 * i,
      0.15 + 0.74 * i,
      0.17 + 0.75 * i,
    ];
  }
}

type Props = { result: MonteCarloResult; progress?: number };

function SurfaceMesh({ result, progress = 1 }: Props) {
  const { positions, colors, indices, xCount, yCount } = useMemo(() => {
    const { paths, params } = result;
    const horizon = params.horizon;
    const visibleT = Math.max(2, Math.ceil((horizon + 1) * progress));
    const xCount = visibleT;
    const yCount = EQUITY_BINS;

    const positions = new Float32Array(xCount * yCount * 3);
    const colors = new Float32Array(xCount * yCount * 3);

    for (let xi = 0; xi < xCount; xi++) {
      // Build histogram for this time step
      const counts = new Float32Array(yCount);
      for (const path of paths) {
        const eq = path[xi] ?? 100;
        const bin = Math.floor((eq - EQUITY_MIN) / BIN_SIZE);
        if (bin >= 0 && bin < yCount) counts[bin]++;
      }
      const maxCount = Math.max(...counts, 1);

      for (let yi = 0; yi < yCount; yi++) {
        const density = counts[yi]! / maxCount; // normalized 0→1
        const equityMid = EQUITY_MIN + (yi + 0.5) * BIN_SIZE;

        // World coordinates:
        // X maps horizon (0..horizon) → 0..20
        // Y maps equity (EQUITY_MIN..EQUITY_MAX) → 0..12
        // Z = density * 5
        const wx = (xi / Math.max(horizon, 1)) * 20;
        const wy = ((equityMid - EQUITY_MIN) / (EQUITY_MAX - EQUITY_MIN)) * 12;
        const wz = density * 5;

        const idx = (yi * xCount + xi) * 3;
        positions[idx]     = wx;
        positions[idx + 1] = wy;
        positions[idx + 2] = wz;

        const [r, g, b] = densityColor(equityMid, density);
        colors[idx]     = r;
        colors[idx + 1] = g;
        colors[idx + 2] = b;
      }
    }

    const indices: number[] = [];
    for (let yi = 0; yi < yCount - 1; yi++) {
      for (let xi = 0; xi < xCount - 1; xi++) {
        const a = yi * xCount + xi;
        const b = yi * xCount + xi + 1;
        const c = (yi + 1) * xCount + xi;
        const d = (yi + 1) * xCount + xi + 1;
        indices.push(a, b, c, b, d, c);
      }
    }

    return { positions, colors, indices, xCount, yCount };
  }, [result, progress]);

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }, [positions, colors, indices]);

  return (
    <mesh geometry={geo}>
      <meshStandardMaterial vertexColors side={THREE.DoubleSide} roughness={0.7} metalness={0.05} />
    </mesh>
  );
}

export function MCDensitySurface({ result, progress = 1 }: Props) {
  return (
    <Suspense
      fallback={
        <div style={{
          width: "100%", height: "100%",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "rgba(165,165,165,0.5)", fontFamily: FONT_LABEL,
          fontSize: 11, letterSpacing: "0.1em", background: "#0a0a0c",
        }}>
          LOADING 3D
        </div>
      }
    >
      <Canvas
        style={{ width: "100%", height: "100%", background: "#09090b" }}
        camera={{ position: [10, 6, 18], fov: 52 }}
      >
        <ambientLight intensity={0.55} />
        <directionalLight position={[20, 20, 10]} intensity={0.45} />
        <SurfaceMesh result={result} progress={progress} />
        <OrbitControls enablePan enableZoom enableRotate dampingFactor={0.08} enableDamping />
        <gridHelper args={[22, 11, "rgba(255,255,255,0.04)", "rgba(255,255,255,0.03)"]} position={[10, 0, 0]} />
      </Canvas>
    </Suspense>
  );
}
