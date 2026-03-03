import fs from "fs";
import path from "path";
import type { Article } from "@/types";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "news.json");

interface DB {
  articles: Article[];
  lastId: number;
}

function readDb(): DB {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    return { articles: [], lastId: 0 };
  }
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
  } catch {
    return { articles: [], lastId: 0 };
  }
}

function writeDb(db: DB): void {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}

export function insertArticle(article: Omit<Article, "id">): void {
  const db = readDb();
  const exists = db.articles.some((a) => a.url === article.url);
  if (exists) return;
  db.lastId += 1;
  db.articles.unshift({ ...article, id: db.lastId });
  writeDb(db);
}

export function updateSummary(
  url: string,
  summary: string,
  keywords: string[]
): void {
  const db = readDb();
  const article = db.articles.find((a) => a.url === url);
  if (article) {
    article.summary = summary;
    article.keywords = keywords;
    writeDb(db);
  }
}

export function getArticles(limit = 50): Article[] {
  const db = readDb();
  return db.articles.slice(0, limit);
}

export function getArticleById(id: number): Article | null {
  const db = readDb();
  return db.articles.find((a) => a.id === id) ?? null;
}

export function getExistingUrls(): Set<string> {
  const db = readDb();
  return new Set(db.articles.map((a) => a.url));
}
