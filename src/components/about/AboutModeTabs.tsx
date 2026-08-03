import { INNO_MODES, type AboutMode } from "@/lib/about/about-inno-data";

const M = "var(--font-text), sans-serif";

export function AboutModeTabs({
  activeMode,
  mobile = false,
  basePath = "/about",
  hrefs,
}: {
  activeMode: AboutMode;
  mobile?: boolean;
  basePath?: string;
  hrefs?: Partial<Record<AboutMode, string>>;
}) {
  return (
    <div className={`relative z-20 flex flex-wrap items-center ${mobile ? "gap-1.5" : "gap-2"}`}>
      {INNO_MODES.map((mode) => {
        const active = activeMode === mode.id;
        const href = hrefs?.[mode.id] ?? (mode.id === "overview" ? basePath : `${basePath}?mode=${mode.id}`);

        return (
          <form key={mode.id} action={href} method="get" className="inline-flex">
            <button
              type="submit"
              aria-pressed={active}
              className={
                active
                  ? "pointer-events-auto rounded-full border border-[#C9A84C]/45 bg-gradient-to-b from-[#1F1F1F] to-[#13131A] px-3.5 py-1.5 text-white shadow-[inset_0_-1px_0_0_rgba(226,202,122,0.45)]"
                  : "pointer-events-auto rounded-full px-2.5 py-1.5 text-zinc-500 transition-colors hover:text-zinc-300"
              }
              style={{ fontFamily: M, fontSize: mobile ? 11 : 12, fontWeight: active ? 700 : 500 }}
            >
              {mode.label}
            </button>
          </form>
        );
      })}
    </div>
  );
}
