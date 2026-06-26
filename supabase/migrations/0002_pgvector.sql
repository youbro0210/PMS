-- ============================================================
-- 0002: pgvector 의미 검색 추가
-- 0001_init.sql 이후 실행
-- ============================================================

-- 1. pgvector 확장
create extension if not exists vector;

-- 2. tasks 임베딩 컬럼 (title + description 결합 임베딩)
--    차원수는 사용하는 임베딩 모델에 맞춤 (text-embedding-3-small = 1536)
alter table public.tasks
  add column if not exists embedding vector(1536),
  add column if not exists embedding_updated_at timestamptz;

comment on column public.tasks.embedding is '의미 검색용 임베딩 (title+description)';
comment on column public.tasks.embedding_updated_at is 'null이면 재생성 대상';

-- 3. HNSW 인덱스 (코사인 거리, 정확도/속도 균형)
create index if not exists idx_tasks_embedding on public.tasks
  using hnsw (embedding vector_cosine_ops);

-- 4. 내용 변경 시 임베딩을 stale로 표시하는 트리거
create or replace function public.mark_embedding_stale()
returns trigger as $$
begin
  if (new.title is distinct from old.title)
     or (new.description is distinct from old.description) then
    new.embedding_updated_at = null;  -- null = 재생성 필요
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_tasks_embedding_stale on public.tasks;
create trigger trg_tasks_embedding_stale
  before update on public.tasks
  for each row execute function public.mark_embedding_stale();

-- 5. 하이브리드 검색 RPC (trgm + vector 가중 결합)
--    security invoker → 호출자 RLS 적용 (멤버 프로젝트만 검색됨)
create or replace function public.search_tasks_hybrid(
  p_project_id uuid,
  p_query      text,
  p_embedding  vector(1536),
  p_limit      int default 5
)
returns table (
  id uuid,
  title text,
  status task_status,
  trgm_score real,
  vector_score real,
  hybrid_score real
)
language sql stable security invoker
as $$
  select
    t.id,
    t.title,
    t.status,
    similarity(t.title, p_query)                  as trgm_score,
    (1 - (t.embedding <=> p_embedding))::real      as vector_score,
    (0.4 * similarity(t.title, p_query)
     + 0.6 * (1 - (t.embedding <=> p_embedding)))::real as hybrid_score
  from public.tasks t
  where t.project_id = p_project_id
    and t.embedding is not null
  order by hybrid_score desc
  limit p_limit;
$$;

comment on function public.search_tasks_hybrid is 'trgm+벡터 하이브리드 태스크 검색 (엔티티 해소·검색용)';
