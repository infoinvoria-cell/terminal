import type { Metadata, Viewport } from "next";
import { Montserrat, Nunito } from "next/font/google";
import { ClientProviders } from "@/components/providers";
import "./globals.css";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  display: "swap",
  weight: ["500", "600", "700"],
});

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  display: "swap",
  weight: ["500", "600", "700", "800"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "Capitalife Terminal",
  description: "Portfolio performance and risk overview",
  icons: {
    icon: "/branding/capitalife-favicon.png",
    shortcut: "/branding/capitalife-favicon.png",
    apple: "/branding/capitalife-favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const simpleGatePassword =
    process.env.SIMPLE_GATE_PASSWORD?.trim() ||
    process.env.NEXT_PUBLIC_SIMPLE_GATE_PASSWORD?.trim() ||
    "inno";

  return (
    <html
      lang="en"
      className={`${montserrat.variable} ${nunito.variable} h-full antialiased`}
    >
      <body className="h-full overflow-hidden bg-[#0c0d10] text-white">
        <ClientProviders simpleGatePassword={simpleGatePassword}>
          {children}
        </ClientProviders>
      </body>
    </html>
  );
}
