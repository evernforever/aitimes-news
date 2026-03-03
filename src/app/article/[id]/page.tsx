"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Article } from "@/types";

export default function ArticlePage() {
  const params = useParams();
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/news/${params.id}`)
      .then((r) => r.json())
      .then((data) => setArticle(data.article || null))
      .finally(() => setLoading(false));
  }, [params.id]);

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
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link href="/" className="text-sm text-blue-500 hover:underline mb-6 block">
        ← 목록으로
      </Link>

      <article>
        {article.category && (
          <span className="inline-block text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded mb-3">
            {article.category}
          </span>
        )}

        <h1 className="text-2xl font-bold text-gray-900 leading-snug mb-3">
          {article.title}
        </h1>

        <div className="flex items-center gap-3 text-sm text-gray-500 mb-6">
          <span>{article.published_at || "날짜 미상"}</span>
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline"
          >
            원문 보기 →
          </a>
        </div>

        {/* AI 요약 */}
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
                  <span
                    key={kw}
                    className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full"
                  >
                    #{kw}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 원문 본문 */}
        {article.content && (
          <div className="prose prose-sm max-w-none">
            <h2 className="text-lg font-semibold text-gray-800 mb-3">원문 내용</h2>
            <div className="text-gray-700 leading-relaxed whitespace-pre-line text-sm bg-white border border-gray-200 rounded-xl p-5">
              {article.content}
            </div>
          </div>
        )}
      </article>
    </div>
  );
}
