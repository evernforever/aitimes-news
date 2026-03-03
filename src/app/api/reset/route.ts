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

    // 새로 스크래핑
    const count = await scrapeLatestNews();
    return NextResponse.json({
      success: true,
      message: `초기화 후 ${count}개 기사를 새로 수집했습니다.`,
      count,
    });
  } catch (err) {
    console.error("[Reset] Error:", err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
