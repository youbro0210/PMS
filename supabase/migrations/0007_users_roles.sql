-- ============================================================
-- 0007: 사용자 · 권한 · 시스템 관리자
--   회원가입(Supabase Auth) 후 profiles 자동 생성은 0001 트리거가 처리.
--   여기서는 시스템 관리자 권한과 멤버 초대 RPC를 추가한다.
--   0006 이후 실행
-- ============================================================

-- ------------------------------------------------------------
-- A. 시스템 관리자 플래그
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

comment on column public.profiles.is_admin is '시스템 관리자(전체 프로젝트·사용자 접근)';

-- 현재 사용자가 시스템 관리자인지
create or replace function public.is_system_admin()
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_admin = true);
$$;


-- ------------------------------------------------------------
-- B. 관리자 전체 접근 override
--    멤버 판정 헬퍼가 시스템 관리자에게 true를 반환하도록 갱신.
--    → 기존 모든 RLS 정책(조회)이 자동으로 관리자 전체 접근을 허용.
-- ------------------------------------------------------------
create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from public.project_members
    where project_id = p_project_id and user_id = auth.uid()
  )
  or exists (
    select 1 from public.profiles where id = auth.uid() and is_admin = true
  );
$$;


-- ------------------------------------------------------------
-- C. 모든 사용자 프로필 조회 (멤버 초대 시 이메일 검색용)
--    profiles SELECT는 기본적으로 본인+같은프로젝트로 제한되므로,
--    관리자/소유자가 이메일로 사용자를 찾을 수 있는 안전한 RPC를 제공.
-- ------------------------------------------------------------
create or replace function public.find_user_by_email(p_email text)
returns table (id uuid, email text, full_name text)
language sql security definer stable
set search_path = public
as $$
  select p.id, p.email, p.full_name
  from public.profiles p
  where lower(p.email) = lower(trim(p_email))
  limit 1;
$$;
grant execute on function public.find_user_by_email to authenticated;


-- ------------------------------------------------------------
-- D. 멤버 초대(추가) — owner/manager 또는 시스템 관리자만
-- ------------------------------------------------------------
create or replace function public.add_project_member(
  p_project_id uuid,
  p_email      text,
  p_role       member_role default 'developer'
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_target uuid;
  v_role  member_role;
begin
  if v_uid is null then raise exception '인증되지 않은 요청입니다.'; end if;

  -- 권한 확인: 해당 프로젝트의 owner/manager 또는 시스템 관리자
  select role into v_role from public.project_members
    where project_id = p_project_id and user_id = v_uid;
  if not (v_role in ('owner', 'manager') or public.is_system_admin()) then
    raise exception '멤버를 추가할 권한이 없습니다.';
  end if;

  -- 대상 사용자 찾기(이미 가입된 사용자만)
  select id into v_target from public.profiles where lower(email) = lower(trim(p_email)) limit 1;
  if v_target is null then
    raise exception '해당 이메일의 사용자를 찾을 수 없습니다. 먼저 회원가입이 필요합니다.';
  end if;

  insert into public.project_members (project_id, user_id, role)
  values (p_project_id, v_target, p_role)
  on conflict (project_id, user_id) do update set role = excluded.role;

  return v_target;
end;
$$;
grant execute on function public.add_project_member to authenticated;
comment on function public.add_project_member is '이메일로 프로젝트 멤버 추가/역할변경 (owner·manager·시스템관리자)';


-- ------------------------------------------------------------
-- E. 시스템 관리자 전용: 전체 사용자 목록 / 관리자 권한 토글
-- ------------------------------------------------------------
create or replace function public.admin_list_users()
returns table (id uuid, email text, full_name text, is_admin boolean, created_at timestamptz)
language sql security definer stable
set search_path = public
as $$
  select p.id, p.email, p.full_name, p.is_admin, p.created_at
  from public.profiles p
  where public.is_system_admin()       -- 관리자가 아니면 0행
  order by p.created_at desc;
$$;
grant execute on function public.admin_list_users to authenticated;

create or replace function public.admin_set_user_admin(p_user_id uuid, p_is_admin boolean)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_system_admin() then
    raise exception '시스템 관리자만 수행할 수 있습니다.';
  end if;
  update public.profiles set is_admin = p_is_admin where id = p_user_id;
end;
$$;
grant execute on function public.admin_set_user_admin to authenticated;


-- ------------------------------------------------------------
-- F. profiles 본인 조회 정책에 관리자 추가
-- ------------------------------------------------------------
create policy "관리자 전체 프로필 조회"
  on public.profiles for select
  using (public.is_system_admin());

-- ============================================================
-- 최초 관리자 지정: 가입 후 아래를 한 번 실행
--   update public.profiles set is_admin = true where email = 'you@example.com';
-- ============================================================
