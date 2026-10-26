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
