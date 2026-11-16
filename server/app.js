import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { AppError, insist } from "./store.js";
import { authentication, hashPassword, verifyPassword } from "./auth.js";

function string(value, name, min, max) {
  insist(
    typeof value === "string" &&
      value.trim().length >= min &&
      value.trim().length <= max &&
      !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
    400,
    `${name} must contain ${min}–${max} characters.`,
  );
  return value.trim();
}
function credentials(body, registering = false) {
  const email = string(body.email, "Email", 3, 160).toLowerCase();
  insist(
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
    400,
    "Enter a valid email address.",
  );
  insist(
    typeof body.password === "string" &&
      body.password.length >= 10 &&
      body.password.length <= 128,
    400,
    "Use a password with 10–128 characters.",
  );
  return {
    email,
    password: body.password,
    ...(registering ? { name: string(body.name, "Name", 2, 60) } : {}),
  };
}
function queueInput(b) {
  const prefix = string(b.prefix, "Token prefix", 1, 4).toUpperCase();
  insist(
    /^[A-Z]{1,4}$/.test(prefix),
    400,
    "Use 1–4 letters for the token prefix.",
  );
  insist(
    Number.isInteger(b.averageMinutes) &&
      b.averageMinutes >= 1 &&
      b.averageMinutes <= 60,
    400,
    "Average visit time must be 1–60 whole minutes.",
  );
  insist(
    Number.isInteger(b.capacity) && b.capacity >= 1 && b.capacity <= 200,
    400,
    "Capacity must be 1–200 visitors.",
  );
  return {
    name: string(b.name, "Service name", 2, 60),
    prefix,
    location: string(b.location, "Location", 2, 100),
    description: string(b.description, "Description", 5, 200),
    requirements: string(b.requirements, "Requirements", 0, 400),
    averageMinutes: b.averageMinutes,
    capacity: b.capacity,
  };
}
export function createApp({
  store,
  secret,
  allowDemo = true,
  limits = true,
  dev = false,
  trustProxy = false,
  showcaseOnly = false,
}) {
  const app = express();
  const auth = authentication(store, secret);
  app.disable("x-powered-by");
  app.set("trust proxy", trustProxy);
  app.use(
    helmet({
      contentSecurityPolicy: dev
        ? false
        : {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", "data:"],
              connectSrc: ["'self'"],
              fontSrc: ["'self'"],
              objectSrc: ["'none'"],
              baseUri: ["'self'"],
              frameAncestors: ["'none'"],
              upgradeInsecureRequests: null,
            },
          },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use("/api", express.json({ limit: "12kb" }));
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (["POST", "PATCH", "DELETE", "PUT"].includes(req.method)) {
      const origin = req.get("origin");
      if (origin) {
        try {
          const u = new URL(origin);
          insist(
            u.host === req.get("host"),
            403,
            "This action must be made from QueueFlow.",
          );
        } catch (e) {
          return next(e.status ? e : new AppError(403, "Invalid origin."));
        }
      }
    }
    next();
  });
  if (limits)
    app.use(
      "/api",
      rateLimit({
        windowMs: 60000,
        limit: 240,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        message: {
          message: "Too many requests. Please wait a minute and try again.",
        },
      }),
    );
  const authLimit = limits
    ? rateLimit({
        windowMs: 15 * 60000,
        limit: 25,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        message: {
          message: "Too many attempts. Please wait 15 minutes and try again.",
        },
      })
    : (req, res, next) => next();
  const wrap = (fn) => (req, res, next) =>
    Promise.resolve()
      .then(() => fn(req, res))
      .catch(next);
  const staff = (req, res, next) =>
    req.actor.role === "staff"
      ? next()
      : next(new AppError(403, "Staff access is required."));
  const mutation = (req, fn) =>
    store.mutate(
      req.actor,
      req.method + " " + req.path,
      req.get("Idempotency-Key"),
      req.body || {},
      fn,
    );
  app.get("/api/health", (req, res) => {
    try {
      store.get("SELECT 1 AS ready");
      res.json({ status: "ok", app: "QueueFlow", database: "sqlite" });
    } catch {
      res
        .status(503)
        .json({ status: "unavailable", message: "Database is not ready." });
    }
  });
  app.get(
    "/api/public",
    wrap((req, res) => {
      store.refresh("campus");
      const queues = store.all(
        "SELECT * FROM queues WHERE workspace_id=? AND archived=0 ORDER BY rowid",
        "campus",
      );
      res.json({
        queues: queues.map((q) => store.queueView(q)),
        day: new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Kolkata",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(store.clock()),
        serverNow: store.clock(),
        allowDemo,
        showcaseOnly,
      });
    }),
  );
  app.post(
    "/api/auth/register",
    authLimit,
    wrap(async (req, res) => {
      insist(
        !showcaseOnly,
        403,
        "This showcase uses fictional practice accounts. Choose Try the live demo to continue.",
        "SHOWCASE_ONLY",
      );
      const c = credentials(req.body || {}, true);
      const hash = await hashPassword(c.password);
      const user = store.addUser("campus", c.name, c.email, hash);
      res.status(201).json(auth.issue(user));
    }),
  );
  app.post(
    "/api/auth/login",
    authLimit,
    wrap(async (req, res) => {
      insist(
        !showcaseOnly,
        403,
        "Regular accounts are not used on this showcase. Choose Try the live demo.",
        "SHOWCASE_ONLY",
      );
      const c = credentials(req.body || {});
      const user = store.get(
        "SELECT * FROM users WHERE workspace_id=? AND email=?",
        "campus",
        c.email,
      );
      insist(
        await verifyPassword(c.password, user?.password_hash),
        401,
        "Email or password is incorrect.",
      );
      res.json(auth.issue(store.user(user.id)));
    }),
  );
  app.post(
    "/api/demo",
    authLimit,
    wrap((req, res) => {
      insist(
        allowDemo,
        403,
        "Practice mode is unavailable on this installation.",
      );
      const demo = store.createDemo();
      res.status(201).json({
        student: auth.issue(demo.student),
        staff: auth.issue(demo.staff),
        workspaceId: demo.workspaceId,
      });
    }),
  );
  app.use("/api", auth.middleware);
  app.post(
    "/api/auth/logout",
    wrap((req, res) => {
      store.run("DELETE FROM sessions WHERE id=?", req.sessionId);
      res.json({ signedOut: true });
    }),
  );
  app.get(
    "/api/workspace",
    wrap((req, res) =>
      res.json({ ...store.snapshot(req.actor), showcaseOnly }),
    ),
  );
  app.post(
    "/api/queues/:id/tickets",
    wrap((req, res) => {
      const purpose = string(req.body?.purpose ?? "", "Visit reason", 0, 120);
      res
        .status(201)
        .json(
          mutation(req, () => store.join(req.actor, req.params.id, purpose)),
        );
    }),
  );
  app.post(
    "/api/tickets/:id/cancel",
    wrap((req, res) =>
      res.json(mutation(req, () => store.cancel(req.actor, req.params.id))),
    ),
  );
  app.get(
    "/api/history",
    wrap((req, res) => {
      const page = Number(req.query.page || 1);
      insist(
        Number.isSafeInteger(page) && page >= 1 && page <= 100000,
        400,
        "Choose a valid history page.",
      );
      const status = req.query.status || "";
      insist(
        !status ||
          [
            "waiting",
            "called",
            "serving",
            "completed",
            "missed",
            "cancelled",
            "expired",
          ].includes(status),
        400,
        "Unknown visit status.",
      );
      res.json(
        store.history(req.actor, {
          page,
          status,
          queueId:
            typeof req.query.queueId === "string"
              ? req.query.queueId
              : undefined,
          search:
            typeof req.query.search === "string"
              ? req.query.search.slice(0, 100)
              : "",
        }),
      );
    }),
  );
  app.get(
    "/api/staff/queues/:id",
    staff,
    wrap((req, res) => res.json(store.desk(req.actor, req.params.id))),
  );
  app.post(
    "/api/staff/queues/:id/actions",
    staff,
    wrap((req, res) =>
      res.json(
        mutation(req, () =>
          store.act(
            req.actor,
            req.params.id,
            req.body?.action,
            req.body?.version,
          ),
        ),
      ),
    ),
  );
  app.post(
    "/api/staff/queues",
    staff,
    wrap((req, res) => {
      const value = queueInput(req.body || {});
      res
        .status(201)
        .json(mutation(req, () => store.editQueue(req.actor, null, value)));
    }),
  );
  app.patch(
    "/api/staff/queues/:id",
    staff,
    wrap((req, res) => {
      const value = queueInput(req.body || {});
      res.json(
        mutation(req, () =>
          store.editQueue(req.actor, req.params.id, value, req.body.version),
        ),
      );
    }),
  );
  app.patch(
    "/api/staff/queues/:id/status",
    staff,
    wrap((req, res) =>
      res.json(
        mutation(req, () =>
          store.setStatus(
            req.actor,
            req.params.id,
            req.body?.status,
            req.body?.version,
          ),
        ),
      ),
    ),
  );
  app.delete(
    "/api/staff/queues/:id",
    staff,
    wrap((req, res) =>
      res.json(
        mutation(req, () =>
          store.archive(req.actor, req.params.id, req.body?.version),
        ),
      ),
    ),
  );
  app.post(
    "/api/demo/reset",
    staff,
    wrap((req, res) => res.json(store.resetDemo(req.actor))),
  );
  app.get(
    "/api/staff/export",
    staff,
    wrap((req, res) => {
      store.refresh(req.actor.workspace_id);
      const rows = store.all(
        "SELECT t.token,t.service_day,q.name AS service,u.name AS visitor,t.purpose,t.status,t.created_at,t.called_at,t.started_at,t.ended_at FROM tickets t JOIN queues q ON q.id=t.queue_id JOIN users u ON u.id=t.user_id WHERE t.workspace_id=? ORDER BY t.created_at DESC LIMIT 10000",
        req.actor.workspace_id,
      );
      const cell = (value) => {
        let s = String(value ?? "");
        if (/^[\s]*[=+@\-\t\r]/.test(s)) s = "'" + s;
        return '"' + s.replaceAll('"', '""') + '"';
      };
      const keys = [
        "token",
        "service_day",
        "service",
        "visitor",
        "purpose",
        "status",
        "created_at",
        "called_at",
        "started_at",
        "ended_at",
      ];
      res
        .set(
          "Content-Disposition",
          'attachment; filename="queueflow-visits.csv"',
        )
        .type("text/csv")
        .send(
          "\uFEFF" +
            [
              keys.join(","),
              ...rows.map((r) => keys.map((k) => cell(r[k])).join(",")),
            ].join("\r\n"),
        );
    }),
  );
  app.use("/api", (req, res) =>
    res.status(404).json({ message: "This API route does not exist." }),
  );
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err.type === "entity.too.large")
      return res.status(413).json({ message: "The request is too large." });
    if (err instanceof SyntaxError && "body" in err)
      return res.status(400).json({ message: "Send a valid JSON object." });
    if (
      err.code?.startsWith("ERR_SQLITE") &&
      /UNIQUE constraint failed: queues.workspace_id, queues.prefix/.test(
        err.message,
      )
    )
      return res.status(409).json({
        message: "That token prefix is already in use. Choose another.",
      });
    if (!err.status) console.error("QueueFlow request error:", err.message);
    res.status(err.status || 500).json({
      message: err.status
        ? err.message
        : "Something went wrong. Refresh and try again.",
      code: err.code || "SERVER_ERROR",
    });
  });
  return { app, auth };
}
