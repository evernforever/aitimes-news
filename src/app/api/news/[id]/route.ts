import { NextResponse } from "next/server";
import { getArticleById } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const article = getArticleById(Number(id));
  if (!article) {
    return NextResponse.json({ error: "기사를 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ article });
}
