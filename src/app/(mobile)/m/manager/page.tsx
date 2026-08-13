import { MobileManagerView } from "@/components/mobile/manager/MobileManagerView";
import { getPortfolioLabBootstrap } from "@/lib/portfolio-simulator/data";

export const metadata = { title: "Portfolio Lab - Capitalife Mobile" };

export default function MobileManagerPage() {
  const bootstrap = getPortfolioLabBootstrap();
  return <MobileManagerView bootstrap={bootstrap} />;
}
