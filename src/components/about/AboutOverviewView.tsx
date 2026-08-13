import {
  Layers, Calendar, Clock, Globe, Shield,
  RefreshCw, BarChart2, Target, CheckCircle, TrendingUp,
} from "lucide-react";
import {
  ABOUT_STRATEGIES, ABOUT_COMPARISON, ABOUT_INVESTOR, ABOUT_RISK,
  ABOUT_TRACK_RECORD, ABOUT_ZEITHORIZONT, ABOUT_ECKDATEN,
  ABOUT_WS_SLEEVES, ABOUT_CI_ALLOC, ABOUT_CORRELATION,
} from "@/lib/about/about-data";

const M = "var(--font-montserrat, 'Montserrat', sans-serif)";
const N = "var(--font-numbers, 'Nunito', sans-serif)";
const CARD = "rounded-[14px] border border-white/[0.055] bg-gradient-to-b from-[#26262d] to-[#111114] shadow-[0_12px_32px_-12px_rgba(0,0,0,0.6)]";
const SHADES = ["var(--dash-accent)", "rgba(226,202,122,0.62)", "rgba(226,202,122,0.38)", "rgba(255,255,255,0.16)", "rgba(255,255,255,0.09)"];

const ICON_MAP: Record<string, React.ReactNode> = {
  Layers: <Layers size={11} />,
  Globe: <Globe size={11} />,
  Clock: <Clock size={11} />,
  Calendar: <Calendar size={11} />,
  CheckCircle: <CheckCircle size={11} />,
  Target: <Target size={11} />,
  RefreshCw: <RefreshCw size={11} />,
  BarChart2: <BarChart2 size={11} />,
};

const ALLOC: Record<string, readonly { label: string; pct: number }[]> = {
  ws: ABOUT_WS_SLEEVES.map((s) => ({ label: s.label, pct: s.pct })),
  ci: [...ABOUT_CI_ALLOC],
};

const HORIZON_ROWS = (() => {
  const seen = new Set<string>();
  return [...ABOUT_INVESTOR, ...ABOUT_ZEITHORIZONT].filter((r) => {
    if (seen.has(r.key)) return false;
    seen.add(r.key);
    return true;
  });
})();

