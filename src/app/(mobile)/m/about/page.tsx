import { redirect } from "next/navigation";
import { MobileAboutView } from "@/components/mobile/about/MobileAboutView";

export const metadata = { title: "Bibel - Capitalife" };

type MobileAboutPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MobileAboutPage(props: MobileAboutPageProps) {
  const searchParams = await props.searchParams;
  if (searchParams?.mode === "inno") redirect("/m/about/inno");
  return <MobileAboutView />;
}
