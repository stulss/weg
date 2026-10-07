-- plen 이력서 클라우드 저장 테이블
-- Supabase SQL Editor에서 한 번 실행하세요. 이력서 본문은 로그인한 사용자 본인만 읽고 쓸 수 있습니다.
create table if not exists public.resume_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  resume jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint resume_profiles_resume_object check (jsonb_typeof(resume) = 'object')
);

alter table public.resume_profiles enable row level security;

revoke all on table public.resume_profiles from anon;
grant select, insert, update, delete on table public.resume_profiles to authenticated;

drop policy if exists "Users can read their own resume" on public.resume_profiles;
create policy "Users can read their own resume"
  on public.resume_profiles for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own resume" on public.resume_profiles;
create policy "Users can insert their own resume"
  on public.resume_profiles for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own resume" on public.resume_profiles;
create policy "Users can update their own resume"
  on public.resume_profiles for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own resume" on public.resume_profiles;
create policy "Users can delete their own resume"
  on public.resume_profiles for delete
  to authenticated
  using ((select auth.uid()) = user_id);
