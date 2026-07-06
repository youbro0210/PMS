import type { Metadata, Viewport } from "next";
import "./globals.css";
import { FloatingLogout } from "@/components/layout/FloatingLogout";
import { RegisterSW } from "@/components/pwa/RegisterSW";

export const metadata: Metadata = {
  title: "SYU PMS",
  description: "자연어로 관리하는 수주 프로젝트 관리 시스템",
  applicationName: "SYU PMS",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "SYU PMS" },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#16244a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        {children}
        <FloatingLogout />
        <RegisterSW />
      </body>
    </html>
  );
}
