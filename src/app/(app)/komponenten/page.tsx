import { ComponentsShell } from "@/components/pages/ComponentsPage";

export const metadata = { title: "Komponenten | Capitalife Terminal" };
export const dynamic = "force-static";
export const revalidate = 3600;

export default function KomponentenRoute() {
  return <ComponentsShell />;
}
