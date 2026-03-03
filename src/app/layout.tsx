import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Times 뉴스 요약",
  description: "aitimes.com 최신 AI 뉴스를 Claude AI가 요약해드립니다",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="bg-gray-50 min-h-screen">{children}</body>
    </html>
  );
}
