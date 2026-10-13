-- Virtual Earn: engagement (daily bonus and streaks, leaderboard, cosmetic
-- shop, in-app notifications).
--
-- The shop sells cosmetic upgrades for virtual coins only: purchases are
-- negative ledger entries ('shop_purchase'); nothing can be bought with or
-- converted to real money.
--
-- Notification functions are named ve_* because the shared database already
-- has another application's list_notifications/count_unread_notifications.
--
-- Error contract additions (SQLSTATE -> meaning):
--   VE009  level requirement not met
--   VE013  item already owned
--   (reuses VE004 "already claimed" for the daily bonus, VE008 for an
--    unaffordable purchase, VE012 for unknown or unavailable items)

-- ---------------------------------------------------------------------------
-- Ledger types and badge metric
-- ---------------------------------------------------------------------------
alter table public.transactions drop constraint transactions_type_check;
alter table public.transactions add constraint transactions_type_check check (
  type in ('tap_reward', 'mission_reward', 'achievement_reward', 'daily_bonus', 'shop_purchase', 'admin_adjustment')
);

alter table public.achievements drop constraint achievements_metric_check;
alter table public.achievements add constraint achievements_metric_check check (
  metric in ('total_taps', 'total_coins_earned', 'missions_completed', 'level', 'longest_streak')
);

alter table public.player_progress
  add column current_streak integer not null default 0 check (current_streak >= 0),
  add column longest_streak integer not null default 0 check (longest_streak >= 0),
  add column last_bonus_on date;

alter table public.player_profiles
  add column leaderboard_opt_out boolean not null default false;

grant update (leaderboard_opt_out) on public.player_profiles to authenticated;

create or replace function ve_private.metric_value(p_user_id uuid, p_metric text)
returns bigint
language sql
stable
set search_path = ''
as $$
  select case p_metric
    when 'total_taps' then coalesce(p.total_taps, 0)
    when 'total_coins_earned' then coalesce(p.total_coins_earned, 0)
    when 'missions_completed' then coalesce(p.missions_completed, 0)::bigint
    when 'level' then ve_private.level_for_xp(coalesce(p.xp_total, 0))::bigint
    when 'longest_streak' then coalesce(p.longest_streak, 0)::bigint
    else 0
  end
  from (select 1) as one
  left join public.player_progress p on p.user_id = p_user_id;
$$;

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
          when 'longest_streak' then coalesce(v_progress.longest_streak, 0)::bigint
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

insert into public.achievements (slug, title, description, metric, threshold, reward_coins, xp_reward, icon, sort_order)
values
  ('streak-three', 'Warming Up', 'Claim the daily bonus 3 days in a row.', 'longest_streak', 3, 60, 20, 'star', 100),
  ('streak-seven', 'On Fire', 'Claim the daily bonus 7 days in a row.', 'longest_streak', 7, 300, 80, 'zap', 110),
  ('streak-thirty', 'Unstoppable', 'Claim the daily bonus 30 days in a row.', 'longest_streak', 30, 1500, 300, 'crown', 120)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create table public.ve_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.player_profiles (id) on delete cascade,
  kind text not null check (kind in ('badge', 'level', 'bonus', 'shop', 'account', 'wallet')),
  title text not null check (char_length(title) between 1 and 120),
  body text not null default '' check (char_length(body) <= 280),
  link text check (link is null or (link ~ '^/[a-z0-9/_-]*$' and char_length(link) <= 64)),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index ve_notifications_user_idx on public.ve_notifications (user_id, created_at desc);
create index ve_notifications_unread_idx on public.ve_notifications (user_id) where read_at is null;

alter table public.ve_notifications enable row level security;
revoke all on public.ve_notifications from anon, authenticated;
grant select on public.ve_notifications to authenticated;

create policy "ve_notifications_select_own"
  on public.ve_notifications for select to authenticated
  using ((select auth.uid()) = user_id);

