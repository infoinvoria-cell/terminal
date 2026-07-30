import { redirect } from "next/navigation";
import { MobileAboutView } from "@/components/mobile/about/MobileAboutView";

export const metadata = { title: "Bibel - Capitalife" };

export default async function MobileAboutPage(props: PageProps<"/m/about">) {
  const searchParams = await props.searchParams;
  if (searchParams?.mode === "inno") redirect("/m/about/inno");
  return <MobileAboutView />;
}
