-- ============================================================
-- 0017: 도면 BOM 기준정보
--   도면 OCR(Claude 비전)로 추출한 자재표(BOM)를 프로젝트 기준정보로 저장.
--   구매구분: purchase(구매품)·outsource(외주품)·inhouse(자사생산품)
--   0016 이후 실행. 멱등.
-- ============================================================

create table if not exists public.bom_items (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  item_no       int,
  description   text not null,
  qty           numeric not null default 1,
  size          text,
  manufacturer  text,
  model         text,
  procure_type  text not null default 'purchase',   -- purchase | outsource | inhouse
  level         int not null default 1,             -- 조립 레벨(레벨별 PO 생성용)
  unit_price    numeric,
  amount        numeric,
  drawing_no    text,
  source_page   int,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_bom_project on public.bom_items(project_id, item_no);

alter table public.bom_items enable row level security;
drop policy if exists "BOM 조회" on public.bom_items;
drop policy if exists "BOM 등록" on public.bom_items;
drop policy if exists "BOM 수정" on public.bom_items;
drop policy if exists "BOM 삭제" on public.bom_items;
create policy "BOM 조회" on public.bom_items for select using (public.is_project_member(project_id) or public.is_system_admin());
create policy "BOM 등록" on public.bom_items for insert with check (public.is_system_admin() or public.get_project_role(project_id) not in ('viewer'));
create policy "BOM 수정" on public.bom_items for update using (public.is_system_admin() or public.get_project_role(project_id) not in ('viewer'));
create policy "BOM 삭제" on public.bom_items for delete using (public.is_system_admin() or public.get_project_role(project_id) in ('owner','manager'));

create or replace function public.touch_bom_updated()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;
drop trigger if exists trg_bom_touch on public.bom_items;
create trigger trg_bom_touch before update on public.bom_items
  for each row execute function public.touch_bom_updated();

-- 프로젝트별 구매구분 집계 뷰(예산·PO 연계용)
create or replace view public.bom_summary as
select project_id, procure_type,
  count(*) as item_count,
  sum(qty) as qty_total,
  sum(coalesce(amount, unit_price * qty, 0)) as amount_total
from public.bom_items
group by project_id, procure_type;
comment on view public.bom_summary is '프로젝트별 구매구분(구매·외주·자사) BOM 집계';

-- ============================================================
-- 완료
-- ============================================================
