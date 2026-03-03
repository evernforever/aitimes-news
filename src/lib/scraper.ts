import { chromium, type BrowserContext } from "playwright";
import { insertArticle, getExistingUrls, updateSummary } from "./db";
import { summarizeArticle } from "./summarizer";
import type { Article } from "@/types";
import fs from "fs";
import path from "path";

const BASE_URL = "https://www.aitimes.com";

interface ScrapedArticle {
  title: string;
  url: string;
  category: string | null;
  published_at: string | null;
  section: "headline" | "popular";
}

export async function scrapeLatestNews(): Promise<number> {
  console.log("[Scraper] Starting scrape of aitimes.com...");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    locale: "ko-KR",
  });

  let newCount = 0;

  try {
    const existingUrls = getExistingUrls();
    const page = await context.newPage();

    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000);

    const articles = await page.evaluate(() => {
      const results: Array<{
        title: string;
        url: string;
        category: string | null;
        published_at: string | null;
        section: "headline" | "popular";
      }> = [];

      function extractLink(el: Element): { title: string; url: string; category: string | null; published_at: string | null } | null {
        const a = (el.tagName === "A" ? el : el.querySelector("a")) as HTMLAnchorElement | null;
        if (!a) return null;
        const href = a.href;
        if (!href || !href.includes("aitimes.com")) return null;
        const isArticle = href.includes("/news/") || href.includes("articleView") || href.includes("/article/");
        if (!isArticle) return null;

        const titleEl = el.querySelector("h2, h3, h4, .title, .tit, strong, b") || a;
        const title = (titleEl?.textContent || a.textContent || "").trim();
        if (!title || title.length < 5) return null;

        const dateEl = el.querySelector("time, .date, .time, [class*='date'], [class*='time']");
        const published_at = dateEl?.getAttribute("datetime") || dateEl?.textContent?.trim() || null;

        const catEl = el.querySelector(".cate, .category, .section, [class*='cate'], [class*='section']");
        const category = catEl?.textContent?.trim() || null;

        return { title, url: href, category, published_at };
      }

      // ── 헤드라인: #skin-8 (.auto-article), 중복 URL 제거 후 7개 ──
      const headlineContainer = document.querySelector("#skin-8");
      if (headlineContainer) {
        const seen = new Set<string>();
        const links = headlineContainer.querySelectorAll("a[href]");
        for (const a of Array.from(links)) {
          const link = extractLink(a);
          if (link && !seen.has(link.url)) {
            seen.add(link.url);
            results.push({ ...link, section: "headline" });
            if (results.filter(r => r.section === "headline").length >= 7) break;
          }
        }
      }

      // ── 인기기사: #skin-9 (.auto-article), 중복 URL 제거 후 10개 ─
      const popularContainer = document.querySelector("#skin-9");
      if (popularContainer) {
        const popularSeen = new Set(results.map(r => r.url));
        const links = popularContainer.querySelectorAll("a[href]");
        for (const a of Array.from(links)) {
          const link = extractLink(a);
          if (link && !popularSeen.has(link.url)) {
            popularSeen.add(link.url);
            results.push({ ...link, section: "popular" });
            if (results.filter(r => r.section === "popular").length >= 10) break;
          }
        }
      }

      return results;
    });

    const headlineCount = articles.filter(a => a.section === "headline").length;
    const popularCount = articles.filter(a => a.section === "popular").length;
    console.log(`[Scraper] Found: ${headlineCount} headlines, ${popularCount} popular articles`);

    if (articles.length === 0) {
      console.warn("[Scraper] No articles found. Run /api/debug-html to inspect the page structure.");
    }

    const newArticles = articles.filter((a) => !existingUrls.has(a.url));
    console.log(`[Scraper] ${newArticles.length} new articles to process`);

    for (const article of [...newArticles].reverse()) {
      try {
        const content = await fetchArticleContent(context, article.url);
        const now = new Date().toISOString();

        const newArticle: Omit<Article, "id"> = {
          title: article.title,
          url: article.url,
          category: article.category ?? (article.section === "popular" ? "인기기사" : "헤드라인"),
          content,
          summary: null,
          keywords: null,
          published_at: article.published_at,
          fetched_at: now,
        };

        insertArticle(newArticle);

        if (content && content.length > 100) {
          const { summary, keywords } = await summarizeArticle(article.title, content);
          updateSummary(article.url, summary, keywords);
        }

        newCount++;
        console.log(`[Scraper][${article.section}] ${article.title.slice(0, 50)}...`);
        await new Promise((r) => setTimeout(r, 1500));
      } catch (err) {
        console.error(`[Scraper] Failed: ${article.url}`, err);
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`[Scraper] Done. ${newCount} new articles saved.`);
  return newCount;
}

/** 디버그용: 메인 페이지 HTML과 섹션 구조를 data/debug.html 에 저장 */
export async function debugPageStructure(): Promise<string> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    locale: "ko-KR",
  });

  try {
    const page = await context.newPage();
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000);

    // 섹션 구조 요약
    const structure = await page.evaluate(() => {
      const info: string[] = [];
      // id가 있는 주요 섹션들
      document.querySelectorAll("[id]").forEach((el) => {
        const id = el.id;
        const classes = Array.from(el.classList).join(" ");
        const linkCount = el.querySelectorAll("a[href*='/news/'], a[href*='articleView']").length;
        if (linkCount > 0) {
          info.push(`#${id} (.${classes.replace(/ /g, " .")}) → 기사링크 ${linkCount}개`);
        }
      });
      // class에 news/article/popular/headline 포함된 요소
      const keywords = ["news", "article", "popular", "headline", "ranking", "most", "hot", "main", "top"];
      document.querySelectorAll("[class]").forEach((el) => {
        const cls = el.className.toString().toLowerCase();
        if (keywords.some(k => cls.includes(k))) {
          const linkCount = el.querySelectorAll("a[href*='/news/'], a[href*='articleView']").length;
          if (linkCount >= 3) {
            info.push(`.${el.className.toString().replace(/ /g, ".")} → 기사링크 ${linkCount}개`);
          }
        }
      });
      return [...new Set(info)].slice(0, 50).join("\n");
    });

    const html = await page.content();
    const dataDir = "data";
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, "debug.html"), html, "utf-8");
    fs.writeFileSync(path.join(dataDir, "debug-structure.txt"), structure, "utf-8");

    return structure;
  } finally {
    await browser.close();
  }
}

async function fetchArticleContent(context: BrowserContext, url: string): Promise<string> {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1000);

    const content = await page.evaluate(() => {
      const selectors = [
        ".article-body",
        ".article-content",
        "#article-body",
        "#articleBody",
        ".news-body",
        ".content-body",
        "article .body",
        "[class*='article'][class*='body']",
        "[class*='article'][class*='content']",
      ];

      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          el.querySelectorAll("script, style, .ad, .advertisement, .related, .share, figure").forEach((e) => e.remove());
          const text = el.textContent?.trim() || "";
          if (text.length > 200) return text;
        }
      }

      const article = document.querySelector("article");
      if (article) {
        article.querySelectorAll("script, style, .ad, nav, header, footer").forEach((e) => e.remove());
        return article.textContent?.trim() || "";
      }

      return "";
    });

    return content.slice(0, 5000);
  } finally {
    await page.close();
  }
}
