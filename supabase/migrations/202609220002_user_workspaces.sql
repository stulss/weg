-- 로그인 사용자별 plen 전체 작업공간 저장
-- Supabase SQL Editor에서 실행하세요. 브라우저는 로그인 사용자의 자기 행만 접근합니다.
create table if not exists public.user_workspaces (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{"version":1,"items":{}}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint user_workspaces_data_object check (jsonb_typeof(data) = 'object'),
  constraint user_workspaces_data_version check (data ->> 'version' = '1'),
  constraint user_workspaces_data_items check (jsonb_typeof(data -> 'items') = 'object'),
  constraint user_workspaces_size_limit check (pg_column_size(data) <= 4194304)
);

alter table public.user_workspaces enable row level security;

revoke all on table public.user_workspaces from anon;
grant select, insert, update, delete on table public.user_workspaces to authenticated;

drop policy if exists "Users can read their own plen workspace" on public.user_workspaces;
create policy "Users can read their own plen workspace"
  on public.user_workspaces for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own plen workspace" on public.user_workspaces;
create policy "Users can insert their own plen workspace"
  on public.user_workspaces for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own plen workspace" on public.user_workspaces;
create policy "Users can update their own plen workspace"
  on public.user_workspaces for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own plen workspace" on public.user_workspaces;
create policy "Users can delete their own plen workspace"
  on public.user_workspaces for delete
  to authenticated
  using ((select auth.uid()) = user_id);
