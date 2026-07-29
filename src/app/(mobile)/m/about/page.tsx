import { MobileAboutInnoView } from "@/components/mobile/about/MobileAboutInnoView";
import { MobileAboutView } from "@/components/mobile/about/MobileAboutView";

export const metadata = { title: "Bibel - Capitalife" };

export default async function MobileAboutPage(props: PageProps<"/m/about">) {
  const searchParams = await props.searchParams;
  return searchParams?.mode === "inno" ? <MobileAboutInnoView /> : <MobileAboutView />;
}
