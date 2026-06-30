-- ============================================================
-- [선행] 리스크·EVM 정책에 관리자 우회 추가(저장 RLS 오류 해결)
-- ============================================================
drop policy if exists "리스크 조회" on public.risk_register;
drop policy if exists "리스크 등록" on public.risk_register;
drop policy if exists "리스크 수정" on public.risk_register;
drop policy if exists "리스크 삭제" on public.risk_register;
create policy "리스크 조회" on public.risk_register for select using (public.is_project_member(project_id) or public.is_system_admin());
create policy "리스크 등록" on public.risk_register for insert with check (public.is_system_admin() or public.get_project_role(project_id) not in ('viewer'));
create policy "리스크 수정" on public.risk_register for update using (public.is_system_admin() or public.get_project_role(project_id) not in ('viewer'));
create policy "리스크 삭제" on public.risk_register for delete using (public.is_system_admin() or public.get_project_role(project_id) in ('owner','manager'));
drop policy if exists "스냅샷 조회" on public.evm_snapshots;
drop policy if exists "스냅샷 등록" on public.evm_snapshots;
drop policy if exists "스냅샷 삭제" on public.evm_snapshots;
create policy "스냅샷 조회" on public.evm_snapshots for select using (public.is_project_member(project_id) or public.is_system_admin());
create policy "스냅샷 등록" on public.evm_snapshots for insert with check (public.is_system_admin() or public.get_project_role(project_id) not in ('viewer'));
create policy "스냅샷 삭제" on public.evm_snapshots for delete using (public.is_system_admin() or public.get_project_role(project_id) in ('owner','manager'));

-- ============================================================
-- 0014: 회계 전표(복식부기) 연동
--   계정과목 → 전표(헤더) → 분개라인(차변/대변)
--   PMS 이벤트(기성·수금·원가·구매입고·선급금) 자동 분개 + ERP 전표 전송
--   * 자동 분개 함수는 SECURITY DEFINER → RLS 무관하게 생성
--   * 부가세율 10% 가정
--   0013 이후 실행. 멱등(여러 번 실행 안전).
-- ============================================================

-- ------------------------------------------------------------
-- A. 계정과목(Chart of Accounts)
-- ------------------------------------------------------------
create table if not exists public.account_codes (
  code text primary key,
  name text not null,
  type text not null check (type in ('asset','liability','equity','revenue','expense'))
);
insert into public.account_codes (code, name, type) values
  ('101','보통예금','asset'),
  ('108','외상매출금','asset'),
  ('120','미수금(유보금)','asset'),
  ('146','재고자산','asset'),
  ('251','미지급금','liability'),
  ('252','외상매입금','liability'),
  ('255','부가세예수금','liability'),
  ('259','선수금','liability'),
  ('404','공사매출','revenue'),
  ('501','재료비','expense'),
  ('504','노무비','expense'),
  ('506','외주비','expense'),
  ('511','경비','expense')
on conflict (code) do nothing;

alter table public.account_codes enable row level security;
drop policy if exists "계정 조회" on public.account_codes;
drop policy if exists "계정 관리" on public.account_codes;
create policy "계정 조회" on public.account_codes for select using (auth.uid() is not null);
create policy "계정 관리" on public.account_codes for all using (public.is_system_admin()) with check (public.is_system_admin());

-- ------------------------------------------------------------
-- B. 전표 헤더 + 분개 라인
-- ------------------------------------------------------------
create table if not exists public.journal_vouchers (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  voucher_no    text,
  voucher_date  date not null default current_date,
  type          text not null,                       -- sales|purchase|receipt|payment|transfer
  description   text,
  source        text not null default 'manual',      -- billing|cost|procurement|advance|manual
  source_id     uuid,
  status        text not null default 'posted',      -- draft|posted|synced
  total_amount  numeric not null default 0,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now()
);
create index if not exists idx_voucher_project on public.journal_vouchers(project_id, voucher_date);
-- 자동전표 중복 방지(같은 출처·전표유형은 1건)
create unique index if not exists uq_voucher_source on public.journal_vouchers(source, source_id, type) where source <> 'manual';

create table if not exists public.journal_lines (
  id           uuid primary key default gen_random_uuid(),
  voucher_id   uuid not null references public.journal_vouchers(id) on delete cascade,
  line_no      int not null default 1,
  account_code text not null references public.account_codes(code),
  debit        numeric not null default 0,
  credit       numeric not null default 0,
  description  text
);
create index if not exists idx_jline_voucher on public.journal_lines(voucher_id);