-- Adds a notification. Volume is naturally bounded (badges, level-ups, shop
-- items and admin actions), and reads are paged, so rows are kept as history.
create or replace function ve_private.notify(p_user_id uuid, p_kind text, p_title text, p_body text, p_link text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ve_notifications (user_id, kind, title, body, link)
  values (p_user_id, p_kind, left(p_title, 120), left(coalesce(p_body, ''), 280), p_link);
end;
$$;

revoke all on function ve_private.notify(uuid, text, text, text, text) from public;

-- Badge unlocked.
create or replace function ve_private.notify_badge()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_achievement public.achievements%rowtype;
begin
  select a.* into v_achievement from public.achievements a where a.id = new.achievement_id;
  perform ve_private.notify(
    new.user_id, 'badge', 'Badge unlocked: ' || v_achievement.title,
    case when v_achievement.reward_coins > 0
         then '+' || v_achievement.reward_coins || ' virtual coins added to your wallet.'
         else v_achievement.description end,
    '/achievements'
  );
  return new;
end;
$$;

create trigger user_achievements_notify
  after insert on public.user_achievements
  for each row execute function ve_private.notify_badge();

-- Level up.
create or replace function ve_private.notify_level()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before integer := ve_private.level_for_xp(old.xp_total);
  v_after integer := ve_private.level_for_xp(new.xp_total);
begin
  if v_after > v_before then
    perform ve_private.notify(new.user_id, 'level', 'Level ' || v_after || ' reached', 'Keep going to unlock more cosmetics.', '/profile');
  end if;
  return new;
end;
$$;

create trigger player_progress_notify_level
  after update of xp_total on public.player_progress
  for each row execute function ve_private.notify_level();

-- Admin actions on a player's account or wallet.
create or replace function ve_private.notify_admin_action()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target uuid;
  v_amount bigint;
begin
  if new.target_type <> 'user' or new.target_id is null
     or new.action not in ('user.suspend', 'user.restore', 'wallet.adjust') then
    return new;
  end if;

  v_target := new.target_id::uuid;
  if not exists (select 1 from public.player_profiles p where p.id = v_target) then
    return new;
  end if;

  if new.action = 'user.suspend' then
    perform ve_private.notify(v_target, 'account', 'Your account was suspended', coalesce(new.metadata ->> 'reason', ''), null);
  elsif new.action = 'user.restore' then
    perform ve_private.notify(v_target, 'account', 'Your account was restored', 'You can earn virtual coins again.', '/earn');
  else
    v_amount := (new.metadata ->> 'amountCoins')::bigint;
    perform ve_private.notify(
      v_target, 'wallet',
      case when v_amount > 0 then 'An admin added ' || v_amount || ' virtual coins'
           else 'An admin removed ' || abs(v_amount) || ' virtual coins' end,
      coalesce(new.metadata ->> 'reason', ''), '/wallet'
    );
  end if;
  return new;
end;
$$;

create trigger audit_logs_notify
  after insert on public.audit_logs
  for each row execute function ve_private.notify_admin_action();

revoke all on function ve_private.notify_badge() from public;
revoke all on function ve_private.notify_level() from public;
revoke all on function ve_private.notify_admin_action() from public;

create or replace function public.ve_list_notifications(p_limit integer default 30)
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
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Invalid limit' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', n.id, 'kind', n.kind, 'title', n.title, 'body', n.body, 'link', n.link,
               'createdAt', n.created_at, 'read', n.read_at is not null
             ) order by n.created_at desc, n.id desc)
      from (
        select * from public.ve_notifications n
        where n.user_id = v_user_id
        order by n.created_at desc, n.id desc
        limit p_limit
      ) n
    ), '[]'::jsonb),
    'unread', (select count(*) from public.ve_notifications n where n.user_id = v_user_id and n.read_at is null)
  );
end;
$$;

create or replace function public.ve_unread_notification_count()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::integer from public.ve_notifications n where n.user_id = auth.uid() and n.read_at is null;
$$;

