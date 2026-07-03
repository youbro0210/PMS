-- ============================================================
-- 0020: BOM → 발주(PO) 자동생성 + 구매구분별 리드타임(L/T)
--   공종/구매구분별 표준 L/T로 BOM에서 발주를 자동 생성하고
--   납기 역산(delivery) 또는 착수 정산(start)으로 발주일·입고예정(ETA)을 계산.
--   롱리드(L/T>=8주)는 임계경로로 표시. 구매품·외주품만 발주(자사생산품=자체 제작).
--   0019 이후 실행. 멱등.
-- ============================================================

-- BOM 품목별 L/T(주) 오버라이드
alter table public.bom_items add column if not exists lead_time_weeks int;

-- 구매구분별 표준 L/T(주) 기본값
create table if not exists public.leadtime_defaults (
  procure_type text primary key,
  weeks int not null default 4
);
insert into public.leadtime_defaults (procure_type, weeks) values
  ('purchase', 4), ('outsource', 8), ('inhouse', 6)
on conflict (procure_type) do nothing;
alter table public.leadtime_defaults enable row level security;
drop policy if exists "LT 조회" on public.leadtime_defaults;
drop policy if exists "LT 관리" on public.leadtime_defaults;
create policy "LT 조회" on public.leadtime_defaults for select using (auth.uid() is not null);
create policy "LT 관리" on public.leadtime_defaults for all using (public.is_system_admin()) with check (public.is_system_admin());

-- 발주와 BOM 연결
alter table public.procurement_items add column if not exists bom_item_id uuid references public.bom_items(id) on delete set null;

-- BOM → 발주 자동생성
create or replace function public.generate_pos_from_bom(
  p_project_id uuid, p_basis text default 'delivery', p_anchor date default null
)
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; v_lt int; v_order date; v_eta date; v_anchor date;
begin
  if not (public.is_system_admin() or public.get_project_role(p_project_id) not in ('viewer')) then
    raise exception '권한이 없습니다.';
  end if;

  v_anchor := coalesce(p_anchor,
    case when p_basis = 'start'
      then (select coalesce(start_date, current_date) from public.projects where id = p_project_id)
      else (select coalesce(delivery_date, end_date, current_date + 180) from public.projects where id = p_project_id)
    end);

  -- 기존 BOM 연동 발주 제거 후 재생성(멱등)
  delete from public.procurement_items where project_id = p_project_id and bom_item_id is not null;

  for r in
    select b.*, coalesce(b.lead_time_weeks, d.weeks, 4) as lt
    from public.bom_items b
    left join public.leadtime_defaults d on d.procure_type = b.procure_type
    where b.project_id = p_project_id and b.procure_type in ('purchase', 'outsource')
  loop
    v_lt := r.lt;
    if p_basis = 'start' then
      v_order := v_anchor; v_eta := v_anchor + (v_lt * 7);
    else
      v_eta := v_anchor; v_order := v_anchor - (v_lt * 7);
    end if;
    insert into public.procurement_items
      (project_id, bom_item_id, name, spec, qty, unit, amount, lead_time_weeks, order_date, eta, is_long_lead, status)
    values
      (p_project_id, r.id, r.description, r.size, r.qty, 'EA',
       coalesce(r.amount, r.unit_price * r.qty, 0), v_lt, v_order, v_eta, (v_lt >= 8),
       (case when p_basis = 'start' then 'ordered' else 'planned' end)::procurement_status);
    n := n + 1;
  end loop;

  return n;
end; $$;
grant execute on function public.generate_pos_from_bom to authenticated;

-- ============================================================
-- 완료
-- ============================================================
