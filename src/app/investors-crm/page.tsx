import { InvestorsCRMView } from "@/components/investors-crm/InvestorsCRMView";

export const metadata = { title: "Early Access Investoren — Capitalife" };

export default function InvestorsCRMPage() {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <InvestorsCRMView />
    </div>
  );
}
