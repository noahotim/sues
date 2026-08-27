# SUES Election Management System

An online voting platform built for the **Soroti University Engineering Society (SUES)**. It lets an election committee set up elections, manage candidates and eligible voters, lets members cast secure and anonymous ballots, and provides real-time results with full audit logging and official declaration forms.

## Features

### Voting & Ballots
- **Atomic one-ballot-per-position voting** — a deterministic receipt document (`vote_receipts/{email}__{election}__{position}`) is created first; a second attempt for the same position collides atomically and is rejected. No Cloud Functions needed.
- **Anonymous ballots** — votes are stored in `votes/{nonce}` where the nonce is a cryptographically random string. No voter identity is ever written to the ballot record.
- **Multi-election ballot page** — all active elections appear on a single voting page. The voter completes every available ballot in one pass.
- **Poll-window enforcement** — the system checks election start/end times (stored as Firestore Timestamps) and shows "Polls have not opened yet" or "Polls have closed" states per election. Ballots are disabled outside the voting window.
- **Unopposed candidate affirmation** — a lone candidate must receive at least 51% of votes cast to be affirmed; otherwise the nomination is not confirmed.
- **Real-time results** — tallies update live via Firestore subscriptions as votes are cast.
- **PDF export** — download a formatted results report (bar charts, turnout summary) via jspdf (lazy-loaded, never slows the initial page).
- **EC-style Declaration of Results** — a formal SUES-branded PDF with the university logo, navy header, position-by-position result tables with winner declarations, turnout summary, certification statement, and four signature lines (Returning Officer, Candidate/Representative, two Observers). Automatically available when polls close.
- **Voter sign-out bar** — the voting booth shows the signed-in voter's name and a one-click sign-out button.
- **Technical support contacts** — displayed on the login page and vote booth footer (Arikod Charles, Chairperson EC; Abel Ea, Outgoing President).

### Voter Registration
- **System-wide register** — CSV upload populates both a per-election roster AND the `eligible_emails` collection. Register members are eligible in every active election automatically.
- **Register-member auto-provision** — when a register member visits any active election for the first time, a per-election roster row is created automatically for turnout tracking.
- **CSV local-file import** — voters are read from a local `.csv` file (never leaves the browser). Supports `email,name` rows, header rows, quotes, and CRLF/BOM.
- **Deduplication** — duplicate emails within the same file are skipped; existing roster rows are preserved (voting state never reset on re-import).

### Admin Dashboard
- **Election-scoped** — select any election from a dropdown to see its specific metrics.
- **Real-time** — candidate counts, eligible voters, and turnout update live via Firestore subscriptions.
- **Results with winner highlights** — progress bars, vote counts, percentages, unopposed badges, and affirmation status.

### Audit Logging
- **Real-time** — audit entries appear the instant an operation happens (no page refresh needed).
- **Comprehensive** — every mutation is logged: election create/update/delete, position create/update/delete, candidate create/update/delete, roster import/add/remove, vote cast (anonymous), role updates.
- **Ballot secrecy preserved** — `CAST_VOTE` audit entries carry no voter identity; all other entries record the acting user's email.

### Authentication & Access Control
- **Google sign-in** with popup-first (redirect fallback for popup blockers).
- **Account chooser** — `prompt: "select_account"` forces the Google account picker so users can switch between accounts.
- **Multi-layer persistence** — `indexedDBLocalPersistence` + `browserLocalPersistence` + `browserSessionPersistence` to survive browser storage partitioning.
- **Redirect state guard** — a sessionStorage flag prevents stale redirect results from causing dead-ends.
- **Eligibility gate** — staff (register entry with a non-VOTER role) OR voters present on an actual roster may sign in. Plain VOTER register entries alone are not sufficient for login.
- **Role from Firestore profile** — no Cloud Functions needed; roles are read from `users/{uid}.role` with an `exists()` guard for first-time profile creation.

### UI & Design
- **SUES branding** — logo on every page (login, sidebar, mobile header, admin headers, vote booth, results, PDF exports), favicon, and the browser tab.
- **Code-split pages** — React.lazy per page + jspdf dynamic import. 18 chunks; heavy libs load on demand.
- **Responsive layout** — admin sidebar with mobile hamburger menu, voter-facing pages adapt to all screen sizes.
- **Permission-guarded navigation** — the sidebar shows only items the current role can access. Non-admin users are redirected to `/vote` (not into an infinite loop on `/admin/dashboard`).

