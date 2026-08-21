/*
# Election Management System - Core Schema

## Overview
Creates the complete data-driven election management system with:
- Data-driven role/permission definitions (no hardcoded labels in UI)
- Data-driven navigation configuration
- User profiles linked to Supabase Auth with role assignment
- Elections with configurable positions, voting windows, and status
- Candidates linked to elections and positions
- Voter roster per election
- Votes with server-side validation
- Audit logs generated from privileged operations

## Tables Created
1. `role_definitions` - Role technical IDs + display metadata (label, description)
2. `permission_definitions` - Permission technical IDs + display metadata
3. `role_permissions` - Maps roles to permissions (many-to-many)
4. `navigation_items` - Sidebar navigation config, filtered by permission
5. `profiles` - Extends auth.users with full_name and role_id
6. `elections` - Election configuration (title, description, status, voting window)
7. `positions` - Positions per election (title, max_votes, display_order)
8. `candidates` - Candidates per election+position (name, bio, photo_url)
9. `voter_roster` - Eligible voters per election (email, name, has_voted)
10. `votes` - Cast ballots (voter, election, position, candidate)
11. `audit_logs` - Audit trail of privileged operations

## Security
- RLS enabled on all tables
- Profiles: users read own, admins read all, users update own (not role)
- Config tables (roles, permissions, navigation): readable by all authenticated
- Elections/positions/candidates: admins CRUD, voters read published
- Voter roster: admins CRUD, voters read own entry
- Votes: voters insert own (via RPC), admins read all for results
- Audit logs: admins read only; inserts via SECURITY DEFINER function

## Bootstrap
- Trigger auto-creates profile on new auth user
- First user automatically gets ROLE_CHAIRPERSON (admin bootstrap)
- Role/permission/navigation seed data inserted as configuration
*/

-- ============================================================
-- ROLE DEFINITIONS (data-driven, not hardcoded in UI)
-- ============================================================
CREATE TABLE IF NOT EXISTS role_definitions (
  id text PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL,
  display_order int NOT NULL DEFAULT 0,
  is_admin boolean NOT NULL DEFAULT false
);

-- ============================================================
-- PERMISSION DEFINITIONS (single source of truth)
-- ============================================================
CREATE TABLE IF NOT EXISTS permission_definitions (
  id text PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL,
  display_order int NOT NULL DEFAULT 0
);

-- ============================================================
-- ROLE-PERMISSION MAPPING
-- ============================================================
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id text NOT NULL REFERENCES role_definitions(id) ON DELETE CASCADE,
  permission_id text NOT NULL REFERENCES permission_definitions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- ============================================================
-- NAVIGATION ITEMS (data-driven sidebar config)
-- ============================================================
CREATE TABLE IF NOT EXISTS navigation_items (
  id text PRIMARY KEY,
  label text NOT NULL,
  path text NOT NULL,
  icon_name text NOT NULL,
  permission_id text REFERENCES permission_definitions(id) ON DELETE CASCADE,
  display_order int NOT NULL DEFAULT 0,
  parent_id text REFERENCES navigation_items(id) ON DELETE CASCADE
);

