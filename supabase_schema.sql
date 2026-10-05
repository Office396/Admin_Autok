-- Supabase Database Schema for Admin Panel
-- Run this in your Supabase SQL Editor

-- Machines table
CREATE TABLE IF NOT EXISTS machines (
  mac_address TEXT PRIMARY KEY,
  pc_name TEXT NOT NULL,
  username TEXT NOT NULL,
  public_ip TEXT,
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'LOCKED', 'DESTRUCTED')),
  blocked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  current_session_id UUID REFERENCES sessions(id) ON DELETE SET NULL
);

-- Commands table
-- NOTE: the CHECK must allow EVERY command the software understands:
-- LOCK/UNLOCK/DESTRUCT/RECOVER (machine control), STOP/UNSTOP (kill switch),
-- SET_CREDENTIALS:* (terminal login rotation), *-GATEWAY/INSTALL_HERMES/
-- MIGRATE_CONFIG (remote service control). A narrower list silently breaks
-- those features with a 23514 check-constraint error on insert.
CREATE TABLE IF NOT EXISTS commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mac_address TEXT NOT NULL REFERENCES machines(mac_address) ON DELETE CASCADE,
  command TEXT NOT NULL CHECK (
    command IN ('LOCK', 'UNLOCK', 'DESTRUCT', 'RECOVER', 'STOP', 'UNSTOP',
                'START_GATEWAY', 'STOP_GATEWAY', 'RESTART_GATEWAY',
                'INSTALL_HERMES', 'MIGRATE_CONFIG')
    OR command LIKE 'SET_CREDENTIALS:%'
  ),
  executed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Error logs table
CREATE TABLE IF NOT EXISTS error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mac_address TEXT NOT NULL,
  error_type TEXT NOT NULL,
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sessions table for history
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mac_address TEXT NOT NULL,
  pc_name TEXT,
  username TEXT,
  public_ip TEXT,
  start_time TIMESTAMPTZ DEFAULT NOW(),
  end_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS) for production
ALTER TABLE machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Policies to allow anon access (for simplicity - add auth in production)
CREATE POLICY "Allow all access to machines" ON machines FOR ALL USING (true);
CREATE POLICY "Allow all access to commands" ON commands FOR ALL USING (true);
CREATE POLICY "Allow all access to error_logs" ON error_logs FOR ALL USING (true);
CREATE POLICY "Allow all access to sessions" ON sessions FOR ALL USING (true);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_commands_mac ON commands(mac_address);
CREATE INDEX IF NOT EXISTS idx_commands_executed ON commands(executed);
CREATE INDEX IF NOT EXISTS idx_error_logs_mac ON error_logs(mac_address);
CREATE INDEX IF NOT EXISTS idx_sessions_mac ON sessions(mac_address);
CREATE INDEX IF NOT EXISTS idx_sessions_start ON sessions(start_time);

-- Software kill-switch table (per-machine + GLOBAL_ALL rows)
CREATE TABLE IF NOT EXISTS software_enabled (
  mac_address TEXT PRIMARY KEY,
  enabled BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Global terminal login credentials (single row: credential_type='terminal_login')
CREATE TABLE IF NOT EXISTS global_credentials (
  credential_type TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE software_enabled ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to software_enabled" ON software_enabled FOR ALL USING (true);
CREATE POLICY "Allow all access to global_credentials" ON global_credentials FOR ALL USING (true);

-- ============================================================================
-- FIX FOR EXISTING DATABASES: widen the commands CHECK constraint.
-- Run this in the Supabase SQL Editor if commands were created with the old
-- 4-value list. Without it, STOP/UNSTOP/SET_CREDENTIALS/service commands fail
-- with error 23514 and those Admin features silently break.
-- ============================================================================
-- ALTER TABLE commands DROP CONSTRAINT IF EXISTS commands_command_check;
-- ALTER TABLE commands ADD CONSTRAINT commands_command_check CHECK (
--   command IN ('LOCK', 'UNLOCK', 'DESTRUCT', 'RECOVER', 'STOP', 'UNSTOP',
--               'START_GATEWAY', 'STOP_GATEWAY', 'RESTART_GATEWAY',
--               'INSTALL_HERMES', 'MIGRATE_CONFIG')
--   OR command LIKE 'SET_CREDENTIALS:%'
-- );