## Tech Stack

| Layer     | Technology                                                   |
| --------- | ------------------------------------------------------------ |
| Frontend  | React 18, TypeScript, Vite, Tailwind CSS, React Router      |
| Backend   | Firebase (Firestore, Auth) — **Spark plan** (no Cloud Functions, no Storage) |
| PDF       | jspdf (lazy-loaded)                                          |
| Icons     | lucide-react                                                 |

## Deployment

| Platform          | URL                                                |
| ----------------- | -------------------------------------------------- |
| Firebase Hosting  | https://sues-vote-live.web.app (primary)           |
| Vercel            | https://sues-tau.vercel.app (parity)               |
| Firebase project  | `sues-vote-live` (user-owned, `otim.no25@gmail.com`) |

### Deploy commands

```bash
# Hide .env (contains emulator/dev config) before production builds
Move-Item .env .env.dev-backup

# Clear Vite cache and build
Remove-Item -Recurse -Force node_modules/.vite
npm run build

# Deploy Firestore rules + hosting
$env:FIREBASE_SKIP_FRAMEWORK_SETUP="1"
npx firebase deploy --only firestore:rules,hosting --project sues-vote-live

# Deploy to Vercel
npx vercel --prod --yes

# Restore .env
Move-Item .env.dev-backup .env
```

> **Important:** The `.env` file contains emulator configuration and the old `sues-d7a7f` project keys. The production build falls back to hardcoded `sues-vote-live` defaults when env vars are absent. Always hide `.env` and clear the Vite cache before building for production.

## Getting Started

### Prerequisites

- Node.js 24+ and npm
- A Firebase project (or access to the existing `sues-vote-live` project)

### Running locally

```bash
npm install
cp .env.example .env   # or copy .env.example to .env on Windows
npm run dev
```

Open http://localhost:5173. The app connects to the Firebase emulators automatically when `VITE_USE_EMULATORS=true` is set in `.env`.

> **Note:** The `.env` file is gitignored. The Firebase keys are web-safe public API keys, but keeping them out of the repository is good practice.

### Local demo with the Emulator Suite

To bring up the **whole demo with one command** — start the Auth/Firestore/Storage emulators, seed the election/candidates/roster, and start the Vite dev server — run:

```powershell
powershell -ExecutionPolicy Bypass -File start-demo.ps1
```

Then open http://localhost:5173 and sign in with a demo account:

- **Chairperson** — `chair.sues@sun.ac.ug` (password: any / `sues2026` in emulator)
- **Secretary** — `secretary.sues@sun.ac.ug`
- **Voter** — `apio.samson@sun.ac.ug` (any of the 5 CSV voters)

> The emulator database is in-memory, so it starts empty every time. `start-demo.ps1` re-seeds it automatically. The seed scripts live in `functions/` (`setup-vote-demo.mjs`, `verify-demo.mjs`, `demo-full-process.mjs`).

## Project Structure

```
src/
  components/       Shared UI components (Card, Button, Badge, etc.) and AdminLayout
  lib/              Auth context, constants (roles/permissions), Firebase init
  pages/            One file per route (login, vote, results, admin/*)
  services/         Data access layer for Firestore (election, candidate, roster,
                    vote, audit, auth services)
functions/
  src/index.ts      Legacy Cloud Functions (no longer used for voting)
  setup-vote-demo.mjs   Seeds demo data for the emulator
  verify-demo.mjs       Verifies the full demo lifecycle
  test-string-times.mjs Regression test for Timestamp-based voting
scripts/
  fb-backfill-times.cjs Production backfill: converts ISO strings to Timestamps
firestore.rules     Comprehensive security rules for all collections
```

## Security Rules

The Firestore security rules enforce all invariants server-side:

