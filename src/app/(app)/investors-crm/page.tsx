import { redirect } from "next/navigation";

export const dynamic = "force-static";
export const revalidate = 3600;

export default function InvestorsCRMPage() {
  redirect("/onboarding");
}
