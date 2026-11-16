# Hosted showcase

Live URL: **https://queueflow-campus.onrender.com**

The app runs as one free Render Node web service in Singapore. It serves React,
Express routes and Socket.IO from the same origin. The source branch is `main`
at https://github.com/Koushik-026/queueflow.

Build: `npm ci && npm test && npm run build`

Start: `node server/index.js`

The Node version is pinned to 24.20.0. Host binding is `0.0.0.0`; the app uses
Render's `PORT`. `TRUST_PROXY=1` enables the configured proxy hop. The health route
checks SQLite readiness and returns 503 if the database is unavailable.

`SHOWCASE_ONLY=true` and `ALLOW_DEMO=true` provide isolated fictional practice
accounts. The public showcase does not accept regular account registration or
sign-in. The local installation retains those features. No passwords or signing
keys are committed to Git; the service generates its own private signing key.

The free filesystem is temporary, so sample records can reset after inactivity,
restarts or redeploys. A fresh visit can begin another private practice campus.
Durable hosted records would need persistent storage and a separately selected
hosting configuration. No paid database or disk was provisioned.

The hosted workflow passed 33 browser checks after the first deploy became live.
Repository pushes automatically trigger a new build; changes should be tested
before pushing. The optional Dockerfile is provided for other hosting paths but
was not used for this native Node deployment.
