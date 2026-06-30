-- ============================================================
-- 0012: EVM(성과분석)·리스크 관리
--   - evm_summary 뷰: 실행예산(BAC)·진척·원가로 PV/EV/AC·CPI/SPI·EAC 계산
--   - evm_snapshots 테이블: S-curve용 시점별 스냅샷(EV/AC 추세)
--   - capture_evm_snapshot(): 현재 evm_summary 값을 스냅샷으로 적재
--   - risk_register 테이블: 리스크 등록부(확률·영향·대응)
--   0011 이후 실행
-- ============================================================

-- ------------------------------------------------------------
-- A. EVM 요약 뷰 (수치는 모두 DB 집계에서 산출 → AI 환각 방지)
--    BAC = 실행예산 합계(budget_items), AC = 원가 집행 합계(cost_entries)
--    PV  = BAC × 계획공정률,  EV = BAC × 실적공정률
-- ------------------------------------------------------------
create or replace view public.evm_summary as
with base as (
  select
    p.id as project_id,
    coalesce((select sum(budget_amount) from public.budget_items bi where bi.project_id = p.id), 0)::numeric as bac,
    coalesce((select sum(amount) from public.cost_entries ce where ce.project_id = p.id), 0)::numeric as ac,
    coalesce((
      select round(sum(wp.weight * wp.planned_progress) / nullif(sum(wp.weight), 0), 2)
      from public.work_packages wp where wp.project_id = p.id
    ), 0)::numeric as planned_pct,
    coalesce((
      select round(sum(wp.weight * wp.actual_progress) / nullif(sum(wp.weight), 0), 2)
      from public.work_packages wp where wp.project_id = p.id
    ), 0)::numeric as actual_pct
  from public.projects p
)
select
  project_id,
  bac,
  ac,
  planned_pct,
  actual_pct,
  round(bac * planned_pct / 100, 0) as pv,          -- Planned Value
  round(bac * actual_pct  / 100, 0) as ev,          -- Earned Value
  -- 성과지수 (AC=0이면 null)
  round(case when ac > 0 then (bac * actual_pct / 100) / ac else null end, 3) as cpi,
  round(case when planned_pct > 0 then actual_pct / planned_pct else null end, 3) as spi,
  -- 예측: EAC = BAC / CPI, ETC = EAC - AC, VAC = BAC - EAC
  round(case when actual_pct > 0 and ac > 0 then ac * bac / (bac * actual_pct / 100) else bac end, 0) as eac,
  round(case when actual_pct > 0 and ac > 0 then ac * bac / (bac * actual_pct / 100) - ac else bac - ac end, 0) as etc,
  round(bac - (case when actual_pct > 0 and ac > 0 then ac * bac / (bac * actual_pct / 100) else bac end), 0) as vac,
  -- 차이: 일정차이(SV=EV-PV), 원가차이(CV=EV-AC)
  round(bac * actual_pct / 100 - bac * planned_pct / 100, 0) as sv,
  round(bac * actual_pct / 100 - ac, 0) as cv
from base;
comment on view public.evm_summary is 'EVM 성과분석(PV/EV/AC·CPI/SPI·EAC/ETC/VAC·SV/CV)';

-- ------------------------------------------------------------
-- B. S-curve용 스냅샷 — 시점별 EV/AC를 기록해 추세선을 그린다
-- ------------------------------------------------------------
create table if not exists public.evm_snapshots (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  snapshot_date date not null default current_date,
  bac          numeric not null default 0,
  pv           numeric not null default 0,
  ev           numeric not null default 0,
  ac           numeric not null default 0,
  cpi          numeric,
  spi          numeric,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  unique (project_id, snapshot_date)
);
comment on table public.evm_snapshots is 'EVM 시점별 스냅샷(S-curve 추세)';

create index if not exists idx_evm_snapshots_project on public.evm_snapshots(project_id, snapshot_date);

-- 현재 evm_summary 값을 오늘자 스냅샷으로 적재(있으면 갱신)
create or replace function public.capture_evm_snapshot(p_project_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v evm_summary%rowtype;
begin
  if not (public.is_project_member(p_project_id) or public.is_system_admin()) then
    raise exception '권한이 없습니다.';
  end if;
  select * into v from public.evm_summary where project_id = p_project_id;
  insert into public.evm_snapshots (project_id, snapshot_date, bac, pv, ev, ac, cpi, spi, created_by)
  values (p_project_id, current_date, coalesce(v.bac,0), coalesce(v.pv,0), coalesce(v.ev,0), coalesce(v.ac,0), v.cpi, v.spi, auth.uid())
  on conflict (project_id, snapshot_date) do update
    set bac = excluded.bac, pv = excluded.pv, ev = excluded.ev, ac = excluded.ac,
        cpi = excluded.cpi, spi = excluded.spi, created_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

alter table public.evm_snapshots enable row level security;
create policy "스냅샷 조회" on public.evm_snapshots for select using (public.is_project_member(project_id));
create policy "스냅샷 등록" on public.evm_snapshots for insert with check (public.get_project_role(project_id) not in ('viewer'));
create policy "스냅샷 삭제" on public.evm_snapshots for delete using (public.get_project_role(project_id) in ('owner','manager'));

-- ------------------------------------------------------------
-- C. 리스크 등록부
--    score = probability × impact (1~5 척도 → 1~25), 매트릭스 등급 산출
-- ------------------------------------------------------------
create table if not exists public.risk_register (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  title         text not null,
  category      text not null default 'schedule',   -- schedule|cost|quality|procurement|safety|external
  probability   int  not null default 3 check (probability between 1 and 5),
  impact        int  not null default 3 check (impact between 1 and 5),
  score         int  generated always as (probability * impact) stored,
  status        text not null default 'open',        -- open|mitigating|closed
  owner_id      uuid references public.profiles(id),
  mitigation    text,
  due_date      date,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.risk_register is '리스크 등록부(확률×영향 매트릭스·대응계획)';

create index if not exists idx_risk_project on public.risk_register(project_id, status);

alter table public.risk_register enable row level security;
create policy "리스크 조회" on public.risk_register for select using (public.is_project_member(project_id));
create policy "리스크 등록" on public.risk_register for insert with check (public.get_project_role(project_id) not in ('viewer'));
create policy "리스크 수정" on public.risk_register for update using (public.get_project_role(project_id) not in ('viewer'));
create policy "리스크 삭제" on public.risk_register for delete using (public.get_project_role(project_id) in ('owner','manager'));

-- 고위험(score>=15) 신규 등록 시 멤버 알림
create or replace function public.on_risk_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.score >= 15 then
    perform public.notify_members(new.project_id, 'risk', '고위험 리스크 등록',
      new.title || ' (위험도 ' || new.score || ')', '/projects/' || new.project_id || '/risks');
  end if;
  return new;
end;
$$;
create trigger trg_risk_notify after insert on public.risk_register
  for each row execute function public.on_risk_created();

-- updated_at 자동 갱신
create or replace function public.touch_risk_updated()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;
create trigger trg_risk_touch before update on public.risk_register
  for each row execute function public.touch_risk_updated();

-- ============================================================
-- 완료
-- ============================================================
