import { DatabaseSync } from "node:sqlite";
import { randomUUID, createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdirSync } from "node:fs";
import path from "node:path";

export class AppError extends Error {
  constructor(status, message, code = "INVALID_REQUEST") {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export function insist(condition, status, message, code) {
  if (!condition) throw new AppError(status, message, code);
}
export const serviceDay = (ms) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ms);
const active = "('waiting','called','serving')";
const baseServices = [
  {
    name: "Academic office",
    prefix: "AC",
    location: "Admin block · Counter 01",
    description:
      "Certificates, academic records and a little help with the paperwork.",
    requirements: "College ID\nYour application or reference number",
    averageMinutes: 4,
    capacity: 30,
  },
  {
    name: "Fees & accounts",
    prefix: "FA",
    location: "Admin block · Counter 02",
    description: "Fee receipts, payment queries and account clarifications.",
    requirements: "College ID\nPayment receipt, if applicable",
    averageMinutes: 6,
    capacity: 20,
  },
  {
    name: "IT help desk",
    prefix: "IT",
    location: "Technology centre · Ground floor",
    description: "Wi-Fi, college accounts and access to campus systems.",
    requirements: "College ID\nThe device or account you need help with",
    averageMinutes: 5,
    capacity: 15,
  },
  {
    name: "Library services",
    prefix: "LB",
    location: "Central library · Reception",
    description: "Membership, borrowing queries and library account support.",
    requirements: "College ID\nLibrary card, if available",
    averageMinutes: 3,
    capacity: 25,
  },
];

export class Store extends EventEmitter {
  constructor(filename = ":memory:", { clock = () => Date.now() } = {}) {
    super();
    this.clock = clock;
    if (filename !== ":memory:")
      mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db
      .exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS workspaces(id TEXT PRIMARY KEY,name TEXT NOT NULL,demo INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,expires_at INTEGER);
      CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES workspaces(id),name TEXT NOT NULL,email TEXT NOT NULL,password_hash TEXT,role TEXT NOT NULL CHECK(role IN ('student','staff')),UNIQUE(workspace_id,email));
      CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS queues(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES workspaces(id),name TEXT NOT NULL,prefix TEXT NOT NULL,location TEXT NOT NULL,description TEXT NOT NULL,requirements TEXT NOT NULL,average_minutes INTEGER NOT NULL,capacity INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','paused','closed')),grace_seconds INTEGER NOT NULL DEFAULT 120,archived INTEGER NOT NULL DEFAULT 0,version INTEGER NOT NULL DEFAULT 1,UNIQUE(workspace_id,prefix));
      CREATE TABLE IF NOT EXISTS tickets(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES workspaces(id),queue_id TEXT NOT NULL REFERENCES queues(id),user_id TEXT NOT NULL REFERENCES users(id),service_day TEXT NOT NULL,sequence INTEGER NOT NULL,token TEXT NOT NULL,purpose TEXT NOT NULL DEFAULT '',status TEXT NOT NULL CHECK(status IN ('waiting','called','serving','completed','missed','cancelled','expired')),created_at INTEGER NOT NULL,called_at INTEGER,started_at INTEGER,ended_at INTEGER,UNIQUE(queue_id,service_day,sequence));
      CREATE UNIQUE INDEX IF NOT EXISTS one_active_visit_per_student ON tickets(workspace_id,user_id) WHERE status IN ${active};
      CREATE UNIQUE INDEX IF NOT EXISTS one_occupied_counter ON tickets(queue_id) WHERE status IN ('called','serving');
      CREATE INDEX IF NOT EXISTS queue_order ON tickets(queue_id,service_day,status,sequence);
      CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES workspaces(id),queue_id TEXT,ticket_id TEXT,actor_id TEXT NOT NULL,action TEXT NOT NULL,created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS requests(actor_id TEXT NOT NULL,request_key TEXT NOT NULL,fingerprint TEXT NOT NULL,response TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(actor_id,request_key));`);
    if (!this.get("SELECT id FROM workspaces WHERE id=?", "campus")) {
      this.run(
        "INSERT INTO workspaces(id,name,created_at) VALUES(?,?,?)",
        "campus",
        "Campus services",
        this.clock(),
      );
      for (const s of baseServices) this.insertQueue("campus", s);
    }
  }
  get(sql, ...args) {
    return this.db.prepare(sql).get(...args);
  }
  all(sql, ...args) {
    return this.db.prepare(sql).all(...args);
  }
  run(sql, ...args) {
    return this.db.prepare(sql).run(...args);
  }
  tx(fn) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const value = fn();
      this.db.exec("COMMIT");
      return value;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  close() {
    this.db.close();
  }
  workspace(id) {
    const w = this.get("SELECT * FROM workspaces WHERE id=?", id);
    insist(
      w && (!w.expires_at || w.expires_at > this.clock()),
      410,
      "This practice workspace has expired. Start a new demo.",
      "WORKSPACE_EXPIRED",
    );
    return w;
  }
  refresh(workspaceId) {
    this.workspace(workspaceId);
    const old = this.all(
      `SELECT DISTINCT queue_id FROM tickets WHERE workspace_id=? AND service_day<>? AND status IN ('waiting','called')`,
      workspaceId,
      serviceDay(this.clock()),
    );
    if (!old.length) return;
    this.tx(() => {
      this.run(
        `UPDATE tickets SET status='expired',ended_at=? WHERE workspace_id=? AND service_day<>? AND status IN ('waiting','called')`,
        this.clock(),
        workspaceId,
        serviceDay(this.clock()),
      );
      for (const t of old)
        this.run("UPDATE queues SET version=version+1 WHERE id=?", t.queue_id);
    });
    this.emit("change", { workspaceId });
  }
  insertQueue(workspaceId, s, grace = 120) {
    const id = randomUUID();
    this.run(
      "INSERT INTO queues(id,workspace_id,name,prefix,location,description,requirements,average_minutes,capacity,grace_seconds) VALUES(?,?,?,?,?,?,?,?,?,?)",
      id,
      workspaceId,
      s.name,
      s.prefix,
      s.location,
      s.description,
      s.requirements,
      s.averageMinutes,
      s.capacity,
      grace,
    );
    return id;
  }
  queue(id, workspaceId) {
    const q = this.get(
      "SELECT * FROM queues WHERE id=? AND workspace_id=? AND archived=0",
      id,
      workspaceId,
    );
    insist(q, 404, "That service is no longer available.", "NOT_FOUND");
    return q;
  }
  user(id) {
    return this.get(
      "SELECT id,workspace_id,name,email,role FROM users WHERE id=?",
      id,
    );
  }
  addUser(workspaceId, name, email, hash, role = "student") {
    const id = randomUUID();
    try {
      this.run(
        "INSERT INTO users VALUES(?,?,?,?,?,?)",
        id,
        workspaceId,
        name,
        email,
        hash,
        role,
      );
    } catch (e) {
      if (
        e.code?.startsWith("ERR_SQLITE") &&
        this.get(
          "SELECT id FROM users WHERE workspace_id=? AND email=?",
          workspaceId,
          email,
        )
      )
        throw new AppError(
          409,
          "An account with that email already exists. Please sign in.",
          "EMAIL_EXISTS",
        );
      throw e;
    }
    return this.user(id);
  }
  average(q) {
    const rows = this.all(
      "SELECT (ended_at-started_at)/60000.0 AS duration FROM tickets WHERE queue_id=? AND status='completed' AND ended_at-started_at BETWEEN 30000 AND 3600000 ORDER BY ended_at DESC LIMIT 20",
      q.id,
    );
    return {
      minutes:
        rows.length >= 3
          ? rows.reduce((n, r) => n + r.duration, 0) / rows.length
          : q.average_minutes,
      source: rows.length >= 3 ? "recent visits" : "service average",
    };
  }
  ticketView(t, staff = false) {
    if (!t) return null;
    const q = this.get("SELECT * FROM queues WHERE id=?", t.queue_id);
    const ahead =
      t.status === "waiting"
        ? this.get(
            `SELECT count(*) AS n FROM tickets WHERE queue_id=? AND id<>? AND (status IN ('called','serving') OR (service_day=? AND status='waiting' AND sequence<?))`,
            q.id,
            t.id,
            t.service_day,
            t.sequence,
          ).n
        : 0;
    const avg = this.average(q);
    const view = {
      id: t.id,
      queueId: t.queue_id,
      token: t.token,
      purpose: t.purpose,
      status: t.status,
      serviceDay: t.service_day,
      createdAt: t.created_at,
      calledAt: t.called_at,
      startedAt: t.started_at,
      endedAt: t.ended_at,
      queueName: q.name,
      location: q.location,
      queueStatus: q.status,
      queueVersion: q.version,
      graceSeconds: q.grace_seconds,
      ahead,
      position: t.status === "waiting" ? ahead + 1 : null,
      estimate:
        q.status === "paused" || t.status !== "waiting"
          ? null
          : {
              low: Math.max(0, Math.floor(ahead * avg.minutes * 0.8)),
              high: Math.max(1, Math.ceil((ahead + 0.5) * avg.minutes * 1.2)),
              source: avg.source,
            },
    };
    if (staff) {
      const u = this.user(t.user_id);
      view.visitor = u?.name || "Visitor";
      view.email = u?.email;
    }
    return view;
  }
  queueView(q) {
    const day = serviceDay(this.clock());
    const waiting = this.get(
      "SELECT count(*) AS n FROM tickets WHERE queue_id=? AND service_day=? AND status='waiting'",
      q.id,
      day,
    ).n;
    const current = this.get(
      "SELECT * FROM tickets WHERE queue_id=? AND status IN ('called','serving')",
      q.id,
    );
    const completed = this.get(
      "SELECT count(*) AS n FROM tickets WHERE queue_id=? AND service_day=? AND status='completed'",
      q.id,
      day,
    ).n;
    const avg = this.average(q);
    const n = waiting + Number(Boolean(current));
    return {
      id: q.id,
      name: q.name,
      prefix: q.prefix,
      location: q.location,
      description: q.description,
      requirements: q.requirements.split("\n").filter(Boolean),
      averageMinutes: q.average_minutes,
      capacity: q.capacity,
      status: q.status,
      graceSeconds: q.grace_seconds,
      version: q.version,
      waiting,
      completed,
      full: n >= q.capacity,
      current: current
        ? { token: current.token, status: current.status }
        : null,
      estimate:
        q.status === "paused"
          ? null
          : {
              low: Math.floor(n * avg.minutes * 0.8),
              high: Math.max(1, Math.ceil((n + 0.5) * avg.minutes * 1.2)),
              source: avg.source,
            },
    };
  }
  snapshot(actor) {
    this.refresh(actor.workspace_id);
    const queues = this.all(
      "SELECT * FROM queues WHERE workspace_id=? AND archived=0 ORDER BY rowid",
      actor.workspace_id,
    ).map((q) => this.queueView(q));
    const visit = this.get(
      `SELECT * FROM tickets WHERE workspace_id=? AND user_id=? AND status IN ${active}`,
      actor.workspace_id,
      actor.id,
    );
    return {
      user: actor,
      workspace: this.workspace(actor.workspace_id),
      queues,
      visit: this.ticketView(visit),
      day: serviceDay(this.clock()),
      serverNow: this.clock(),
    };
  }
  audit(actor, queueId, ticketId, action) {
    this.run(
      "INSERT INTO audit VALUES(?,?,?,?,?,?,?)",
      randomUUID(),
      actor.workspace_id,
      queueId,
      ticketId,
      actor.id,
      action,
      this.clock(),
    );
  }
  mutate(actor, route, key, payload, fn) {
    this.refresh(actor.workspace_id);
    insist(
      typeof key === "string" && /^[a-zA-Z0-9_-]{16,100}$/.test(key),
      400,
      "A valid request key is required. Please refresh and retry.",
    );
    const fingerprint = createHash("sha256")
      .update(route + JSON.stringify(payload))
      .digest("hex");
    const result = this.tx(() => {
      const previous = this.get(
        "SELECT * FROM requests WHERE actor_id=? AND request_key=?",
        actor.id,
        key,
      );
      if (previous) {
        insist(
          previous.fingerprint === fingerprint,
          409,
          "This request key was already used for a different action.",
        );
        return JSON.parse(previous.response);
      }
      const response = fn();
      this.run(
        "INSERT INTO requests VALUES(?,?,?,?,?)",
        actor.id,
        key,
        fingerprint,
        JSON.stringify(response),
        this.clock(),
      );
      return response;
    });
    this.emit("change", { workspaceId: actor.workspace_id });
    return result;
  }
  version(q, expected) {
    insist(
      Number.isSafeInteger(expected) && expected === q.version,
      409,
      "The queue changed in another window. Review the refreshed desk and try again.",
      "STALE_QUEUE",
    );
  }
  join(actor, id, purpose = "") {
    insist(
      actor.role === "student",
      403,
      "Switch to the student view to join a queue.",
    );
    const q = this.queue(id, actor.workspace_id);
    const day = serviceDay(this.clock());
    insist(
      !this.get(
        `SELECT id FROM tickets WHERE workspace_id=? AND user_id=? AND status IN ${active}`,
        actor.workspace_id,
        actor.id,
      ),
      409,
      "You already have an active visit. Open My visit to continue or cancel it.",
      "ACTIVE_VISIT",
    );
    insist(
      q.status === "open",
      409,
      q.status === "paused"
        ? "This service is paused. Please choose another service or check back later."
        : "This service is closed to new visits.",
      "QUEUE_UNAVAILABLE",
    );
    insist(
      this.get(
        `SELECT count(*) AS n FROM tickets WHERE queue_id=? AND status IN ${active}`,
        id,
      ).n < q.capacity,
      409,
      "This queue is full. Please check back shortly.",
      "QUEUE_FULL",
    );
    const seq = this.get(
      "SELECT coalesce(max(sequence),0)+1 AS n FROM tickets WHERE queue_id=? AND service_day=?",
      id,
      day,
    ).n;
    const ticketId = randomUUID();
    const token = `${q.prefix}-${String(seq).padStart(3, "0")}`;
    this.run(
      "INSERT INTO tickets(id,workspace_id,queue_id,user_id,service_day,sequence,token,purpose,status,created_at) VALUES(?,?,?,?,?,?,?,?,'waiting',?)",
      ticketId,
      actor.workspace_id,
      id,
      actor.id,
      day,
      seq,
      token,
      purpose,
      this.clock(),
    );
    this.run("UPDATE queues SET version=version+1 WHERE id=?", id);
    this.audit(actor, id, ticketId, "joined");
    return { ticketId, token };
  }
  cancel(actor, ticketId) {
    const t = this.get(
      "SELECT * FROM tickets WHERE id=? AND workspace_id=? AND user_id=?",
      ticketId,
      actor.workspace_id,
      actor.id,
    );
    insist(t, 404, "Visit not found.");
    insist(
      ["waiting", "called"].includes(t.status),
      409,
      "This visit can no longer be cancelled. If service has started, speak to the counter staff.",
    );
    this.run(
      "UPDATE tickets SET status='cancelled',ended_at=? WHERE id=?",
      this.clock(),
      t.id,
    );
    this.run("UPDATE queues SET version=version+1 WHERE id=?", t.queue_id);
    this.audit(actor, t.queue_id, t.id, "cancelled");
    return { ticketId, status: "cancelled" };
  }
  act(actor, id, action, expectedVersion) {
    insist(actor.role === "staff", 403, "Staff access is required.");
    const q = this.queue(id, actor.workspace_id);
    this.version(q, expectedVersion);
    let t = this.get(
      "SELECT * FROM tickets WHERE queue_id=? AND status IN ('called','serving')",
      id,
    );
    if (action === "call") {
      insist(
        q.status !== "paused",
        409,
        "Resume this service before calling the next visitor.",
      );
      insist(
        !t,
        409,
        "Finish or mark the current visitor as missed before calling another.",
      );
      t = this.get(
        "SELECT * FROM tickets WHERE queue_id=? AND service_day=? AND status='waiting' ORDER BY sequence LIMIT 1",
        id,
        serviceDay(this.clock()),
      );
      insist(t, 409, "Nobody is waiting right now.", "EMPTY_QUEUE");
      this.run(
        "UPDATE tickets SET status='called',called_at=? WHERE id=?",
        this.clock(),
        t.id,
      );
    } else {
      insist(t, 409, "There is no current visitor. Refresh the desk.");
      if (action === "start") {
        insist(t.status === "called", 409, "This visit has already started.");
        this.run(
          "UPDATE tickets SET status='serving',started_at=? WHERE id=?",
          this.clock(),
          t.id,
        );
      } else if (action === "complete") {
        insist(
          t.status === "serving",
          409,
          "Confirm the visitor has arrived with Start visit before completing it.",
        );
        this.run(
          "UPDATE tickets SET status='completed',ended_at=? WHERE id=?",
          this.clock(),
          t.id,
        );
      } else if (action === "miss") {
        insist(
          t.status === "called",
          409,
          "Only a called visitor can be marked as missed.",
        );
        insist(
          this.clock() >= t.called_at + q.grace_seconds * 1000,
          409,
          `Allow the ${q.grace_seconds}-second arrival window before marking this visitor as missed.`,
          "GRACE_PERIOD",
        );
        this.run(
          "UPDATE tickets SET status='missed',ended_at=? WHERE id=?",
          this.clock(),
          t.id,
        );
      } else throw new AppError(400, "Unknown desk action.");
    }
    this.run("UPDATE queues SET version=version+1 WHERE id=?", id);
    this.audit(actor, id, t.id, action);
    return { ticketId: t.id, token: t.token, action };
  }
  desk(actor, id) {
    insist(actor.role === "staff", 403, "Staff access is required.");
    this.refresh(actor.workspace_id);
    const q = this.queue(id, actor.workspace_id);
    return {
      queue: this.queueView(q),
      current: this.ticketView(
        this.get(
          "SELECT * FROM tickets WHERE queue_id=? AND status IN ('called','serving')",
          id,
        ),
        true,
      ),
      waiting: this.all(
        "SELECT * FROM tickets WHERE queue_id=? AND service_day=? AND status='waiting' ORDER BY sequence",
        id,
        serviceDay(this.clock()),
      ).map((t) => this.ticketView(t, true)),
    };
  }
  history(actor, { queueId, status, search = "", page = 1 } = {}) {
    this.refresh(actor.workspace_id);
    let where = "t.workspace_id=?";
    const args = [actor.workspace_id];
    if (actor.role !== "staff") {
      where += " AND t.user_id=?";
      args.push(actor.id);
    }
    if (queueId) {
      where += " AND t.queue_id=?";
      args.push(queueId);
    }
    if (status) {
      where += " AND t.status=?";
      args.push(status);
    }
    if (search) {
      where += " AND (t.token LIKE ? ESCAPE '\\' OR u.name LIKE ? ESCAPE '\\')";
      const escaped = search.replace(/[\\%_]/g, "\\$&");
      args.push("%" + escaped + "%", "%" + escaped + "%");
    }
    const total = this.get(
      `SELECT count(*) AS n FROM tickets t JOIN users u ON u.id=t.user_id WHERE ${where}`,
      ...args,
    ).n;
    return {
      total,
      page,
      pages: Math.ceil(total / 25),
      items: this.all(
        `SELECT t.* FROM tickets t JOIN users u ON u.id=t.user_id WHERE ${where} ORDER BY t.created_at DESC,t.sequence DESC LIMIT 25 OFFSET ?`,
        ...args,
        (page - 1) * 25,
      ).map((t) => this.ticketView(t, actor.role === "staff")),
    };
  }
  editQueue(actor, id, value, expectedVersion) {
    insist(actor.role === "staff", 403, "Staff access is required.");
    if (!id) {
      id = this.insertQueue(
        actor.workspace_id,
        value,
        this.workspace(actor.workspace_id).demo ? 15 : 120,
      );
      this.audit(actor, id, null, "service_created");
    } else {
      const q = this.queue(id, actor.workspace_id);
      this.version(q, expectedVersion);
      this.run(
        "UPDATE queues SET name=?,prefix=?,location=?,description=?,requirements=?,average_minutes=?,capacity=?,version=version+1 WHERE id=?",
        value.name,
        value.prefix,
        value.location,
        value.description,
        value.requirements,
        value.averageMinutes,
        value.capacity,
        id,
      );
      this.audit(actor, id, null, "service_edited");
    }
    return { queueId: id };
  }
  setStatus(actor, id, status, expectedVersion) {
    insist(actor.role === "staff", 403, "Staff access is required.");
    const q = this.queue(id, actor.workspace_id);
    this.version(q, expectedVersion);
    insist(
      ["open", "paused", "closed"].includes(status),
      400,
      "Choose open, paused or closed.",
    );
    this.run(
      "UPDATE queues SET status=?,version=version+1 WHERE id=?",
      status,
      id,
    );
    this.audit(actor, id, null, "service_" + status);
    return { queueId: id, status };
  }
  archive(actor, id, expectedVersion) {
    insist(actor.role === "staff", 403, "Staff access is required.");
    const q = this.queue(id, actor.workspace_id);
    this.version(q, expectedVersion);
    insist(
      q.status === "closed",
      409,
      "Close this service to new visits before archiving it.",
    );
    insist(
      !this.get(
        `SELECT id FROM tickets WHERE queue_id=? AND status IN ${active}`,
        id,
      ),
      409,
      "Finish all active visits before archiving this service.",
    );
    this.run("UPDATE queues SET archived=1,version=version+1 WHERE id=?", id);
    this.audit(actor, id, null, "service_archived");
    return { queueId: id, archived: true };
  }
  createDemo() {
    const id = randomUUID();
    const now = this.clock();
    return this.tx(() => {
      this.run(
        "INSERT INTO workspaces VALUES(?,?,?,?,?)",
        id,
        "Practice campus",
        1,
        now,
        now + 24 * 3600000,
      );
      const student = this.addUser(
        id,
        "Alex Morgan",
        "alex@practice.example",
        null,
      );
      const staff = this.addUser(
        id,
        "Sam Taylor",
        "sam@practice.example",
        null,
        "staff",
      );
      for (const s of baseServices) this.insertQueue(id, s, 15);
      this.seedDemo(id);
      return { workspaceId: id, student, staff };
    });
  }
  seedDemo(id) {
    const queues = this.all(
      "SELECT * FROM queues WHERE workspace_id=? AND archived=0 ORDER BY rowid",
      id,
    );
    const now = this.clock();
    const day = serviceDay(now);
    const names = [
      "Riya Shah",
      "Dev Patel",
      "Maya Rao",
      "Arjun Das",
      "Noor Ali",
      "Isha Mehta",
      "Leo Chen",
      "Tara Sen",
    ];
    for (let qi = 0; qi < queues.length; qi++) {
      const q = queues[qi];
      const count = [8, 5, 4, 3][qi] ?? 0;
      for (let i = 0; i < count; i++) {
        const email = `visitor${qi}_${i}@practice.example`;
        const u =
          this.get(
            "SELECT id FROM users WHERE workspace_id=? AND email=?",
            id,
            email,
          ) || this.addUser(id, names[i % names.length], email, null);
        const seq = 40 + i;
        const status = i < 2 ? "completed" : i === 2 ? "serving" : "waiting";
        this.run(
          "INSERT INTO tickets VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
          randomUUID(),
          id,
          q.id,
          u.id,
          day,
          seq,
          `${q.prefix}-${String(seq).padStart(3, "0")}`,
          ["Document enquiry", "Account support", "Certificate request"][i % 3],
          status,
          now - (count - i + 8) * 60000,
          i <= 2 ? now - (count - i + 2) * 60000 : null,
          i <= 2 ? now - (count - i + 1) * 60000 : null,
          i < 2 ? now - (count - i - 2) * 60000 : null,
        );
      }
      this.run(
        "UPDATE queues SET status=?,version=version+1 WHERE id=?",
        qi === 3 ? "paused" : "open",
        q.id,
      );
    }
  }
  resetDemo(actor) {
    insist(
      actor.role === "staff" && this.workspace(actor.workspace_id).demo,
      403,
      "Only practice staff can reset a practice workspace.",
    );
    this.tx(() => {
      this.run("DELETE FROM tickets WHERE workspace_id=?", actor.workspace_id);
      this.run("DELETE FROM audit WHERE workspace_id=?", actor.workspace_id);
      this.run(
        "DELETE FROM requests WHERE actor_id IN (SELECT id FROM users WHERE workspace_id=?)",
        actor.workspace_id,
      );
      this.seedDemo(actor.workspace_id);
    });
    this.emit("change", { workspaceId: actor.workspace_id });
    return { reset: true };
  }
}
