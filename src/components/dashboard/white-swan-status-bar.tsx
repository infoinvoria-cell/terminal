import Image from "next/image";

type Pill = { label: string; value: string; open?: boolean };

const PILLS: Pill[] = [
  { label: "Portfolio",    value: "WS-F+10%" },
  { label: "Sleeves",      value: "6 active" },
  { label: "Entries",      value: "35 active" },
  { label: "Universe",     value: "42 confirmed · #43 open" },
  { label: "Seasonal",     value: "21 patterns" },
  { label: "Group weights", value: "FROZEN", open: true },
  { label: "AuM",          value: "€0 · no live portfolio" },
];

export function WhiteSwanStatusBar() {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-[14px] border border-white/[0.05] bg-gradient-to-r from-[#16170a] to-[#0e0f0b] px-4 py-2.5">
      <div className="flex shrink-0 items-center gap-2">
        <Image
          src="/branding/white-swan-icon.png"
          alt="White Swan"
          width={18}
          height={18}
          className="rounded-sm object-contain opacity-70"
        />
        <span className="text-[11px] font-semibold text-zinc-500 [font-family:var(--font-montserrat),sans-serif]">
          White Swan Status
        </span>
      </div>
      <div className="h-3.5 w-px shrink-0 bg-white/[0.08]" />
      <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-1">
        {PILLS.map((p) => (
          <span
            key={p.label}
            className="flex items-center gap-1.5 text-[10.5px] [font-family:var(--font-montserrat),sans-serif]"
          >
            <span className="text-zinc-600">{p.label}:</span>
            <span className={p.open ? "text-emerald-400/90" : "text-zinc-400"}>
              {p.value}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