-- Marks the caller's notifications read: the given ids, or all when null.
create or replace function public.ve_mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_ids is not null and cardinality(p_ids) > 100 then
    raise exception 'Too many ids' using errcode = '22023';
  end if;

  update public.ve_notifications n
  set read_at = now()
  where n.user_id = v_user_id
    and n.read_at is null
    and (p_ids is null or n.id = any (p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Daily bonus and streaks
-- ---------------------------------------------------------------------------
create or replace function public.daily_bonus_policy()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('baseCoins', 20, 'stepCoins', 10, 'maxSteps', 6, 'xpReward', 10);
$$;

-- Reward for claiming on a given streak day (day 1 = base, capped growth).
create or replace function ve_private.bonus_for_streak(p_streak integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select (p.v ->> 'baseCoins')::integer
         + (p.v ->> 'stepCoins')::integer * least(greatest(p_streak, 1) - 1, (p.v ->> 'maxSteps')::integer)
  from (select public.daily_bonus_policy() as v) p;
$$;

revoke all on function ve_private.bonus_for_streak(integer) from public;
grant execute on function ve_private.bonus_for_streak(integer) to authenticated;

create or replace function public.get_daily_bonus_status()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := timezone('utc', now())::date;
  v_progress public.player_progress%rowtype;
  v_current integer;
  v_claimed boolean;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select p.* into v_progress from public.player_progress p where p.user_id = v_user_id;
  v_claimed := v_progress.last_bonus_on = v_today;
  -- A streak survives until the end of the day after the last claim.
  v_current := case when v_progress.last_bonus_on >= v_today - 1 then coalesce(v_progress.current_streak, 0) else 0 end;

  return jsonb_build_object(
    'claimedToday', coalesce(v_claimed, false),
    'currentStreak', v_current,
    'longestStreak', coalesce(v_progress.longest_streak, 0),
    'nextRewardCoins', ve_private.bonus_for_streak(v_current + 1),
    'xpReward', (public.daily_bonus_policy() ->> 'xpReward')::integer,
    'resetsAt', (v_today + 1)::timestamp at time zone 'utc',
    'currency', 'VC',
    'redeemable', false
  );
end;
$$;

create or replace function public.claim_daily_bonus(p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := timezone('utc', now())::date;
  v_xp integer := (public.daily_bonus_policy() ->> 'xpReward')::integer;
  v_progress public.player_progress%rowtype;
  v_existing public.transactions%rowtype;
  v_streak integer;
  v_reward integer;
  v_transaction_id uuid;
  v_unlocked jsonb;
  v_snapshot jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_idempotency_key is null then
    raise exception 'Idempotency key required' using errcode = '22023';
  end if;

  perform 1 from public.wallets w where w.user_id = v_user_id for update;
  if not found then
    raise exception 'Wallet not found' using errcode = 'P0002';
  end if;

  select t.* into v_existing
  from public.transactions t
  where t.user_id = v_user_id and t.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.type <> 'daily_bonus' then
      raise exception 'Idempotency key already used' using errcode = 'VE003';
    end if;
    v_snapshot := ve_private.progress_snapshot(v_user_id);
    select p.* into v_progress from public.player_progress p where p.user_id = v_user_id;
    return jsonb_build_object(
      'success', true, 'duplicate', true, 'transactionId', v_existing.id,
      'rewardCoins', v_existing.amount_coins, 'xpReward', v_xp,
      'currentStreak', v_progress.current_streak, 'longestStreak', v_progress.longest_streak,
      'balanceCoins', v_snapshot -> 'balanceCoins', 'xpTotal', v_snapshot -> 'xpTotal', 'level', v_snapshot -> 'level',
      'unlockedAchievements', '[]'::jsonb, 'currency', 'VC', 'redeemable', false
    );
  end if;

  insert into public.player_progress (user_id) values (v_user_id) on conflict (user_id) do nothing;
  select p.* into v_progress from public.player_progress p where p.user_id = v_user_id for update;

  if v_progress.last_bonus_on = v_today then
    raise exception 'Daily bonus already claimed today' using errcode = 'VE004';
  end if;

  v_streak := case when v_progress.last_bonus_on = v_today - 1 then v_progress.current_streak + 1 else 1 end;
  v_reward := ve_private.bonus_for_streak(v_streak);

  v_transaction_id := ve_private.post_entry(
    v_user_id, v_reward, 'daily_bonus', 'daily_bonus', to_char(v_today, 'YYYY-MM-DD'), p_idempotency_key
  );

  update public.player_progress p
  set current_streak = v_streak,
      longest_streak = greatest(p.longest_streak, v_streak),
      last_bonus_on = v_today
  where p.user_id = v_user_id;

  perform ve_private.record_activity(v_user_id, v_reward, v_xp, 0, 0);
  v_unlocked := ve_private.evaluate_achievements(v_user_id);
  v_snapshot := ve_private.progress_snapshot(v_user_id);

  return jsonb_build_object(
    'success', true, 'duplicate', false, 'transactionId', v_transaction_id,
    'rewardCoins', v_reward, 'xpReward', v_xp,
    'currentStreak', v_streak, 'longestStreak', greatest(v_progress.longest_streak, v_streak),
    'balanceCoins', v_snapshot -> 'balanceCoins', 'xpTotal', v_snapshot -> 'xpTotal', 'level', v_snapshot -> 'level',
    'unlockedAchievements', v_unlocked, 'currency', 'VC', 'redeemable', false
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Leaderboard: public fields only (username, avatar, level, score), and
-- never players who opted out or are suspended.
-- ---------------------------------------------------------------------------
create or replace function public.get_leaderboard(p_board text default 'xp', p_limit integer default 25)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_week_start date := (select period.starts_on from ve_private.task_period('weekly', now()) as period);
  v_entries jsonb;
  v_you jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_board is null or p_board not in ('xp', 'weekly') or p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Unsupported leaderboard' using errcode = '22023';
  end if;

  with scores as (
    select p.id,
           p.username,
           p.avatar_key,
           ve_private.level_for_xp(coalesce(pp.xp_total, 0)) as level,
           case when p_board = 'xp' then coalesce(pp.xp_total, 0)
                else coalesce((select sum(d.coins_earned) from public.daily_activity d
                               where d.user_id = p.id and d.activity_date >= v_week_start), 0)
           end::bigint as score,
           (select si.name from public.user_inventory ui join public.shop_items si on si.id = ui.item_id
            where ui.user_id = p.id and ui.equipped and ui.category = 'title') as title,
           (select si.style_key from public.user_inventory ui join public.shop_items si on si.id = ui.item_id
            where ui.user_id = p.id and ui.equipped and ui.category = 'avatar_frame') as frame
    from public.player_profiles p
    left join public.player_progress pp on pp.user_id = p.id
    where not p.leaderboard_opt_out and p.suspended_at is null
  ),
  ranked as (
    select s.*, rank() over (order by s.score desc) as position
    from scores s
    where s.score > 0
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'rank', r.position, 'username', r.username, 'avatarKey', r.avatar_key, 'level', r.level,
           'score', r.score, 'title', r.title, 'frame', r.frame, 'isYou', r.id = v_user_id
         ) order by r.position, r.username), '[]'::jsonb)
  into v_entries
  from (select * from ranked order by position, username limit p_limit) r;

  with scores as (
    select p.id,
           case when p_board = 'xp' then coalesce(pp.xp_total, 0)
                else coalesce((select sum(d.coins_earned) from public.daily_activity d
                               where d.user_id = p.id and d.activity_date >= v_week_start), 0)
           end::bigint as score
    from public.player_profiles p
    left join public.player_progress pp on pp.user_id = p.id
    where not p.leaderboard_opt_out and p.suspended_at is null
  )
  select jsonb_build_object(
           'rank', case when me.score > 0 then (select count(*) + 1 from scores s where s.score > me.score) end,
           'score', me.score,
           'optedOut', (select p.leaderboard_opt_out from public.player_profiles p where p.id = v_user_id)
         )
  into v_you
  from (
    select coalesce((select s.score from scores s where s.id = v_user_id), 0) as score
  ) me;

  return jsonb_build_object('board', p_board, 'entries', v_entries, 'you', v_you, 'weekStartsOn', v_week_start);
end;
$$;

-- ---------------------------------------------------------------------------
-- Cosmetic shop
-- ---------------------------------------------------------------------------
create table public.shop_items (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 48),
  name text not null check (char_length(name) between 2 and 40),
  description text not null default '' check (char_length(description) <= 200),
  category text not null check (category in ('tap_skin', 'avatar_frame', 'title')),
  -- Presentation key interpreted by the app from a fixed whitelist.
  style_key text not null check (style_key ~ '^[a-z0-9-]{2,32}$'),
  price_coins integer not null check (price_coins between 1 and 1000000),
  level_required integer not null default 1 check (level_required between 1 and 1000),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.user_inventory (
  user_id uuid not null references public.player_profiles (id) on delete cascade,
  item_id uuid not null references public.shop_items (id) on delete restrict,
  category text not null,
  equipped boolean not null default false,
  transaction_id uuid not null,
  purchased_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

-- At most one equipped item per category.
create unique index user_inventory_one_equipped_idx on public.user_inventory (user_id, category) where equipped;

alter table public.shop_items enable row level security;
alter table public.user_inventory enable row level security;
revoke all on public.shop_items from anon, authenticated;
revoke all on public.user_inventory from anon, authenticated;
grant select on public.shop_items to authenticated;
grant select on public.user_inventory to authenticated;

create policy "shop_items_select_active"
  on public.shop_items for select to authenticated
  using (is_active);

create policy "user_inventory_select_own"
  on public.user_inventory for select to authenticated
  using ((select auth.uid()) = user_id);

insert into public.shop_items (slug, name, description, category, style_key, price_coins, level_required, sort_order)
values
  ('skin-sunset', 'Sunset', 'A warm orange tap button.', 'tap_skin', 'sunset', 300, 1, 10),
  ('skin-ocean', 'Ocean', 'A cool blue tap button.', 'tap_skin', 'ocean', 300, 1, 20),
  ('skin-aurora', 'Aurora', 'A shimmering purple-to-teal tap button.', 'tap_skin', 'aurora', 1200, 5, 30),
  ('frame-gold', 'Gold Ring', 'A gold ring around your avatar.', 'avatar_frame', 'gold', 500, 1, 40),
  ('frame-neon', 'Neon Ring', 'A glowing ring around your avatar.', 'avatar_frame', 'neon', 900, 3, 50),
  ('title-tapper', 'Tapper', 'A title shown next to your name on the leaderboard.', 'title', 'tapper', 150, 1, 60),
  ('title-baron', 'Coin Baron', 'A title for seasoned players.', 'title', 'baron', 2500, 8, 70)
on conflict (slug) do nothing;

create or replace function public.list_shop()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_level integer;
  v_balance bigint;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select ve_private.level_for_xp(coalesce(p.xp_total, 0)) into v_level
  from (select 1) one left join public.player_progress p on p.user_id = v_user_id;
  select w.balance_coins into v_balance from public.wallets w where w.user_id = v_user_id;

  return jsonb_build_object(
    'balanceCoins', coalesce(v_balance, 0),
    'level', v_level,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'slug', i.slug, 'name', i.name, 'description', i.description,
               'category', i.category, 'styleKey', i.style_key, 'priceCoins', i.price_coins,
               'levelRequired', i.level_required,
               'owned', ui.item_id is not null,
               'equipped', coalesce(ui.equipped, false)
             ) order by i.category, i.sort_order, i.price_coins)
      from public.shop_items i
      left join public.user_inventory ui on ui.item_id = i.id and ui.user_id = v_user_id
      where i.is_active or ui.item_id is not null
    ), '[]'::jsonb),
    'currency', 'VC',
    'redeemable', false
  );
