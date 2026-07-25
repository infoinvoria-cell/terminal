import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Brain - Capitalife Terminal" };

export default function BrainGraphRoute() {
  redirect("/brain");
}
