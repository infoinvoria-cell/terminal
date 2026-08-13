"use client";

import { Suspense, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { MonteCarloResult } from "@/lib/modeling/types";

type Props = {
  result: MonteCarloResult;
};

const QUANTILES = Array.from({ length: 19 }, (_, i) => 0.05 + i * 0.05);

function equityToColor(equity: number): [number, number, number] {
  if (equity >= 100) {
    const t = Math.min((equity - 100) / 100, 1);
    return [0.70 + 0.28 * t, 0.74 + 0.22 * t, 0.80 + 0.18 * t];
  } else {
    const t = Math.min((100 - equity) / 50, 1);
    return [0.51 + 0.28 * t, 0.43 - 0.23 * t, 0.30 - 0.10 * t];
  }
}

function SurfaceMesh({ result }: { result: MonteCarloResult }) {
  const meshRef = useRef<THREE.Mesh>(null);

  const geometry = useMemo(() => {
    const { paths, params } = result;
    const horizon = params.horizon;
    const xCount = horizon + 1;
    const yCount = QUANTILES.length; // 19

    // Sort paths by final equity to assign quantile ranks
    const sorted = [...paths].sort((a, b) => a[a.length - 1] - b[b.length - 1]);

    // Pick quantile paths
    const quantilePaths: number[][] = QUANTILES.map((q) => {
      const idx = Math.min(Math.floor(q * sorted.length), sorted.length - 1);
      return sorted[idx];
    });

    const positions = new Float32Array(xCount * yCount * 3);
    const colors = new Float32Array(xCount * yCount * 3);

    for (let yi = 0; yi < yCount; yi++) {
      const path = quantilePaths[yi];
      for (let xi = 0; xi < xCount; xi++) {
        const equity = path[Math.min(xi, path.length - 1)] ?? 100;
        const x = (xi / (xCount - 1)) * horizon;
        const y = yi / (yCount - 1); // 0 → 1
        const zNorm = (Math.max(50, Math.min(300, equity)) - 50) / 250; // 0→1
        const z = zNorm * 4 - 2; // -2 → 2

        const idx = (yi * xCount + xi) * 3;
        positions[idx] = x;
        positions[idx + 1] = y;
        positions[idx + 2] = z;

        const [r, g, b] = equityToColor(equity);
        colors[idx] = r;
        colors[idx + 1] = g;
        colors[idx + 2] = b;
      }
    }

    // Build triangle indices
    const indices: number[] = [];
    for (let yi = 0; yi < yCount - 1; yi++) {
      for (let xi = 0; xi < xCount - 1; xi++) {
        const a = yi * xCount + xi;
        const b = yi * xCount + xi + 1;
        const c = (yi + 1) * xCount + xi;
        const d = (yi + 1) * xCount + xi + 1;
        indices.push(a, b, c);
        indices.push(b, d, c);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }, [result]);

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshStandardMaterial vertexColors side={THREE.DoubleSide} />
    </mesh>
  );
}

export function MCQuantileSurface({ result }: Props) {
  const horizon = result.params.horizon;

  return (
    <Suspense
      fallback={
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(165,165,165,0.5)",
            fontFamily: "var(--font-montserrat,'Montserrat',sans-serif)",
            fontSize: 11,
            letterSpacing: "0.1em",
            background: "#0a0a0c",
          }}
        >
          LOADING 3D
        </div>
      }
    >
      <Canvas
        style={{ width: "100%", height: "100%" }}
        camera={{ position: [horizon / 2, 0.5, 200], fov: 55 }}
      >
        <ambientLight intensity={0.6} />
        <SurfaceMesh result={result} />
        <gridHelper args={[horizon, Math.min(horizon, 12), 0x888888, 0x444444]} position={[horizon / 2, -0.1, 0]} />
        <OrbitControls enablePan={true} enableZoom={true} enableRotate={true} />
      </Canvas>
    </Suspense>
  );
}
