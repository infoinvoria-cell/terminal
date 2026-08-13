"use client";

import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { AnalyticsSeriesPoint } from "@/lib/analytics/portfolio-data";
import { extractDrawdownEvents } from "@/lib/modeling/transforms";
import type { DrawdownEvent } from "@/lib/modeling/types";

type Props = {
  performanceSeries: AnalyticsSeriesPoint[];
};

function ScatterSpheres({ events }: { events: DrawdownEvent[] }) {
  const spheres = useMemo(() => {
    if (!events.length) return [];

    // Normalize axes to 0–20 world units
    const maxDuration = Math.max(...events.map((e) => e.duration), 1);
    const maxDepth = Math.max(...events.map((e) => Math.abs(e.depth)), 1);
    const maxRecovery = Math.max(
      ...events.map((e) => e.recoveryDays ?? 0),
      1
    );

    return events.map((e, i) => {
      const x = (e.duration / maxDuration) * 20;
      const y = (Math.abs(e.depth) / maxDepth) * 20;
      const z = ((e.recoveryDays ?? 0) / maxRecovery) * 20;
      const open = e.recoveryDays === null;
      return { key: i, position: [x, y, z] as [number, number, number], open };
    });
  }, [events]);

  return (
    <>
      {spheres.map(({ key, position, open }) => (
        <mesh key={key} position={position}>
          <sphereGeometry args={[0.8, 8, 8]} />
          <meshStandardMaterial color={open ? "#C9A84C" : "#8ea5bc"} />
        </mesh>
      ))}
    </>
  );
}

export function DrawdownRecovery3D({ performanceSeries }: Props) {
  const events = useMemo(
    () => extractDrawdownEvents(performanceSeries),
    [performanceSeries]
  );

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
        camera={{ position: [10, 10, 25], fov: 50 }}
      >
        <ambientLight intensity={0.6} />
        <pointLight position={[20, 20, 20]} intensity={0.8} />
        <ScatterSpheres events={events} />
        <gridHelper args={[24, 8, 0x888888, 0x444444]} position={[10, -1, 10]} />
        <OrbitControls enablePan={true} enableZoom={true} enableRotate={true} />
      </Canvas>
    </Suspense>
  );
}
