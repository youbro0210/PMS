-- ============================================================
-- 0015: 회계 전표 보완
--   1) 계정과목 추가: 현금·당좌예금·받을어음·지급어음·선급금·부가세대급금·예수금
--   2) 수금 분개 차/대 정합: 보통예금+유보금+선수금정산 = 외상매출금 (균형)
--   3) 기존 데이터 자동전표 생성 함수(acct_backfill_project)
--   0014 이후 실행. 멱등.
-- ============================================================

-- 1) 계정과목 추가
insert into public.account_codes (code, name, type) values
  ('100','현금','asset'),
  ('102','당좌예금','asset'),
  ('110','받을어음','asset'),
  ('134','선급금','asset'),
  ('135','부가세대급금','asset'),
  ('253','지급어음','liability'),
  ('257','예수금','liability')
on conflict (code) do nothing;

-- 2) 수금 분개 라인 빌더 — 균형 보장(차변 합 = 외상매출금 대변)
create or replace function public.acct_receipt_lines(p_net numeric, p_ret numeric, p_adv numeric, p_this numeric)
returns jsonb language sql immutable as $$
  select jsonb_build_array(jsonb_build_object('account','101','debit',coalesce(p_net,0),'credit',0,'desc','보통예금'))
    || case when coalesce(p_ret,0) > 0 then jsonb_build_array(jsonb_build_object('account','120','debit',p_ret,'credit',0,'desc','유보금(미수금)')) else '[]'::jsonb end
    || case when coalesce(p_adv,0) > 0 then jsonb_build_array(jsonb_build_object('account','259','debit',p_adv,'credit',0,'desc','선수금 정산')) else '[]'::jsonb end
    || jsonb_build_array(jsonb_build_object('account','108','debit',0,'credit',coalesce(p_this,0),'desc','외상매출금 회수'));
$$;

-- 기성 트리거 재정의: 매출은 공급가 기준(균형), 수금은 유보·선급 정산 포함
create or replace function public.acct_on_billing() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.subcontractor_id is not null then return new; end if;
  if new.status in ('confirmed','paid') then
    perform public.acct_create_voucher(new.project_id, 'sales', coalesce(new.confirmed_at::date, current_date),
      new.period_no || '회차 기성 확정', 'billing', new.id,
      jsonb_build_array(
        jsonb_build_object('account','108','debit',coalesce(new.this_amount,0),'credit',0,'desc','외상매출금'),
        jsonb_build_object('account','404','debit',0,'credit',coalesce(new.this_amount,0),'desc','공사매출')));
  end if;
  if new.status = 'paid' then
    perform public.acct_create_voucher(new.project_id, 'receipt', coalesce(new.paid_at::date, current_date),
      new.period_no || '회차 수금', 'billing', new.id,
      public.acct_receipt_lines(new.net_payment, new.retention_amount, new.advance_deduction, new.this_amount));
  end if;
  return new;
end; $$;

-- 3) 기존 데이터 자동전표 생성(백필) — 트리거 설치 전 데이터까지 전표화. 멱등.
create or replace function public.acct_backfill_project(p_project_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  if not (public.is_project_member(p_project_id) or public.is_system_admin()) then
    raise exception '권한이 없습니다.';
  end if;

  -- 선급금
  for r in select id, advance_payment, start_date from public.projects where id = p_project_id and coalesce(advance_payment,0) > 0 loop
    perform public.acct_create_voucher(p_project_id, 'receipt', coalesce(r.start_date, current_date), '선급금 수령', 'advance', r.id,
      jsonb_build_array(
        jsonb_build_object('account','101','debit',r.advance_payment,'credit',0,'desc','보통예금'),
        jsonb_build_object('account','259','debit',0,'credit',r.advance_payment,'desc','선수금'))); n := n + 1;
  end loop;

  -- 기성(원도급): 확정→매출, 지급→수금
  for r in select * from public.billings where project_id = p_project_id and subcontractor_id is null loop
    if r.status in ('confirmed','paid') then
      perform public.acct_create_voucher(p_project_id, 'sales', coalesce(r.confirmed_at::date, current_date),
        r.period_no || '회차 기성 확정', 'billing', r.id,
        jsonb_build_array(
          jsonb_build_object('account','108','debit',coalesce(r.this_amount,0),'credit',0,'desc','외상매출금'),
          jsonb_build_object('account','404','debit',0,'credit',coalesce(r.this_amount,0),'desc','공사매출'))); n := n + 1;
    end if;
    if r.status = 'paid' then
      perform public.acct_create_voucher(p_project_id, 'receipt', coalesce(r.paid_at::date, current_date),
        r.period_no || '회차 수금', 'billing', r.id,
        public.acct_receipt_lines(r.net_payment, r.retention_amount, r.advance_deduction, r.this_amount)); n := n + 1;
    end if;
  end loop;

  -- 원가
  for r in select * from public.cost_entries where project_id = p_project_id loop
    perform public.acct_create_voucher(p_project_id, 'purchase', coalesce(r.entry_date, current_date),
      coalesce(r.description,'원가 발생'), 'cost', r.id,
      jsonb_build_array(
        jsonb_build_object('account',(case r.category when 'material' then '501' when 'labor' then '504' when 'subcontract' then '506' else '511' end),'debit',coalesce(r.amount,0),'credit',0,'desc','원가'),
        jsonb_build_object('account','251','debit',0,'credit',coalesce(r.amount,0),'desc','미지급금'))); n := n + 1;
  end loop;

  -- 구매 입고
  for r in select * from public.procurement_items where project_id = p_project_id and status in ('received','inspected') and coalesce(amount,0) > 0 loop
    perform public.acct_create_voucher(p_project_id, 'purchase', coalesce(r.received_date, current_date),
      '기자재 입고: ' || r.name, 'procurement', r.id,
      jsonb_build_array(
        jsonb_build_object('account','146','debit',r.amount,'credit',0,'desc','재고자산'),
        jsonb_build_object('account','252','debit',0,'credit',r.amount,'desc','외상매입금'))); n := n + 1;
  end loop;

  return n;
end; $$;
grant execute on function public.acct_backfill_project to authenticated;

-- ============================================================
-- 완료
-- ============================================================
