import PreviewWorkspacePage from "@/components/preview/PreviewWorkspacePage";

export const metadata = { title: "Preview Workspace - Capitalife Terminal" };
export const dynamic = "force-static";
export const revalidate = 3600;

export default function PreviewWorkspaceRoute() {
  return <PreviewWorkspacePage />;
}
