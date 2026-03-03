import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { scrapeTestArticle } from "@/lib/scraper";

const DB_PATH = path.join(process.cwd(), "data", "news.json");

export async function POST() {
  try {
    // DB 초기화
    fs.writeFileSync(DB_PATH, JSON.stringify({ articles: [], lastId: 0 }, null, 2), "utf-8");
    console.log("[ScrapeTest] news.json 초기화 완료");

    // 헤드라인 첫 기사 1개만 수집
    const count = await scrapeTestArticle();
    return NextResponse.json({
      success: true,
      message: `테스트 완료: 헤드라인 기사 ${count}개 수집했습니다.`,
      count,
    });
  } catch (err) {
    console.error("[ScrapeTest] Error:", err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
