import { NextResponse } from "next/server";
import { getArticles } from "@/lib/db";

export async function GET() {
  try {
    const articles = getArticles(50);
    return NextResponse.json({ articles });
  } catch (err) {
    console.error("[API/news] Error:", err);
    return NextResponse.json({ error: "DB 오류가 발생했습니다." }, { status: 500 });
  }
}
