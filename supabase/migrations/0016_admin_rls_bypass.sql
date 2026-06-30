-- ============================================================
-- 0016: 건설/제조 도메인 테이블 RLS에 시스템 관리자 우회 추가
--   관리자가 본인이 멤버로 등록되지 않은 프로젝트에서도
--   단계 일정 배분·기성·원가·구매 등을 수정/삭제할 수 있도록.
--   (리스크·EVM·회계에 이어 동일 패턴 적용)  멱등.
-- ============================================================

do $$
declare
  t text;
  member_tables text[] := array[
    'subcontractors','work_packages','progress_records',
    'billings','budget_items','cost_entries','inspections'
  ];
begin
  foreach t in array member_tables loop
    execute format($f$
      drop policy if exists "%1$s 조회" on public.%1$I;
      drop policy if exists "%1$s 생성" on public.%1$I;
      drop policy if exists "%1$s 수정" on public.%1$I;
      drop policy if exists "%1$s 삭제" on public.%1$I;
      create policy "%1$s 조회" on public.%1$I for select
        using (public.is_project_member(project_id) or public.is_system_admin());
      create policy "%1$s 생성" on public.%1$I for insert
        with check (public.is_system_admin() or public.get_project_role(project_id) not in ('viewer'));
      create policy "%1$s 수정" on public.%1$I for update
        using (public.is_system_admin() or public.get_project_role(project_id) not in ('viewer'));
      create policy "%1$s 삭제" on public.%1$I for delete
        using (public.is_system_admin() or public.get_project_role(project_id) in ('owner','manager'));
    $f$, t);
  end loop;
end $$;

-- 구매(procurement_items)
drop policy if exists "구매 조회" on public.procurement_items;
drop policy if exists "구매 생성" on public.procurement_items;
drop policy if exists "구매 수정" on public.procurement_items;
drop policy if exists "구매 삭제" on public.procurement_items;
create policy "구매 조회" on public.procurement_items for select
  using (public.is_project_member(project_id) or public.is_system_admin());
create policy "구매 생성" on public.procurement_items for insert
  with check (public.is_system_admin() or public.get_project_role(project_id) not in ('viewer'));
create policy "구매 수정" on public.procurement_items for update
  using (public.is_system_admin() or public.get_project_role(project_id) not in ('viewer'));
create policy "구매 삭제" on public.procurement_items for delete
  using (public.is_system_admin() or public.get_project_role(project_id) in ('owner','manager'));

-- ============================================================
-- 완료
-- ============================================================
