/*
# Cloud project sync (per-user)

The first REAL per-user data model in FlashFX. Each user's projects (scene JSON + a small
metadata blob) live in `cloud_projects`, and their media assets live in the private
`project-assets` Storage bucket. Everything is scoped to auth.uid() with real RLS — the
account-based ownership model, not the shared x-app-key pattern used elsewhere.

## Sync model
- `updated_at` is CLIENT-controlled (the local project's modifiedAt), so last-write-wins
  compares logical edit time across devices — no server trigger overwrites it.
- `deleted` is a tombstone so a delete on one device propagates instead of resurrecting.
- Project ids are the app's own text ids (not UUIDs), hence `id text primary key`.

## Changes
1. Table `public.cloud_projects` (owner-only RLS).
2. Private Storage bucket `project-assets`, path `{user_id}/{projectId}/{assetId}`, owner-folder RLS.
*/

-- ============================================================
-- cloud_projects
-- ============================================================
create table if not exists public.cloud_projects (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null default 'Untitled',
  scene       jsonb not null,
  meta        jsonb,
  deleted     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists cloud_projects_user_idx on public.cloud_projects (user_id, updated_at desc);

alter table public.cloud_projects enable row level security;

drop policy if exists "own_projects_select" on public.cloud_projects;
create policy "own_projects_select" on public.cloud_projects
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "own_projects_insert" on public.cloud_projects;
create policy "own_projects_insert" on public.cloud_projects
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "own_projects_update" on public.cloud_projects;
create policy "own_projects_update" on public.cloud_projects
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own_projects_delete" on public.cloud_projects;
create policy "own_projects_delete" on public.cloud_projects
  for delete to authenticated using (auth.uid() = user_id);

-- ============================================================
-- project-assets bucket + owner-folder RLS (path: {user_id}/{projectId}/{assetId})
-- ============================================================
insert into storage.buckets (id, name, public)
  values ('project-assets', 'project-assets', false)
  on conflict (id) do nothing;

drop policy if exists "own_assets_select" on storage.objects;
create policy "own_assets_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'project-assets' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own_assets_insert" on storage.objects;
create policy "own_assets_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'project-assets' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own_assets_update" on storage.objects;
create policy "own_assets_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'project-assets' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own_assets_delete" on storage.objects;
create policy "own_assets_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'project-assets' and (storage.foldername(name))[1] = auth.uid()::text);
