import type { Metadata, Viewport } from "next";
import { Montserrat, Nunito_Sans } from "next/font/google";
import { ClientProviders } from "@/components/providers";
import { MobileRedirect } from "@/components/mobile/MobileRedirect";
import { EngineStatusProvider } from "@/components/engine/EngineStatusProvider";
import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  display: "swap",
});

const nunitoSans = Nunito_Sans({
  subsets: ["latin"],
  variable: "--font-nunito",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "Capitalife Terminal",
  description: "Portfolio performance and risk overview",
  icons: {
    icon: "/CAPITALIFE_ICON.png",
    shortcut: "/CAPITALIFE_ICON.png",
    apple: "/CAPITALIFE_ICON.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${montserrat.variable} ${nunitoSans.variable} h-full antialiased`}
    >
      <body className="h-full overflow-hidden bg-[#0c0d10] text-white">
        <MobileRedirect />
        <EngineStatusProvider />
        <ClientProviders initialHeaderHidden={true}>
          {children}
        </ClientProviders>
      </body>
    </html>
  );
}
