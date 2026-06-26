/**
 * 임베딩 생성 유틸.
 * Anthropic은 임베딩 모델을 직접 제공하지 않으므로 서드파티(OpenAI 호환)를 사용한다.
 * 모델/엔드포인트는 환경변수로 분리해 교체 가능하게 둔다.
 */

const EMBEDDING_ENDPOINT = "https://api.openai.com/v1/embeddings";

export async function createEmbedding(text: string): Promise<number[]> {
  const res = await fetch(EMBEDDING_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.EMBEDDING_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small",
      input: text.slice(0, 8000), // 토큰 한도 방어
    }),
  });

  if (!res.ok) {
    throw new Error(`Embedding API error: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as { data: { embedding: number[] }[] };
  return json.data[0].embedding;
}

/** pgvector RPC에 넘길 때 사용하는 직렬화 형식: "[0.1,0.2,...]" */
export function toPgVector(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
