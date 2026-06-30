import type { Metadata, Viewport } from "next";
import "./globals.css";
import { FloatingLogout } from "@/components/layout/FloatingLogout";

export const metadata: Metadata = {
  title: "MnSi PMS",
  description: "자연어로 관리하는 수주 프로젝트 관리 시스템",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        {children}
        <FloatingLogout />
      </body>
    </html>
  );
}
