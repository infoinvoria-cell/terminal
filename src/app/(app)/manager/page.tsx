import { PortfolioLabPage } from "@/components/portfolio-lab/PortfolioLabPage";
import { getPortfolioLabBootstrap } from "@/lib/portfolio-simulator/data";
import { writePortfolioLabQaScenarios } from "@/lib/portfolio-simulator/qa";

export const revalidate = 300;

export const metadata = {
  title: "Portfolio Lab — Capitalife",
};

export default async function ManagerPage() {
  const bootstrap = getPortfolioLabBootstrap();
  writePortfolioLabQaScenarios(bootstrap);
  return <PortfolioLabPage bootstrap={bootstrap} />;
}
