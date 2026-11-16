# Verification record

Verified locally on 16 November 2026 using Windows, Node.js 24.20.0, the built
React application, Express and the file-backed SQLite database. Browser checks
used headless Chrome with Playwright at 1440px and 390px viewport widths.

## Results

| Check                                           | Result                               |
| ----------------------------------------------- | ------------------------------------ |
| Production frontend build                       | Passed                               |
| Queue/database/HTTP tests                       | 32 passed, 0 failed                  |
| Browser workflow checks                         | 33 passed, 0 failed                  |
| Hosted HTTPS browser workflow checks            | 33 passed, 0 failed                  |
| Uncaught browser/asset errors in recorded flows | 0                                    |
| Student and staff phone layouts                 | No horizontal page overflow at 390px |
| Public entry response                           | HTTP 200                             |

## Complete story checked

The student opens a populated practice campus, reads a service's requirements,
joins it and receives the expected AC-048 token at position seven. Refreshing
retains the visit. Opening the staff tab retains the same workspace while giving
that tab its own staff view. Staff complete the current visit; the original
student tab updates to position six through the live connection.

The service dropdown changes the counter and current visitor correctly. Staff
call the next FIFO token. The missed-turn button initially remains disabled;
after the actual arrival countdown it enables. Marking the visitor missed frees
the counter without automatically calling another visitor. Call, start and
complete actions are then exercised through the visible controls.

The recorded browser run also checks:

- Paused-service join prevention and document guidance.
- History status filtering and an actual CSV download.
- Service creation, editing, pause, close and archive.
- Cancellation confirmation, retaining a place and confirmed cancellation.
- Student history containing only the student's visits.
- Counter displays containing tokens rather than visitor names.
- Refreshing the counter display retaining the staff role in that tab.
- Mobile navigation and both student/staff phone layouts.
- Scoped demo reset restoring the sample queue while retaining archived services.

The lower-level suite checks double joins, idempotent retries, conflicting keys,
parallel HTTP requests, stale staff versions, occupied counters, illegal state
transitions, arrival grace, capacity, owner-only cancellation, authentication,
logout revocation, CRUD validation, SQL search wildcards, midnight in India,
overnight service, private history, demo isolation and reopening the SQLite file.

## Scope

The free showcase is live at https://queueflow-campus.onrender.com, running
Node.js 24.20.0 on Linux in Render's Singapore region. Its build ran all 32
queue/API checks before publishing. The same 33-check browser workflow passed on
the public HTTPS URL, including live student/staff updates and phone layouts.
The database readiness endpoint returned HTTP 200 and the public profile reported
showcase mode. Regular login/registration are disabled on that temporary showcase;
its fictional practice accounts retain the authenticated workflows.

These checks cover small single-process demonstrations, not a production college
rollout or load capacity. The optional Dockerfile was not built. Audio,
screen-reader behavior, other browser engines and real service-duration accuracy
were not measured. Free-instance records can reset after inactivity or restarts.

Browser screenshots and machine-readable results are saved locally under
`output/browser/`. The shareable archive excludes databases, signing keys,
environment secrets, installed packages and temporary verification records.
