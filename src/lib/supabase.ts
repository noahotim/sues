import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

// Database table names as constants (technical identifiers, not business data)
export const TABLES = {
  ROLE_DEFINITIONS: "role_definitions",
  PERMISSION_DEFINITIONS: "permission_definitions",
  ROLE_PERMISSIONS: "role_permissions",
  NAVIGATION_ITEMS: "navigation_items",
  PROFILES: "profiles",
  ELECTIONS: "elections",
  POSITIONS: "positions",
  CANDIDATES: "candidates",
  VOTER_ROSTER: "voter_roster",
  VOTES: "votes",
  AUDIT_LOGS: "audit_logs",
} as const;

// Technical role identifiers (security contract constants)
export const ROLE_IDS = {
  CHAIRPERSON: "ROLE_CHAIRPERSON",
  SECRETARY: "ROLE_SECRETARY",
  ASSISTANT: "ROLE_ASSISTANT",
  VOTER: "VOTER",
} as const;

// Election status values used as technical identifiers
export const ELECTION_STATUS = {
  DRAFT: "draft",
  ACTIVE: "active",
  CLOSED: "closed",
  PUBLISHED: "published",
} as const;