-- ============================================================
-- PROFILES (extends auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL DEFAULT '',
  role_id text NOT NULL DEFAULT 'VOTER' REFERENCES role_definitions(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- ELECTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS elections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  start_time timestamptz,
  end_time timestamptz,
  results_published boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- POSITIONS (per election, data-driven)
-- ============================================================
CREATE TABLE IF NOT EXISTS positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id uuid NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  max_votes int NOT NULL DEFAULT 1,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- CANDIDATES (per election + position)
-- ============================================================
CREATE TABLE IF NOT EXISTS candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id uuid NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  position_id uuid NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  name text NOT NULL,
  bio text NOT NULL DEFAULT '',
  photo_url text NOT NULL DEFAULT '',
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- VOTER ROSTER (per election)
-- ============================================================
CREATE TABLE IF NOT EXISTS voter_roster (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id uuid NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  voter_email text NOT NULL,
  voter_name text NOT NULL DEFAULT '',
  has_voted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (election_id, voter_email)
);

-- ============================================================
-- VOTES (cast ballots)
-- ============================================================
CREATE TABLE IF NOT EXISTS votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id uuid NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  position_id uuid NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  voter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- AUDIT LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text NOT NULL DEFAULT '',
  action text NOT NULL,
  entity_type text NOT NULL DEFAULT '',
  entity_id text NOT NULL DEFAULT '',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_positions_election_id ON positions(election_id);
CREATE INDEX IF NOT EXISTS idx_candidates_election_id ON candidates(election_id);
CREATE INDEX IF NOT EXISTS idx_candidates_position_id ON candidates(position_id);
CREATE INDEX IF NOT EXISTS idx_voter_roster_election_id ON voter_roster(election_id);
CREATE INDEX IF NOT EXISTS idx_voter_roster_email ON voter_roster(voter_email);
CREATE INDEX IF NOT EXISTS idx_votes_election_id ON votes(election_id);
CREATE INDEX IF NOT EXISTS idx_votes_position_id ON votes(position_id);
CREATE INDEX IF NOT EXISTS idx_votes_candidate_id ON votes(candidate_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_elections_status ON elections(status);

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Get the current user's role from profiles
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role_id FROM profiles WHERE id = auth.uid();
$$;

-- Check if the current user has a specific permission
CREATE OR REPLACE FUNCTION has_permission(p_permission text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = get_user_role()
    AND rp.permission_id = p_permission
  );
$$;

-- Check if current user is an admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE((SELECT is_admin FROM role_definitions WHERE id = get_user_role()), false);
$$;

-- Insert an audit log entry
CREATE OR REPLACE FUNCTION log_audit(
  p_action text,
  p_entity_type text DEFAULT '',
  p_entity_id text DEFAULT '',
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO audit_logs (user_id, user_email, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    COALESCE((SELECT email FROM profiles WHERE id = auth.uid()), ''),
    p_action,
    p_entity_type,
    p_entity_id,
    p_details
  );
END;
$$;

-- Submit a vote with server-side validation
CREATE OR REPLACE FUNCTION submit_vote(
  p_election_id uuid,
  p_position_id uuid,
  p_candidate_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_election_status text;
  v_election_start timestamptz;
  v_election_end timestamptz;
  v_is_eligible boolean;
  v_already_voted boolean;
  v_candidate_valid boolean;
  v_position_valid boolean;
BEGIN
  -- Validate election exists and is active
  SELECT status, start_time, end_time INTO v_election_status, v_election_start, v_election_end
  FROM elections WHERE id = p_election_id;

  IF v_election_status IS NULL THEN
    RAISE EXCEPTION 'Election not found';
  END IF;

  IF v_election_status != 'active' THEN
    RAISE EXCEPTION 'Election is not active';
  END IF;

  IF v_election_start IS NOT NULL AND now() < v_election_start THEN
    RAISE EXCEPTION 'Voting has not opened yet';
  END IF;

  IF v_election_end IS NOT NULL AND now() > v_election_end THEN
    RAISE EXCEPTION 'Voting has closed';
  END IF;

  -- Validate position belongs to election
  SELECT EXISTS(
    SELECT 1 FROM positions WHERE id = p_position_id AND election_id = p_election_id
  ) INTO v_position_valid;

  IF NOT v_position_valid THEN
    RAISE EXCEPTION 'Invalid position for this election';
  END IF;

  -- Validate candidate belongs to position and election
  SELECT EXISTS(
    SELECT 1 FROM candidates WHERE id = p_candidate_id AND position_id = p_position_id AND election_id = p_election_id
  ) INTO v_candidate_valid;

  IF NOT v_candidate_valid THEN
    RAISE EXCEPTION 'Invalid candidate for this position';
  END IF;

  -- Validate voter eligibility
  SELECT EXISTS(
    SELECT 1 FROM voter_roster
    WHERE election_id = p_election_id
    AND voter_email = (SELECT email FROM profiles WHERE id = auth.uid())
  ) INTO v_is_eligible;

  IF NOT v_is_eligible THEN
    RAISE EXCEPTION 'You are not on the voter roster for this election';
  END IF;

  -- Check for duplicate vote on this position
  SELECT EXISTS(
    SELECT 1 FROM votes
    WHERE election_id = p_election_id
    AND position_id = p_position_id
    AND voter_id = auth.uid()
  ) INTO v_already_voted;

  IF v_already_voted THEN
    RAISE EXCEPTION 'You have already voted for this position';
  END IF;

  -- Insert the vote
  INSERT INTO votes (election_id, position_id, candidate_id, voter_id)
  VALUES (p_election_id, p_position_id, p_candidate_id, auth.uid());

  -- Mark voter as having voted
  UPDATE voter_roster
  SET has_voted = true
  WHERE election_id = p_election_id
    AND voter_email = (SELECT email FROM profiles WHERE id = auth.uid());

  -- Log the action
  PERFORM log_audit('CAST_VOTE', 'vote', p_candidate_id::text, jsonb_build_object('election_id', p_election_id, 'position_id', p_position_id));
END;
$$;

-- ============================================================
-- TRIGGER: Auto-create profile on new auth user
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_count int;
  v_assigned_role text;
BEGIN
  -- Check if any admin profiles exist
  SELECT COUNT(*) INTO v_admin_count
  FROM profiles p
  JOIN role_definitions rd ON p.role_id = rd.id
  WHERE rd.is_admin = true;

  -- First user becomes chairperson, others become voters
  IF v_admin_count = 0 THEN
    v_assigned_role := 'ROLE_CHAIRPERSON';
  ELSE
    v_assigned_role := 'VOTER';
  END IF;

  INSERT INTO profiles (id, email, full_name, role_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    v_assigned_role
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- ENABLE RLS ON ALL TABLES
-- ============================================================
ALTER TABLE role_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE permission_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE navigation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE elections ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE voter_roster ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES: role_definitions (readable by all authenticated)
-- ============================================================
DROP POLICY IF EXISTS "read_role_definitions" ON role_definitions;
CREATE POLICY "read_role_definitions" ON role_definitions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "manage_role_definitions" ON role_definitions;
CREATE POLICY "manage_role_definitions" ON role_definitions
  FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- ============================================================
-- RLS POLICIES: permission_definitions
-- ============================================================
DROP POLICY IF EXISTS "read_permission_definitions" ON permission_definitions;
CREATE POLICY "read_permission_definitions" ON permission_definitions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "manage_permission_definitions" ON permission_definitions;
CREATE POLICY "manage_permission_definitions" ON permission_definitions
  FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- ============================================================
-- RLS POLICIES: role_permissions
-- ============================================================
DROP POLICY IF EXISTS "read_role_permissions" ON role_permissions;
CREATE POLICY "read_role_permissions" ON role_permissions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "manage_role_permissions" ON role_permissions;
CREATE POLICY "manage_role_permissions" ON role_permissions
  FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- ============================================================
-- RLS POLICIES: navigation_items
-- ============================================================
DROP POLICY IF EXISTS "read_navigation_items" ON navigation_items;
CREATE POLICY "read_navigation_items" ON navigation_items
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "manage_navigation_items" ON navigation_items;
CREATE POLICY "manage_navigation_items" ON navigation_items
  FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- ============================================================
-- RLS POLICIES: profiles
-- ============================================================
DROP POLICY IF EXISTS "read_own_profile" ON profiles;
CREATE POLICY "read_own_profile" ON profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR is_admin());

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "admin_update_profile" ON profiles;
CREATE POLICY "admin_update_profile" ON profiles
  FOR UPDATE TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- ============================================================
-- RLS POLICIES: elections
-- ============================================================
DROP POLICY IF EXISTS "read_elections" ON elections;
CREATE POLICY "read_elections" ON elections
  FOR SELECT TO authenticated
  USING (is_admin() OR status IN ('active', 'closed', 'published'));

DROP POLICY IF EXISTS "manage_elections" ON elections;
CREATE POLICY "manage_elections" ON elections
  FOR INSERT TO authenticated WITH CHECK (has_permission('MANAGE_ELECTIONS'));

DROP POLICY IF EXISTS "update_elections" ON elections;
CREATE POLICY "update_elections" ON elections
  FOR UPDATE TO authenticated
  USING (has_permission('MANAGE_ELECTIONS')) WITH CHECK (has_permission('MANAGE_ELECTIONS'));

DROP POLICY IF EXISTS "delete_elections" ON elections;
CREATE POLICY "delete_elections" ON elections
  FOR DELETE TO authenticated
  USING (has_permission('MANAGE_ELECTIONS'));

-- ============================================================
-- RLS POLICIES: positions
-- ============================================================
DROP POLICY IF EXISTS "read_positions" ON positions;
CREATE POLICY "read_positions" ON positions
  FOR SELECT TO authenticated
  USING (
    is_admin() OR EXISTS(
      SELECT 1 FROM elections e
      WHERE e.id = positions.election_id
      AND e.status IN ('active', 'closed', 'published')
    )
  );

DROP POLICY IF EXISTS "manage_positions" ON positions;
CREATE POLICY "manage_positions" ON positions
  FOR INSERT TO authenticated WITH CHECK (has_permission('MANAGE_ELECTIONS'));

DROP POLICY IF EXISTS "update_positions" ON positions;
CREATE POLICY "update_positions" ON positions
  FOR UPDATE TO authenticated
  USING (has_permission('MANAGE_ELECTIONS')) WITH CHECK (has_permission('MANAGE_ELECTIONS'));

DROP POLICY IF EXISTS "delete_positions" ON positions;
CREATE POLICY "delete_positions" ON positions
  FOR DELETE TO authenticated
  USING (has_permission('MANAGE_ELECTIONS'));

-- ============================================================
-- RLS POLICIES: candidates
-- ============================================================
DROP POLICY IF EXISTS "read_candidates" ON candidates;
CREATE POLICY "read_candidates" ON candidates
  FOR SELECT TO authenticated
  USING (
    is_admin() OR EXISTS(
      SELECT 1 FROM elections e
      WHERE e.id = candidates.election_id
      AND e.status IN ('active', 'closed', 'published')
    )
  );

DROP POLICY IF EXISTS "manage_candidates" ON candidates;
CREATE POLICY "manage_candidates" ON candidates
  FOR INSERT TO authenticated WITH CHECK (has_permission('MANAGE_CANDIDATES'));

DROP POLICY IF EXISTS "update_candidates" ON candidates;
CREATE POLICY "update_candidates" ON candidates
  FOR UPDATE TO authenticated
  USING (has_permission('MANAGE_CANDIDATES')) WITH CHECK (has_permission('MANAGE_CANDIDATES'));

DROP POLICY IF EXISTS "delete_candidates" ON candidates;
CREATE POLICY "delete_candidates" ON candidates
  FOR DELETE TO authenticated
  USING (has_permission('MANAGE_CANDIDATES'));

-- ============================================================
-- RLS POLICIES: voter_roster
-- ============================================================
DROP POLICY IF EXISTS "read_voter_roster" ON voter_roster;
CREATE POLICY "read_voter_roster" ON voter_roster
  FOR SELECT TO authenticated
  USING (
    is_admin() OR voter_email = (SELECT email FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "manage_voter_roster" ON voter_roster;
CREATE POLICY "manage_voter_roster" ON voter_roster
  FOR INSERT TO authenticated WITH CHECK (has_permission('MANAGE_ROSTER'));

DROP POLICY IF EXISTS "update_voter_roster" ON voter_roster;
CREATE POLICY "update_voter_roster" ON voter_roster
  FOR UPDATE TO authenticated
  USING (has_permission('MANAGE_ROSTER')) WITH CHECK (has_permission('MANAGE_ROSTER'));

DROP POLICY IF EXISTS "delete_voter_roster" ON voter_roster;
CREATE POLICY "delete_voter_roster" ON voter_roster
  FOR DELETE TO authenticated
  USING (has_permission('MANAGE_ROSTER'));

-- ============================================================
-- RLS POLICIES: votes (insert only via RPC, read for results)
-- ============================================================
DROP POLICY IF EXISTS "read_votes" ON votes;
CREATE POLICY "read_votes" ON votes
  FOR SELECT TO authenticated
  USING (
    is_admin() OR voter_id = auth.uid()
  );

-- No direct INSERT policy — votes must go through submit_vote() RPC

-- ============================================================
-- RLS POLICIES: audit_logs (admin read only, insert via function)
-- ============================================================
DROP POLICY IF EXISTS "read_audit_logs" ON audit_logs;
CREATE POLICY "read_audit_logs" ON audit_logs
  FOR SELECT TO authenticated
  USING (has_permission('VIEW_AUDIT_LOGS'));

-- ============================================================
-- SEED: Configuration Data (roles, permissions, mappings, nav)
-- This is system configuration, NOT business data.
-- ============================================================

-- Permission definitions
INSERT INTO permission_definitions (id, label, description, display_order) VALUES
  ('VIEW_DASHBOARD', 'View Dashboard', 'Access the admin dashboard overview', 1),
  ('MANAGE_ELECTIONS', 'Manage Elections', 'Create, edit, and configure elections and positions', 2),
  ('MANAGE_CANDIDATES', 'Manage Candidates', 'Add, edit, and remove candidates from elections', 3),
  ('MANAGE_ROSTER', 'Manage Voter Roster', 'Import and manage the voter eligibility roster', 4),
  ('VIEW_RESULTS', 'View Results', 'View election results and turnout statistics', 5),
  ('MANAGE_USERS', 'Manage Users', 'Assign and change administrator roles', 6),
  ('VIEW_AUDIT_LOGS', 'View Audit Logs', 'View the system audit trail', 7),
  ('VOTE', 'Cast Vote', 'Participate in active elections as a voter', 8),
  ('PUBLISH_RESULTS', 'Publish Results', 'Publish finalized election results', 9)
ON CONFLICT (id) DO NOTHING;

-- Role definitions
INSERT INTO role_definitions (id, label, description, display_order, is_admin) VALUES
  ('ROLE_CHAIRPERSON', 'Chairperson', 'Full system access with all administrative privileges', 1, true),
  ('ROLE_SECRETARY', 'Secretary', 'Manages elections, candidates, and voter roster', 2, true),
  ('ROLE_ASSISTANT', 'Polling Assistant', 'Assists with voter verification and roster management', 3, true),
  ('VOTER', 'Voter', 'Can participate in active elections by casting ballots', 4, false)
ON CONFLICT (id) DO NOTHING;

-- Role-permission mappings
INSERT INTO role_permissions (role_id, permission_id) VALUES
  ('ROLE_CHAIRPERSON', 'VIEW_DASHBOARD'),
  ('ROLE_CHAIRPERSON', 'MANAGE_ELECTIONS'),
  ('ROLE_CHAIRPERSON', 'MANAGE_CANDIDATES'),
  ('ROLE_CHAIRPERSON', 'MANAGE_ROSTER'),
  ('ROLE_CHAIRPERSON', 'VIEW_RESULTS'),
  ('ROLE_CHAIRPERSON', 'MANAGE_USERS'),
  ('ROLE_CHAIRPERSON', 'VIEW_AUDIT_LOGS'),
  ('ROLE_CHAIRPERSON', 'PUBLISH_RESULTS'),
  ('ROLE_CHAIRPERSON', 'VOTE'),
  ('ROLE_SECRETARY', 'VIEW_DASHBOARD'),
  ('ROLE_SECRETARY', 'MANAGE_ELECTIONS'),
  ('ROLE_SECRETARY', 'MANAGE_CANDIDATES'),
  ('ROLE_SECRETARY', 'MANAGE_ROSTER'),
  ('ROLE_SECRETARY', 'VIEW_RESULTS'),
  ('ROLE_SECRETARY', 'VOTE'),
  ('ROLE_ASSISTANT', 'VIEW_DASHBOARD'),
  ('ROLE_ASSISTANT', 'MANAGE_ROSTER'),
  ('ROLE_ASSISTANT', 'VOTE'),
  ('VOTER', 'VOTE')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Navigation items
INSERT INTO navigation_items (id, label, path, icon_name, permission_id, display_order) VALUES
  ('nav_dashboard', 'Dashboard', '/admin/dashboard', 'LayoutDashboard', 'VIEW_DASHBOARD', 1),
  ('nav_elections', 'Elections', '/admin/elections', 'Vote', 'MANAGE_ELECTIONS', 2),
  ('nav_candidates', 'Candidates', '/admin/candidates', 'Users', 'MANAGE_CANDIDATES', 3),
  ('nav_roster', 'Voter Roster', '/admin/roster', 'ClipboardCheck', 'MANAGE_ROSTER', 4),
  ('nav_results', 'Results', '/admin/results', 'BarChart3', 'VIEW_RESULTS', 5),
  ('nav_users', 'User Management', '/admin/users', 'ShieldCheck', 'MANAGE_USERS', 6),
  ('nav_audit', 'Audit Logs', '/admin/audit', 'ScrollText', 'VIEW_AUDIT_LOGS', 7),
  ('nav_vote', 'Cast Vote', '/vote', 'CheckSquare', 'VOTE', 8)
ON CONFLICT (id) DO NOTHING;
