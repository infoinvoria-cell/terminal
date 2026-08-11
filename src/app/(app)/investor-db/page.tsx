import { InvestorDbShell } from "@/components/investor-db/InvestorDbShell";

export const metadata = { title: "Investor DB - Capitalife Terminal" };
export const dynamic = "force-dynamic";

export default function InvestorDbPage() {
  return <InvestorDbShell />;
}
