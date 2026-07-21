import { MobileNavReporter } from "@/components/mobile/MobileNavReporter";
import { MobileLayoutClient } from "@/components/mobile/MobileLayoutClient";

export const metadata = { title: "Capitalife Mobile" };

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MobileNavReporter />
      <MobileLayoutClient>{children}</MobileLayoutClient>
    </>
  );
}
