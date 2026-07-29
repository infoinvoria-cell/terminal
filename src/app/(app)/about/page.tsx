import type { Metadata } from "next";
import { AboutInnoView } from "@/components/about/AboutInnoView";
import { AboutModeTabs } from "@/components/about/AboutModeTabs";
import { AboutOverviewView } from "@/components/about/AboutOverviewView";

export const metadata: Metadata = { title: "Bibel - Capitalife" };

export default async function AboutPage(props: PageProps<"/about">) {
  const searchParams = await props.searchParams;
  const mode = searchParams?.mode === "inno" ? "inno" : "overview";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-7 pb-4 pt-4">
      <div className="relative z-20 shrink-0">
        <AboutModeTabs activeMode={mode} hrefs={{ overview: "/about", inno: "/about/inno" }} />
      </div>
      {mode === "inno" ? <AboutInnoView /> : <AboutOverviewView />}
    </div>
  );
}
