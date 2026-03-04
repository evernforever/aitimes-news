"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Article } from "@/types";

export default function ArticlePage() {
  const params = useParams();
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);

  // 텍스트 선택 팝업
  const [popup, setPopup] = useState<{ x: number; y: number; text: string; isTouch: boolean } | null>(null);

  // 설명 모달
  const [modal, setModal] = useState<{ text: string; explanation: string; loading: boolean } | null>(null);

  const articleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/news/${params.id}`)
      .then((r) => r.json())
      .then((data) => setArticle(data.article || null))
      .finally(() => setLoading(false));
  }, [params.id]);

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
        if (!articleRef.current?.contains(anchorNode as Node)) {
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
    if (!popup || !article) return;
    const selectedText = popup.text;
    setPopup(null);
    window.getSelection()?.removeAllRanges();

    setModal({ text: selectedText, explanation: "", loading: true });

    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedText, articleTitle: article.title }),
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
  }, [popup, article]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center text-gray-500">
        <svg className="animate-spin h-8 w-8 mx-auto text-blue-500" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-400 text-lg mb-4">기사를 찾을 수 없습니다.</p>
        <Link href="/" className="text-blue-500 hover:underline">← 목록으로</Link>
      </div>
    );
  }

  return (
    <>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link href="/" className="text-sm text-blue-500 hover:underline mb-6 block">
          ← 목록으로
        </Link>

        <article ref={articleRef}>
          {article.category && (
            <span className="inline-block text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded mb-3">
              {article.category}
            </span>
          )}

          <h1 className="text-2xl font-bold text-gray-900 leading-snug mb-3">
            {article.title}
          </h1>

          <div className="flex items-center gap-3 text-sm text-gray-500 mb-6">
            <span>
              {article.published_at ||
                new Date(article.fetched_at).toLocaleString("ko-KR", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}
            </span>
            <a href={article.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
              원문 보기 →
            </a>
          </div>

          {article.summary && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                  Claude AI 요약
                </span>
              </div>
              <p className="text-gray-800 leading-relaxed text-sm">{article.summary}</p>
              {article.keywords && article.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-4">
                  {article.keywords.map((kw) => (
                    <span key={kw} className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
                      #{kw}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {article.content && (
            <div>
              <h2 className="text-lg font-semibold text-gray-800 mb-3">원문 내용</h2>
              <div className="text-gray-700 leading-relaxed whitespace-pre-line text-sm bg-white border border-gray-200 rounded-xl p-5">
                {article.content}
              </div>
            </div>
          )}

          <p className="text-xs text-gray-400 mt-4 text-center">
            텍스트를 드래그하면 Claude에게 설명을 요청할 수 있습니다
          </p>
        </article>
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
