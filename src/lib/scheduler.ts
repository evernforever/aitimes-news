import cron from "node-cron";
import { scrapeLatestNews } from "./scraper";

let isScheduled = false;

export function startScheduler() {
  if (isScheduled) return;
  isScheduled = true;

  // 매일 오전 8시 실행 (크론 표현식: 0 8 * * *)
  cron.schedule(
    "0 8 * * *",
    async () => {
      console.log("[Scheduler] Running daily news scrape...");
      try {
        const count = await scrapeLatestNews();
        console.log(`[Scheduler] Completed. ${count} new articles.`);
      } catch (err) {
        console.error("[Scheduler] Error during scrape:", err);
      }
    },
    { timezone: "Asia/Seoul" }
  );

  console.log("[Scheduler] Daily news scraper scheduled at 08:00 KST.");
}
