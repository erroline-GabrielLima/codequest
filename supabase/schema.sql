create table if not exists public.game_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 32),
  created_at timestamptz not null default now()
);

create index if not exists game_profiles_owner_created_idx
  on public.game_profiles (owner_id, created_at);

create unique index if not exists game_profiles_one_per_account
  on public.game_profiles (owner_id);

alter table public.game_profiles enable row level security;

drop policy if exists "Owners can read their game profiles" on public.game_profiles;
create policy "Owners can read their game profiles"
  on public.game_profiles for select to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "Owners can create their game profiles" on public.game_profiles;
create policy "Owners can create their game profiles"
  on public.game_profiles for insert to authenticated
  with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners can update their game profiles" on public.game_profiles;
create policy "Owners can update their game profiles"
  on public.game_profiles for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners can delete their game profiles" on public.game_profiles;
create policy "Owners can delete their game profiles"
  on public.game_profiles for delete to authenticated
  using ((select auth.uid()) = owner_id);

grant select, insert, update, delete on public.game_profiles to authenticated;


-- Live submissions and a public leaderboard with aggregate counts only.
create table if not exists public.challenges (
  id text primary key,
  title text not null
);

alter table public.challenges enable row level security;
revoke all on public.challenges from public, anon, authenticated;

insert into public.challenges (id, title)
values ('week-01', 'O primeiro passo')
on conflict (id) do nothing;

create table if not exists public.challenge_submissions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.game_profiles (id) on delete cascade,
  challenge_id text not null references public.challenges (id),
  answer text not null check (char_length(trim(answer)) between 1 and 20000),
  language text not null check (char_length(trim(language)) between 1 and 40),
  submitted_at timestamptz not null default now(),
  unique (profile_id, challenge_id)
);

create index if not exists challenge_submissions_profile_idx
  on public.challenge_submissions (profile_id);

alter table public.challenge_submissions enable row level security;
revoke all on public.challenge_submissions from public, anon, authenticated;
grant select, insert, update on public.challenge_submissions to authenticated;

drop policy if exists "Owners can read their challenge submissions" on public.challenge_submissions;
create policy "Owners can read their challenge submissions"
  on public.challenge_submissions for select to authenticated
  using (exists (
    select 1 from public.game_profiles gp
    where gp.id = challenge_submissions.profile_id
      and gp.owner_id = (select auth.uid())
  ));

drop policy if exists "Owners can submit their challenges" on public.challenge_submissions;
create policy "Owners can submit their challenges"
  on public.challenge_submissions for insert to authenticated
  with check (exists (
    select 1 from public.game_profiles gp
    where gp.id = challenge_submissions.profile_id
      and gp.owner_id = (select auth.uid())
  ));

drop policy if exists "Owners can update their challenge submissions" on public.challenge_submissions;
create policy "Owners can update their challenge submissions"
  on public.challenge_submissions for update to authenticated
  using (exists (
    select 1 from public.game_profiles gp
    where gp.id = challenge_submissions.profile_id
      and gp.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.game_profiles gp
    where gp.id = challenge_submissions.profile_id
      and gp.owner_id = (select auth.uid())
  ));

create table if not exists public.challenge_leaderboard (
  profile_id uuid primary key references public.game_profiles (id) on delete cascade,
  profile_name text not null,
  submissions_count integer not null check (submissions_count > 0),
  last_submitted_at timestamptz not null
);

alter table public.challenge_leaderboard enable row level security;
revoke all on public.challenge_leaderboard from public, anon, authenticated;
grant select on public.challenge_leaderboard to anon, authenticated;

drop policy if exists "Anyone can read the public leaderboard" on public.challenge_leaderboard;
create policy "Anyone can read the public leaderboard"
  on public.challenge_leaderboard for select to anon, authenticated
  using (true);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.record_challenge_submission()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.challenge_leaderboard as leaderboard (
    profile_id, profile_name, submissions_count, last_submitted_at
  )
  select new.profile_id, gp.name, 1, new.submitted_at
  from public.game_profiles gp
  where gp.id = new.profile_id
  on conflict (profile_id) do update
    set profile_name = excluded.profile_name,
        submissions_count = leaderboard.submissions_count + 1,
        last_submitted_at = greatest(leaderboard.last_submitted_at, excluded.last_submitted_at);

  return new;
