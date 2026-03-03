import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function summarizeArticle(
  title: string,
  content: string
): Promise<{ summary: string; keywords: string[] }> {
  const prompt = `다음 AI 뉴스 기사를 한국어로 요약해주세요.

제목: ${title}

본문:
${content}

다음 JSON 형식으로만 응답해주세요. 다른 텍스트는 포함하지 마세요:
{
  "summary": "3~5문장으로 핵심 내용을 요약한 텍스트",
  "keywords": ["키워드1", "키워드2", "키워드3", "키워드4", "키워드5"]
}`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const responseText =
    message.content[0].type === "text" ? message.content[0].text : "";

  try {
    // JSON 파싱
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      summary: parsed.summary || "",
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
    };
  } catch {
    // 파싱 실패 시 텍스트를 그대로 요약으로 사용
    return {
      summary: responseText.slice(0, 500),
      keywords: [],
    };
  }
}
