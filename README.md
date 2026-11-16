# QueueFlow

A virtual queue for campus service counters. Students get a token and follow their
turn; staff call visitors, start visits and mark them complete. The public counter
display shows token numbers without exposing visitor names.

Built for the Node.js skill development lab with **Node.js, Express, React,
Socket.IO and SQLite**. There are no paid APIs or external database accounts to set up.

The free hosted showcase uses fictional practice accounts. Its sample records can
reset after inactivity or restarts, so regular registration/sign-in is disabled
there. The local installation keeps the complete student/staff account workflow.

## Run it

Install Node.js 24 or later, then open a terminal in this folder:

```sh
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:3100**. On Windows, you can also double-click
**Start QueueFlow.cmd**. For development with automatic frontend updates:

```sh
npm run dev
```

## Try the demonstration

Click **Try the live demo** on the home page. This creates a separate practice
campus containing fictional visitors. No account is required for practice.

1. Choose Academic office and get a token.
2. Open **My visit** to see your position and estimated wait.
3. Click **Second tab** to open the same workspace as staff.
4. Complete the existing visit, then call and start the next visitor.
5. Watch the student's position update in the original tab.

Practice sessions expire after 24 hours. **Reset practice visits**, inside the
account menu, clears only this workspace's visit data and loads sample visitors
into its available services. Service edits and archived services are retained.
The demo uses a 15-second arrival window; regular services use two minutes.

See [the walkthrough](DEMO_GUIDE.md) for the complete presentation sequence.

## What works

- Student registration, sign-in, saved visits, cancellation and private history.
- One active visit per student across the workspace.
- FIFO service queues with explicit call, start, complete and missed-turn actions.
- Separate queues, each with one counter; staff can select the service they operate.
- Service creation, editing, pausing, closing to joins and archiving.
- Live updates across authenticated tabs, with a 15-second refresh fallback.
- History filters, pagination and a staff CSV export of up to 10,000 visits.
- A public display containing token numbers, service status and locations.
- An isolated practice mode, guided steps and responsive student/staff screens.

## Queue rules

```text
waiting → called → serving → completed
    ↓        ↓
cancelled  cancelled / missed
```

Staff must confirm arrival with **Start visit** before completing a visit. A token
can be marked missed only after its arrival window. Returning visitors join again
at the end with a new token. The next visitor is never called automatically.

**Pause** stops joins and new calls but preserves places. **Close joins** blocks
new visitors while staff finish the existing queue. An empty, closed service can
be archived; its history remains available.

Tokens are numbered per service per day in **Asia/Kolkata**. At the next request
after midnight, older waiting/called tokens expire. An overnight visit already in
service may finish. Sequence numbers restart for the new date, and history retains
each token's date.

Wait ranges are estimates, not appointments. They include visitors ahead and an
occupied counter. The configured average is used until at least three suitable
completed durations are available. No SMS or push notifications are sent. Optional
sound and updates work while the page remains open.

## Regular student and staff accounts

Students can register from the sign-in dialog. Practice accounts are separate and
cannot access regular records. There is no default staff password.

To create a regular staff account, set `QUEUEFLOW_STAFF_PASSWORD` in your terminal
to a private password of 10–128 characters, then run:

```sh
npm run staff:add -- staff@college.edu "Staff name"
```

Remove that variable afterwards. Sign in through the app with the new account.
Use **Manage services** to replace the initial example locations and requirements
before using the system for an actual campus.

Passwords are stored as salted scrypt hashes. JWTs last 12 hours and are checked
against server-side sessions so signing out revokes the token. The browser keeps
its token in session storage. Staff permissions are checked by the server, not
just by hiding interface controls.

## Data and deployment

Local data is saved in `data/queueflow.sqlite`. The local signing key is stored in
the same ignored data directory. Copy `.env.example` to `.env` to change the port,
database location or practice-mode availability.

The Node runtime is pinned in `.node-version`. Hosted builds run `npm ci`, the
automated tests and the production frontend build, then start the same Express
server. `TRUST_PROXY=1` is used only behind the configured hosting proxy, and the
health endpoint queries the database rather than returning an unconditional OK.

The Dockerfile is an alternative way to run the application. For durable hosted use, mount
persistent storage at `/app/data` and provide a private `JWT_SECRET` of at least 32
characters. An ephemeral hosting filesystem will lose records when replaced; the
app does not provision a database or paid disk automatically. For multiple server
instances, a shared database and Socket.IO adapter would be needed. This version
is intended for a classroom demonstration or one small service installation.

## Check the project

```sh
npm test
npm run build
```

The automated suite covers queue transitions, retries, simultaneous requests,
authorization, isolated demos, daily rollover, service management and persistence.
Browser checks are in `scripts/browser-check.mjs`; they need Playwright and Chrome
or Edge, and an already running app. Set `PLAYWRIGHT_MODULE_PATH` to the package
file from which Playwright can be resolved when using your own installation.

See [architecture and rules](docs/ARCHITECTURE.md), [API routes](docs/API.md),
[lab coverage](docs/LAB_MAP.md) and [verification results](docs/VERIFICATION.md).

## Source references

- [Express routing](https://expressjs.com/en/guide/routing/)
- [Node.js SQLite](https://nodejs.org/docs/latest-v24.x/api/sqlite.html)
- [React documentation](https://react.dev/learn)
- [Socket.IO documentation](https://socket.io/docs/v4/)

The implementation and demo are complete; formal college submission pages should
use the presenting student's confirmed name, roll number and guide details.