alter table public.journal_vouchers enable row level security;
drop policy if exists "전표 조회" on public.journal_vouchers;
drop policy if exists "전표 등록" on public.journal_vouchers;
drop policy if exists "전표 수정" on public.journal_vouchers;
drop policy if exists "전표 삭제" on public.journal_vouchers;
create policy "전표 조회" on public.journal_vouchers for select using (public.is_project_member(project_id) or public.is_system_admin());
create policy "전표 등록" on public.journal_vouchers for insert with check (public.is_system_admin() or public.get_project_role(project_id) not in ('viewer'));
create policy "전표 수정" on public.journal_vouchers for update using (public.is_system_admin() or public.get_project_role(project_id) not in ('viewer'));
create policy "전표 삭제" on public.journal_vouchers for delete using (public.is_system_admin() or public.get_project_role(project_id) in ('owner','manager'));

alter table public.journal_lines enable row level security;
drop policy if exists "분개 조회" on public.journal_lines;
drop policy if exists "분개 변경" on public.journal_lines;
create policy "분개 조회" on public.journal_lines for select using (
  exists (select 1 from public.journal_vouchers v where v.id = voucher_id and (public.is_project_member(v.project_id) or public.is_system_admin())));
create policy "분개 변경" on public.journal_lines for all using (
  exists (select 1 from public.journal_vouchers v where v.id = voucher_id and (public.is_system_admin() or public.get_project_role(v.project_id) not in ('viewer'))))
  with check (
  exists (select 1 from public.journal_vouchers v where v.id = voucher_id and (public.is_system_admin() or public.get_project_role(v.project_id) not in ('viewer'))));

-- ------------------------------------------------------------
-- C. 전표 생성 헬퍼 (분개 라인 jsonb 배열) — 자동·수동 공통
-- ------------------------------------------------------------
create or replace function public.acct_create_voucher(
  p_project_id uuid, p_type text, p_date date, p_desc text,
  p_source text, p_source_id uuid, p_lines jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_total numeric; ln jsonb; i int := 0;
begin
  if p_source <> 'manual' and p_source_id is not null then
    select id into v_id from public.journal_vouchers where source = p_source and source_id = p_source_id and type = p_type;
    if v_id is not null then return v_id; end if;
  end if;
  select coalesce(sum((e->>'debit')::numeric), 0) into v_total from jsonb_array_elements(p_lines) e;
  insert into public.journal_vouchers (project_id, voucher_no, voucher_date, type, description, source, source_id, status, total_amount, created_by)
  values (p_project_id,
    to_char(coalesce(p_date, current_date), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 4)),
    coalesce(p_date, current_date), p_type, p_desc, p_source, p_source_id, 'posted', v_total, auth.uid())
  returning id into v_id;
  for ln in select * from jsonb_array_elements(p_lines) loop
    i := i + 1;
    insert into public.journal_lines (voucher_id, line_no, account_code, debit, credit, description)
    values (v_id, i, ln->>'account', coalesce((ln->>'debit')::numeric, 0), coalesce((ln->>'credit')::numeric, 0), ln->>'desc');
  end loop;
  return v_id;
end; $$;
grant execute on function public.acct_create_voucher to authenticated;

-- ------------------------------------------------------------
-- D. 자동 분개 트리거
-- ------------------------------------------------------------
-- 기성: 확정→매출전표 / 지급→수금전표 (원도급 기성만)
create or replace function public.acct_on_billing() returns trigger language plpgsql security definer set search_path = public as $$
declare v_supply numeric; v_vat numeric;
begin
  if new.subcontractor_id is not null then return new; end if;
  v_supply := coalesce(new.this_amount, 0);
  v_vat := round(v_supply * 0.1);
  if new.status = 'confirmed' then
    perform public.acct_create_voucher(new.project_id, 'sales', coalesce(new.confirmed_at::date, current_date),
      new.period_no || '회차 기성 확정', 'billing', new.id,
      jsonb_build_array(
        jsonb_build_object('account','108','debit',v_supply + v_vat,'credit',0,'desc','외상매출금'),
        jsonb_build_object('account','404','debit',0,'credit',v_supply,'desc','공사매출'),
        jsonb_build_object('account','255','debit',0,'credit',v_vat,'desc','부가세예수금')));
  elsif new.status = 'paid' then
    perform public.acct_create_voucher(new.project_id, 'receipt', coalesce(new.paid_at::date, current_date),
      new.period_no || '회차 수금', 'billing', new.id,
      jsonb_build_array(
        jsonb_build_object('account','101','debit',coalesce(new.net_payment,0),'credit',0,'desc','보통예금'),
        jsonb_build_object('account','108','debit',0,'credit',coalesce(new.net_payment,0),'desc','외상매출금 회수')));
  end if;
  return new;
