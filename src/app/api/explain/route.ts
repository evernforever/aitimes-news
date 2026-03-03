import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  const { selectedText, articleTitle } = await req.json();

  if (!selectedText?.trim()) {
    return new Response("선택된 텍스트가 없습니다.", { status: 400 });
  }

  const prompt = `AI 뉴스 기사 "${articleTitle}"를 읽는 독자가 아래 텍스트를 선택했습니다.

선택된 텍스트:
"${selectedText}"

이 텍스트를 일반인도 쉽게 이해할 수 있도록 2~4문장으로 간략히 설명해주세요. 전문 용어가 있다면 풀어서 설명해주세요. 한국어로 답변하세요.`;

  const stream = await client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        if (
          chunk.type === "content_block_delta" &&
          chunk.delta.type === "text_delta"
        ) {
          controller.enqueue(encoder.encode(chunk.delta.text));
        }
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
