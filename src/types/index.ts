export interface Article {
  id: number;
  title: string;
  url: string;
  category: string | null;
  content: string | null;
  summary: string | null;
  keywords: string[] | null;
  published_at: string | null;
  fetched_at: string;
}