end; $$;
drop trigger if exists trg_acct_billing on public.billings;
create trigger trg_acct_billing after insert or update on public.billings for each row execute function public.acct_on_billing();

-- 원가: 비용전표
create or replace function public.acct_on_cost() returns trigger language plpgsql security definer set search_path = public as $$
declare v_acct text;
begin
  v_acct := case new.category when 'material' then '501' when 'labor' then '504' when 'subcontract' then '506' else '511' end;
  perform public.acct_create_voucher(new.project_id, 'purchase', coalesce(new.entry_date, current_date),
    coalesce(new.description, '원가 발생'), 'cost', new.id,
    jsonb_build_array(
      jsonb_build_object('account',v_acct,'debit',coalesce(new.amount,0),'credit',0,'desc','원가'),
      jsonb_build_object('account','251','debit',0,'credit',coalesce(new.amount,0),'desc','미지급금')));
  return new;
end; $$;
drop trigger if exists trg_acct_cost on public.cost_entries;
create trigger trg_acct_cost after insert on public.cost_entries for each row execute function public.acct_on_cost();

-- 구매 입고: 매입전표
create or replace function public.acct_on_proc() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('received','inspected') and coalesce(new.amount,0) > 0 then
    perform public.acct_create_voucher(new.project_id, 'purchase', coalesce(new.received_date, current_date),
      '기자재 입고: ' || new.name, 'procurement', new.id,
      jsonb_build_array(
        jsonb_build_object('account','146','debit',new.amount,'credit',0,'desc','재고자산'),
        jsonb_build_object('account','252','debit',0,'credit',new.amount,'desc','외상매입금')));
  end if;
  return new;
end; $$;
drop trigger if exists trg_acct_proc on public.procurement_items;
create trigger trg_acct_proc after insert or update on public.procurement_items for each row execute function public.acct_on_proc();

-- 선급금: 선수금전표
create or replace function public.acct_on_project() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.advance_payment,0) > 0 then
    perform public.acct_create_voucher(new.id, 'receipt', coalesce(new.start_date, current_date),
      '선급금 수령', 'advance', new.id,
      jsonb_build_array(
        jsonb_build_object('account','101','debit',new.advance_payment,'credit',0,'desc','보통예금'),
        jsonb_build_object('account','259','debit',0,'credit',new.advance_payment,'desc','선수금')));
  end if;
  return new;
end; $$;
drop trigger if exists trg_acct_project on public.projects;
create trigger trg_acct_project after insert on public.projects for each row execute function public.acct_on_project();

-- ------------------------------------------------------------
-- E. 계정 요약(시산표) 뷰
-- ------------------------------------------------------------
create or replace view public.account_summary as
select v.project_id, l.account_code, a.name as account_name, a.type,
  sum(l.debit) as debit_total, sum(l.credit) as credit_total,
  sum(l.debit) - sum(l.credit) as balance
from public.journal_lines l
join public.journal_vouchers v on v.id = l.voucher_id
join public.account_codes a on a.code = l.account_code
group by v.project_id, l.account_code, a.name, a.type;
comment on view public.account_summary is '프로젝트별 계정 차변·대변·잔액(시산표)';

-- ------------------------------------------------------------
-- F. ERP 연동 — 회계 모듈 + 전표 아웃박스
-- ------------------------------------------------------------
insert into public.erp_module_config (module, label) values ('accounting', '회계(전표·분개)')
on conflict (module) do nothing;

drop trigger if exists trg_erp_sync_accounting on public.journal_vouchers;
create trigger trg_erp_sync_accounting after insert or update or delete on public.journal_vouchers
  for each row execute function public.enqueue_erp_sync('accounting');

-- ============================================================
-- 완료
-- ============================================================
