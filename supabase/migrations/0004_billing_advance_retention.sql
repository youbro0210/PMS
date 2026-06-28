-- ============================================================
-- 0004: 선급금(Advance) · 기성 유보(Retention) 정산
--   0003_construction.sql 이후 실행
-- ============================================================

-- ------------------------------------------------------------
-- A. 프로젝트(현장) 계약 조건
-- ------------------------------------------------------------
alter table public.projects
  add column if not exists advance_payment      numeric(16, 0) default 0,  -- 선급금 총액
  add column if not exists advance_recovery_rate numeric(5, 2) default 0,  -- 기성당 선급금 정산율(%)
  add column if not exists retention_rate        numeric(5, 2) default 0;  -- 기성 유보율(%)

comment on column public.projects.advance_payment is '계약 선급금 총액(원)';
comment on column public.projects.advance_recovery_rate is '기성 발생 시 선급금 정산 비율(%) — 금회 기성액에 곱해 차감';
comment on column public.projects.retention_rate is '기성 유보율(%) — 금회 기성액에서 유보(준공/하자담보 시 정산)';


-- ------------------------------------------------------------
-- B. 기성 정산 컬럼
-- ------------------------------------------------------------
alter table public.billings
  add column if not exists retention_amount   numeric(16, 0) default 0,  -- 금회 유보액
  add column if not exists advance_deduction  numeric(16, 0) default 0,  -- 금회 선급금 정산액
  add column if not exists net_payment        numeric(16, 0) default 0;  -- 실지급액

comment on column public.billings.retention_amount is '금회 기성액 × 유보율';
comment on column public.billings.advance_deduction is '금회 기성액 × 선급금 정산율';
comment on column public.billings.net_payment is '실지급액 = 금회 기성액 − 유보액 − 선급금 정산액';

-- 실지급액 자동 산정 트리거 (입력 누락 시 보정)
create or replace function public.calc_billing_net()
returns trigger as $$
begin
  new.net_payment :=
    coalesce(new.this_amount, 0)
    - coalesce(new.retention_amount, 0)
    - coalesce(new.advance_deduction, 0);
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_billing_net on public.billings;
create trigger trg_billing_net
  before insert or update on public.billings
  for each row execute function public.calc_billing_net();


-- ------------------------------------------------------------
-- C. 기성 현황 뷰 보강 — 유보 누계·선급금 잔액·실지급 누계
-- ------------------------------------------------------------
drop view if exists public.billing_summary;
create view public.billing_summary as
select
  b.project_id,
  count(*)                          as billing_count,
  max(b.period_no)                  as latest_period,
  max(b.cumulative_amount)          as cumulative_billed,   -- 누계 기성액
  max(b.contract_amount)            as contract_amount,
  round(
    max(b.cumulative_amount)::numeric / nullif(max(b.contract_amount), 0) * 100, 2
  )                                 as billed_rate,          -- 기성률(%)
  sum(b.retention_amount)           as retention_held,       -- 누계 유보액
  sum(b.advance_deduction)          as advance_recovered,    -- 누계 선급금 정산액
  sum(b.net_payment)                as net_paid_total,       -- 누계 실지급액
  (p.advance_payment - coalesce(sum(b.advance_deduction), 0)) as advance_balance  -- 선급금 잔액
from public.billings b
join public.projects p on p.id = b.project_id
where b.subcontractor_id is null   -- 원도급(발주처 대상) 기성 기준
group by b.project_id, p.advance_payment;

comment on view public.billing_summary is '원도급 기성 현황(기성률·유보 누계·선급금 잔액·실지급 누계)';


-- ============================================================
-- 완료
-- ============================================================