end;
$$;

revoke all on function private.record_challenge_submission() from public, anon, authenticated;

drop trigger if exists record_challenge_submission on public.challenge_submissions;
create trigger record_challenge_submission
  after insert on public.challenge_submissions
  for each row execute function private.record_challenge_submission();


-- Admin roles, editable challenge schedules, manual submission review, and approved-score leaderboard.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table if not exists public.project_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'educator')),
  created_at timestamptz not null default now()
);

alter table public.project_admins enable row level security;
revoke all on public.project_admins from public, anon, authenticated;
grant select, insert, update, delete on public.project_admins to authenticated;

create or replace function private.current_project_role()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select pa.role
  from public.project_admins pa
  where pa.user_id = (select auth.uid())
  limit 1;
$$;

revoke all on function private.current_project_role() from public, anon;
grant execute on function private.current_project_role() to authenticated;

create or replace function private.is_project_owner()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.project_admins pa
    where pa.user_id = (select auth.uid())
      and pa.role = 'owner'
  );
$$;

revoke all on function private.is_project_owner() from public, anon;
grant execute on function private.is_project_owner() to authenticated;

drop policy if exists "Admins can read their own role" on public.project_admins;
create policy "Admins can read their own role"
  on public.project_admins for select to authenticated
  using (user_id = (select auth.uid()) or private.is_project_owner());

drop policy if exists "Owners can add educators" on public.project_admins;
create policy "Owners can add educators"
  on public.project_admins for insert to authenticated
  with check (private.is_project_owner() and role = 'educator');

drop policy if exists "Owners can update educators" on public.project_admins;
create policy "Owners can update educators"
  on public.project_admins for update to authenticated
  using (private.is_project_owner() and role = 'educator')
  with check (private.is_project_owner() and role = 'educator');

drop policy if exists "Owners can remove educators" on public.project_admins;
create policy "Owners can remove educators"
  on public.project_admins for delete to authenticated
  using (private.is_project_owner() and role = 'educator');

alter table public.challenges
  add column if not exists description text not null default '',
  add column if not exists difficulty text not null default 'INICIANTE',
  add column if not exists example_input text not null default '',
  add column if not exists example_output text not null default '',
  add column if not exists example_text text not null default '',
  add column if not exists points integer not null default 10,
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz,
  add column if not exists is_published boolean not null default true;

update public.challenges
set description = 'Escreva um programa que receba seu nome e mostre uma mensagem de boas-vindas.'
where id = 'week-01' and description = '';

update public.challenges
set example_text = '', example_input = '', example_output = ''
where example_text = '' and example_input = '"Lia"' and example_output = '"Olá, Lia!"';

alter table public.challenges
  alter column example_input set default '',
  alter column example_output set default '';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'challenges_points_range_check') then
    alter table public.challenges
      add constraint challenges_points_range_check check (points between 0 and 1000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'challenges_time_window_check') then
    alter table public.challenges
      add constraint challenges_time_window_check check (starts_at is null or ends_at is null or starts_at < ends_at);
  end if;
end
$$;

alter table public.challenges enable row level security;
revoke all on public.challenges from public, anon, authenticated;
grant select on public.challenges to anon, authenticated;
grant insert, update, delete on public.challenges to authenticated;

drop policy if exists "Anyone can read published challenges" on public.challenges;
create policy "Anyone can read published challenges"
  on public.challenges for select to anon
  using (is_published = true);

drop policy if exists "Signed-in users can read published challenges and admins all challenges" on public.challenges;
create policy "Signed-in users can read published challenges and admins all challenges"
  on public.challenges for select to authenticated
  using (is_published = true or private.current_project_role() is not null);

drop policy if exists "Admins can create challenges" on public.challenges;
create policy "Admins can create challenges"
  on public.challenges for insert to authenticated
  with check (private.current_project_role() is not null);

drop policy if exists "Admins can edit challenges" on public.challenges;
create policy "Admins can edit challenges"
  on public.challenges for update to authenticated
  using (private.current_project_role() is not null)
  with check (private.current_project_role() is not null);

