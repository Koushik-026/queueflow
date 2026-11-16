# QueueFlow REST API

JSON responses use `message` and `code` for errors. Private routes require
`Authorization: Bearer <JWT>`. Successful mutations return the affected ticket or
queue identifier. Read routes return permitted views, not raw database rows.

| Method | Route                           | Purpose                                                                     |
| ------ | ------------------------------- | --------------------------------------------------------------------------- |
| GET    | `/api/health`                   | Basic server/database readiness                                             |
| GET    | `/api/public`                   | Live campus service summaries without visitor identities                    |
| POST   | `/api/auth/register`            | Student account: name, email, password                                      |
| POST   | `/api/auth/login`               | Sign in a regular student or staff account                                  |
| POST   | `/api/auth/logout`              | Revoke this JWT's stored session                                            |
| POST   | `/api/demo`                     | Create an isolated practice workspace and its scoped student/staff sessions |
| GET    | `/api/workspace`                | Services, signed-in user and own active visit                               |
| POST   | `/api/queues/:id/tickets`       | Join, with optional purpose                                                 |
| POST   | `/api/tickets/:id/cancel`       | Cancel own waiting/called ticket                                            |
| GET    | `/api/history`                  | Own history, or workspace history for staff                                 |
| GET    | `/api/staff/queues/:id`         | Current visitor and FIFO waiting list                                       |
| POST   | `/api/staff/queues/:id/actions` | Call, start, complete or miss                                               |
| POST   | `/api/staff/queues`             | Create a service                                                            |
| PATCH  | `/api/staff/queues/:id`         | Edit a service                                                              |
| PATCH  | `/api/staff/queues/:id/status`  | Open, pause or close joins                                                  |
| DELETE | `/api/staff/queues/:id`         | Archive a closed, empty service                                             |
| GET    | `/api/staff/export`             | Workspace CSV, latest 10,000 visits                                         |
| POST   | `/api/demo/reset`               | Staff-only reset of practice visits                                         |

Join, cancel and staff service mutations require an `Idempotency-Key` header
(16–100 letters, numbers, underscores or hyphens). Retrying the same method, path
and body with that key returns the original result. Reusing it for different
inputs returns a conflict. The client keeps the key for a network-failed request.

Staff updates/actions include the latest numeric `version`. A stale version
returns `409 STALE_QUEUE` and the interface refreshes; it does not force an update.

```json
{ "action": "call", "version": 6 }
```

The action values are `call`, `start`, `complete` and `miss`. Status changes use
`status: "open"`, `"paused"` or `"closed"` with `version`. Service creation/editing
uses `name`, `prefix`, `location`, `description`, newline-separated `requirements`,
integer `averageMinutes` (1–60) and integer `capacity` (1–200).

History accepts `page` (25 records), `queueId`, `status` and literal `search`.
All filters remain constrained to the authenticated user's permitted workspace.

Common errors: `400` invalid input; `401` missing/ended session; `403` insufficient
permission; `404` absent or inaccessible record; `409` queue/version/state conflict;
`410` expired practice workspace; `429` request limit. Production rate limits are
240 API requests/minute/IP and 25 login/register/demo attempts/15 minutes/IP.

Socket.IO connects on the same server. Send the JWT in the socket `auth.token`
field. A `queue:changed` event instructs the client to fetch a fresh workspace or
desk view. The event never contains visitor names or tokens from other workspaces.
