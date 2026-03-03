import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import type { Article } from "@/types";

const DB_PATH = path.join(process.cwd(), "data", "news.json");

export async function POST() {
  try {
    const raw = fs.readFileSync(DB_PATH, "utf-8");
    const db = JSON.parse(raw) as { articles: Article[]; lastId: number };

    let count = 0;
    db.articles = db.articles.map((a) => {
      if (a.category === null) {
        count++;
        return { ...a, category: "헤드라인" };
      }
      return a;
    });

    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
    return NextResponse.json({ success: true, updated: count });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
