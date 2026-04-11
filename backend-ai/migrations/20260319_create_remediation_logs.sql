-- Migration: create remediation_logs
-- Date: 2026-03-19
--
-- Notes:
-- - Uses JSON/JSONB-compatible types where possible.
-- - If your database does not support JSON, change JSON columns to TEXT.

CREATE TABLE IF NOT EXISTS remediation_logs (
  id INTEGER PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  user_id INTEGER NULL,
  api_key_id INTEGER NULL,
  security_log_id INTEGER NULL,
  request_id VARCHAR NULL,

  threat_type VARCHAR NULL,
  threat_score FLOAT NULL,

  actions JSON NOT NULL,
  email_to VARCHAR NULL,
  webhook_urls JSON NULL,
  error VARCHAR NULL
);

CREATE INDEX IF NOT EXISTS ix_remediation_logs_user_created_at ON remediation_logs (user_id, created_at);
CREATE INDEX IF NOT EXISTS ix_remediation_logs_api_key_created_at ON remediation_logs (api_key_id, created_at);
CREATE INDEX IF NOT EXISTS ix_remediation_logs_request_id ON remediation_logs (request_id);
CREATE INDEX IF NOT EXISTS ix_remediation_logs_security_log_id ON remediation_logs (security_log_id);

