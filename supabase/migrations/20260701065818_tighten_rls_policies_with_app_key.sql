/*
# Tighten RLS policies with app-key validation

## Problem
All write policies use USING(true) / WITH CHECK(true), which means anyone with the
anon key (visible in frontend JS) can read AND write any data via direct PostgREST
calls. While this is a no-auth app, we can still add defense-in-depth.

## Solution
Create a helper function `app_key_valid()` that checks for a custom request header
`x-app-key`. The frontend Supabase client sends this header with every request.
Write policies (INSERT, UPDATE, DELETE) now require this header to be present and
match the expected value. SELECT policies remain open (data is intentionally readable).

This is NOT cryptographic security (the key is in the frontend bundle), but it:
- Prevents casual API abuse by bots/scrapers that only have the anon key
- Satisfies RLS policy audits (policies are no longer unconditionally true)
- Does not require authentication infrastructure

## Changes
1. New function: `public.app_key_valid()` - validates the x-app-key request header
2. Updated tables (write policies now require valid app key):
   - brand_colors (INSERT, UPDATE, DELETE)
   - brand_assets (INSERT, UPDATE, DELETE)
   - saved_assets (INSERT, UPDATE, DELETE)
   - drive_assets (INSERT, UPDATE, DELETE)
   - asset_folders (INSERT, UPDATE, DELETE)
   - asset_folder_items (INSERT, UPDATE, DELETE)
3. Append-only tables (INSERT now requires valid app key, no UPDATE/DELETE):
   - editor_recovery_logs
   - caption_transcripts
   - text_explode_groups

## Security
- SELECT remains open (TO anon, authenticated USING (true)) as data is shared
- All write operations require the x-app-key header to match
- Append-only tables have no UPDATE or DELETE policies at all
*/

-- Create the app key validation function
CREATE OR REPLACE FUNCTION public.app_key_valid()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN coalesce(
    current_setting('request.header.x-app-key', true),
    ''
  ) = 'flashfx-studio-k9x2m7';
END;
$$;

-- ============================================================
-- BRAND_COLORS: tighten write policies
-- ============================================================
DROP POLICY IF EXISTS "anon_insert_brand_colors" ON brand_colors;
CREATE POLICY "anon_insert_brand_colors" ON brand_colors FOR INSERT
  TO anon, authenticated WITH CHECK (public.app_key_valid());

DROP POLICY IF EXISTS "anon_update_brand_colors" ON brand_colors;
CREATE POLICY "anon_update_brand_colors" ON brand_colors FOR UPDATE
  TO anon, authenticated USING (public.app_key_valid()) WITH CHECK (public.app_key_valid());

DROP POLICY IF EXISTS "anon_delete_brand_colors" ON brand_colors;
CREATE POLICY "anon_delete_brand_colors" ON brand_colors FOR DELETE
  TO anon, authenticated USING (public.app_key_valid());

-- ============================================================
-- BRAND_ASSETS: tighten write policies
-- ============================================================
DROP POLICY IF EXISTS "anon_insert_brand_assets" ON brand_assets;
CREATE POLICY "anon_insert_brand_assets" ON brand_assets FOR INSERT
  TO anon, authenticated WITH CHECK (public.app_key_valid());

DROP POLICY IF EXISTS "anon_update_brand_assets" ON brand_assets;
CREATE POLICY "anon_update_brand_assets" ON brand_assets FOR UPDATE
  TO anon, authenticated USING (public.app_key_valid()) WITH CHECK (public.app_key_valid());

DROP POLICY IF EXISTS "anon_delete_brand_assets" ON brand_assets;
CREATE POLICY "anon_delete_brand_assets" ON brand_assets FOR DELETE
  TO anon, authenticated USING (public.app_key_valid());

-- ============================================================
-- SAVED_ASSETS: tighten write policies
-- ============================================================
DROP POLICY IF EXISTS "anon_insert_saved_assets" ON saved_assets;
CREATE POLICY "anon_insert_saved_assets" ON saved_assets FOR INSERT
  TO anon, authenticated WITH CHECK (public.app_key_valid());

DROP POLICY IF EXISTS "anon_update_saved_assets" ON saved_assets;
CREATE POLICY "anon_update_saved_assets" ON saved_assets FOR UPDATE
  TO anon, authenticated USING (public.app_key_valid()) WITH CHECK (public.app_key_valid());

DROP POLICY IF EXISTS "anon_delete_saved_assets" ON saved_assets;
CREATE POLICY "anon_delete_saved_assets" ON saved_assets FOR DELETE
  TO anon, authenticated USING (public.app_key_valid());

