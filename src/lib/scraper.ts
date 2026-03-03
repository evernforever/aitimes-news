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
  section: "headline" | "popular" | "latest";
}

export async function scrapeLatestNews(
  sections: ("headline" | "popular" | "latest")[] = ["headline", "popular", "latest"]
): Promise<number> {
  console.log(`[Scraper] Starting scrape of aitimes.com... sections: ${sections.join(", ")}`);

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

    const articles = await page.evaluate((sectionsList: string[]) => {
      const results: Array<{
        title: string;
        url: string;
        category: string | null;
        published_at: string | null;
        section: "headline" | "popular" | "latest";
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

      // 컨테이너에서 기사 단위 요소 목록 반환 (li가 있으면 li 순회, 없으면 a[href] 순회)
      function getItems(container: Element): Element[] {
        const lis = Array.from(container.querySelectorAll("li"));
        if (lis.length >= 2) return lis;
        return Array.from(container.querySelectorAll("a[href]"));
      }

      if (sectionsList.includes("headline")) {
        // ── 대표 헤드라인: #skin-1, 1개 ──
        const featuredContainer = document.querySelector("#skin-1");
        if (featuredContainer) {
          const seen = new Set<string>();
          for (const item of getItems(featuredContainer)) {
            const link = extractLink(item);
            if (link && !seen.has(link.url)) {
              seen.add(link.url);
              results.push({ ...link, section: "headline" });
              break;
            }
          }
        }

        // ── 헤드라인: #skin-8, 중복 URL 제거 후 7개 ──
        const headlineContainer = document.querySelector("#skin-8");
        if (headlineContainer) {
          const seen = new Set(results.map(r => r.url));
          for (const item of getItems(headlineContainer)) {
            const link = extractLink(item);
            if (link && !seen.has(link.url)) {
              seen.add(link.url);
              results.push({ ...link, section: "headline" });
              if (results.filter(r => r.section === "headline").length >= 8) break;
            }
          }
        }
      }

      if (sectionsList.includes("popular")) {
        // ── 인기기사: #skin-9, 중복 URL 제거 후 10개 ──
        const popularContainer = document.querySelector("#skin-9");
        if (popularContainer) {
          const popularSeen = new Set(results.map(r => r.url));
          for (const item of getItems(popularContainer)) {
            const link = extractLink(item);
            if (link && !popularSeen.has(link.url)) {
              popularSeen.add(link.url);
              results.push({ ...link, section: "popular" });
              if (results.filter(r => r.section === "popular").length >= 10) break;
            }
          }
        }
      }

      if (sectionsList.includes("latest")) {
        // ── 최신기사: #skin-10, 중복 URL 제거 후 10개 ──
        const latestContainer = document.querySelector("#skin-10");
        if (latestContainer) {
          const latestSeen = new Set(results.map(r => r.url));
          for (const item of getItems(latestContainer)) {
            const link = extractLink(item);
            if (link && !latestSeen.has(link.url)) {
              latestSeen.add(link.url);
              results.push({ ...link, section: "latest" });
              if (results.filter(r => r.section === "latest").length >= 10) break;
            }
          }
        }
      }

      return results;
    }, sections);

    const headlineCount = articles.filter(a => a.section === "headline").length;
    const popularCount = articles.filter(a => a.section === "popular").length;
    const latestCount = articles.filter(a => a.section === "latest").length;
    console.log(`[Scraper] Found: ${headlineCount} headlines, ${popularCount} popular, ${latestCount} latest articles`);

    if (articles.length === 0) {
      console.warn("[Scraper] No articles found. Run /api/debug-html to inspect the page structure.");
    }

    const newArticles = articles.filter((a) => !existingUrls.has(a.url));
    console.log(`[Scraper] ${newArticles.length} new articles to process`);

    // 기사 1건: 본문 가져오기 + 요약을 동시에 처리
    async function processOneArticle(article: ScrapedArticle) {
      const { content, published_at: articlePublishedAt } = await fetchArticleContent(context, article.url);
      let summary = "";
      let keywords: string[] = [];
      if (content && content.length > 100) {
        const result = await summarizeArticle(article.title, content);
        summary = result.summary;
        keywords = result.keywords;
      }
      return { content, published_at: articlePublishedAt, summary, keywords };
    }

    // 10개씩 병렬 처리 (순서 보존을 위해 배치 내 결과를 순차 삽입)
    const CONCURRENCY = 10;
    const reversed = [...newArticles].reverse();

    for (let i = 0; i < reversed.length; i += CONCURRENCY) {
      const batch = reversed.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(batch.map(a => processOneArticle(a)));

      for (let j = 0; j < batch.length; j++) {
        const article = batch[j];
        const result = results[j];
        if (result.status === "rejected") {
          console.error(`[Scraper] Failed: ${article.url}`, result.reason);
          continue;
        }
        const { content, published_at: articlePublishedAt, summary, keywords } = result.value;
        const now = new Date().toISOString();

        const newArticle: Omit<Article, "id"> = {
          title: article.title,
          url: article.url,
          category: article.category ?? (
            article.section === "popular" ? "인기기사" :
            article.section === "latest" ? "최신기사" :
            "헤드라인"
          ),
          content,
          summary: summary || null,
          keywords: keywords.length > 0 ? keywords : null,
          published_at: articlePublishedAt || article.published_at,
          fetched_at: now,
        };

        insertArticle(newArticle);
        if (summary) updateSummary(article.url, summary, keywords);
        newCount++;
        console.log(`[Scraper][${article.section}] ${article.title.slice(0, 50)}...`);
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`[Scraper] Done. ${newCount} new articles saved.`);
  return newCount;
}

/** 테스트용: 헤드라인 첫 번째 기사 1개만 수집·요약 */
export async function scrapeTestArticle(): Promise<number> {
  console.log("[ScraperTest] Starting single headline test...");

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

    const article = await page.evaluate(() => {
      function extractLink(el: Element): { title: string; url: string; published_at: string | null } | null {
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
        return { title, url: href, published_at };
      }

      const container = document.querySelector("#skin-1");
      if (!container) return null;
      const lis = Array.from(container.querySelectorAll("li"));
      const items = lis.length >= 1 ? lis : Array.from(container.querySelectorAll("a[href]"));
      for (const item of items) {
        const link = extractLink(item);
        if (link) return link;
      }
      return null;
    });

    if (!article) {
      console.warn("[ScraperTest] No article found.");
      return 0;
    }

    console.log(`[ScraperTest] Found: ${article.title.slice(0, 50)}`);
    const { content, published_at: articlePublishedAt } = await fetchArticleContent(context, article.url);
    const now = new Date().toISOString();

    const newArticle: Omit<import("@/types").Article, "id"> = {
      title: article.title,
      url: article.url,
      category: "헤드라인",
      content,
      summary: null,
      keywords: null,
      published_at: articlePublishedAt || article.published_at,
      fetched_at: now,
    };

    insertArticle(newArticle);

    if (content && content.length > 100) {
      const { summary, keywords } = await summarizeArticle(article.title, content);
      updateSummary(article.url, summary, keywords);
    }

    console.log("[ScraperTest] Done. 1 article saved.");
    return 1;
  } finally {
    await browser.close();
  }
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

async function fetchArticleContent(context: BrowserContext, url: string): Promise<{ content: string; published_at: string | null }> {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(500);

    const result = await page.evaluate(() => {
      // published_at 추출: "입력 YYYY.MM.DD HH:MM" 패턴을 페이지 전체 텍스트에서 탐색
      let published_at: string | null = null;
      const inputPattern = /입력\s*(\d{4}\.\d{2}\.\d{2})\s+(\d{2}:\d{2})/;
      const pageText = document.body.innerText || "";
      const inputMatch = pageText.match(inputPattern);
      if (inputMatch) {
        published_at = `${inputMatch[1]} ${inputMatch[2]}`;
      } else {
        // fallback: time[datetime] 속성
        const timeEl = document.querySelector("time[datetime]");
        if (timeEl) {
          const dt = timeEl.getAttribute("datetime") || "";
          const m = dt.match(/(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
          if (m) published_at = `${m[1].replace(/-/g, ".")} ${m[2]}`;
        }
      }

      // 본문 추출
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
          if (text.length > 200) return { content: text, published_at };
        }
      }

      const article = document.querySelector("article");
      if (article) {
        article.querySelectorAll("script, style, .ad, nav, header, footer").forEach((e) => e.remove());
        return { content: article.textContent?.trim() || "", published_at };
      }

      return { content: "", published_at };
    });

    return { content: result.content.slice(0, 5000), published_at: result.published_at };
  } finally {
    await page.close();
  }
}
