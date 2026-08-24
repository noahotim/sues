# SUES Election Management System

An online voting platform built for the **Soroti University Engineering Society (SUES)**. It lets an election committee set up elections, manage candidates and eligible voters, lets members cast secure and anonymous ballots, and provides real-time results with full audit logging.

## Features

- **Role-based access** — Chairperson, Secretary, Polling Assistant, and Voter, with a permission system that controls what each role sees and does.
- **Election management** — Create elections, configure positions, and manage lifecycle status (draft → active → closed → published).
- **Candidate management** — Add candidates per position with bio and photo.
- **Voter roster** — Add eligible voters individually or bulk-import from CSV.
- **Secure voting** — Votes are recorded without any voter identifier to preserve anonymity. Duplicate votes are blocked via per-user receipts, and all voting goes through a server-side Cloud Function.
- **Results** — Live tallies per position with turnout metrics.
- **Audit trail** — Every privileged action (casting a vote, changing roles) is logged.

## Tech Stack

| Layer     | Technology                                            |
| --------- | ----------------------------------------------------- |
| Frontend  | React 18, TypeScript, Vite, Tailwind CSS, React Router |
| Backend   | Firebase (Firestore, Auth, Storage, Cloud Functions)  |
| Icons     | lucide-react                                          |

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- A Firebase project (or access to the existing `sues-d7a7f` project)

### Running locally

```bash
npm install
npm run dev
```

Open http://localhost:5173. The Firebase configuration is read from `src/lib/firebase.ts`. If you are contributing against the live project, the app connects to the shared backend automatically — be careful not to create real test data in production.

> **Note:** The Firebase API keys are currently checked into the repository. They are web-safe public keys, but moving them to a `.env` file (see `.env.example`) is planned.

## Project Structure

```
src/
  components/   # Shared UI components and admin layout
  lib/          # Auth context, constants (roles/permissions), Firebase init
  pages/        # One file per route (login, vote, admin/*)
  services/     # Data access layer for Firestore + Cloud Functions
functions/
  src/index.ts  # Cloud Functions (castVote, setUserRole, onUserCreated)
```

## Roles & Permissions

| Role              | Can do                                                                 |
| ----------------- | ---------------------------------------------------------------------- |
| Chairperson       | Full access — elections, candidates, roster, users, results, audit logs, publish results |
| Secretary         | Elections, candidates, roster, results, voting                         |
| Polling Assistant | Roster management (verification) and voting                            |
| Voter             | Voting only                                                             |

Roles are enforced both in the UI (permission guard) and server-side via Firestore security rules and custom claims set by Cloud Functions. The first user to sign up is automatically assigned the Chairperson role.

## Cloud Functions

- `onUserCreated` — creates the user profile document and assigns a default role on sign-up.
- `castVote` — validates the election is active, the position/candidate belong to it, the voter is on the roster, and the voter has not already voted for that position. Writes the anonymous vote, a per-user receipt, updates the roster, and appends an audit log in a single transaction.
- `setUserRole` — lets the Chairperson assign roles (via custom claims).

The Firestore security rules forbid direct client writes to `votes` and `audit_logs`; all sensitive writes go through the Cloud Functions.

## Scripts

| Command                          | Description                        |
| -------------------------------- | ---------------------------------- |
| `npm run dev`                    | Start the Vite dev server          |
| `npm run build`                  | Type-check and build the frontend  |
| `npm run preview`                | Preview the production build       |
| `npm run typecheck`              | Run the TypeScript type checker    |
| `cd functions && npm run build`  | Compile the Cloud Functions        |
| `cd functions && npm run deploy` | Deploy the Cloud Functions         |

## Contributing

Contributions are welcome. Please follow the standard fork-and-pull-request workflow:

1. **Fork** the repository on GitHub.
2. **Clone** your fork and add the upstream as a remote:

   ```bash
   git clone https://github.com/YOUR-USERNAME/sues.git
   git remote add upstream https://github.com/AbelEaX/sues.git
   ```

3. Create a **feature branch** for your change (never commit directly to `main`):

   ```bash
   git checkout -b fix/my-change
   ```

4. Make your change, run `npm run typecheck` and `npm run build`, and commit:

   ```bash
   git add <files>
   git commit -m "fix: describe the change"
   git push origin fix/my-change
   ```

5. Open a **Pull Request** against `AbelEaX/sues` with a clear description of what and why.

### Conventions

- Field names in Firestore are **camelCase** (matching the Cloud Functions and security rules).
- Keep each PR focused on a single change so it is easy to review.
- Verify your change compiles before opening a PR.

## Security Notes

- Votes are stored **anonymously** — no voter ID is attached to a vote document.
- Double voting is prevented by receipts and roster flags, enforced inside a transaction.
- Audit logs are read-only via the rules and only visible to the Chairperson.
- When testing, prefer a dedicated Firebase test project or the Emulator Suite over the live database.
