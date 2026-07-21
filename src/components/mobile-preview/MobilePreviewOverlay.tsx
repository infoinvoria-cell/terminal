"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useMobilePreview } from "@/context/mobile-preview-context";

// Desktop ↔ Mobile route maps
function toMobile(p: string): string {
  if (p.startsWith("/sentinel")) return "/m/sentinel";
  if (p.startsWith("/signal"))   return "/m/signale";
  if (p.startsWith("/brain"))    return "/m/brain";
  if (p.startsWith("/settings")) return "/m/settings";
  if (p.startsWith("/monitoring")) return "/m/signale";
  return "/m/home";
}
function toDesktop(p: string): string {
  if (p.startsWith("/m/sentinel")) return "/sentinel";
  if (p.startsWith("/m/signale"))  return "/signal";
  if (p.startsWith("/m/brain"))    return "/brain";
  if (p.startsWith("/m/settings")) return "/settings";
  return "/";
}

// iPhone 15 Pro physical proportions (390 × 844 logical)
const PHONE_W = 390;
const PHONE_H = 844;
const FRAME_PAD = 14; // frame padding around screen
const FRAME_R = 50;   // outer corner radius

function IPhoneFrame({ scale, mobileUrl, iframeRef }: {
  scale: number;
  mobileUrl: string;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
}) {
  const outerW = PHONE_W + FRAME_PAD * 2;
  const outerH = PHONE_H + FRAME_PAD * 2 + 24; // +24 for notch bump

  return (
    <div
      style={{
        width: outerW * scale,
        height: outerH * scale,
        flexShrink: 0,
        position: "relative",
      }}
    >
      <div
        style={{
          width: outerW,
          height: outerH,
          transformOrigin: "top left",
          transform: `scale(${scale})`,
          position: "absolute",
          top: 0,
          left: 0,
        }}
      >
        {/* Outer shell */}
        <div
          style={{
            width: outerW,
            height: outerH,
            borderRadius: FRAME_R,
            background: "linear-gradient(145deg, #2a2a2a 0%, #1a1a1a 100%)",
            boxShadow:
              "0 0 0 1px rgba(255,255,255,0.12), inset 0 0 0 1px rgba(0,0,0,0.5), 0 32px 80px rgba(0,0,0,0.8)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Side buttons left */}
          <div style={{ position: "absolute", left: -3, top: 100, width: 3, height: 32, background: "#2f2f2f", borderRadius: "3px 0 0 3px" }} />
          <div style={{ position: "absolute", left: -3, top: 148, width: 3, height: 52, background: "#2f2f2f", borderRadius: "3px 0 0 3px" }} />
          <div style={{ position: "absolute", left: -3, top: 214, width: 3, height: 52, background: "#2f2f2f", borderRadius: "3px 0 0 3px" }} />
          {/* Side button right */}
          <div style={{ position: "absolute", right: -3, top: 160, width: 3, height: 72, background: "#2f2f2f", borderRadius: "0 3px 3px 0" }} />

          {/* Screen area */}
          <div
            style={{
              position: "absolute",
              top: FRAME_PAD,
              left: FRAME_PAD,
              width: PHONE_W,
              height: PHONE_H + 24,
              borderRadius: FRAME_R - FRAME_PAD,
              overflow: "hidden",
              background: "#000",
            }}
          >
            {/* Notch */}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: "50%",
                transform: "translateX(-50%)",
                width: 120,
                height: 34,
                background: "#1a1a1a",
                borderRadius: "0 0 22px 22px",
                zIndex: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#2a2a2a" }} />
              <div style={{ width: 42, height: 8, borderRadius: 4, background: "#222" }} />
            </div>

            {/* Content iframe */}
            <iframe
              ref={iframeRef}
              src={mobileUrl}
              style={{
                width: PHONE_W,
                height: PHONE_H,
                border: "none",
                marginTop: 34,
                display: "block",
              }}
              title="Mobile Preview"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function MobilePreviewOverlay() {
  const { mode } = useMobilePreview();
  const pathname = usePathname();
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(1);

  const mobileUrl = toMobile(pathname);
  const outerH = PHONE_H + FRAME_PAD * 2 + 24;
  const outerW = PHONE_W + FRAME_PAD * 2;

  // Recalculate scale on resize
  useEffect(() => {
    const calc = () => {
      const avH = window.innerHeight - 32;
      const avW = mode === "split" ? 440 : window.innerWidth - 64;
      const s = Math.min(avH / outerH, avW / outerW, 1);
      setScale(Math.max(s, 0.3));
    };
    calc();
    window.addEventListener("resize", calc, { passive: true });
    return () => window.removeEventListener("resize", calc);
  }, [mode, outerH, outerW]);

  // Sync desktop pathname → iframe src (one-way push)
  useEffect(() => {
    const target = mobileUrl;
    if (iframeRef.current) {
      try {
        const curr = iframeRef.current.contentWindow?.location.pathname ?? "";
        if (curr !== target) iframeRef.current.src = target;
      } catch {
        iframeRef.current.src = target;
      }
    }
  }, [mobileUrl]);

  // Push body right margin when split so desktop isn't hidden behind phone panel
  useEffect(() => {
    const panelW = mode === "split" ? outerW * scale + 32 : 0;
    document.documentElement.style.setProperty("--mobile-preview-panel-w", `${panelW}px`);
    return () => { document.documentElement.style.setProperty("--mobile-preview-panel-w", "0px"); };
  }, [mode, outerW, scale]);

  // Listen for mobile iframe nav → update desktop (two-way sync)
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type !== "capitalife-nav") return;
      const mobilePath: string = e.data.path;
      const desk = toDesktop(mobilePath);
      if (desk !== pathname) router.replace(desk);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [pathname, router]);

  if (mode === "desktop") return null;

  if (mode === "mobile") {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 900,
          background: "#000",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <IPhoneFrame scale={scale} mobileUrl={mobileUrl} iframeRef={iframeRef} />
      </div>
    );
  }

  // Split view: desktop stays visible (z-index normal), overlay is a sidebar panel
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        zIndex: 900,
        width: outerW * scale + 32,
        background: "#070809",
        borderLeft: "1px solid rgba(255,255,255,0.07)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <IPhoneFrame scale={scale} mobileUrl={mobileUrl} iframeRef={iframeRef} />
    </div>
  );
}
