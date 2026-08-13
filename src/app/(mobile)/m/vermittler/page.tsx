import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function VermittlerPage() {
  redirect("/m/manager");
}
