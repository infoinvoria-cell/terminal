import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import { AboutInnoView } from "@/components/about/AboutInnoView";
import { AboutModeTabs } from "@/components/about/AboutModeTabs";
import { AboutOverviewView } from "@/components/about/AboutOverviewView";

export const metadata: Metadata = { title: "Bibel - Capitalife" };

export default async function AboutPage(props: PageProps<"/about">) {
  const searchParams = await props.searchParams;
  const mode = searchParams?.mode === "inno" ? "inno" : "overview";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden px-7 pb-4 pt-3.5">
      <AboutOverviewHeader mode={mode} />
      <div className="shrink-0">
        <AboutModeTabs activeMode={mode} />
      </div>
      {mode === "inno" ? <AboutInnoView /> : <AboutOverviewView />}
    </div>
  );
}

function AboutOverviewHeader({ mode }: { mode: "overview" | "inno" }) {
  const M = "var(--font-montserrat), sans-serif";
  const N = "var(--font-nunito), sans-serif";

  return (
    <div className="flex shrink-0 items-center justify-between">
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-[color:var(--dash-accent)]/25 bg-[color:var(--dash-accent)]/10">
          <BookOpen size={14} className="text-[color:var(--dash-accent)]" />
        </div>
        <div>
          <div className="flex items-baseline gap-2">
            <h1 className="text-[15px] font-bold leading-none text-white" style={{ fontFamily: N }}>Bibel</h1>
            <span className="text-[10px] text-[color:var(--dash-muted)]" style={{ fontFamily: M }}>
              {mode === "overview" ? "Zwei unkorrelierte Strategien - internes Referenzblatt" : "INNO Vorbereitung - Due-Diligence-Modus"}
            </span>
          </div>
          <p className="mt-1 text-[9px] uppercase tracking-widest text-[color:var(--dash-muted)]" style={{ fontFamily: M }}>
            Intern - kein Angebot - nicht geprueft
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {mode === "overview" ? (
          <>
            <HeroChip label="White Swan - Live" value="+35.2% p.a." sub="seit Apr 2024" />
            <HeroChip label="Core Invest - Backtest" value="+17.1% OOS" sub="Paper - Pre-Fund" muted />
          </>
        ) : (
          <>
            <HeroChip label="Tactical - Statement" value="11.04.2024 - 01.07.2026" sub="report-basiert" />
            <HeroChip label="Strategic - Status" value="kein Live-Record" sub="separat pruefen" muted />
          </>
        )}
      </div>
    </div>
  );
}

function HeroChip({ label, value, sub, muted }: { label: string; value: string; sub: string; muted?: boolean }) {
  const M = "var(--font-montserrat), sans-serif";
  const N = "var(--font-nunito), sans-serif";
  return (
    <div className={`rounded-xl border px-3.5 py-2 ${muted ? "border-white/[0.08] bg-white/[0.02]" : "border-[color:var(--dash-accent)]/25 bg-[color:var(--dash-accent)]/[0.06]"}`}>
      <p className="text-[8px] font-semibold uppercase tracking-widest text-[color:var(--dash-muted)]" style={{ fontFamily: M }}>{label}</p>
      <p className={`text-[16px] font-bold leading-tight ${muted ? "text-white" : "text-[color:var(--dash-accent)]"}`} style={{ fontFamily: N }}>{value}</p>
      <p className="text-[8px] text-[color:var(--dash-muted)]" style={{ fontFamily: M }}>{sub}</p>
    </div>
  );
}
