-- ============================================================
-- 0008: 알림(Notifications) · 활동 로그(Activity Log / 감사)
--   0007 이후 실행
-- ============================================================

-- ------------------------------------------------------------
-- A. 활동 로그 (감사 추적)
-- ------------------------------------------------------------
create table public.activity_log (
  id          uuid primary key default uuid_generate_v4(),
  project_id  uuid references public.projects(id) on delete cascade,
  actor_id    uuid references public.profiles(id) on delete set null,
  entity      text not null,         -- billing / procurement / inspection / phase / member
  action      text not null,         -- created / updated / status_changed
  summary     text,
  created_at  timestamptz default now()
);
create index idx_activity_project on public.activity_log(project_id, created_at desc);

alter table public.activity_log enable row level security;
create policy "활동 조회" on public.activity_log for select
  using (public.is_project_member(project_id));


-- ------------------------------------------------------------
-- B. 알림
-- ------------------------------------------------------------
create table public.notifications (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  project_id  uuid references public.projects(id) on delete cascade,
  type        text not null,         -- member / billing / inspection / procurement
  title       text not null,
  body        text,
  link        text,
  is_read     boolean default false,
  created_at  timestamptz default now()
);
create index idx_notif_user on public.notifications(user_id, is_read, created_at desc);

alter table public.notifications enable row level security;
create policy "내 알림 조회" on public.notifications for select using (user_id = auth.uid());
create policy "내 알림 수정" on public.notifications for update using (user_id = auth.uid());
create policy "내 알림 삭제" on public.notifications for delete using (user_id = auth.uid());


-- ------------------------------------------------------------
-- C. 헬퍼 — 프로젝트 멤버 전원에게 알림
-- ------------------------------------------------------------
create or replace function public.notify_members(
  p_project_id uuid, p_type text, p_title text, p_body text, p_link text
)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, project_id, type, title, body, link)
  select pm.user_id, p_project_id, p_type, p_title, p_body, p_link
  from public.project_members pm
  where pm.project_id = p_project_id;
end;
$$;

create or replace function public.won(n numeric)
returns text language sql immutable as $$
  select to_char(coalesce(n, 0), 'FM999,999,999,999') || '원';
$$;


-- ------------------------------------------------------------
-- D. 이벤트 트리거 — 대금 / 구매 / 점검 / 진척
-- ------------------------------------------------------------

-- 대금 등록
create or replace function public.on_billing_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.activity_log (project_id, actor_id, entity, action, summary)
  values (new.project_id, auth.uid(), 'billing', 'created',
          new.period_no || '회차 대금 ' || public.won(new.this_amount) || ' 청구');
  perform public.notify_members(new.project_id, 'billing', '대금 청구 등록',
          new.period_no || '회차 ' || public.won(new.this_amount), '/projects/' || new.project_id || '/billings');
  return new;
end; $$;
create trigger trg_billing_activity after insert on public.billings
  for each row execute function public.on_billing_created();

-- 기자재 등록/상태변경
create or replace function public.on_procurement_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.activity_log (project_id, actor_id, entity, action, summary)
    values (new.project_id, auth.uid(), 'procurement', 'created',
            '기자재 발주: ' || new.name || case when new.is_long_lead then ' (롱리드)' else '' end);
    if new.is_long_lead then
      perform public.notify_members(new.project_id, 'procurement', '롱리드 자재 발주',
              new.name || ' · ETA ' || coalesce(new.eta::text, '미정'), '/projects/' || new.project_id || '/procurement');
    end if;
  elsif new.status is distinct from old.status then
    insert into public.activity_log (project_id, actor_id, entity, action, summary)
    values (new.project_id, auth.uid(), 'procurement', 'status_changed',
            new.name || ' 상태 → ' || new.status);
  end if;
  return new;
end; $$;
create trigger trg_proc_activity after insert or update on public.procurement_items
  for each row execute function public.on_procurement_change();

-- 점검(FAT/품질/안전)
create or replace function public.on_inspection_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.activity_log (project_id, actor_id, entity, action, summary)
  values (new.project_id, auth.uid(), 'inspection', 'created',
          new.type || ' 점검: ' || new.result);
  if new.result = 'fail' then
    perform public.notify_members(new.project_id, 'inspection', '점검 불합격',
            new.type || ' 불합격 — 시정 필요', null);
  end if;
  return new;
end; $$;
create trigger trg_insp_activity after insert on public.inspections
  for each row execute function public.on_inspection_created();

-- 단계 진척 갱신
create or replace function public.on_phase_progress()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.actual_progress is distinct from old.actual_progress then
    insert into public.activity_log (project_id, actor_id, entity, action, summary)
    values (new.project_id, auth.uid(), 'phase', 'updated',
            new.name || ' 진척 ' || old.actual_progress || '% → ' || new.actual_progress || '%');
  end if;
  return new;
end; $$;
create trigger trg_phase_activity after update on public.work_packages
  for each row execute function public.on_phase_progress();


-- ------------------------------------------------------------
-- E. 멤버 초대 시 대상자에게 알림 (0007 함수 재정의)
-- ------------------------------------------------------------
create or replace function public.add_project_member(
  p_project_id uuid, p_email text, p_role member_role default 'developer'
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_target uuid;
  v_role member_role;
  v_pname text;
begin
  if v_uid is null then raise exception '인증되지 않은 요청입니다.'; end if;
  select role into v_role from public.project_members where project_id = p_project_id and user_id = v_uid;
  if not (v_role in ('owner', 'manager') or public.is_system_admin()) then
    raise exception '멤버를 추가할 권한이 없습니다.';
  end if;
  select id into v_target from public.profiles where lower(email) = lower(trim(p_email)) limit 1;
  if v_target is null then
    raise exception '해당 이메일의 사용자를 찾을 수 없습니다. 먼저 회원가입이 필요합니다.';
  end if;

  insert into public.project_members (project_id, user_id, role)
  values (p_project_id, v_target, p_role)
  on conflict (project_id, user_id) do update set role = excluded.role;

  select name into v_pname from public.projects where id = p_project_id;
  insert into public.notifications (user_id, project_id, type, title, body, link)
  values (v_target, p_project_id, 'member', '프로젝트에 추가됨',
          v_pname || ' (' || p_role || ')', '/projects/' || p_project_id || '/board');

  insert into public.activity_log (project_id, actor_id, entity, action, summary)
  values (p_project_id, v_uid, 'member', 'created', p_email || ' 추가(' || p_role || ')');

  return v_target;
end;
$$;
grant execute on function public.add_project_member to authenticated;

-- ============================================================
-- 완료
-- ============================================================
