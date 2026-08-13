"use client";

import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { computeVaRSurface } from "@/lib/modeling/transforms";
import { FONT_LABEL } from "@/lib/modeling/colors";

type Props = {
  monthlyReturns: number[];
};

const CONFIDENCES = [0.90, 0.92, 0.94, 0.95, 0.96, 0.97, 0.98, 0.99];
const HORIZONS = [1, 3, 6, 12, 24, 36, 60];

function varColor(loss: number): [number, number, number] {
  // loss is negative; more negative = worse → gold; near zero = gray
  const t = Math.min(Math.abs(loss) / 0.5, 1); // 0 = no loss, 1 = -50%+
  // gray(0.35) → gold(201/255, 168/255, 76/255)
  const r = 0.35 + t * (0.788 - 0.35);
  const g = 0.35 + t * (0.659 - 0.35);
  const b = 0.35 + t * (0.298 - 0.35);
  return [r, g, b];
}

function VaRMesh({ monthlyReturns }: Props) {
  const geometry = useMemo(() => {
    const result = computeVaRSurface(monthlyReturns, CONFIDENCES, HORIZONS);
    if (!result) return null;

    const rows = CONFIDENCES.length;
    const cols = HORIZONS.length;
    const positions = new Float32Array(rows * cols * 3);
    const colors = new Float32Array(rows * cols * 3);

    for (let ci = 0; ci < rows; ci++) {
      for (let hi = 0; hi < cols; hi++) {
        const varVal = result.varMatrix[ci]?.[hi] ?? 0;
        const x = (hi / (cols - 1)) * 20;
        const y = (ci / (rows - 1)) * 12;
        const z = Math.max(-15, varVal * 30); // scale: -50% loss → -15 units

        const idx = (ci * cols + hi) * 3;
        positions[idx] = x;
        positions[idx + 1] = y;
        positions[idx + 2] = z;

        const [r, g, b] = varColor(varVal);
        colors[idx] = r;
        colors[idx + 1] = g;
        colors[idx + 2] = b;
      }
    }

    const indices: number[] = [];
    for (let ci = 0; ci < rows - 1; ci++) {
      for (let hi = 0; hi < cols - 1; hi++) {
        const a = ci * cols + hi;
        const b = ci * cols + hi + 1;
        const c = (ci + 1) * cols + hi;
        const d = (ci + 1) * cols + hi + 1;
        indices.push(a, b, c, b, d, c);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }, [monthlyReturns]);

  if (!geometry) return null;

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial vertexColors side={THREE.DoubleSide} />
    </mesh>
  );
}

const FALLBACK_STYLE: React.CSSProperties = {
  width: "100%", height: "100%",
  display: "flex", alignItems: "center", justifyContent: "center",
  color: "rgba(165,165,165,0.5)",
  fontFamily: "var(--font-montserrat,'Montserrat',sans-serif)",
  fontSize: 11, letterSpacing: "0.1em",
  background: "#0a0a0c",
};

export function VaRCVaRSurface({ monthlyReturns }: Props) {
  return (
    <Suspense fallback={<div style={FALLBACK_STYLE}>LOADING 3D</div>}>
      <Canvas style={{ width: "100%", height: "100%" }} camera={{ position: [10, -8, 18], fov: 52 }}>
        <ambientLight intensity={0.55} />
        <pointLight position={[15, 15, 20]} intensity={0.8} />
        <VaRMesh monthlyReturns={monthlyReturns} />
        <gridHelper args={[22, 8, 0x888888, 0x444444]} position={[10, -1, -7]} />
        <OrbitControls enablePan enableZoom enableRotate />
      </Canvas>
    </Suspense>
  );
}

export function VaRCVaRHeatmap({ monthlyReturns }: Props) {
  const result = useMemo(() => computeVaRSurface(monthlyReturns, CONFIDENCES, HORIZONS), [monthlyReturns]);

  if (!result) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: FONT_LABEL, fontSize: 9, color: "rgba(136,136,136,0.45)", letterSpacing: "0.1em" }}>
          NEED ≥ 12 MONTHS
        </span>
      </div>
    );
  }

  const { confidences, horizons, varMatrix, cvarMatrix } = result;
  const rows = confidences.length;
  const cols = horizons.length;
  const CELL_W = 44, CELL_H = 20;
  const LABEL_W = 38, LABEL_H = 24;
  const W = LABEL_W + cols * CELL_W + 8;
  const H = LABEL_H + rows * CELL_H * 2 + 30;

  const minVar = Math.min(...varMatrix.flat());
  const maxVar = Math.max(...varMatrix.flat(), -0.001);

  function fillColor(v: number, isVar: boolean) {
    // v is negative (loss); more negative = worse = gold; near-zero = gray
    // t=0 → near zero (gray), t=1 → worst loss (gold)
    const t = Math.max(0, Math.min(1, (minVar - v) / (minVar - maxVar + 1e-9)));
    if (isVar) {
      // gray → gold gradient
      const r = Math.round(55 + t * (201 - 55));
      const g = Math.round(55 + t * (168 - 55));
      const b = Math.round(55 + t * (76 - 55));
      return `rgb(${r},${g},${b})`;
    }
    // CVaR darker: gold shifted slightly deeper
    const r = Math.round(35 + t * (180 - 35));
    const g = Math.round(35 + t * (145 - 35));
    const b = Math.round(35 + t * (60 - 35));
    return `rgb(${r},${g},${b})`;
  }

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", overflow: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ maxWidth: "100%", maxHeight: "100%" }}>
        {/* Column headers (horizons) */}
        {horizons.map((h, j) => (
          <text key={`h${j}`} x={LABEL_W + j * CELL_W + CELL_W / 2} y={14} textAnchor="middle"
            style={{ fontFamily: FONT_LABEL, fontSize: 6.5, fill: "rgba(184,184,184,0.55)", letterSpacing: "0.04em" }}>
            {h}M
          </text>
        ))}

        {/* VaR rows */}
        <text x={LABEL_W - 3} y={LABEL_H + rows * CELL_H / 2} textAnchor="end"
          style={{ fontFamily: FONT_LABEL, fontSize: 6, fill: "rgba(201,168,76,0.6)", letterSpacing: "0.08em" }}>
          VAR
        </text>
        {confidences.map((conf, ci) =>
          horizons.map((_, hi) => {
            const v = varMatrix[ci]?.[hi] ?? 0;
            const fill = fillColor(v, true);
            return (
              <g key={`var-${ci}-${hi}`}>
                <rect x={LABEL_W + hi * CELL_W} y={LABEL_H + ci * CELL_H}
                  width={CELL_W - 1} height={CELL_H - 1} fill={fill} rx={1} />
                <text x={LABEL_W + hi * CELL_W + CELL_W / 2} y={LABEL_H + ci * CELL_H + CELL_H / 2 + 3}
                  textAnchor="middle"
                  style={{ fontFamily: FONT_LABEL, fontSize: 5.5, fill: "rgba(238,238,238,0.8)" }}>
                  {(v * 100).toFixed(1)}%
                </text>
              </g>
            );
          })
        )}

        {/* CVaR rows */}
        <text x={LABEL_W - 3} y={LABEL_H + rows * CELL_H + rows * CELL_H / 2 + 14} textAnchor="end"
          style={{ fontFamily: FONT_LABEL, fontSize: 6, fill: "rgba(201,168,76,0.6)", letterSpacing: "0.08em" }}>
          CVAR
        </text>
        {confidences.map((conf, ci) =>
          horizons.map((_, hi) => {
            const v = cvarMatrix[ci]?.[hi] ?? 0;
            const fill = fillColor(v, false);
            const y = LABEL_H + rows * CELL_H + 14 + ci * CELL_H;
            return (
              <g key={`cvar-${ci}-${hi}`}>
                <rect x={LABEL_W + hi * CELL_W} y={y}
                  width={CELL_W - 1} height={CELL_H - 1} fill={fill} rx={1} />
                <text x={LABEL_W + hi * CELL_W + CELL_W / 2} y={y + CELL_H / 2 + 3}
                  textAnchor="middle"
                  style={{ fontFamily: FONT_LABEL, fontSize: 5.5, fill: "rgba(238,238,238,0.8)" }}>
                  {(v * 100).toFixed(1)}%
                </text>
              </g>
            );
          })
        )}

        {/* Row labels (confidence) */}
        {confidences.map((conf, ci) => (
          <text key={`conf-${ci}`}
            x={LABEL_W - 3}
            y={LABEL_H + ci * CELL_H + CELL_H / 2 + 3}
            textAnchor="end"
            style={{ fontFamily: FONT_LABEL, fontSize: 5.5, fill: "rgba(140,140,140,0.5)" }}>
            {(conf * 100).toFixed(0)}%
          </text>
        ))}
        {confidences.map((conf, ci) => (
          <text key={`conf2-${ci}`}
            x={LABEL_W - 3}
            y={LABEL_H + rows * CELL_H + 14 + ci * CELL_H + CELL_H / 2 + 3}
            textAnchor="end"
            style={{ fontFamily: FONT_LABEL, fontSize: 5.5, fill: "rgba(140,140,140,0.5)" }}>
            {(conf * 100).toFixed(0)}%
          </text>
        ))}
      </svg>
    </div>
  );
}
