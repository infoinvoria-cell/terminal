import { MobileBottomNavigation } from "@/components/mobile/MobileBottomNavigation";

export default function MobileLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="h-[100dvh] min-h-0 overflow-hidden bg-[#0c0d10] text-white">
      <main
        className="min-h-0 overflow-y-auto overscroll-contain font-[family-name:var(--font-nunito)]"
        style={{ height: "calc(100dvh - 64px - env(safe-area-inset-bottom))" }}
      >
        {children}
      </main>
      <MobileBottomNavigation />
    </div>
  );
}
