import { SettingsPage } from "@/components/settings/SettingsPage";

export const metadata = { title: "Settings â€” Capitalife Terminal" };
export const dynamic = "force-static";
export const revalidate = 3600;

export default function SettingsRoute() {
  return <SettingsPage />;
}
