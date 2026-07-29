import {
  AlertTriangle, BookOpen, Boxes, BriefcaseBusiness, Building2, CircleHelp, Database, FileText, ShieldAlert,
} from "lucide-react";
import {
  INNO_COST_ROWS,
  INNO_DATA_GAPS_ROWS,
  INNO_IBKR_ROWS,
  INNO_MEETING_BRIEF,
  INNO_OVERVIEW_METRICS,
  INNO_RISK_ROWS,
  INNO_SOURCE_REGISTER,
  INNO_STRATEGY_CARDS,
  INNO_TRACK_RECORD_ROWS,
  type InnoSourceRef,
  type InnoStatusTone,
  type InnoTableRow,
} from "@/lib/about/about-inno-data";

const M = "var(--font-montserrat), sans-serif";
const N = "var(--font-nunito), sans-serif";
const CARD = "rounded-[18px] border border-white/[0.07] bg-gradient-to-b from-[#1e1f22] to-[#151618] shadow-[0_12px_32px_-12px_rgba(0,0,0,0.6)]";

export function AboutInnoView() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-[color:var(--dash-accent)]/25 bg-[color:var(--dash-accent)]/10">
            <BookOpen size={14} className="text-[color:var(--dash-accent)]" />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <h2 className="text-[15px] font-bold leading-none text-white" style={{ fontFamily: N }}>INNO Vorbereitung</h2>
              <span className="text-[10px] text-[color:var(--dash-muted)]" style={{ fontFamily: M }}>Interner Diligence-Modus · zwei Portfolios strikt getrennt</span>
            </div>
            <p className="mt-1 text-[9px] uppercase tracking-widest text-[color:var(--dash-muted)]" style={{ fontFamily: M }}>
              Statement-basiert · keine Performanceversprechen · Quellenpflicht pro Kennzahl
            </p>
          </div>
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-2.5 xl:grid-cols-4">
        {INNO_OVERVIEW_METRICS.map((metric) => (
          <div key={metric.label} className={`p-4 ${CARD}`}>
            <p className="text-[9px] font-semibold uppercase tracking-widest text-[color:var(--dash-muted)]" style={{ fontFamily: M }}>{metric.label}</p>
            <p className={`mt-1 text-[18px] font-bold ${metric.tone === "gold" ? "text-[color:var(--dash-accent)]" : metric.tone === "red" ? "text-rose-300" : metric.tone === "blue" ? "text-sky-300" : "text-white"}`} style={{ fontFamily: N }}>
              {metric.value}
            </p>
            {metric.sub ? <p className="mt-1 text-[10px] text-white/75" style={{ fontFamily: M }}>{metric.sub}</p> : null}
            <SourceLine source={metric.source} calculation={metric.calculation} limitation={metric.limitation} />
          </div>
        ))}
      </div>

      <div className="grid min-h-0 grid-cols-2 gap-2.5 xl:grid-cols-2">
        {INNO_STRATEGY_CARDS.map((card) => (
          <div key={card.id} className={`flex min-h-0 flex-col gap-3 p-5 ${CARD}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[color:var(--dash-muted)]" style={{ fontFamily: M }}>
                  {card.id === "tactical" ? "01 · Tactical" : "02 · Strategic"}
                </p>
                <h3 className="mt-1 text-[24px] font-bold leading-none text-white" style={{ fontFamily: N, letterSpacing: "-0.02em" }}>{card.title}</h3>
              </div>
              <StatusBadge tone={card.badgeTone}>{card.badge}</StatusBadge>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 border-t border-white/[0.05] pt-3.5">
              {card.rows.map((row) => (
                <div key={row.key} className="flex flex-col gap-0.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[10px] text-[color:var(--dash-muted)]" style={{ fontFamily: M }}>{row.key}</span>
                    <span className="text-right text-[10px] font-medium text-white" style={{ fontFamily: M }}>{row.value}</span>
                  </div>
                  <p className="text-[8px] text-white/35" style={{ fontFamily: M }}>Quelle: {row.source}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[1.2fr_0.8fr] gap-2.5">
        <Panel icon={<BriefcaseBusiness size={12} />} label="Track Record">
          <SimpleTable
            columns={[
              ["Portfolio", "portfolio"],
              ["Zeitraum", "zeitraum"],
              ["Performance", "performance"],
              ["p.a.", "annualisierung"],
              ["Max DD", "drawdown"],
              ["Sharpe", "sharpe"],
              ["Calmar", "calmar"],
              ["PF", "profitFactor"],
              ["Datenqualitaet", "datenqualitaet"],
            ]}
            rows={INNO_TRACK_RECORD_ROWS}
          />
        </Panel>
        <Panel icon={<ShieldAlert size={12} />} label="Risiken und Limits">
          <CompactRows rows={INNO_RISK_ROWS} keyField="topic" valueField="value" statusField="status" />
        </Panel>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[0.95fr_1.05fr] gap-2.5">
        <Panel icon={<Building2 size={12} />} label="Kosten und Track-Record-Bereinigung">
          <CompactRows rows={INNO_COST_ROWS} keyField="item" valueField="detail" statusField="status" />
        </Panel>
        <Panel icon={<Boxes size={12} />} label="IBKR und technische Umsetzung">
          <SimpleTable
            columns={[
              ["Instrument", "instrument"],
              ["Produkt", "product"],
              ["Venue", "venue"],
              ["Kontrakt", "contract"],
              ["Margin", "margin"],
              ["Status", "status"],
            ]}
            rows={INNO_IBKR_ROWS}
          />
        </Panel>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[0.9fr_1.1fr] gap-2.5">
        <Panel icon={<FileText size={12} />} label="INNO-Meeting-Brief">
          <div className="flex flex-col gap-2 p-4">
            {INNO_MEETING_BRIEF.map((line) => (
              <div key={line} className="rounded-[12px] border border-white/[0.05] bg-white/[0.03] px-3 py-2 text-[11px] text-white/85" style={{ fontFamily: M }}>
                {line}
              </div>
            ))}
          </div>
        </Panel>
        <Panel icon={<AlertTriangle size={12} />} label="Datenluecken und Widersprueche">
          <SimpleTable
            columns={[
              ["Aussage", "aussage"],
              ["Wert", "wert"],
              ["Status", "status"],
              ["Datenart", "datenart"],
              ["Quelle", "quelle"],
              ["Verwendbar", "verwendbar"],
              ["Offene Pruefung", "pruefung"],
            ]}
            rows={INNO_DATA_GAPS_ROWS}
          />
        </Panel>
      </div>

      <div className={`shrink-0 ${CARD}`}>
        <div className="flex items-center gap-1.5 border-b border-white/[0.05] px-4 py-2.5">
          <Database size={12} className="text-[color:var(--dash-accent)]" />
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[color:var(--dash-accent)]" style={{ fontFamily: M }}>Quellenregister</p>
        </div>
        <div className="grid grid-cols-3 gap-0 divide-x divide-white/[0.04]">
          {INNO_SOURCE_REGISTER.map((source) => (
            <div key={source.path} className="p-4">
              <p className="text-[11px] font-semibold text-white" style={{ fontFamily: N }}>{source.label}</p>
              <SourceBlock source={source} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Panel({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className={`flex min-h-0 flex-col overflow-hidden ${CARD}`}>
      <div className="flex shrink-0 items-center gap-1.5 border-b border-white/[0.05] px-4 py-2.5">
        <span className="text-[color:var(--dash-accent)]">{icon}</span>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[color:var(--dash-accent)]" style={{ fontFamily: M }}>{label}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}

function SimpleTable({ columns, rows }: { columns: [string, string][]; rows: InnoTableRow[] }) {
  return (
    <table className="w-full min-w-[720px]">
      <thead className="sticky top-0 bg-[#1a1b1e]">
        <tr className="border-b border-white/[0.05]">
          {columns.map(([label]) => (
            <th key={label} className="px-4 py-1.5 text-left text-[9px] font-semibold uppercase tracking-wider text-[color:var(--dash-muted)]" style={{ fontFamily: M }}>
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-white/[0.03]">
        {rows.map((row, idx) => (
          <tr key={`${idx}-${Object.values(row)[0]}`}>
            {columns.map(([, key]) => (
              <td key={key} className="px-4 py-2 align-top text-[10px] text-white/85" style={{ fontFamily: M }}>
                {row[key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CompactRows({
  rows, keyField, valueField, statusField,
}: {
  rows: InnoTableRow[];
  keyField: string;
  valueField: string;
  statusField: string;
}) {
  return (
    <div className="flex flex-col gap-2 p-4">
      {rows.map((row, idx) => (
        <div key={`${idx}-${row[keyField]}`} className="rounded-[12px] border border-white/[0.05] bg-white/[0.02] p-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/75" style={{ fontFamily: M }}>{row[keyField]}</p>
            <StatusBadge tone={toneFromStatus(row[statusField])}>{row[statusField]}</StatusBadge>
          </div>
          <p className="mt-2 text-[11px] text-white" style={{ fontFamily: M }}>{row[valueField]}</p>
          {row.note ? <p className="mt-1 text-[9px] text-white/45" style={{ fontFamily: M }}>{row.note}</p> : null}
          {row.source ? <p className="mt-1 text-[8px] text-white/35" style={{ fontFamily: M }}>Quelle: {row.source}</p> : null}
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ children, tone }: { children: React.ReactNode; tone: InnoStatusTone }) {
  const cls = tone === "gold"
    ? "border-[color:var(--dash-accent)]/30 bg-[color:var(--dash-accent)]/10 text-[color:var(--dash-accent)]"
    : tone === "blue"
      ? "border-sky-400/30 bg-sky-400/10 text-sky-300"
      : tone === "red"
        ? "border-rose-400/30 bg-rose-400/10 text-rose-300"
        : "border-white/[0.08] bg-white/[0.04] text-white/65";
  return <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[9px] font-semibold ${cls}`} style={{ fontFamily: M }}>{children}</span>;
}

function SourceLine({ source, calculation, limitation }: { source: string; calculation?: string; limitation?: string }) {
  return (
    <div className="mt-2 flex flex-col gap-0.5">
      <p className="text-[8px] text-white/35" style={{ fontFamily: M }}>Quelle: {source}</p>
      {calculation ? <p className="text-[8px] text-white/35" style={{ fontFamily: M }}>Berechnung: {calculation}</p> : null}
      {limitation ? <p className="text-[8px] text-white/35" style={{ fontFamily: M }}>Einschraenkung: {limitation}</p> : null}
    </div>
  );
}

function SourceBlock({ source }: { source: InnoSourceRef }) {
  return (
    <div className="mt-2 flex flex-col gap-1 text-[10px] text-white/70" style={{ fontFamily: M }}>
      <p>{source.path}</p>
      {source.period ? <p>Zeitraum: {source.period}</p> : null}
      {source.updated ? <p>Letzte Aktualisierung: {source.updated}</p> : null}
      {source.quality ? <p>Qualitaet: {source.quality}</p> : null}
    </div>
  );
}

function toneFromStatus(status: string): InnoStatusTone {
  const key = status.toLowerCase();
  if (key.includes("widers")) return "red";
  if (key.includes("nicht")) return "red";
  if (key.includes("live")) return "gold";
  if (key.includes("offen")) return "red";
  if (key.includes("pruefung")) return "blue";
  return "zinc";
}
