import type { Metadata } from "next";
import {
  Info, TrendingUp, TrendingDown, Activity, Zap,
  Layers, Calendar, Clock, Globe, Shield, Wallet,
  RefreshCw, BarChart2, Target, CheckCircle,
} from "lucide-react";
import {
  ABOUT_STRATEGIES, ABOUT_COMPARISON, ABOUT_INVESTOR,
  ABOUT_RISK, ABOUT_TRACK_RECORD, ABOUT_ZEITHORIZONT, ABOUT_ECKDATEN,
} from "@/lib/about/about-data";

export const metadata: Metadata = { title: "Info Panel — Capitalife" };

const M = "var(--font-montserrat), sans-serif";
const N = "var(--font-nunito), sans-serif";

const ICON_MAP: Record<string, React.ReactNode> = {
  Layers:      <Layers size={12} />,
  Globe:       <Globe size={12} />,
  Clock:       <Clock size={12} />,
  Calendar:    <Calendar size={12} />,
  CheckCircle: <CheckCircle size={12} />,
  Target:      <Target size={12} />,
  RefreshCw:   <RefreshCw size={12} />,
};

export default function AboutPage() {
  return (
    <div className="relative flex h-full w-full flex-col">
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="px-8 pb-20 pt-5">

          {/* HEADER */}
          <div className="mb-6 flex items-center gap-2.5">
            <Info size={16} className="shrink-0 text-[color:var(--dash-accent)]" />
            <div>
              <h1 className="text-[13px] font-bold leading-none text-white" style={{ fontFamily: N }}>Info Panel</h1>
              <p className="mt-0.5 text-[10px] text-[color:var(--dash-muted)]" style={{ fontFamily: M }}>Intern · kein Angebot · nicht geprüft</p>
            </div>
          </div>

          {/* ROW 1 — Zwei Strategien */}
          <div className="mb-5 grid grid-cols-2 gap-5">
            {ABOUT_STRATEGIES.map((s) => (
              <div key={s.id} className="rounded-[20px] border border-white/[0.07] bg-gradient-to-b from-[#1e1f22] to-[#151618] p-7 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.6)]">
                <div className="mb-5 flex items-start justify-between">
                  <div>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-[color:var(--dash-muted)]" style={{ fontFamily: M }}>{s.number} · {s.type}</p>
                    <h2 className="text-[26px] font-bold text-white" style={{ fontFamily: N, letterSpacing: "-0.02em" }}>{s.name}</h2>
                  </div>
                  <BadgeEl color={s.badgeColor}>{s.badge}</BadgeEl>
                </div>
                <div className="mb-5 grid grid-cols-4 gap-3">
                  {s.stats.map((st) => (
                    <BigStat key={st.label} label={st.label} value={st.value} color={st.color} />
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-x-8 gap-y-2.5">
                  {s.details.map((d) => (
                    <Row key={d.key} icon={ICON_MAP[d.icon]} k={d.key} v={d.value} />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* ROW 2 — Vergleich + Investor/Risiko */}
          <div className="mb-5 grid grid-cols-[1fr_280px] gap-5">
            <div className="rounded-[20px] border border-white/[0.07] bg-gradient-to-b from-[#1e1f22] to-[#151618] shadow-[0_16px_40px_-16px_rgba(0,0,0,0.6)]">
              <div className="flex items-center gap-2 border-b border-white/[0.05] px-6 py-3.5">
                <BarChart2 size={13} className="text-[color:var(--dash-accent)]" />
                <p className="text-[11px] font-semibold uppercase tracking-widest text-[color:var(--dash-accent)]" style={{ fontFamily: M }}>Vergleich · Anlageklassen</p>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.04]">
                    {["Strategie / Asset","CAGR","Max DD","Sharpe","Calmar","Horizont","Korr. zu WS"].map(h => (
                      <th key={h} className="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[color:var(--dash-muted)]" style={{ fontFamily: M }}>{h}</th>
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
            <div className="flex flex-col gap-5">
              <div className="flex-1 rounded-[20px] border border-white/[0.07] bg-gradient-to-b from-[#1e1f22] to-[#151618] p-5 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.6)]">
                <SectionHead icon={<Wallet size={13} />} label="Für Investoren" />
                <div className="mt-3 space-y-2.5">
                  {ABOUT_INVESTOR.map(({ key, value }) => <KV key={key} k={key} v={value} />)}
                </div>
              </div>
              <div className="flex-1 rounded-[20px] border border-white/[0.07] bg-gradient-to-b from-[#1e1f22] to-[#151618] p-5 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.6)]">
                <SectionHead icon={<Shield size={13} />} label="Risikoprofil" />
                <div className="mt-3 space-y-2.5">
                  {ABOUT_RISK.map(({ key, value }) => <KV key={key} k={key} v={value} />)}
                </div>
              </div>
            </div>
          </div>

          {/* ROW 3 — Track Record / Zeithorizont / Eckdaten */}
          <div className="grid grid-cols-3 gap-5">
            <div className="rounded-[20px] border border-white/[0.07] bg-gradient-to-b from-[#1e1f22] to-[#151618] p-5 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.6)]">
              <SectionHead icon={<TrendingUp size={13} />} label="Track Record · Live CFD" />
              <div className="mt-3 space-y-2.5">
                {ABOUT_TRACK_RECORD.map(({ key, value }) => <KV key={key} k={key} v={value} />)}
              </div>
            </div>
            <div className="rounded-[20px] border border-white/[0.07] bg-gradient-to-b from-[#1e1f22] to-[#151618] p-5 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.6)]">
              <SectionHead icon={<Clock size={13} />} label="Zeithorizont" />
              <div className="mt-3 space-y-2.5">
                {ABOUT_ZEITHORIZONT.map(({ key, value }) => <KV key={key} k={key} v={value} />)}
              </div>
            </div>
            <div className="rounded-[20px] border border-white/[0.07] bg-gradient-to-b from-[#1e1f22] to-[#151618] p-5 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.6)]">
              <SectionHead icon={<Globe size={13} />} label="Eckdaten" />
              <div className="mt-3 space-y-2.5">
                {ABOUT_ECKDATEN.map(({ key, value }) => <KV key={key} k={key} v={value} />)}
              </div>
            </div>
          </div>

        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16" style={{ background: "linear-gradient(to top, #0a0a0c 0%, transparent 100%)" }} />
    </div>
  );
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function BigStat({ label, value, color }: { label: string; value: string; color: "gold"|"red"|"white" }) {
  const c = color === "gold" ? "text-[color:var(--dash-accent)]" : color === "red" ? "text-zinc-400" : "text-white";
  return (
    <div className="rounded-[12px] border border-white/[0.05] bg-white/[0.03] px-4 py-3">
      <p className="mb-1.5 text-[10px] text-[color:var(--dash-muted)]" style={{ fontFamily: M }}>{label}</p>
      <p className={`text-[22px] font-bold leading-none ${c}`} style={{ fontFamily: N }}>{value}</p>
    </div>
  );
}

function Row({ icon, k, v }: { icon: React.ReactNode; k: string; v: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-[color:var(--dash-muted)]">{icon}</span>
      <span className="text-[11px] text-[color:var(--dash-muted)]" style={{ fontFamily: M }}>{k}</span>
      <span className="ml-auto text-right text-[11px] font-medium text-white" style={{ fontFamily: M }}>{v}</span>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="shrink-0 text-[11px] text-[color:var(--dash-muted)]" style={{ fontFamily: M }}>{k}</span>
      <span className="text-right text-[11px] font-medium text-white" style={{ fontFamily: M }}>{v}</span>
    </div>
  );
}

function SectionHead({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[color:var(--dash-accent)]">{icon}</span>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-[color:var(--dash-accent)]" style={{ fontFamily: M }}>{label}</p>
    </div>
  );
}

function BadgeEl({ children, color }: { children: React.ReactNode; color: "gold"|"blue" }) {
  const cls = color === "gold"
    ? "border-[color:var(--dash-accent)]/30 bg-[color:var(--dash-accent)]/10 text-[color:var(--dash-accent)]"
    : "border-blue-400/30 bg-blue-400/10 text-blue-400";
  return <span className={`mt-1 shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold ${cls}`} style={{ fontFamily: M }}>{children}</span>;
}

function TRow({ name, tag, cagr, dd, sharpe, calmar, horizon, corrSpy, accent }: {
  name: string; tag: string; cagr: string; dd: string;
  sharpe: string; calmar: string; horizon: string; corrSpy: string; accent: boolean;
}) {
  return (
    <tr className={accent ? "bg-[color:var(--dash-accent)]/[0.03]" : ""}>
      <td className="px-5 py-2.5">
        <span className={`text-[12px] font-medium ${accent ? "text-[color:var(--dash-accent)]" : "text-white"}`} style={{ fontFamily: M }}>{name}</span>
        {tag && <span className={`ml-1.5 rounded px-1 py-0.5 text-[9px] font-semibold ${accent ? "bg-[color:var(--dash-accent)]/15 text-[color:var(--dash-accent)]" : "bg-white/[0.06] text-zinc-500"}`}>{tag}</span>}
      </td>
      <td className="px-5 py-2.5 text-[12px] font-semibold text-[color:var(--dash-accent)]" style={{ fontFamily: N }}>{cagr}</td>
      <td className="px-5 py-2.5 text-[12px] font-semibold text-red-400" style={{ fontFamily: N }}>{dd}</td>
      <td className="px-5 py-2.5 text-[12px] text-white" style={{ fontFamily: N }}>{sharpe}</td>
      <td className="px-5 py-2.5 text-[12px] text-white" style={{ fontFamily: N }}>{calmar}</td>
      <td className="px-5 py-2.5 text-[11px] text-[color:var(--dash-muted)]" style={{ fontFamily: M }}>{horizon}</td>
      <td className="px-5 py-2.5 text-[11px] text-[color:var(--dash-muted)]" style={{ fontFamily: M }}>{corrSpy}</td>
    </tr>
  );
}
