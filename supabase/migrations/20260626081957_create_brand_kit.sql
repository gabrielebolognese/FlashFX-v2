/*
# Create Brand Kit tables (single-tenant, no auth)

Brand kit data persists across all projects - colors and assets are shared globally.

1. New Tables
  - `brand_colors`
    - `id` (uuid, primary key)
    - `hex` (text, the color hex code e.g. '#FF5500')
    - `sort_order` (integer, for ordering in the palette)
    - `created_at` (timestamp)
  - `brand_assets`
    - `id` (uuid, primary key)
    - `name` (text, file name or label)
    - `url` (text, the public URL or object URL stored)
    - `is_logo` (boolean, whether it's a primary logo)
    - `sort_order` (integer, for ordering)
    - `width` (integer, image width in px)
    - `height` (integer, image height in px)
    - `created_at` (timestamp)

2. Security
  - Enable RLS on both tables.
  - Allow anon + authenticated full CRUD since data is intentionally shared (no auth in this app).
*/

-- Brand Colors
CREATE TABLE IF NOT EXISTS brand_colors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hex text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE brand_colors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_brand_colors" ON brand_colors;
CREATE POLICY "anon_select_brand_colors" ON brand_colors FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_brand_colors" ON brand_colors;
CREATE POLICY "anon_insert_brand_colors" ON brand_colors FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_brand_colors" ON brand_colors;
CREATE POLICY "anon_update_brand_colors" ON brand_colors FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_brand_colors" ON brand_colors;
CREATE POLICY "anon_delete_brand_colors" ON brand_colors FOR DELETE
  TO anon, authenticated USING (true);

-- Brand Assets (logos + images)
CREATE TABLE IF NOT EXISTS brand_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  url text NOT NULL,
  is_logo boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  width integer NOT NULL DEFAULT 0,
  height integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE brand_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_brand_assets" ON brand_assets;
CREATE POLICY "anon_select_brand_assets" ON brand_assets FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_brand_assets" ON brand_assets;
CREATE POLICY "anon_insert_brand_assets" ON brand_assets FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_brand_assets" ON brand_assets;
CREATE POLICY "anon_update_brand_assets" ON brand_assets FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_brand_assets" ON brand_assets;
CREATE POLICY "anon_delete_brand_assets" ON brand_assets FOR DELETE
  TO anon, authenticated USING (true);
