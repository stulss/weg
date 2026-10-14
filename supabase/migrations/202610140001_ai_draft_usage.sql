-- AI 초안 생성 사용량(사용자별·일별) 기록과 한도 확인
-- Supabase SQL Editor에서 실행하세요. 서버 함수(api/draft.js)가 로그인 사용자의 토큰으로 consume_ai_draft_quota를 호출합니다.
create table if not exists public.ai_draft_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  usage_date date not null default (now() at time zone 'Asia/Seoul')::date,
  count integer not null default 0 check (count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

alter table public.ai_draft_usage enable row level security;

-- 사용자는 자기 사용량을 읽을 수만 있고, 직접 쓰거나 고칠 수 없습니다.
revoke all on table public.ai_draft_usage from anon, authenticated;
grant select on table public.ai_draft_usage to authenticated;

drop policy if exists "Users can read their own AI draft usage" on public.ai_draft_usage;
create policy "Users can read their own AI draft usage"
  on public.ai_draft_usage for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- 한도 안이면 1회 차감하고 true, 한도를 넘으면 차감 없이 false를 돌려줍니다.
-- security definer로 실행되지만 auth.uid() 본인 행만 다룹니다. 한도는 서버가 넘기되 50을 넘을 수 없습니다.
create or replace function public.consume_ai_draft_quota(daily_limit integer)
returns table (allowed boolean, used integer, remaining integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'Asia/Seoul')::date;
  cap integer := least(greatest(coalesce(daily_limit, 0), 0), 50);
  current_count integer;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  insert into public.ai_draft_usage as u (user_id, usage_date, count)
  values (uid, today, 0)
  on conflict (user_id, usage_date) do nothing;

  update public.ai_draft_usage as u
     set count = u.count + 1, updated_at = now()
   where u.user_id = uid and u.usage_date = today and u.count < cap
  returning u.count into current_count;

  if current_count is null then
    select u.count into current_count from public.ai_draft_usage u where u.user_id = uid and u.usage_date = today;
    return query select false, current_count, 0;
  else
    return query select true, current_count, cap - current_count;
  end if;
end;
$$;

revoke all on function public.consume_ai_draft_quota(integer) from public, anon;
grant execute on function public.consume_ai_draft_quota(integer) to authenticated;
