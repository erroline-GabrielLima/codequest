create table if not exists public.game_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 32),
  created_at timestamptz not null default now()
);

create index if not exists game_profiles_owner_created_idx
  on public.game_profiles (owner_id, created_at);

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
\n\n-- Live submissions and a public leaderboard with aggregate counts only.\ncreate table if not exists public.challenges (
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
