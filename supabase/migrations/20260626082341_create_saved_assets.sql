/*
# Create saved_assets table (single-tenant, no auth)

Stores frequently-used images and audio that persist across all projects.
Users can save assets to this collection and reuse them in any project.

1. New Tables
  - `saved_assets`
    - `id` (uuid, primary key)
    - `name` (text, display name of the asset)
    - `url` (text, the blob/object URL or data URL for the asset)
    - `asset_type` (text, either 'image' or 'audio')
    - `width` (integer, image width in px, 0 for audio)
    - `height` (integer, image height in px, 0 for audio)
    - `duration` (real, audio duration in seconds, null for images)
    - `mime_type` (text, the MIME type e.g. 'image/png', 'audio/mp3')
    - `created_at` (timestamp)

2. Security
  - Enable RLS on `saved_assets`.
  - Allow anon + authenticated full CRUD (no auth in this app, data is shared).

3. Indexes
  - Index on `asset_type` for filtering by images or audio.
*/

CREATE TABLE IF NOT EXISTS saved_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  url text NOT NULL,
  asset_type text NOT NULL CHECK (asset_type IN ('image', 'audio')),
  width integer NOT NULL DEFAULT 0,
  height integer NOT NULL DEFAULT 0,
  duration real,
  mime_type text NOT NULL DEFAULT 'image/png',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saved_assets_type ON saved_assets(asset_type);

ALTER TABLE saved_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_saved_assets" ON saved_assets;
CREATE POLICY "anon_select_saved_assets" ON saved_assets FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_saved_assets" ON saved_assets;
CREATE POLICY "anon_insert_saved_assets" ON saved_assets FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_saved_assets" ON saved_assets;
CREATE POLICY "anon_update_saved_assets" ON saved_assets FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_saved_assets" ON saved_assets;
CREATE POLICY "anon_delete_saved_assets" ON saved_assets FOR DELETE
  TO anon, authenticated USING (true);
