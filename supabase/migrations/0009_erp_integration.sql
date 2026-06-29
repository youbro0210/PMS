-- ============================================================
-- 0009: ERP 연동 (더존 ERP-iU / 옴니이솔)
--   변경 아웃박스 + 코드 매핑 + 외부문서번호 + 자동 적재 트리거
--   0008 이후 실행. 설계 배경: docs/ERP_INTEGRATION.md
-- ============================================================

-- ------------------------------------------------------------
-- A. ENUM
-- ------------------------------------------------------------
create type erp_sync_op as enum ('create', 'update', 'delete');
create type erp_sync_status as enum ('pending', 'sent', 'confirmed', 'failed', 'skipped');

-- ------------------------------------------------------------
-- B. 동기화 아웃박스 — 저장(입력/수정/삭제) 변경분을 큐로 적재
-- ------------------------------------------------------------
create table public.erp_sync_outbox (
  id            uuid primary key default uuid_generate_v4(),
  project_id    uuid references public.projects(id) on delete set null,
  entity        text not null,                 -- 'billing' | 'procurement' | 'project' | ...
  entity_id     uuid not null,                 -- 원본 레코드 id
  op            erp_sync_op not null,
  payload       jsonb not null default '{}',   -- 전송 스냅샷
  external_ref  text,                          -- 멱등성 키(entity:id:op 등)
  status        erp_sync_status not null default 'pending',
  attempts      int not null default 0,
  erp_doc_no    text,                          -- ERP가 회신한 전표/문서번호
  error         text,
  created_at    timestamptz default now(),
  processed_at  timestamptz
);
create index idx_erp_outbox_status on public.erp_sync_outbox(status, created_at);
create index idx_erp_outbox_entity on public.erp_sync_outbox(entity, entity_id);

comment on table public.erp_sync_outbox is 'ERP 연동 변경 큐(저장 시 자동 적재, 동기화 워커가 처리)';

-- ------------------------------------------------------------
-- C. 코드 매핑 — PMS 코드 ↔ ERP 코드 (거래처/품목/계정/프로젝트 등)
-- ------------------------------------------------------------
create table public.erp_mapping (
  id           uuid primary key default uuid_generate_v4(),
  kind         text not null,                  -- 'vendor' | 'item' | 'account' | 'project' | 'doc'
  pms_id       text not null,                  -- PMS 측 식별자(uuid 또는 코드)
  erp_code     text not null,                  -- ERP 측 코드/번호
  note         text,
  updated_at   timestamptz default now(),
  unique (kind, pms_id)
);
comment on table public.erp_mapping is 'PMS↔ERP 코드 매핑(거래처·품목·계정·문서)';

-- ------------------------------------------------------------
-- D. 원본 테이블에 외부문서번호/동기화 시각
-- ------------------------------------------------------------
alter table public.billings          add column if not exists erp_doc_no text, add column if not exists erp_synced_at timestamptz;
alter table public.procurement_items add column if not exists erp_doc_no text, add column if not exists erp_synced_at timestamptz;
alter table public.projects          add column if not exists erp_doc_no text, add column if not exists erp_synced_at timestamptz;

-- ------------------------------------------------------------
-- E. RLS — 아웃박스/매핑은 시스템 영역. 멤버 조회만, 쓰기는 트리거/서비스.
-- ------------------------------------------------------------
alter table public.erp_sync_outbox enable row level security;
alter table public.erp_mapping     enable row level security;

create policy "연동 큐 조회" on public.erp_sync_outbox for select
  using (project_id is null or public.is_project_member(project_id));
create policy "매핑 조회" on public.erp_mapping for select
  using (auth.uid() is not null);
-- 쓰기(insert/update/delete)는 트리거(security definer) 및 service_role로만 수행 → 별도 정책 없음.

-- ------------------------------------------------------------
-- F. 자동 적재 트리거 — 저장(입력/수정/삭제) 시 아웃박스에 기록
-- ------------------------------------------------------------
create or replace function public.enqueue_erp_sync()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_op     erp_sync_op;
  v_row    record;
  v_pid    uuid;
  v_id     uuid;
begin
  if tg_op = 'INSERT' then v_op := 'create'; v_row := new;
  elsif tg_op = 'UPDATE' then v_op := 'update'; v_row := new;
  else v_op := 'delete'; v_row := old;
  end if;

  v_id  := v_row.id;
  v_pid := v_row.project_id;

  insert into public.erp_sync_outbox (project_id, entity, entity_id, op, payload, external_ref)
  values (
    v_pid, tg_argv[0], v_id, v_op,
    case when tg_op = 'DELETE' then jsonb_build_object('id', v_id) else to_jsonb(v_row) end,
    tg_argv[0] || ':' || v_id::text || ':' || v_op::text
  );

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

-- 대금(기성), 구매(기자재), 수주(프로젝트) 저장 시 적재
create trigger trg_erp_sync_billing
  after insert or update or delete on public.billings
  for each row execute function public.enqueue_erp_sync('billing');

create trigger trg_erp_sync_procurement
  after insert or update or delete on public.procurement_items
  for each row execute function public.enqueue_erp_sync('procurement');

create trigger trg_erp_sync_project
  after insert or update or delete on public.projects
  for each row execute function public.enqueue_erp_sync('project');

-- ============================================================
-- 완료. 연동 방식 확정 후 lib/erp 어댑터의 전송 로직을 채우면 동작.
-- ============================================================
