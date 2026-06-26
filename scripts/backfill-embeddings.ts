/**
 * (선택) 의미 검색용 임베딩 백필 스크립트.
 *
 * 0002_pgvector.sql로 tasks/공종 등에 임베딩 컬럼을 두고 의미 검색을 쓸 경우 사용한다.
 * 건설 MVP의 기본 검색은 단순 매칭(executors.search)이며, 대규모 현장에서
 * "비슷한 안전 지적사항 찾기" 같은 의미 검색이 필요해지면 활성화한다.
 *
 * 실행:  npm run embeddings:backfill
 * RLS와 무관한 시스템 작업이므로 service_role(untyped)을 사용한다.
 */
import { createClient } from "@supabase/supabase-js";
import { createEmbedding, toPgVector } from "@/lib/ai/embeddings";

const BATCH = 50;
const TABLE = process.env.EMBEDDING_TABLE ?? "tasks"; // 임베딩 컬럼을 둔 테이블

async function main() {
  // 제네릭 없이 생성해 임의 테이블 접근 허용
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const { data: rows, error } = await db
    .from(TABLE)
    .select("id, title, name, description")
    .is("embedding_updated_at", null)
    .limit(BATCH);

  if (error) throw error;
  if (!rows || rows.length === 0) {
    console.log("재생성할 임베딩이 없습니다.");
    return;
  }

  for (const r of rows as { id: string; title?: string; name?: string; description?: string }[]) {
    const text = [r.title ?? r.name, r.description].filter(Boolean).join("\n");
    const embedding = await createEmbedding(text);
    const { error: upErr } = await db
      .from(TABLE)
      .update({ embedding: toPgVector(embedding), embedding_updated_at: new Date().toISOString() })
      .eq("id", r.id);
    if (upErr) console.error(`실패 ${r.id}:`, upErr.message);
    else console.log(`완료 ${r.id}`);
  }
  console.log(`총 ${rows.length}건 처리.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
