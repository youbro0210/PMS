import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LLM PMS",
  description: "자연어로 조작하는 프로젝트 관리 시스템",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
