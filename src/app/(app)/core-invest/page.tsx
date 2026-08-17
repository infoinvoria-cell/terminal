import { CoreInvestOverview } from '@/components/core-invest/overview/CoreInvestOverview';
import { loadCoreInvestEquityCurve } from '@/lib/core-invest/overview/load-equity-curve';

export const metadata = { title: 'Core Invest — Capitalife Terminal' };

export default function CoreInvestPage() {
  const equityCurve = loadCoreInvestEquityCurve();
  return <CoreInvestOverview equityCurve={equityCurve} />;
}
