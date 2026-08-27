export const PERMISSIONS = {
  VIEW_DASHBOARD: 'VIEW_DASHBOARD',
  MANAGE_ELECTIONS: 'MANAGE_ELECTIONS',
  MANAGE_CANDIDATES: 'MANAGE_CANDIDATES',
  MANAGE_ROSTER: 'MANAGE_ROSTER',
  VIEW_RESULTS: 'VIEW_RESULTS',
  MANAGE_USERS: 'MANAGE_USERS',
  VIEW_AUDIT_LOGS: 'VIEW_AUDIT_LOGS',
  VOTE: 'VOTE',
  PUBLISH_RESULTS: 'PUBLISH_RESULTS'
};

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  'ROLE_CHAIRPERSON': [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.MANAGE_ELECTIONS,
    PERMISSIONS.MANAGE_CANDIDATES,
    PERMISSIONS.MANAGE_ROSTER,
    PERMISSIONS.VIEW_RESULTS,
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.VIEW_AUDIT_LOGS,
    PERMISSIONS.PUBLISH_RESULTS,
    PERMISSIONS.VOTE
  ],
  'ROLE_SECRETARY': [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.MANAGE_ELECTIONS,
    PERMISSIONS.MANAGE_CANDIDATES,
    PERMISSIONS.MANAGE_ROSTER,
    PERMISSIONS.VIEW_RESULTS,
    PERMISSIONS.VOTE
  ],
  'ROLE_ASSISTANT': [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.MANAGE_ROSTER,
    PERMISSIONS.VOTE
  ],
  'VOTER': [
    PERMISSIONS.VOTE,
    PERMISSIONS.VIEW_RESULTS
  ]
};

export const ROLES = [
  { id: 'ROLE_CHAIRPERSON', label: 'Chairperson', description: 'Full system access', is_admin: true },
  { id: 'ROLE_SECRETARY', label: 'Secretary', description: 'Manages elections, candidates, and roster', is_admin: true },
  { id: 'ROLE_ASSISTANT', label: 'Polling Assistant', description: 'Assists with voter verification', is_admin: true },
  { id: 'VOTER', label: 'Voter', description: 'Can participate in active elections', is_admin: false }
];

export const NAVIGATION_ITEMS = [
  { id: 'nav_dashboard', label: 'Dashboard', path: '/admin/dashboard', icon_name: 'LayoutDashboard', permission_id: 'VIEW_DASHBOARD' },
  { id: 'nav_elections', label: 'Elections', path: '/admin/elections', icon_name: 'Vote', permission_id: 'MANAGE_ELECTIONS' },
  { id: 'nav_candidates', label: 'Candidates', path: '/admin/candidates', icon_name: 'Users', permission_id: 'MANAGE_CANDIDATES' },
  { id: 'nav_roster', label: 'Voter Roster', path: '/admin/roster', icon_name: 'ClipboardCheck', permission_id: 'MANAGE_ROSTER' },
  { id: 'nav_results', label: 'Results', path: '/admin/results', icon_name: 'BarChart3', permission_id: 'VIEW_RESULTS' },
  { id: 'nav_users', label: 'User Management', path: '/admin/users', icon_name: 'ShieldCheck', permission_id: 'MANAGE_USERS' },
  { id: 'nav_audit', label: 'Audit Logs', path: '/admin/audit', icon_name: 'ScrollText', permission_id: 'VIEW_AUDIT_LOGS' },
  { id: 'nav_vote', label: 'Cast Vote', path: '/vote', icon_name: 'CheckSquare', permission_id: 'VOTE' }
];
