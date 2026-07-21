"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

const STORAGE_KEY = "cl_intro";
const TOTAL_MS = 2000;

function markIntroAsSeen() {
  try {
    sessionStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Das Intro darf auch bei blockiertem Storage sauber enden.
  }
}

export default function IntroAnimation() {
  const [shouldPlay, setShouldPlay] = useState(false);

  const overlayRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const logoLayerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    try {
      if (sessionStorage.getItem(STORAGE_KEY) === "1") {
        return;
      }
    } catch {
      // Bei blockiertem Storage einmal abspielen.
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      markIntroAsSeen();
      return;
    }

    setShouldPlay(true);
  }, []);

  useEffect(() => {
    if (!shouldPlay) return;

    const overlay = overlayRef.current;
    const stage = stageRef.current;
    const logoLayer = logoLayerRef.current;
    const progress = progressRef.current;

    if (!overlay || !stage || !logoLayer || !progress) {
      markIntroAsSeen();
      setShouldPlay(false);
      return;
    }

    const logoWidth = logoLayer.getBoundingClientRect().width;

    /*
     * Der Icon-Bereich nimmt im vollständigen Logo etwa 9,28 % ein.
     * Das vollständige Logo wird deshalb anfangs nach rechts verschoben,
     * sodass genau dieser Ausschnitt mittig steht.
     *
     * Wichtig: Es wird während der gesamten Animation nur dieser eine
     * Logo-Layer benutzt. Es findet kein Bildwechsel statt.
     */
    const iconFraction = 190 / 2048;
    const centeredIconShift = logoWidth * (0.5 - iconFraction / 2);

    const animations: Animation[] = [];

    animations.push(
      logoLayer.animate(
        [
          {
            opacity: 0,
            transform: `translateX(${centeredIconShift}px) translateY(7px) scale(0.9)`,
            clipPath: `inset(0 ${(1 - iconFraction) * 100}% 0 0)`,
            offset: 0,
          },
          {
            opacity: 1,
            transform: `translateX(${centeredIconShift}px) translateY(0px) scale(1)`,
            clipPath: `inset(0 ${(1 - iconFraction) * 100}% 0 0)`,
            offset: 0.24,
          },
          {
            opacity: 1,
            transform: `translateX(${centeredIconShift}px) translateY(0px) scale(1)`,
            clipPath: `inset(0 ${(1 - iconFraction) * 100}% 0 0)`,
            offset: 0.32,
          },
          {
            opacity: 1,
            transform: "translateX(0px) translateY(0px) scale(1)",
            clipPath: "inset(0 0% 0 0)",
            offset: 0.7,
          },
          {
            opacity: 1,
            transform: "translateX(0px) translateY(0px) scale(1)",
            clipPath: "inset(0 0% 0 0)",
            offset: 0.825,
          },
          {
            opacity: 0,
            transform: "translateX(0px) translateY(-2px) scale(0.995)",
            clipPath: "inset(0 0% 0 0)",
            offset: 1,
          },
        ],
        {
          duration: TOTAL_MS,
          easing: "linear",
          fill: "forwards",
        },
      ),
    );

    /*
     * Die Kurven werden auf einzelne Segmente verteilt:
     * - ruhiger Icon-Auftritt
     * - geschmeidiges Öffnen des Logos
     * - dezenter Abschluss
     */
    const segmentAnimations = [
      logoLayer.animate(
        [
          {
            transform: `translateX(${centeredIconShift}px) translateY(7px) scale(0.9)`,
          },
          {
            transform: `translateX(${centeredIconShift}px) translateY(0px) scale(1)`,
          },
        ],
        {
          duration: 480,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "forwards",
        },
      ),
      logoLayer.animate(
        [
          {
            transform: `translateX(${centeredIconShift}px) translateY(0px) scale(1)`,
            clipPath: `inset(0 ${(1 - iconFraction) * 100}% 0 0)`,
          },
          {
            transform: "translateX(0px) translateY(0px) scale(1)",
            clipPath: "inset(0 0% 0 0)",
          },
        ],
        {
          delay: 640,
          duration: 760,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          fill: "forwards",
        },
      ),
    ];

    animations.push(...segmentAnimations);

    animations.push(
      progress.animate(
        [
          { opacity: 0, transform: "scaleX(0)" },
          { opacity: 0.55, transform: "scaleX(0)", offset: 0.12 },
          { opacity: 0.55, transform: "scaleX(1)", offset: 0.82 },
          { opacity: 0, transform: "scaleX(1)", offset: 1 },
        ],
        {
          delay: 360,
          duration: 1180,
          easing: "cubic-bezier(0.4, 0, 0.2, 1)",
          fill: "forwards",
        },
      ),
    );

    animations.push(
      stage.animate(
        [
          { opacity: 1 },
          { opacity: 1, offset: 0.825 },
          { opacity: 0 },
        ],
        {
          duration: TOTAL_MS,
          easing: "ease-out",
          fill: "forwards",
        },
      ),
    );

    animations.push(
      overlay.animate(
        [
          { opacity: 1 },
          { opacity: 1, offset: 0.825 },
          { opacity: 0 },
        ],
        {
          duration: TOTAL_MS,
          easing: "ease-out",
          fill: "forwards",
        },
      ),
    );

    const timer = window.setTimeout(() => {
      markIntroAsSeen();
      setShouldPlay(false);
    }, TOTAL_MS);

    return () => {
      window.clearTimeout(timer);
      animations.forEach((animation) => animation.cancel());
    };
  }, [shouldPlay]);

  if (!shouldPlay) return null;

  return (
    <div
      ref={overlayRef}
      aria-hidden="true"
      className="fixed inset-0 z-[9999] grid place-items-center overflow-hidden bg-black"
    >
      <div
        ref={stageRef}
        className="relative flex w-full flex-col items-center justify-center"
      >
        <div className="relative flex h-[clamp(130px,18vw,220px)] w-full items-center justify-center">
          <div
            ref={logoLayerRef}
            className="pointer-events-none absolute w-[min(88vw,1080px)] opacity-0"
            style={{
              clipPath: "inset(0 90.72% 0 0)",
              willChange: "transform, opacity, clip-path",
            }}
          >
            <img
              src="/logo.png"
              alt=""
              draggable={false}
              className="block h-auto w-full select-none"
            />
          </div>
        </div>

        <div className="mt-5 h-px w-36 overflow-hidden bg-white/[0.07]">
          <div
            ref={progressRef}
            className="h-full w-full origin-left opacity-0"
            style={{
              background:
                "linear-gradient(90deg, #c9a227 0%, #e2ca7a 100%)",
              transform: "scaleX(0)",
              willChange: "transform, opacity",
            }}
          />
        </div>
      </div>
    </div>
  );
}
