ALTER TABLE sessions ADD COLUMN device_id TEXT;

UPDATE sessions
SET device_id = CASE
  WHEN user_agent IS NULL OR trim(user_agent) = '' THEN 'legacy-session:' || id
  ELSE 'legacy-ua:' || user_agent
END
WHERE device_id IS NULL;

CREATE INDEX idx_sessions_user_device
  ON sessions(user_id, device_id, revoked_at, expires_at);
