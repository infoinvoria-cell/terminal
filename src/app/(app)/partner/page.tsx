import { PartnerProgramPage } from "@/components/partner/PartnerProgramPage";

export const metadata = { title: "Partnerprogramm â€” Capitalife Terminal" };
export const dynamic = "force-static";
export const revalidate = 3600;

export default function PartnerRoute() {
  return <PartnerProgramPage />;
}