| Collection        | Read                    | Write                                  |
| ----------------- | ----------------------- | -------------------------------------- |
| `elections`       | Any signed-in user      | Election managers (Chair/Secretary)    |
| `positions`       | Admins + active elections| Election managers                      |
| `candidates`      | Admins + active elections| Election managers                      |
| `voter_roster`    | Admins + own row        | Managers (full) / voters (own turnout flags only) |
| `vote_receipts`   | Own receipts            | Create-once (atomic duplicate lock)    |
| `votes`           | Admins only             | Create-once (nonce-keyed, anonymous)   |
| `eligible_emails` | Admins + own entry      | Election managers                      |
| `audit_logs`      | Chairperson only        | Create with action validation          |
| `users`           | Own profile + admins    | Self (name) / Chair (roles)            |

Key rules:
- `isOnRosterNow()` checks both the per-election roster AND the system-wide register (`eligible_emails`).
- `electionOpen()` compares `request.time` against Firestore Timestamps (not ISO strings).
- `CAST_VOTE` audit entries are anonymous (no `actorEmail`); all other audit actions require the actor's email to match the authenticated user.
- `vote_receipts` use a deterministic document ID (`email__electionId__positionId`) so a second attempt collides atomically.

## Roles & Permissions

| Role              | Permissions                                                          |
| ----------------- | -------------------------------------------------------------------- |
| Chairperson       | Dashboard, Elections, Candidates, Roster, Results, Users, Audit, Publish, Vote |
| Secretary         | Dashboard, Elections, Candidates, Roster, Results, Vote              |
| Polling Assistant | Dashboard, Roster, Vote                                              |
| Voter             | Vote, View Results                                                   |

Roles are enforced in the UI (permission guard) and server-side via Firestore security rules. Roles are read from the Firestore profile document (`users/{uid}.role`), not from Cloud Function custom claims.

## Scripts

| Command                          | Description                                  |
| -------------------------------- | -------------------------------------------- |
| `npm run dev`                    | Start the Vite dev server                    |
| `npm run build`                  | Type-check and build the frontend            |
| `npm run preview`                | Preview the production build                 |
| `npm run typecheck`              | Run the TypeScript type checker              |
| `cd functions && npm run build`  | Compile the Cloud Functions (legacy)         |
| `cd functions && npm run deploy` | Deploy the Cloud Functions (legacy)          |

### Test scripts

| Command                                          | Description                                      |
| ------------------------------------------------ | ------------------------------------------------ |
| `node functions/test-string-times.mjs`           | Regression test for Timestamp-based voting       |
| `node functions/verify-demo.mjs`                 | Verifies the full demo lifecycle (9 checks)      |
| `node functions/demo-full-process.mjs`           | End-to-end demo: seed → vote → verify → results  |
| `node scripts/fb-backfill-times.cjs`             | Backfill production elections: ISO → Timestamp   |

## Signing in

Every account uses **Google sign-in**. After authenticating, the system checks whether the email is on the election **register** (`eligible_emails`) or on a **voter roster** — if not, the user is signed back out automatically. Only registered people can enter.

| Person                        | How they sign in                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Chairperson**               | Google sign-in with their registered email. Full admin access.                                                     |
| **Secretary**                 | Google sign-in with their registered email. Election-manager admin.                                                |
| **Polling Assistant**         | Google sign-in with their registered email. Can manage the roster and vote.                                        |
| **Voter (student)**           | Google sign-in with the exact email imported onto a roster via CSV. Voting + results access.                        |

### Importing voters from a local CSV file

1. Sign in as an admin (Chairperson/Secretary/Assistant) and open **Voter Roster**.
2. Select the election, then click **Import CSV**.
3. Click **Choose a CSV file from your computer** and pick a `.csv` file. The file is parsed locally (supports `email,name` rows, a header row, quotes, and CRLF/BOM).
4. Review the loaded rows in the text area, then click **Import Voters** to add them to the roster AND the system-wide register.

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
- Double voting is prevented by deterministic receipt document IDs — a second attempt collides atomically and is rejected by Firestore.
- Audit logs are read-only for non-Chairpersons and only visible to the Chairperson.
- All voting goes through client-side receipt + ballot writes enforced by Firestore security rules (no Cloud Functions required on the Spark plan).
- Election times are stored as Firestore Timestamps and enforced server-side by security rules.
- The system-wide register (`eligible_emails`) grants eligibility across all active elections, but login is restricted to staff (non-VOTER register entries) or voters with at least one roster row.
- When testing, prefer the Firebase Emulator Suite over the live database.
