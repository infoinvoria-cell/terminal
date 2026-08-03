import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AboutModeTabs } from "@/components/about/AboutModeTabs";
import { AboutOverviewView } from "@/components/about/AboutOverviewView";

export const metadata: Metadata = { title: "Bibel - Capitalife" };

export default async function AboutPage(props: PageProps<"/about">) {
  const searchParams = await props.searchParams;
  if (searchParams?.mode === "inno") redirect("/about/inno");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden pb-4 pl-0 pr-4 pt-4">
      <div className="relative z-20 shrink-0">
        <AboutModeTabs activeMode="overview" hrefs={{ overview: "/about", inno: "/about/inno" }} />
      </div>
      <AboutOverviewView />
    </div>
  );
}
