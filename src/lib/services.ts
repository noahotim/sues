import { supabase, TABLES, ROLE_IDS } from "./supabase";

// ============================================================
// TYPES
// ============================================================

export interface RoleDefinition {
  id: string;
  label: string;
  description: string;
  display_order: number;
  is_admin: boolean;
}

export interface PermissionDefinition {
  id: string;
  label: string;
  description: string;
  display_order: number;
}

export interface NavigationItem {
  id: string;
  label: string;
  path: string;
  icon_name: string;
  permission_id: string | null;
  display_order: number;
  parent_id: string | null;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role_id: string;
  created_at: string;
  updated_at: string;
}

export interface Election {
  id: string;
  title: string;
  description: string;
  status: string;
  start_time: string | null;
  end_time: string | null;
  results_published: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Position {
  id: string;
  election_id: string;
  title: string;
  description: string;
  max_votes: number;
  display_order: number;
  created_at: string;
}

export interface Candidate {
  id: string;
  election_id: string;
  position_id: string;
  name: string;
  bio: string;
  photo_url: string;
  display_order: number;
  created_at: string;
}

export interface VoterRosterEntry {
  id: string;
  election_id: string;
  voter_email: string;
  voter_name: string;
  has_voted: boolean;
  created_at: string;
}

export interface Vote {
  id: string;
  election_id: string;
  position_id: string;
  candidate_id: string;
  voter_id: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  user_email: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown>;
  created_at: string;
}

// ============================================================
// AUTH CONTEXT TYPES
// ============================================================

export interface AuthState {
  user: { id: string; email: string } | null;
  profile: Profile | null;
  role: RoleDefinition | null;
  permissions: string[];
  loading: boolean;
}

// ============================================================
// CONFIG LOADING (roles, permissions, navigation from DB)
// ============================================================

export async function loadRoleDefinitions(): Promise<RoleDefinition[]> {
  const { data, error } = await supabase
    .from(TABLES.ROLE_DEFINITIONS)
    .select("*")
    .order("display_order");
  if (error) throw error;
  return data ?? [];
}

export async function loadPermissionDefinitions(): Promise<PermissionDefinition[]> {
  const { data, error } = await supabase
    .from(TABLES.PERMISSION_DEFINITIONS)
    .select("*")
    .order("display_order");
  if (error) throw error;
  return data ?? [];
}

export async function loadNavigationItems(): Promise<NavigationItem[]> {
  const { data, error } = await supabase
    .from(TABLES.NAVIGATION_ITEMS)
    .select("*")
    .order("display_order");
  if (error) throw error;
  return data ?? [];
}

export async function loadRolePermissions(roleId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from(TABLES.ROLE_PERMISSIONS)
    .select("permission_id")
    .eq("role_id", roleId);
  if (error) throw error;
  return (data ?? []).map((r) => r.permission_id);
}

// ============================================================
// PROFILE LOADING
// ============================================================

export async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from(TABLES.PROFILES)
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ============================================================
// AUTH HELPERS
// ============================================================

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

export async function signUp(email: string, password: string, fullName: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// ============================================================
// ELECTION SERVICES
// ============================================================

export async function loadElections(): Promise<Election[]> {
  const { data, error } = await supabase
    .from(TABLES.ELECTIONS)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function loadElection(id: string): Promise<Election | null> {
  const { data, error } = await supabase
    .from(TABLES.ELECTIONS)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createElection(input: {
  title: string;
  description: string;
  start_time: string | null;
  end_time: string | null;
}): Promise<Election> {
  const { data, error } = await supabase
    .from(TABLES.ELECTIONS)
    .insert({
      title: input.title,
      description: input.description,
      start_time: input.start_time,
      end_time: input.end_time,
      status: "draft",
      created_by: (await supabase.auth.getUser()).data.user?.id,
    })
    .select()
    .single();
  if (error) throw error;

  await supabase.rpc("log_audit", {
    p_action: "CREATE_ELECTION",
    p_entity_type: "election",
    p_entity_id: data.id,
    p_details: { title: input.title } as unknown as never,
  });

  return data;
}

export async function updateElection(
  id: string,
  input: Partial<Pick<Election, "title" | "description" | "status" | "start_time" | "end_time" | "results_published">>
): Promise<void> {
  const { error } = await supabase
    .from(TABLES.ELECTIONS)
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;

  await supabase.rpc("log_audit", {
    p_action: "UPDATE_ELECTION",
    p_entity_type: "election",
    p_entity_id: id,
    p_details: input as unknown as never,
  });
}

export async function deleteElection(id: string): Promise<void> {
  const { error } = await supabase.from(TABLES.ELECTIONS).delete().eq("id", id);
  if (error) throw error;

  await supabase.rpc("log_audit", {
    p_action: "DELETE_ELECTION",
    p_entity_type: "election",
    p_entity_id: id,
    p_details: {} as unknown as never,
  });
}

// ============================================================
// POSITION SERVICES
// ============================================================

export async function loadPositions(electionId: string): Promise<Position[]> {
  const { data, error } = await supabase
    .from(TABLES.POSITIONS)
    .select("*")
    .eq("election_id", electionId)
    .order("display_order");
  if (error) throw error;
  return data ?? [];
}

export async function createPosition(input: {
  election_id: string;
  title: string;
  description: string;
  max_votes: number;
  display_order: number;
}): Promise<Position> {
  const { data, error } = await supabase
    .from(TABLES.POSITIONS)
    .insert(input)
    .select()
    .single();
  if (error) throw error;

  await supabase.rpc("log_audit", {
    p_action: "CREATE_POSITION",
    p_entity_type: "position",
    p_entity_id: data.id,
    p_details: { title: input.title, election_id: input.election_id } as unknown as never,
  });

  return data;
}

export async function updatePosition(
  id: string,
  input: Partial<Pick<Position, "title" | "description" | "max_votes" | "display_order">>
): Promise<void> {
  const { error } = await supabase.from(TABLES.POSITIONS).update(input).eq("id", id);
  if (error) throw error;
}

export async function deletePosition(id: string): Promise<void> {
  const { error } = await supabase.from(TABLES.POSITIONS).delete().eq("id", id);
  if (error) throw error;
}

// ============================================================
// CANDIDATE SERVICES
// ============================================================

export async function loadCandidates(electionId: string): Promise<Candidate[]> {
  const { data, error } = await supabase
    .from(TABLES.CANDIDATES)
    .select("*")
    .eq("election_id", electionId)
    .order("display_order");
  if (error) throw error;
  return data ?? [];
}

export async function loadCandidatesByPosition(positionId: string): Promise<Candidate[]> {
  const { data, error } = await supabase
    .from(TABLES.CANDIDATES)
    .select("*")
    .eq("position_id", positionId)
    .order("display_order");
  if (error) throw error;
  return data ?? [];
}

export async function createCandidate(input: {
  election_id: string;
  position_id: string;
  name: string;
  bio: string;
  photo_url: string;
  display_order: number;
}): Promise<Candidate> {
  const { data, error } = await supabase
    .from(TABLES.CANDIDATES)
    .insert(input)
    .select()
    .single();
  if (error) throw error;

  await supabase.rpc("log_audit", {
    p_action: "CREATE_CANDIDATE",
    p_entity_type: "candidate",
    p_entity_id: data.id,
    p_details: { name: input.name, position_id: input.position_id } as unknown as never,
  });

  return data;
}

export async function updateCandidate(
  id: string,
  input: Partial<Pick<Candidate, "name" | "bio" | "photo_url" | "display_order" | "position_id">>
): Promise<void> {
  const { error } = await supabase.from(TABLES.CANDIDATES).update(input).eq("id", id);
  if (error) throw error;
}

export async function deleteCandidate(id: string): Promise<void> {
  const { error } = await supabase.from(TABLES.CANDIDATES).delete().eq("id", id);
  if (error) throw error;
}

// ============================================================
// VOTER ROSTER SERVICES
// ============================================================

export async function loadVoterRoster(electionId: string): Promise<VoterRosterEntry[]> {
  const { data, error } = await supabase
    .from(TABLES.VOTER_ROSTER)
    .select("*")
    .eq("election_id", electionId)
    .order("voter_name");
  if (error) throw error;
  return data ?? [];
}

export async function addVoterToRoster(input: {
  election_id: string;
  voter_email: string;
  voter_name: string;
}): Promise<void> {
  const { error } = await supabase.from(TABLES.VOTER_ROSTER).insert({
    election_id: input.election_id,
    voter_email: input.voter_email.toLowerCase(),
    voter_name: input.voter_name,
  });
  if (error) throw error;
}

export async function bulkAddVoters(
  electionId: string,
  voters: { voter_email: string; voter_name: string }[]
): Promise<{ inserted: number; errors: string[] }> {
  const errors: string[] = [];
  let inserted = 0;

  for (const voter of voters) {
    const { error } = await supabase.from(TABLES.VOTER_ROSTER).insert({
      election_id: electionId,
      voter_email: voter.voter_email.toLowerCase().trim(),
      voter_name: voter.voter_name.trim(),
    });
    if (error) {
      if (error.code === "23505") {
        errors.push(`Duplicate: ${voter.voter_email}`);
      } else {
        errors.push(`${voter.voter_email}: ${error.message}`);
      }
    } else {
      inserted++;
    }
  }

  await supabase.rpc("log_audit", {
    p_action: "IMPORT_ROSTER",
    p_entity_type: "election",
    p_entity_id: electionId,
    p_details: { inserted, error_count: errors.length } as unknown as never,
  });

  return { inserted, errors };
}

export async function deleteVoterFromRoster(id: string): Promise<void> {
  const { error } = await supabase.from(TABLES.VOTER_ROSTER).delete().eq("id", id);
  if (error) throw error;
}

// ============================================================
// VOTE SERVICES
// ============================================================

export async function submitBallot(
  electionId: string,
  positionId: string,
  candidateId: string
): Promise<void> {
  const { error } = await supabase.rpc("submit_vote", {
    p_election_id: electionId,
    p_position_id: positionId,
    p_candidate_id: candidateId,
  });
  if (error) throw error;
}

export async function loadVoteCounts(electionId: string): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from(TABLES.VOTES)
    .select("candidate_id")
    .eq("election_id", electionId);
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.candidate_id] = (counts[row.candidate_id] ?? 0) + 1;
  }
  return counts;
}

export async function hasUserVotedForPosition(
  electionId: string,
  positionId: string,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from(TABLES.VOTES)
    .select("id")
    .eq("election_id", electionId)
    .eq("position_id", positionId)
    .eq("voter_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

// ============================================================
// AUDIT LOG SERVICES
// ============================================================

export async function loadAuditLogs(limit = 100): Promise<AuditLog[]> {
  const { data, error } = await supabase
    .from(TABLES.AUDIT_LOGS)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

// ============================================================
// USER MANAGEMENT SERVICES
// ============================================================

export async function loadAllProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from(TABLES.PROFILES)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function updateUserRole(userId: string, roleId: string): Promise<void> {
  const { error } = await supabase
    .from(TABLES.PROFILES)
    .update({ role_id: roleId, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) throw error;

  await supabase.rpc("log_audit", {
    p_action: "UPDATE_USER_ROLE",
    p_entity_type: "profile",
    p_entity_id: userId,
    p_details: { new_role: roleId } as unknown as never,
  });
}

// ============================================================
// DASHBOARD METRICS (computed from real data)
// ============================================================

export interface DashboardMetrics {
  totalElections: number;
  activeElections: number;
  totalCandidates: number;
  totalEligibleVoters: number;
  totalVotesCast: number;
  turnoutPercentage: number;
}

export async function loadDashboardMetrics(): Promise<DashboardMetrics> {
  const [elections, candidates, roster, votes] = await Promise.all([
    supabase.from(TABLES.ELECTIONS).select("id, status"),
    supabase.from(TABLES.CANDIDATES).select("id"),
    supabase.from(TABLES.VOTER_ROSTER).select("id, has_voted"),
    supabase.from(TABLES.VOTES).select("id"),
  ]);

  if (elections.error) throw elections.error;
  if (candidates.error) throw candidates.error;
  if (roster.error) throw roster.error;
  if (votes.error) throw votes.error;

  const electionRows = elections.data ?? [];
  const candidateRows = candidates.data ?? [];
  const rosterRows = roster.data ?? [];
  const voteRows = votes.data ?? [];

  const totalEligibleVoters = rosterRows.length;
  const totalVotesCast = voteRows.length;
  const turnoutPercentage =
    totalEligibleVoters > 0
      ? Math.round((totalVotesCast / totalEligibleVoters) * 100)
      : 0;

  return {
    totalElections: electionRows.length,
    activeElections: electionRows.filter((e) => e.status === "active").length,
    totalCandidates: candidateRows.length,
    totalEligibleVoters,
    totalVotesCast,
    turnoutPercentage,
  };
}

// ============================================================
// HELPER: check if current user is admin
// ============================================================

export function isAdminRole(roleId: string | null | undefined): boolean {
  return roleId === ROLE_IDS.CHAIRPERSON || roleId === ROLE_IDS.SECRETARY || roleId === ROLE_IDS.ASSISTANT;
}
