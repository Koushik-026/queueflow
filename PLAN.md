# QueueFlow

QueueFlow helps students wait away from a campus service counter while staff handle
visits in order. This is a focused Node.js lab project with a React interface,
Express REST API, JWT authentication, SQLite transactions and live Socket.IO updates.

## People and procedure

Students choose a service, read its location and requirements, join once and track
their token. One student may hold one active visit across the workspace. They can
cancel before service starts. Called visitors go to the counter; staff confirm their
arrival before starting service. Staff complete the visit before calling the next
waiting token. A missed visitor rejoins at the end with a new token.

There is one counter per service in this version. Services have independent queues.
FIFO order, student privacy and explicit transitions take priority over decorative
features. Public boards contain token numbers, never visitor names or emails.

## Rules

* States: waiting → called → serving → completed. Waiting/called may be cancelled;
  called may become missed only after the grace period. Completed, missed,
  cancelled and expired are terminal. No silent automatic advancement.
* Open accepts joins; paused stops joins and new calls but permits completion of
  an existing visit; closed stops joins while staff finish the existing queue.
* Daily sequence numbers use Asia/Kolkata. Older waiting/called visits expire on
  rollover. An overnight serving visit may finish before another is called.
* Joining uses an idempotency key and an active-visit database constraint. Staff
  mutations use queue versions, idempotency and atomic transactions to prevent
  duplicate calls or overwriting another operator's action.
* Waiting estimates include people ahead and the occupied counter. They use a
  configured service average until enough recent completed durations exist. They
  are approximate ranges, not appointment promises.
* Practice workspaces contain fictional data, are isolated from live records and
  from other practice workspaces, and permit student/staff role switching. Reset
  affects only the current practice workspace.

## Delivery and validation

Build a responsive application with clear steps, inline explanations, meaningful
empty/error/loading states, keyboard-accessible forms and confirmations. Include
working service management, visit history, CSV export, a public display and a guided
demo. Verify transitions, retries, concurrency, authorization, isolation, rollover,
data persistence and actual student/staff UI flows. Keep source, setup instructions,
API notes and a short demonstration guide together. Formal college reports can use
the friend's confirmed metadata later; no names are invented.

Develop locally first. The required Express/Node runtime is not replaced by a
Cloudflare Worker to fit Sites hosting. Prepare a Node-compatible deployment
configuration without creating chargeable hosting resources or reusing Seyra's
repository or service.
