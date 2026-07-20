import { LazyBrainGraphShell } from "@/components/performance/LazyBrainGraphShell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Brain - Capitalife Terminal" };

export default function BrainRoute() {
  return <LazyBrainGraphShell />;
}
