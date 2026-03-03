import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { scrapeLatestNews } from "@/lib/scraper";

const DB_PATH = path.join(process.cwd(), "data", "news.json");

export async function POST() {
  try {
    // DB 초기화
    fs.writeFileSync(DB_PATH, JSON.stringify({ articles: [], lastId: 0 }, null, 2), "utf-8");
    console.log("[Reset] news.json 초기화 완료");

    // 헤드라인만 먼저 수집 (인기기사/최신기사는 탭 클릭 시 lazy-load)
    const count = await scrapeLatestNews(["headline"]);
    return NextResponse.json({
      success: true,
      message: `초기화 후 헤드라인 ${count}개를 수집했습니다.`,
      count,
    });
  } catch (err) {
    console.error("[Reset] Error:", err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
