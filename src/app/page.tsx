"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import type { Article } from "@/types";

export default function Home() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("헤드라인");
  const [categoryLoading, setCategoryLoading] = useState<string | null>(null);

  // 텍스트 선택 팝업
  const [popup, setPopup] = useState<{ x: number; y: number; text: string; isTouch: boolean } | null>(null);

  // 설명 모달
  const [modal, setModal] = useState<{ text: string; explanation: string; loading: boolean } | null>(null);

  const contentRef = useRef<HTMLDivElement>(null);

  // 텍스트 선택 후 팝업 표시 (iOS: selectionchange, Android: touchend, 데스크탑: mouseup)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const showPopup = (isTouch: boolean) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const selection = window.getSelection();
        const text = selection?.toString().trim();

        if (!text || text.length < 2) {
          setPopup(null);
          return;
        }

        const anchorNode = selection?.anchorNode;
        if (!contentRef.current?.contains(anchorNode as Node)) {
          setPopup(null);
          return;
        }

        const range = selection?.getRangeAt(0);
        const rect = range?.getBoundingClientRect();
        // 모바일: 선택 영역 오른쪽 아래, 데스크탑: 선택 영역 위 가운데
        const x = rect ? (isTouch ? rect.right : rect.left + rect.width / 2) : 0;
        const y = rect ? (isTouch ? rect.bottom : rect.top) : 0;

        setPopup({ x, y, text, isTouch });
      }, isTouch ? 300 : 200);
    };

    const handleSelectionChange = () => showPopup(navigator.maxTouchPoints > 0);
    const handleTouchEnd = () => showPopup(true);
    const handleMouseUp = () => {
      if (navigator.maxTouchPoints > 0) return;
      showPopup(false);
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    document.addEventListener("touchend", handleTouchEnd);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("mouseup", handleMouseUp);
      clearTimeout(timer);
    };
  }, []);

  const handleAskClaude = useCallback(async () => {
    if (!popup) return;
    const selectedText = popup.text;
    setPopup(null);
    window.getSelection()?.removeAllRanges();

    setModal({ text: selectedText, explanation: "", loading: true });

    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedText, articleTitle: "AI Times 뉴스" }),
      });

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let explanation = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        explanation += decoder.decode(value, { stream: true });
        setModal((prev) => prev ? { ...prev, explanation, loading: false } : null);
      }
    } catch {
      setModal((prev) =>
        prev ? { ...prev, explanation: "설명을 불러오는 중 오류가 발생했습니다.", loading: false } : null
      );
    }
  }, [popup]);

  const fetchArticles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/news");
      const data = await res.json();
      setArticles(data.articles || []);
    } catch {
      setMessage("뉴스를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  const handleScrape = async () => {
    setScraping(true);
    const start = Date.now();
    try {
      const res = await fetch("/api/scrape", { method: "POST" });
      const data = await res.json();
      const elapsed = Math.round((Date.now() - start) / 1000);
      setMessage(`${data.message || data.error} (소요시간: ${elapsed}초)`);
      if (data.success) {
        await fetchArticles();
        setFilter("헤드라인");
      }
    } catch {
      setMessage("스크래핑 중 오류가 발생했습니다.");
    } finally {
      setScraping(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("저장된 뉴스를 모두 삭제하고 다시 수집할까요?")) return;
    setResetting(true);
    setMessage("");
    setArticles([]);
    const start = Date.now();
    try {
      const res = await fetch("/api/reset", { method: "POST" });
      const data = await res.json();
      const elapsed = Math.round((Date.now() - start) / 1000);
      setMessage(`${data.message || data.error} (소요시간: ${elapsed}초)`);
      if (data.success) {
        await fetchArticles();
        setFilter("헤드라인");
      }
    } catch {
      setMessage("초기화 중 오류가 발생했습니다.");
    } finally {
      setResetting(false);
    }
  };

  const fetchSection = async (section: "popular" | "latest") => {
    const res = await fetch("/api/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section }),
    });
    return res.json();
  };

  const handleCategoryClick = async (cat: string) => {
    setFilter(cat);

    if (cat === "전체") {
      const missingSections: ("popular" | "latest")[] = [];
      if (!articles.some((a) => a.category === "인기기사")) missingSections.push("popular");
      if (!articles.some((a) => a.category === "최신기사")) missingSections.push("latest");
      if (missingSections.length === 0) return;

      setCategoryLoading("전체");
      const start = Date.now();
      try {
        let totalCount = 0;
        for (const section of missingSections) {
          const data = await fetchSection(section);
          totalCount += data.count ?? 0;
        }
        const elapsed = Math.round((Date.now() - start) / 1000);
        setMessage(`누락된 기사 총 ${totalCount}개를 수집했습니다. (소요시간: ${elapsed}초)`);
        await fetchArticles();
      } catch {
        setMessage("기사를 불러오는 중 오류가 발생했습니다.");
      } finally {
        setCategoryLoading(null);
      }
      return;
    }

    if (cat === "인기기사" || cat === "최신기사") {
      const hasArticles = articles.some((a) => a.category === cat);
      if (!hasArticles) {
        const section = cat === "인기기사" ? "popular" : "latest";
        setCategoryLoading(cat);
        const start = Date.now();
        try {
          const data = await fetchSection(section);
          const elapsed = Math.round((Date.now() - start) / 1000);
          setMessage(`${data.message || data.error} (소요시간: ${elapsed}초)`);
          await fetchArticles();
        } catch {
          setMessage(`${cat} 기사를 불러오는 중 오류가 발생했습니다.`);
        } finally {
          setCategoryLoading(null);
        }
      }
    }
  };

  // 카테고리 버튼 (헤드라인 → 인기기사 → 최신기사 → 전체, 항상 표시)
  const CATEGORY_BUTTONS = ["헤드라인", "인기기사", "최신기사", "전체"];

  // 필터링
  const filtered =
    filter === "전체" ? articles : articles.filter((a) => a.category === filter);

  // 날짜별 그룹핑 후 그룹 내 카테고리 순 정렬 (헤드라인 → 인기기사 → 최신기사)
  const CATEGORY_ORDER: Record<string, number> = { "헤드라인": 0, "인기기사": 1, "최신기사": 2 };

  const grouped = filtered.reduce<Record<string, Article[]>>((acc, article) => {
    const date = article.fetched_at
      ? new Date(article.fetched_at).toLocaleDateString("ko-KR", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "날짜 미상";
    if (!acc[date]) acc[date] = [];
    acc[date].push(article);
    return acc;
  }, {});

  Object.values(grouped).forEach((group) => {
    group.sort((a, b) =>
      (CATEGORY_ORDER[a.category ?? ""] ?? 99) - (CATEGORY_ORDER[b.category ?? ""] ?? 99)
    );
  });

  return (
    <>
    <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8">
      {/* 헤더 */}
      <header className="mb-6 sm:mb-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
              AI Times 뉴스 요약
            </h1>
            <p className="text-gray-500 mt-1 text-sm">
              Claude AI가 최신 AI 뉴스를 요약해드립니다
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleReset}
              disabled={scraping || resetting}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-gray-100 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 text-gray-600 border border-gray-300 hover:border-red-300 px-4 py-2 rounded-lg font-medium transition-colors text-sm"
            >
              {resetting ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  초기화 중...
                </>
              ) : (
                "초기화"
              )}
            </button>
            <button
              onClick={handleScrape}
              disabled={scraping || resetting}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm"
            >
              {scraping ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  수집 중...
                </>
              ) : (
                "새로고침"
              )}
            </button>
          </div>
        </div>

        {message && (
          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-sm">
            {message}
          </div>
        )}
      </header>

      {/* 카테고리 필터 */}
      {articles.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {CATEGORY_BUTTONS.map((cat) => (
            <button
              key={cat}
              onClick={() => handleCategoryClick(cat)}
              disabled={categoryLoading === cat}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                filter === cat
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-600 border border-gray-300 hover:border-blue-400"
              } disabled:opacity-60`}
            >
              {categoryLoading === cat ? (
                <>
                  <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  로딩 중...
                </>
              ) : cat}
            </button>
          ))}
        </div>
      )}

      {/* 재수집 진행 배너 */}
      {resetting && (
        <div className="flex flex-col items-center justify-center py-20 gap-5">
          <div className="relative">
            <svg className="animate-spin h-16 w-16 text-blue-200" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            </svg>
            <svg className="animate-spin h-16 w-16 text-blue-500 absolute inset-0" style={{ animationDuration: "0.8s" }} viewBox="0 0 24 24" fill="none">
              <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-gray-800">재수집 중입니다...</p>
            <p className="text-sm text-gray-500 mt-1">기사를 가져오고 AI 요약을 생성하고 있습니다. 잠시만 기다려 주세요.</p>
          </div>
        </div>
      )}

      {/* 로딩 */}
      {loading && !resetting && (
        <div className="text-center py-20 text-gray-500">
          <svg className="animate-spin h-8 w-8 mx-auto mb-2 text-blue-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          불러오는 중...
        </div>
      )}

      {/* 빈 상태 */}
      {!loading && !resetting && filtered.length === 0 && (
        <div className="text-center py-20">
          <p className="text-gray-400 text-lg mb-4">수집된 뉴스가 없습니다</p>
          <p className="text-gray-400 text-sm mb-6">
            위의 <strong>지금 뉴스 수집</strong> 버튼을 눌러 aitimes.com에서 뉴스를 가져오세요.
          </p>
          <p className="text-gray-300 text-xs">
            매일 오전 8시에 자동으로 뉴스가 수집됩니다.
          </p>
        </div>
      )}

      {/* 뉴스 목록 */}
      <div ref={contentRef}>
        {!loading && !resetting &&
          Object.entries(grouped).map(([date, dateArticles]) => (
            <section key={date} className="mb-8">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 border-b border-gray-200 pb-2">
                {date} · {dateArticles.length}건
              </h2>
              <div className="space-y-4">
                {dateArticles.map((article) => (
                  <ArticleCard key={article.id} article={article} />
                ))}
              </div>
            </section>
          ))}
      </div>

      <p className="text-xs text-gray-400 mt-4 text-center">
        텍스트를 드래그하면 Claude에게 설명을 요청할 수 있습니다
      </p>
    </div>

    {/* 드래그 팝업 */}
    {popup && (
      <div
        id="ask-claude-popup"
        style={{
          position: "fixed",
          top: popup.isTouch ? popup.y + 8 : popup.y - 48,
          left: popup.isTouch
            ? Math.max(8, Math.min(popup.x, window.innerWidth - 130))
            : Math.max(8, Math.min(popup.x, window.innerWidth - 8)),
          transform: popup.isTouch ? "none" : "translateX(-50%)",
          zIndex: 50,
        }}
      >
        <button
          onMouseDown={(e) => e.preventDefault()}
          onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleAskClaude(); }}
          onClick={handleAskClaude}
          className="flex items-center gap-1.5 bg-gray-900 hover:bg-gray-700 text-white text-xs font-medium px-3 py-2 rounded-lg shadow-lg whitespace-nowrap transition-colors"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" />
          </svg>
          클로드에 물어보기
        </button>
      </div>
    )}

    {/* 설명 모달 */}
    {modal && (
      <div
        className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
        onClick={(e) => { if (e.target === e.currentTarget) setModal(null); }}
      >
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">Claude AI</span>
              <span className="text-sm font-medium text-gray-700">설명</span>
            </div>
            <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
          </div>

          <div className="px-5 py-4">
            <div className="bg-gray-50 rounded-lg px-3 py-2 mb-4 text-sm text-gray-600 border-l-4 border-blue-300 italic line-clamp-2">
              "{modal.text}"
            </div>

            <div className="text-sm text-gray-800 leading-relaxed min-h-[80px]">
              {modal.loading ? (
                <div className="flex items-center gap-2 text-gray-400">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  설명 생성 중...
                </div>
              ) : (
                modal.explanation
              )}
            </div>
          </div>

          <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
            <button
              onClick={() => setModal(null)}
              className="text-sm text-gray-500 hover:text-gray-700 px-4 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

function ArticleCard({ article }: { article: Article }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {article.category && (
            <span className="inline-block text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded mb-2">
              {article.category}
            </span>
          )}
          <Link href={`/article/${article.id}`}>
            <h3 className="text-base font-semibold text-gray-900 hover:text-blue-600 transition-colors leading-snug mb-2 cursor-pointer">
              {article.title}
            </h3>
          </Link>

          {article.summary ? (
            <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">
              {article.summary}
            </p>
          ) : (
            <p className="text-sm text-gray-400 italic">요약 준비 중...</p>
          )}

          {article.keywords && article.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {article.keywords.map((kw) => (
                <span
                  key={kw}
                  className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full"
                >
                  #{kw}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
        <span className="text-xs text-gray-400">
          {article.published_at || new Date(article.fetched_at).toLocaleString("ko-KR", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}
        </span>
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-500 hover:text-blue-700 font-medium"
        >
          원문 보기 →
        </a>
      </div>
    </div>
  );
}
