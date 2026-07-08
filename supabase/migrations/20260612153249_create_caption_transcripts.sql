-- Stores the final generated caption transcript for a project. This is a
-- best-effort backend record written once when the user accepts generated
-- captions; the editable caption clips themselves live in the local project
-- scene. The app is local-first and uses the anon Supabase role (no auth), so
-- policies mirror editor_recovery_logs: permissive but RLS-enabled.

CREATE TABLE IF NOT EXISTS caption_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text,
  source_layer_id text,
  language text,
  model text NOT NULL,
  timestamp_mode text NOT NULL,
  segment_count integer NOT NULL DEFAULT 0,
  processing_ms integer NOT NULL DEFAULT 0,
  segments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS caption_transcripts_project_id_idx
  ON caption_transcripts (project_id);

ALTER TABLE caption_transcripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_insert_caption_transcripts" ON caption_transcripts
  FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "authenticated_insert_caption_transcripts" ON caption_transcripts
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "anon_select_caption_transcripts" ON caption_transcripts
  FOR SELECT TO anon USING (true);
CREATE POLICY "authenticated_select_caption_transcripts" ON caption_transcripts
  FOR SELECT TO authenticated USING (true);
