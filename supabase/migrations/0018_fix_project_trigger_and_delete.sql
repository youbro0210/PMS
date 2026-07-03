-- ============================================================
-- 0018: 프로젝트 생성 트리거 버그 수정 + 프로젝트 삭제 기능
--   1) enqueue_erp_sync: projects 테이블은 project_id가 없고 id가 곧 프로젝트 id.
--      entity='project'일 때 v_row.id를 프로젝트 id로 사용(그 외는 project_id).
--   2) admin_delete_project: 소유자/관리자만 프로젝트 삭제(자식 cascade).
--   멱등.
-- ============================================================

create or replace function public.enqueue_erp_sync()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_op   erp_sync_op;
  v_row  record;
  v_pid  uuid;
  v_id   uuid;
begin
  if tg_op = 'INSERT' then v_op := 'create'; v_row := new;
  elsif tg_op = 'UPDATE' then v_op := 'update'; v_row := new;
  else v_op := 'delete'; v_row := old;
  end if;

  v_id := v_row.id;
  -- projects 테이블은 project_id 컬럼이 없음 → id가 프로젝트 id
  if tg_argv[0] = 'project' then
    v_pid := v_row.id;
  else
    v_pid := v_row.project_id;
  end if;

  insert into public.erp_sync_outbox (project_id, entity, entity_id, op, payload, external_ref)
  values (
    v_pid, tg_argv[0], v_id, v_op,
    case when tg_op = 'DELETE' then jsonb_build_object('id', v_id) else to_jsonb(v_row) end,
    tg_argv[0] || ':' || v_id::text || ':' || v_op::text
  );

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

-- 프로젝트 삭제(소유자/관리자) — 자식 레코드는 FK on delete cascade로 함께 삭제
create or replace function public.admin_delete_project(p_project_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_system_admin() or public.get_project_role(p_project_id) = 'owner') then
    raise exception '프로젝트 삭제 권한이 없습니다(소유자 또는 시스템 관리자만).';
  end if;
  delete from public.projects where id = p_project_id;
end; $$;
grant execute on function public.admin_delete_project to authenticated;

-- ============================================================
-- 완료
-- ============================================================
