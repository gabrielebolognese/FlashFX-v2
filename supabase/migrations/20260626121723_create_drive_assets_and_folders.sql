/*
# Create drive_assets catalog and asset_folders tables (single-tenant, no auth)

1. New Tables
  - `drive_assets`
    - `id` (uuid, primary key)
    - `drive_id` (text, unique Google Drive file ID)
    - `name` (text, display name of the asset)
    - `mime_type` (text, e.g. 'video/mp4', 'image/png')
    - `is_folder` (boolean, whether this is a folder)
    - `parent_drive_id` (text, Drive ID of the parent folder, nullable for root items)
    - `category` (text, derived category: transitions, motion-graphics, sound-effects, luts, overlays, etc.)
    - `tags` (text[], searchable tags for the asset)
    - `thumbnail_url` (text, thumbnail URL from Drive or generated)
    - `size_bytes` (bigint, file size in bytes)
    - `modified_at` (timestamptz, last modified time from Drive)
    - `synced_at` (timestamptz, when this record was last synced from Drive)
    - `created_at` (timestamptz, record creation time)

  - `asset_folders`
    - `id` (uuid, primary key)
    - `name` (text, folder display name)
    - `parent_id` (uuid, self-referencing for nested folders, nullable for root)
    - `folder_type` (text, which media tab this folder belongs to: images, videos, audio, all)
    - `color` (text, optional color for folder icon)
    - `sort_order` (integer, for manual ordering)
    - `created_at` (timestamptz)

  - `asset_folder_items`
    - `id` (uuid, primary key)
    - `folder_id` (uuid, FK to asset_folders)
    - `asset_id` (text, the local media asset ID)
    - `added_at` (timestamptz)

2. Security
  - Enable RLS on all tables.
  - Allow anon + authenticated full CRUD (no auth in this app).

3. Indexes
  - drive_assets: index on parent_drive_id, category, drive_id
  - asset_folders: index on parent_id, folder_type
  - asset_folder_items: index on folder_id, asset_id
*/

-- Drive assets catalog (indexed from Google Drive)
CREATE TABLE IF NOT EXISTS drive_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_id text UNIQUE NOT NULL,
  name text NOT NULL,
  mime_type text NOT NULL DEFAULT 'application/octet-stream',
  is_folder boolean NOT NULL DEFAULT false,
  parent_drive_id text,
  category text,
  tags text[] DEFAULT '{}',
  thumbnail_url text,
  size_bytes bigint DEFAULT 0,
  modified_at timestamptz,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drive_assets_parent ON drive_assets(parent_drive_id);
CREATE INDEX IF NOT EXISTS idx_drive_assets_category ON drive_assets(category);
CREATE INDEX IF NOT EXISTS idx_drive_assets_drive_id ON drive_assets(drive_id);
CREATE INDEX IF NOT EXISTS idx_drive_assets_is_folder ON drive_assets(is_folder);

ALTER TABLE drive_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_drive_assets" ON drive_assets;
CREATE POLICY "anon_select_drive_assets" ON drive_assets FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_drive_assets" ON drive_assets;
CREATE POLICY "anon_insert_drive_assets" ON drive_assets FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_drive_assets" ON drive_assets;
CREATE POLICY "anon_update_drive_assets" ON drive_assets FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_drive_assets" ON drive_assets;
CREATE POLICY "anon_delete_drive_assets" ON drive_assets FOR DELETE
  TO anon, authenticated USING (true);

-- User-created folders for organizing local media assets
CREATE TABLE IF NOT EXISTS asset_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  parent_id uuid REFERENCES asset_folders(id) ON DELETE CASCADE,
  folder_type text NOT NULL DEFAULT 'all' CHECK (folder_type IN ('images', 'videos', 'audio', 'all')),
  color text DEFAULT '#f7b500',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_folders_parent ON asset_folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_asset_folders_type ON asset_folders(folder_type);

ALTER TABLE asset_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_asset_folders" ON asset_folders;
CREATE POLICY "anon_select_asset_folders" ON asset_folders FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_asset_folders" ON asset_folders;
CREATE POLICY "anon_insert_asset_folders" ON asset_folders FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_asset_folders" ON asset_folders;
CREATE POLICY "anon_update_asset_folders" ON asset_folders FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_asset_folders" ON asset_folders;
CREATE POLICY "anon_delete_asset_folders" ON asset_folders FOR DELETE
  TO anon, authenticated USING (true);

-- Junction table: which assets belong to which folders
CREATE TABLE IF NOT EXISTS asset_folder_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id uuid NOT NULL REFERENCES asset_folders(id) ON DELETE CASCADE,
  asset_id text NOT NULL,
  added_at timestamptz DEFAULT now(),
  UNIQUE(folder_id, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_asset_folder_items_folder ON asset_folder_items(folder_id);
CREATE INDEX IF NOT EXISTS idx_asset_folder_items_asset ON asset_folder_items(asset_id);

ALTER TABLE asset_folder_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_asset_folder_items" ON asset_folder_items;
CREATE POLICY "anon_select_asset_folder_items" ON asset_folder_items FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_asset_folder_items" ON asset_folder_items;
CREATE POLICY "anon_insert_asset_folder_items" ON asset_folder_items FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_asset_folder_items" ON asset_folder_items;
CREATE POLICY "anon_update_asset_folder_items" ON asset_folder_items FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_asset_folder_items" ON asset_folder_items;
CREATE POLICY "anon_delete_asset_folder_items" ON asset_folder_items FOR DELETE
  TO anon, authenticated USING (true);
