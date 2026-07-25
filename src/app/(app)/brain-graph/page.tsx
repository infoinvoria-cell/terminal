import { redirect } from "next/navigation";

export const metadata = { title: "Brain - Capitalife Terminal" };

export default function BrainGraphRoute() {
  redirect("/brain");
}

