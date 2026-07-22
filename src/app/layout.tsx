import type { Metadata, Viewport } from "next";
import { Montserrat, Nunito } from "next/font/google";
import { cookies } from "next/headers";
import { ClientProviders } from "@/components/providers";

import IntroAnimation from "@/components/intro/IntroAnimation";
import { MobileRedirect } from "@/components/mobile/MobileRedirect";
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
    icon: "/CAPITALIFE_ICON.png",
    shortcut: "/CAPITALIFE_ICON.png",
    apple: "/CAPITALIFE_ICON.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const initialHeaderHidden = cookieStore.get("fmd_header_hidden")?.value !== "0";

  return (
    <html
      lang="en"
      className={`${montserrat.variable} ${nunito.variable} h-full antialiased`}
    >
      <body className="h-full overflow-hidden bg-[#0c0d10] text-white">
        <script dangerouslySetInnerHTML={{__html: `try{var h=localStorage.getItem('fmd_header_hidden');if(h==='1'||h==='true')document.documentElement.style.setProperty('--header-height','0px')}catch(e){}`}} />
        <MobileRedirect />
        <IntroAnimation />
        <ClientProviders initialHeaderHidden={initialHeaderHidden}>
          {children}
        </ClientProviders>
      </body>
    </html>
  );
}
