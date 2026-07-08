-- Editor recovery / corruption event logging.
-- No auth exists in this app; logs are diagnostic and not user-owned, so anon
-- may insert and read. RLS is enabled with explicit per-verb policies.

CREATE TABLE IF NOT EXISTS editor_recovery_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  message text NOT NULL DEFAULT '',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  project_id text,
  session_id text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS editor_recovery_logs_created_at_idx
  ON editor_recovery_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS editor_recovery_logs_event_type_idx
  ON editor_recovery_logs (event_type);

ALTER TABLE editor_recovery_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_insert_recovery_logs" ON editor_recovery_logs
  FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "authenticated_insert_recovery_logs" ON editor_recovery_logs
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "anon_select_recovery_logs" ON editor_recovery_logs
  FOR SELECT TO anon USING (true);
CREATE POLICY "authenticated_select_recovery_logs" ON editor_recovery_logs
  FOR SELECT TO authenticated USING (true);
