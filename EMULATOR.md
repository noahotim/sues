# Local development with the Firebase Emulator Suite

The app can run entirely against the **local Firebase Emulator Suite**, so you can
test voting, elections, admin flows and Cloud Functions without touching the
production project or any real user data.

## What the emulator provides

| Emulator   | Port  | Used for                                   |
| ---------- | ----- | ------------------------------------------ |
| Auth       | 9099  | Sign-up / sign-in, custom claims          |
| Firestore  | 8080  | Elections, candidates, votes, roster       |
| Functions  | 5001  | `castVote`, user creation, `setUserRole`   |
| Storage    | 9199  | Candidate photos                           |
| Emulator UI| 4000  | Browse/edit data, set custom claims        |

All data lives only in the emulator and is wiped when you stop it.

## Setup

The Firebase CLI is a dev dependency, so a normal install already provides it:

```bash
npm install
```

(If you prefer a global install instead: `npm install -g firebase-tools`.)

**Java:** the Firestore, Auth and Storage emulators require a **Java 21+** JVM
on your PATH. Check with `java -version`. On Windows, install the Temurin 21
JRE: `winget install --id EclipseAdoptium.Temurin.21.JRE -e`.

## Running locally

You need two terminals.

**1. Start the emulators** (this also builds and serves the Cloud Functions):

```bash
# first time, and again whenever you change functions/src/index.ts
cd functions && npm run build && cd ..

npm run emulators
```

The Emulator UI is available at http://localhost:4000.

**2. Point the frontend at the emulators.** In your `.env`, set:

```bash
VITE_USE_EMULATORS=true
```

Then start the dev server as usual:

```bash
npm run dev
```

When `VITE_USE_EMULATORS=true`, `src/lib/firebase.ts` connects to
`127.0.0.1` on the ports above and uses the throwaway project id `demo-sues`,
so no production credentials are required.

## Testing the flows

1. Open http://localhost:5173 and **register a new account**. The
   `onCreate` Cloud Function (running in the Functions emulator) automatically
   creates the user document, adds them to the voter roster and assigns the
   `VOTER` role. You can immediately vote in an active election.
2. To test **admin** flows (create elections, manage roster, tallies), open the
   Emulator UI → **Auth** → select the user → **Edit**, set the custom claims
   field to `{"role":"ROLE_CHAIRPERSON"}` and apply. Refresh the app to pick up
   the new role.
3. Use the Emulator UI (**Firestore**) to seed elections, positions and
   candidates, or to inspect votes and audit logs as you exercise the UI.

## Automated end-to-end check

With the emulators running, you can verify the whole voting flow
(sign-up trigger, admin setup, `castVote`, receipts, double-vote prevention)
with one command:

```bash
npm run test:e2e
```

It creates a throwaway voter in the emulators and prints `ALL CHECKS PASSED`
on success.

- The Firestore and Storage security rules are enforced by the emulators, so
  behaviour matches production.
- Stopping the emulators discards all local data. Restarting starts fresh.
- For production builds leave `VITE_USE_EMULATORS` unset or `false`.

## Notes
