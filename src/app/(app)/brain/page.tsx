import { BrainGraphShell } from "@/components/brain-graph/BrainGraphShell";

export const metadata = { title: "Brain - Capitalife Terminal" };
export const dynamic = "force-static";
export const revalidate = 3600;

export default function BrainRoute() {
  return <BrainGraphShell />;
}
