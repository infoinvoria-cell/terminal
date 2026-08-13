import { MobileAboutInnoView } from "@/components/mobile/about/MobileAboutInnoView";
import { buildTrackRecordOverview } from "@/lib/track-record/service";

export const dynamic = "force-dynamic";
export const metadata = { title: "INNO Vorbereitung - Capitalife" };

export default async function MobileAboutInnoPage() {
  return <MobileAboutInnoView trackRecordOverview={await buildTrackRecordOverview()} />;
}
