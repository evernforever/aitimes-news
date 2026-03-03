import { NextResponse } from "next/server";
import { debugPageStructure } from "@/lib/scraper";

export async function POST() {
  try {
    const structure = await debugPageStructure();
    return NextResponse.json({
      success: true,
      message: "data/debug.html 과 data/debug-structure.txt 에 저장됐습니다.",
      structure,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
