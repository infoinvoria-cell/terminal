"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";

export function RootShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isMobile = pathname?.startsWith("/m/") ?? false;

  if (isMobile) return <>{children}</>;

  return (
    <div className="flex h-[100dvh] min-h-0 overflow-hidden bg-[#0c0d10]">
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
