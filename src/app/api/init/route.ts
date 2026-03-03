// 서버 초기화 시 스케줄러 등록용 엔드포인트
// Next.js instrumentation.ts로 대신 처리
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ status: "ok" });
}
