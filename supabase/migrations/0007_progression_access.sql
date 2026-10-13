-- Virtual Earn: privileges, RLS and read models for progression, missions,
-- achievements and profiles.
--
-- Same approach as 0003: revoke Supabase's broad default grants first, then
-- grant only SELECT. Every write goes through a SECURITY DEFINER function.

alter table public.player_progress enable row level security;
alter table public.daily_activity enable row level security;
alter table public.tasks enable row level security;
alter table public.task_progress enable row level security;
alter table public.achievements enable row level security;
alter table public.user_achievements enable row level security;

revoke all on public.player_progress from anon, authenticated;
revoke all on public.daily_activity from anon, authenticated;
revoke all on public.tasks from anon, authenticated;
revoke all on public.task_progress from anon, authenticated;
revoke all on public.achievements from anon, authenticated;
revoke all on public.user_achievements from anon, authenticated;

grant select on public.player_progress to authenticated;
grant select on public.daily_activity to authenticated;
grant select on public.tasks to authenticated;
grant select on public.task_progress to authenticated;
grant select on public.achievements to authenticated;
grant select on public.user_achievements to authenticated;

create policy "player_progress_select_own"
  on public.player_progress for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "daily_activity_select_own"
  on public.daily_activity for select to authenticated
  using ((select auth.uid()) = user_id);

-- Players see published missions only; drafts and archived ones are admin-only.
create policy "tasks_select_published"
  on public.tasks for select to authenticated
  using (status = 'published');

create policy "task_progress_select_own"
  on public.task_progress for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "achievements_select_active"
  on public.achievements for select to authenticated
  using (is_active);

create policy "user_achievements_select_own"
  on public.user_achievements for select to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Profiles: a preset avatar instead of arbitrary image URLs, so the app never
-- loads third-party images on a player's behalf.
-- ---------------------------------------------------------------------------
alter table public.player_profiles
  add column avatar_key text not null default 'coins'
    check (avatar_key in ('coins', 'rocket', 'star', 'leaf', 'flame', 'crown', 'gem', 'zap'));

revoke update on public.player_profiles from authenticated;
revoke update (username, avatar_url) on public.player_profiles from authenticated;
grant update (username, avatar_key) on public.player_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Read models (SECURITY INVOKER: RLS applies)
-- ---------------------------------------------------------------------------

-- Missions for the current period with the caller's progress.
create or replace function public.list_missions()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  return coalesce((
    select jsonb_agg(m.mission order by m.sort_order, m.title)
    from (
      select t.sort_order, t.title, jsonb_build_object(
        'id', t.id,
        'slug', t.slug,
        'title', t.title,
        'description', t.description,
        'objectiveType', t.objective_type,
        'target', t.objective_target,
        'progress', least(progress.value, t.objective_target),
        'rewardCoins', t.reward_coins,
        'xpReward', t.xp_reward,
        'frequency', t.frequency,
        'periodKey', period.period_key,
        'periodEndsAt', case when t.frequency = 'once' then null
                             else (period.ends_on::timestamp at time zone 'utc') end,
        'claimed', claim.id is not null,
        'claimedAt', claim.completed_at
      ) as mission
      from public.tasks t
      cross join lateral ve_private.task_period(t.frequency, now()) as period
      left join lateral (
        select coalesce(sum(case t.objective_type
                              when 'taps' then d.tap_count
                              when 'missions' then d.missions_completed
                            end), 0)::bigint as value
        from public.daily_activity d
        where d.user_id = v_user_id
          and d.activity_date >= period.starts_on
          and d.activity_date < period.ends_on
      ) as progress on true
      left join public.task_progress claim
        on claim.user_id = v_user_id and claim.task_id = t.id and claim.period_key = period.period_key
      where t.status = 'published'
    ) m
  ), '[]'::jsonb);
end;
$$;

