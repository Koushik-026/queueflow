# Node.js lab coverage

QueueFlow is prepared around the Node.js portion of R25CSE2124. It demonstrates
these topics through one working application; it does not claim to implement
every separate Java/XML/weather exercise in the syllabus.

| Lab concept             | Project evidence                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------- |
| Native HTTP server      | `createServer` in `server/index.js` hosts Express and Socket.IO                     |
| Native Node modules     | `http`, `path`, `url`, `os`, `fs`, `crypto`, `util`, `events` and `sqlite`          |
| Asynchronous JavaScript | Password derivation, REST requests, socket refreshes and async tests                |
| Express routing         | Public, authenticated student and staff routes in `server/app.js`                   |
| Middleware              | JSON parsing, authorization, rate limiting, security headers and error handling     |
| REST CRUD               | Service creation/read/update/archiving; student visit creation and status updates   |
| Database integration    | SQLite records, prepared statements, indexes, foreign keys and transactions         |
| JWT authorization       | Signed JWTs, stored sessions, role checks and logout revocation                     |
| React                   | Reusable forms/cards, state, effects, validation and navigation                     |
| Responsive interface    | Desktop, tablet and phone layouts; native dropdowns and keyboard-accessible dialogs |
| Event-driven updates    | A Node EventEmitter broadcasts workspace changes through Socket.IO                  |
| Testing                 | Queue rules, HTTP authorization/concurrency, persistence and browser workflows      |

For the viva, explain one complete request: **Get my token** → POST route → JWT
check → SQLite transaction → new ticket → change event → updated student and
staff screens. Then explain why a double-click cannot create two active visits.
