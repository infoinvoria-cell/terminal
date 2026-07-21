import { getSignalPageData } from "@/lib/signal/signalPageData";
import { MobileSignaleView } from "@/components/mobile/signale/MobileSignaleView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Signale — Capitalife Terminal" };

export default async function MobileSignalePage() {
  const data = await getSignalPageData();
  return <MobileSignaleView data={data} />;
}