end;
$$;

-- The caller's equipped cosmetics, by category ({ tapSkin, avatarFrame, title }).
create or replace function public.get_equipped_cosmetics()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'tapSkin', max(i.style_key) filter (where ui.category = 'tap_skin'),
    'avatarFrame', max(i.style_key) filter (where ui.category = 'avatar_frame'),
    'title', max(i.name) filter (where ui.category = 'title')
  )
  from public.user_inventory ui
  join public.shop_items i on i.id = ui.item_id
  where ui.user_id = auth.uid() and ui.equipped;
$$;

create or replace function public.purchase_item(p_item_id uuid, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_balance bigint;
  v_item public.shop_items%rowtype;
  v_existing public.transactions%rowtype;
  v_level integer;
  v_transaction_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_item_id is null or p_idempotency_key is null then
    raise exception 'Item and idempotency key required' using errcode = '22023';
  end if;

  select w.balance_coins into v_balance from public.wallets w where w.user_id = v_user_id for update;
  if not found then
    raise exception 'Wallet not found' using errcode = 'P0002';
  end if;

  select t.* into v_existing
  from public.transactions t
  where t.user_id = v_user_id and t.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.type <> 'shop_purchase' or v_existing.source_id is distinct from p_item_id::text then
      raise exception 'Idempotency key already used' using errcode = 'VE003';
    end if;
    return jsonb_build_object(
      'success', true, 'duplicate', true, 'transactionId', v_existing.id, 'itemId', p_item_id,
      'priceCoins', -v_existing.amount_coins, 'balanceCoins', v_balance, 'currency', 'VC', 'redeemable', false
    );
  end if;

  select i.* into v_item from public.shop_items i where i.id = p_item_id and i.is_active;
  if not found then
    raise exception 'Item not available' using errcode = 'VE012';
  end if;

  if exists (select 1 from public.user_inventory ui where ui.user_id = v_user_id and ui.item_id = p_item_id) then
    raise exception 'Item already owned' using errcode = 'VE013';
  end if;

  v_level := ve_private.level_for_xp(coalesce((select p.xp_total from public.player_progress p where p.user_id = v_user_id), 0));
  if v_level < v_item.level_required then
    raise exception 'Level requirement not met' using errcode = 'VE009';
  end if;

  if v_balance < v_item.price_coins then
    raise exception 'Not enough virtual coins' using errcode = 'VE008';
  end if;

  v_transaction_id := ve_private.post_entry(
    v_user_id, -v_item.price_coins, 'shop_purchase', 'shop_item', v_item.id::text, p_idempotency_key
  );

  insert into public.user_inventory (user_id, item_id, category, transaction_id)
  values (v_user_id, v_item.id, v_item.category, v_transaction_id);

  perform ve_private.notify(v_user_id, 'shop', 'Unlocked ' || v_item.name, 'Equip it from the shop.', '/shop');

  return jsonb_build_object(
    'success', true, 'duplicate', false, 'transactionId', v_transaction_id, 'itemId', v_item.id,
    'priceCoins', v_item.price_coins, 'balanceCoins', v_balance - v_item.price_coins,
    'currency', 'VC', 'redeemable', false
  );
end;
$$;

-- Equips an owned item (unequipping the category's current one) or unequips it.
create or replace function public.equip_item(p_item_id uuid, p_equip boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_owned public.user_inventory%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_item_id is null or p_equip is null then
    raise exception 'Item required' using errcode = '22023';
  end if;

  select ui.* into v_owned
  from public.user_inventory ui
  where ui.user_id = v_user_id and ui.item_id = p_item_id
  for update;
  if not found then
    raise exception 'Item not owned' using errcode = 'VE012';
  end if;

  if p_equip then
    update public.user_inventory ui set equipped = false
    where ui.user_id = v_user_id and ui.category = v_owned.category and ui.equipped and ui.item_id <> p_item_id;
  end if;

  update public.user_inventory ui set equipped = p_equip
  where ui.user_id = v_user_id and ui.item_id = p_item_id;

  return public.get_equipped_cosmetics();
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on function public.ve_list_notifications(integer) from public, anon;
revoke all on function public.ve_unread_notification_count() from public, anon;
revoke all on function public.ve_mark_notifications_read(uuid[]) from public, anon;
revoke all on function public.daily_bonus_policy() from public, anon;
revoke all on function public.get_daily_bonus_status() from public, anon;
revoke all on function public.claim_daily_bonus(uuid) from public, anon;
revoke all on function public.get_leaderboard(text, integer) from public, anon;
revoke all on function public.list_shop() from public, anon;
revoke all on function public.get_equipped_cosmetics() from public, anon;
revoke all on function public.purchase_item(uuid, uuid) from public, anon;
revoke all on function public.equip_item(uuid, boolean) from public, anon;

grant execute on function public.ve_list_notifications(integer) to authenticated;
grant execute on function public.ve_unread_notification_count() to authenticated;
grant execute on function public.ve_mark_notifications_read(uuid[]) to authenticated;
grant execute on function public.daily_bonus_policy() to authenticated;
grant execute on function public.get_daily_bonus_status() to authenticated;
grant execute on function public.claim_daily_bonus(uuid) to authenticated;
grant execute on function public.get_leaderboard(text, integer) to authenticated;
grant execute on function public.list_shop() to authenticated;
grant execute on function public.get_equipped_cosmetics() to authenticated;
grant execute on function public.purchase_item(uuid, uuid) to authenticated;
grant execute on function public.equip_item(uuid, boolean) to authenticated;
