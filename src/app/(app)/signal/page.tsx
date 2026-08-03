import { SignalShell } from "@/components/signal-shell/SignalShell";
import { getSignalPageData } from "@/lib/signal/signalPageData";

export const metadata = { title: "Signal - Capitalife Terminal" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SignalRoute() {
  const data = await getSignalPageData();
  return <SignalShell data={data} />;
}