export function AboutOverviewView() {
  return (
    <>
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-2.5">
        {ABOUT_STRATEGIES.map((s) => (
          <div key={s.id} className={`flex min-h-0 flex-col justify-between gap-3 overflow-hidden p-5 ${CARD}`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[color:var(--dash-muted)]" style={{ fontFamily: M }}>{s.number} - {s.type}</p>
                <h2 className="mt-1 text-[24px] font-bold leading-none text-white" style={{ fontFamily: N, letterSpacing: "-0.02em" }}>{s.name}</h2>
              </div>
              <BadgeEl color={s.badgeColor}>{s.badge}</BadgeEl>
            </div>

            <div className="flex items-end gap-5">
              <div>
                <p className="text-[9px] uppercase tracking-widest text-[color:var(--dash-muted)]" style={{ fontFamily: M }}>{s.stats[0].label}</p>
                <p className="text-[38px] font-bold leading-none text-[color:var(--dash-accent)]" style={{ fontFamily: N, letterSpacing: "-0.03em" }}>{s.stats[0].value}</p>
              </div>
              <div className="mb-0.5 grid flex-1 grid-cols-3 gap-2">
                {s.stats.slice(1).map((st) => (
                  <MiniStat key={st.label} label={st.label} value={st.value} color={st.color} />
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-widest text-[color:var(--dash-muted)]" style={{ fontFamily: M }}>
                {s.id === "ws" ? "Sleeve-Verteilung - 35 Strategien" : "Gewichtung v2.0"}
              </p>
              <AllocBar segments={ALLOC[s.id]} />
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-2 border-t border-white/[0.05] pt-3.5">
              {s.details.map((d) => (
                <Row key={d.key} icon={ICON_MAP[d.icon]} k={d.key} v={d.value} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[1fr_340px] gap-2.5">
        <div className={`flex min-h-0 flex-col overflow-hidden ${CARD}`}>
          <SectionBar icon={<BarChart2 size={12} />} label="Vergleich - risiko-adjustiert" note="Sharpe & Calmar verifiziert - Benchmarks geschaetzt" />
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-[#111114]">
                <tr className="border-b border-white/[0.05]">
                  {["Asset", "CAGR p.a.", "Max DD", "Sharpe", "Calmar", "Korr. SPY"].map((h) => (
                    <th key={h} className="px-4 py-1.5 text-left text-[9px] font-semibold uppercase tracking-wider text-[color:var(--dash-muted)]" style={{ fontFamily: M }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {ABOUT_COMPARISON.map((r) => (
                  <TRow key={r.name} {...r} />
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className={`flex min-h-0 flex-col overflow-hidden p-4 ${CARD}`}>
          <SectionHead icon={<Target size={12} />} label="Korrelation zu SPY" />
          <p className="mt-0.5 text-[9px] text-[color:var(--dash-muted)]" style={{ fontFamily: M }}>Geschaetzt - niedriger = mehr Diversifikation</p>
          <div className="mt-3 flex flex-1 flex-col justify-between gap-1.5">
            {ABOUT_CORRELATION.map((c) => (
              <CorrBar key={c.name} name={c.name} corr={c.corr} accent={c.accent} />
            ))}
          </div>
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-3 gap-2.5">
        <div className={`flex flex-col overflow-hidden p-4 ${CARD}`}>
          <SectionHead icon={<TrendingUp size={12} />} label="White Swan - Live-Track-Record" />
          <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2">
            {ABOUT_TRACK_RECORD.map(({ key, value }) => <KV key={key} k={key} v={value} />)}
          </div>
        </div>
        <div className={`flex flex-col overflow-hidden p-4 ${CARD}`}>
          <SectionHead icon={<Clock size={12} />} label="Anlagehorizont & Konditionen" />
          <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2">
            {HORIZON_ROWS.slice(0, 10).map(({ key, value }) => <KV key={key} k={key} v={value} />)}
          </div>
        </div>
        <div className={`flex flex-col overflow-hidden p-4 ${CARD}`}>
          <SectionHead icon={<Shield size={12} />} label="Risiko & Aufbau" />
          <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2">
            {ABOUT_RISK.map(({ key, value }) => <KV key={key} k={key} v={value} />)}
            {ABOUT_ECKDATEN.slice(4, 6).map(({ key, value }) => <KV key={key} k={key} v={value} />)}
          </div>
        </div>
      </div>
    </>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: "gold" | "red" | "white" }) {
  const c = color === "gold" ? "text-[color:var(--dash-accent)]" : color === "red" ? "text-red-400/90" : "text-white";
  return (
    <div className="rounded-[10px] border border-white/[0.055] bg-white/[0.025] px-2.5 py-2">
      <p className="text-[8px] uppercase tracking-wider" style={{ fontFamily: M, color: "rgba(180,192,210,0.6)", letterSpacing: "0.04em" }}>{label}</p>
      <p className={`mt-0.5 text-[16px] font-bold leading-none ${c}`} style={{ fontFamily: N }}>{value}</p>
    </div>
  );
}

function AllocBar({ segments }: { segments: readonly { label: string; pct: number }[] }) {
  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full border border-white/[0.06]">
        {segments.map((s, i) => (
          <div key={s.label} style={{ width: `${s.pct}%`, background: SHADES[i % SHADES.length] }} title={`${s.label} ${s.pct}%`} />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
        {segments.map((s, i) => (
          <span key={s.label} className="flex items-center gap-1 text-[9px] text-[color:var(--dash-muted)]" style={{ fontFamily: M }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: SHADES[i % SHADES.length] }} />
            {s.label} <span className="text-white/80">{s.pct}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function CorrBar({ name, corr, accent }: { name: string; corr: number; accent: boolean }) {
  const w = Math.max(2, Math.min(100, ((corr + 0.1) / 1.1) * 100));
  return (
    <div className="flex items-center gap-2">
      <span className={`w-[86px] shrink-0 truncate text-[10px] ${accent ? "font-medium text-[color:var(--dash-accent)]" : "text-[color:var(--dash-muted)]"}`} style={{ fontFamily: M }}>{name}</span>
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${w}%`, background: accent ? "var(--dash-accent)" : "rgba(255,255,255,0.28)" }} />
      </div>
      <span className={`w-9 shrink-0 text-right text-[10px] font-semibold ${accent ? "text-[color:var(--dash-accent)]" : "text-white/70"}`} style={{ fontFamily: N }}>{corr.toFixed(2)}</span>
    </div>
  );
}

function Row({ icon, k, v }: { icon: React.ReactNode; k: string; v: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="shrink-0 text-[color:var(--dash-accent)]/70">{icon}</span>
      <span className="shrink-0 text-[10px] text-[color:var(--dash-muted)]" style={{ fontFamily: M }}>{k}</span>
      <span className="ml-auto truncate text-right text-[10px] font-medium text-white" style={{ fontFamily: M }}>{v}</span>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="shrink-0 text-[10px] text-[color:var(--dash-muted)]" style={{ fontFamily: M }}>{k}</span>
      <span className="truncate text-right text-[10px] font-medium text-white" style={{ fontFamily: M }}>{v}</span>
    </div>
  );
}

function SectionHead({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <span className="shrink-0" style={{ color: "#D6B24A" }}>{icon}</span>
      <p className="text-[11px] font-[700] uppercase" style={{ fontFamily: M, color: "#f5f7fa", letterSpacing: "0.04em" }}>{label}</p>
    </div>
  );
}

function SectionBar({ icon, label, note }: { icon: React.ReactNode; label: string; note: string }) {
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-white/[0.055] px-4 py-2.5">
      <div className="flex items-center gap-1.5">
        <span style={{ color: "#D6B24A" }}>{icon}</span>
        <p className="text-[11px] font-[700] uppercase" style={{ fontFamily: M, color: "#f5f7fa", letterSpacing: "0.04em" }}>{label}</p>
      </div>
      <p className="text-[9px]" style={{ fontFamily: M, color: "rgba(180,192,210,0.6)" }}>{note}</p>
    </div>
  );
}

function BadgeEl({ children, color }: { children: React.ReactNode; color: "gold" | "blue" }) {
  const cls = color === "gold"
    ? "border-[color:var(--dash-accent)]/30 bg-[color:var(--dash-accent)]/10 text-[color:var(--dash-accent)]"
    : "border-blue-400/30 bg-blue-400/10 text-blue-400";
  return <span className={`mt-0.5 shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${cls}`} style={{ fontFamily: M }}>{children}</span>;
}

function TRow({ name, tag, cagr, dd, sharpe, calmar, corrSpy, accent }: {
  name: string; tag: string; cagr: string; dd: string; sharpe: string; calmar: string; corrSpy: string; accent: boolean;
}) {
  return (
    <tr className={accent ? "bg-[color:var(--dash-accent)]/[0.03]" : ""}>
      <td className="px-4 py-2.5">
        <span className={`text-[11px] font-medium ${accent ? "text-[color:var(--dash-accent)]" : "text-white"}`} style={{ fontFamily: M }}>{name}</span>
        {tag && <span className={`ml-1.5 rounded px-1 py-0.5 text-[8px] font-semibold ${accent ? "bg-[color:var(--dash-accent)]/15 text-[color:var(--dash-accent)]" : "bg-white/[0.06] text-zinc-500"}`}>{tag}</span>}
      </td>
      <td className="px-4 py-2.5 text-[11px] font-semibold text-[color:var(--dash-accent)]" style={{ fontFamily: N }}>{cagr}</td>
      <td className="px-4 py-2.5 text-[11px] font-semibold text-red-400" style={{ fontFamily: N }}>{dd}</td>
      <td className="px-4 py-2.5 text-[11px] text-white" style={{ fontFamily: N }}>{sharpe}</td>
      <td className="px-4 py-2.5 text-[11px] text-white" style={{ fontFamily: N }}>{calmar}</td>
      <td className="px-4 py-[7px] text-[10px] text-[color:var(--dash-muted)]" style={{ fontFamily: M }}>{corrSpy}</td>
    </tr>
  );
}