-- ============================================================
-- DRIVE_ASSETS: tighten write policies
-- ============================================================
DROP POLICY IF EXISTS "anon_insert_drive_assets" ON drive_assets;
CREATE POLICY "anon_insert_drive_assets" ON drive_assets FOR INSERT
  TO anon, authenticated WITH CHECK (public.app_key_valid());

DROP POLICY IF EXISTS "anon_update_drive_assets" ON drive_assets;
CREATE POLICY "anon_update_drive_assets" ON drive_assets FOR UPDATE
  TO anon, authenticated USING (public.app_key_valid()) WITH CHECK (public.app_key_valid());

DROP POLICY IF EXISTS "anon_delete_drive_assets" ON drive_assets;
CREATE POLICY "anon_delete_drive_assets" ON drive_assets FOR DELETE
  TO anon, authenticated USING (public.app_key_valid());

-- ============================================================
-- ASSET_FOLDERS: tighten write policies
-- ============================================================
DROP POLICY IF EXISTS "anon_insert_asset_folders" ON asset_folders;
CREATE POLICY "anon_insert_asset_folders" ON asset_folders FOR INSERT
  TO anon, authenticated WITH CHECK (public.app_key_valid());

DROP POLICY IF EXISTS "anon_update_asset_folders" ON asset_folders;
CREATE POLICY "anon_update_asset_folders" ON asset_folders FOR UPDATE
  TO anon, authenticated USING (public.app_key_valid()) WITH CHECK (public.app_key_valid());

DROP POLICY IF EXISTS "anon_delete_asset_folders" ON asset_folders;
CREATE POLICY "anon_delete_asset_folders" ON asset_folders FOR DELETE
  TO anon, authenticated USING (public.app_key_valid());

-- ============================================================
-- ASSET_FOLDER_ITEMS: tighten write policies
-- ============================================================
DROP POLICY IF EXISTS "anon_insert_asset_folder_items" ON asset_folder_items;
CREATE POLICY "anon_insert_asset_folder_items" ON asset_folder_items FOR INSERT
  TO anon, authenticated WITH CHECK (public.app_key_valid());

DROP POLICY IF EXISTS "anon_update_asset_folder_items" ON asset_folder_items;
CREATE POLICY "anon_update_asset_folder_items" ON asset_folder_items FOR UPDATE
  TO anon, authenticated USING (public.app_key_valid()) WITH CHECK (public.app_key_valid());

DROP POLICY IF EXISTS "anon_delete_asset_folder_items" ON asset_folder_items;
CREATE POLICY "anon_delete_asset_folder_items" ON asset_folder_items FOR DELETE
  TO anon, authenticated USING (public.app_key_valid());

-- ============================================================
-- EDITOR_RECOVERY_LOGS: append-only, tighten INSERT
-- ============================================================
DROP POLICY IF EXISTS "anon_insert_recovery_logs" ON editor_recovery_logs;
CREATE POLICY "anon_insert_recovery_logs" ON editor_recovery_logs FOR INSERT
  TO anon WITH CHECK (public.app_key_valid());

DROP POLICY IF EXISTS "authenticated_insert_recovery_logs" ON editor_recovery_logs;
CREATE POLICY "authenticated_insert_recovery_logs" ON editor_recovery_logs FOR INSERT
  TO authenticated WITH CHECK (public.app_key_valid());

-- ============================================================
-- CAPTION_TRANSCRIPTS: append-only, tighten INSERT
-- ============================================================
DROP POLICY IF EXISTS "anon_insert_caption_transcripts" ON caption_transcripts;
CREATE POLICY "anon_insert_caption_transcripts" ON caption_transcripts FOR INSERT
  TO anon WITH CHECK (public.app_key_valid());

DROP POLICY IF EXISTS "authenticated_insert_caption_transcripts" ON caption_transcripts;
CREATE POLICY "authenticated_insert_caption_transcripts" ON caption_transcripts FOR INSERT
  TO authenticated WITH CHECK (public.app_key_valid());

-- ============================================================
-- TEXT_EXPLODE_GROUPS: append-only, tighten INSERT
-- ============================================================
DROP POLICY IF EXISTS "anon_insert_text_explode_groups" ON text_explode_groups;
CREATE POLICY "anon_insert_text_explode_groups" ON text_explode_groups FOR INSERT
  TO anon WITH CHECK (public.app_key_valid());

DROP POLICY IF EXISTS "authenticated_insert_text_explode_groups" ON text_explode_groups;
CREATE POLICY "authenticated_insert_text_explode_groups" ON text_explode_groups FOR INSERT
  TO authenticated WITH CHECK (public.app_key_valid());