-- Achievements with the caller's progress toward each.
create or replace function public.list_achievements()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_progress public.player_progress%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select p.* into v_progress from public.player_progress p where p.user_id = v_user_id;

  return coalesce((
    select jsonb_agg(item.achievement order by item.sort_order, item.threshold)
    from (
      select a.sort_order, a.threshold, jsonb_build_object(
        'slug', a.slug,
        'title', a.title,
        'description', a.description,
        'icon', a.icon,
        'metric', a.metric,
        'threshold', a.threshold,
        'progress', least(value.current, a.threshold),
        'rewardCoins', a.reward_coins,
        'xpReward', a.xp_reward,
        'unlocked', ua.unlocked_at is not null,
        'unlockedAt', ua.unlocked_at
      ) as achievement
      from public.achievements a
      cross join lateral (
        select case a.metric
          when 'total_taps' then coalesce(v_progress.total_taps, 0)
          when 'total_coins_earned' then coalesce(v_progress.total_coins_earned, 0)
          when 'missions_completed' then coalesce(v_progress.missions_completed, 0)::bigint
          when 'level' then ve_private.level_for_xp(coalesce(v_progress.xp_total, 0))::bigint
          else 0
        end as current
      ) as value
      left join public.user_achievements ua
        on ua.user_id = v_user_id and ua.achievement_id = a.id
      where a.is_active
    ) item
  ), '[]'::jsonb);
end;
$$;

-- XP, level, totals and the closest locked achievement.
create or replace function public.get_progression()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_xp bigint;
  v_level integer;
  v_progress public.player_progress%rowtype;
  v_achievements jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select p.* into v_progress from public.player_progress p where p.user_id = v_user_id;
  v_xp := coalesce(v_progress.xp_total, 0);
  v_level := ve_private.level_for_xp(v_xp);
  v_achievements := public.list_achievements();

  return jsonb_build_object(
    'xpTotal', v_xp,
    'level', v_level,
    'levelStartXp', ve_private.xp_for_level(v_level),
    'nextLevelXp', ve_private.xp_for_level(v_level + 1),
    'totalTaps', coalesce(v_progress.total_taps, 0),
    'totalCoinsEarned', coalesce(v_progress.total_coins_earned, 0),
    'missionsCompleted', coalesce(v_progress.missions_completed, 0),
    'achievementsUnlocked', (
      select count(*) from jsonb_array_elements(v_achievements) e where (e ->> 'unlocked')::boolean
    ),
    'achievementsTotal', jsonb_array_length(v_achievements),
    'nextAchievement', (
      select e
      from jsonb_array_elements(v_achievements) e
      where not (e ->> 'unlocked')::boolean
      order by (e ->> 'progress')::numeric / greatest((e ->> 'threshold')::numeric, 1) desc,
               (e ->> 'threshold')::numeric
      limit 1
    )
  );
end;
$$;

-- Earned virtual coins grouped by UTC day, ISO week or month, zero-filled.
create or replace function public.get_reward_history(p_bucket text default 'day', p_points integer default 14)
returns table (period_start date, coins bigint)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := timezone('utc', now())::date;
  v_step interval;
  v_last date;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_bucket = 'day' and p_points between 1 and 90 then
    v_step := interval '1 day';
    v_last := v_today;
  elsif p_bucket = 'week' and p_points between 1 and 52 then
    v_step := interval '1 week';
    v_last := date_trunc('week', v_today::timestamp)::date;
  elsif p_bucket = 'month' and p_points between 1 and 24 then
    v_step := interval '1 month';
    v_last := date_trunc('month', v_today::timestamp)::date;
  else
    raise exception 'Unsupported bucket or range' using errcode = '22023';
  end if;

  return query
  select b.start::date,
         coalesce(sum(t.amount_coins) filter (where t.amount_coins > 0), 0)::bigint
  from generate_series(v_last - (v_step * (p_points - 1)), v_last::timestamp, v_step) as b (start)
  left join public.transactions t
    on t.user_id = v_user_id
   and t.created_at >= (b.start::date::timestamp at time zone 'utc')
   and t.created_at < ((b.start + v_step)::date::timestamp at time zone 'utc')
  group by b.start
  order by b.start;
end;
$$;

revoke all on function public.list_missions() from public, anon;
revoke all on function public.list_achievements() from public, anon;
revoke all on function public.get_progression() from public, anon;
revoke all on function public.get_reward_history(text, integer) from public, anon;
grant execute on function public.list_missions() to authenticated;
grant execute on function public.list_achievements() to authenticated;
grant execute on function public.get_progression() to authenticated;
grant execute on function public.get_reward_history(text, integer) to authenticated;
