import { INNO_MODES, type AboutMode } from "@/lib/about/about-inno-data";
import { InjectPillCss } from "@/components/ui/pill-button";

const M = "var(--font-montserrat, 'Montserrat', sans-serif)";

export function AboutModeTabs({
  activeMode,
  mobile = false,
  basePath = "/about",
  hrefs,
  fontFamily = M,
}: {
  activeMode: AboutMode;
  mobile?: boolean;
  basePath?: string;
  hrefs?: Partial<Record<AboutMode, string>>;
  fontFamily?: string;
}) {
  return (
    <>
      <InjectPillCss />
      <div className={`relative z-20 flex flex-wrap items-center ${mobile ? "gap-1.5" : "gap-2"}`}>
        {INNO_MODES.map((mode) => {
          const active = activeMode === mode.id;
          const href = hrefs?.[mode.id] ?? (mode.id === "overview" ? basePath : `${basePath}?mode=${mode.id}`);

          return (
            <form key={mode.id} action={href} method="get" className="inline-flex">
              <button
                type="submit"
                aria-pressed={active}
                className={`rc-pill ${active ? "rc-active" : "rc-inactive"}`}
                style={{
                  fontFamily,
                  padding: mobile ? "6px 14px" : "8px 20px",
                  fontSize: mobile ? 11 : 12,
                  fontWeight: active ? 700 : 500,
                  color: active ? "#F3F3F4" : "#6a6e7a",
                }}
              >
                {mode.label}
              </button>
            </form>
          );
        })}
      </div>
    </>
  );
}
