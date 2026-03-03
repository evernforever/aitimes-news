import { NextResponse } from "next/server";
import { scrapeLatestNews } from "@/lib/scraper";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const section = body.section as "headline" | "popular" | "latest" | undefined;
    const sections = section ? [section] : undefined;
    const count = await scrapeLatestNews(sections);
    return NextResponse.json({
      success: true,
      message: `${count}개의 새 기사를 수집했습니다.`,
      count,
    });
  } catch (err) {
    console.error("[API/scrape] Error:", err);
    return NextResponse.json(
      { success: false, error: "스크래핑 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