drop policy if exists "Admins can delete challenges" on public.challenges;
create policy "Admins can delete challenges"
  on public.challenges for delete to authenticated
  using (private.current_project_role() is not null);

alter table public.challenge_submissions
  add column if not exists status text not null default 'pending',
  add column if not exists review_feedback text,
  add column if not exists reviewed_by uuid references auth.users (id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists awarded_points integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'challenge_submissions_status_check') then
    alter table public.challenge_submissions
      add constraint challenge_submissions_status_check
      check (status in ('pending', 'approved', 'changes_requested'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'challenge_submissions_awarded_points_check') then
    alter table public.challenge_submissions
      add constraint challenge_submissions_awarded_points_check
      check (awarded_points is null or awarded_points between 0 and 1000);
  end if;
end
$$;

alter table public.challenge_submissions enable row level security;
revoke all on public.challenge_submissions from public, anon, authenticated;
grant select on public.challenge_submissions to authenticated;
update public.challenge_submissions cs
set awarded_points = c.points
from public.challenges c
where cs.challenge_id = c.id
  and cs.status = 'approved'
  and cs.awarded_points is null;
grant insert (profile_id, challenge_id, answer, language) on public.challenge_submissions to authenticated;
grant update (answer, language, status, review_feedback, reviewed_by, reviewed_at, awarded_points)
  on public.challenge_submissions to authenticated;

drop policy if exists "Owners can read their challenge submissions" on public.challenge_submissions;
create policy "Owners and admins can read challenge submissions"
  on public.challenge_submissions for select to authenticated
  using (
    private.current_project_role() is not null
    or exists (
      select 1 from public.game_profiles gp
      where gp.id = challenge_submissions.profile_id
        and gp.owner_id = (select auth.uid())
    )
  );

drop policy if exists "Owners can submit their challenges" on public.challenge_submissions;
create policy "Owners can submit open challenges"
  on public.challenge_submissions for insert to authenticated
  with check (
    exists (
      select 1 from public.game_profiles gp
      where gp.id = challenge_submissions.profile_id
        and gp.owner_id = (select auth.uid())
    )
    and exists (
      select 1 from public.challenges c
      where c.id = challenge_submissions.challenge_id
        and c.is_published = true
        and (c.starts_at is null or c.starts_at <= now())
        and (c.ends_at is null or c.ends_at > now())
    )
  );

drop policy if exists "Owners can update their challenge submissions" on public.challenge_submissions;
drop policy if exists "Owners can edit their open challenge submissions" on public.challenge_submissions;
create policy "Owners can edit their open challenge submissions"
  on public.challenge_submissions for update to authenticated
  using (
    exists (
      select 1 from public.game_profiles gp
      where gp.id = challenge_submissions.profile_id
        and gp.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.game_profiles gp
      where gp.id = challenge_submissions.profile_id
        and gp.owner_id = (select auth.uid())
    )
    and exists (
      select 1 from public.challenges c
      where c.id = challenge_submissions.challenge_id
        and c.is_published = true
        and (c.starts_at is null or c.starts_at <= now())
        and (c.ends_at is null or c.ends_at > now())
    )
  );

drop policy if exists "Admins can review challenge submissions" on public.challenge_submissions;
create policy "Admins can review challenge submissions"
  on public.challenge_submissions for update to authenticated
  using (private.current_project_role() is not null)
  with check (private.current_project_role() is not null);

drop policy if exists "Admins can read all player profiles" on public.game_profiles;
create policy "Admins can read all player profiles"
  on public.game_profiles for select to authenticated
  using (private.current_project_role() is not null);

alter table public.challenge_leaderboard
  add column if not exists points integer not null default 0,
  add column if not exists approved_count integer not null default 0;

alter table public.challenge_leaderboard enable row level security;
revoke all on public.challenge_leaderboard from public, anon, authenticated;
grant select on public.challenge_leaderboard to anon, authenticated;

drop policy if exists "Anyone can read the public leaderboard" on public.challenge_leaderboard;
create policy "Anyone can read approved leaderboard entries"
  on public.challenge_leaderboard for select to anon, authenticated
  using (approved_count > 0);

create or replace function private.refresh_profile_leaderboard(target_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_name text;
  total_points integer;
  total_approved integer;
  latest_approved timestamptz;
begin
  select gp.name into target_name
  from public.game_profiles gp
  where gp.id = target_profile_id;

  if target_name is null then
    delete from public.challenge_leaderboard where profile_id = target_profile_id;
    return;
  end if;

  select coalesce(sum(awards.points), 0), count(*), max(awards.last_submitted_at)
  into total_points, total_approved, latest_approved
  from (
    select cs.challenge_id, max(coalesce(cs.awarded_points, c.points)) as points, max(cs.submitted_at) as last_submitted_at
    from public.challenge_submissions cs
    join public.challenges c on c.id = cs.challenge_id
    where cs.profile_id = target_profile_id
      and cs.status = 'approved'
    group by cs.challenge_id
  ) awards;

  if total_approved = 0 then
    delete from public.challenge_leaderboard where profile_id = target_profile_id;
    return;
  end if;

  insert into public.challenge_leaderboard (
    profile_id, profile_name, submissions_count, last_submitted_at, points, approved_count
  )
  values (
    target_profile_id, target_name, total_approved, latest_approved, total_points, total_approved
  )
  on conflict (profile_id) do update
    set profile_name = excluded.profile_name,
        submissions_count = excluded.submissions_count,
        last_submitted_at = excluded.last_submitted_at,
        points = excluded.points,
        approved_count = excluded.approved_count;
end;
$$;

revoke all on function private.refresh_profile_leaderboard(uuid) from public, anon, authenticated;

create or replace function private.sync_submission_leaderboard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    perform private.refresh_profile_leaderboard(old.profile_id);
    return old;
  end if;

  if tg_op = 'UPDATE' and old.profile_id is distinct from new.profile_id then
    perform private.refresh_profile_leaderboard(old.profile_id);
  end if;

  perform private.refresh_profile_leaderboard(new.profile_id);
  return new;
end;
$$;

revoke all on function private.sync_submission_leaderboard() from public, anon, authenticated;

create or replace function private.reset_submission_review_on_edit()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $
begin
  if new.answer is distinct from old.answer
     or new.language is distinct from old.language
     or new.profile_id is distinct from old.profile_id
     or new.challenge_id is distinct from old.challenge_id then
    new.status := 'pending';
    new.review_feedback := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.awarded_points := null;
  end if;
  return new;
end;
$$;

revoke all on function private.reset_submission_review_on_edit() from public, anon, authenticated;

drop trigger if exists record_challenge_submission on public.challenge_submissions;
drop trigger if exists sync_submission_leaderboard on public.challenge_submissions;
drop trigger if exists reset_submission_review_on_edit on public.challenge_submissions;
create trigger reset_submission_review_on_edit
  before update on public.challenge_submissions
  for each row execute function private.reset_submission_review_on_edit();

create trigger sync_submission_leaderboard
  after insert or delete or update of profile_id, challenge_id, answer, language, status, awarded_points
  on public.challenge_submissions
  for each row execute function private.sync_submission_leaderboard();

create or replace function private.refresh_challenge_leaderboards()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  profile_row record;
begin
  if new.points is distinct from old.points then
    for profile_row in
      select distinct cs.profile_id
      from public.challenge_submissions cs
      where cs.challenge_id = new.id and cs.status = 'approved'
    loop
      perform private.refresh_profile_leaderboard(profile_row.profile_id);
    end loop;
  end if;
  return new;
end;
$$;

revoke all on function private.refresh_challenge_leaderboards() from public, anon, authenticated;

drop trigger if exists refresh_challenge_leaderboards on public.challenges;
create trigger refresh_challenge_leaderboards
  after update of points on public.challenges
  for each row execute function private.refresh_challenge_leaderboards();

do $$
declare
  profile_row record;
begin
  for profile_row in select distinct profile_id from public.challenge_submissions loop
    perform private.refresh_profile_leaderboard(profile_row.profile_id);
  end loop;
end
$$;
