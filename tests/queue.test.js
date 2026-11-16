import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, mkdirSync } from "node:fs";
import path from "node:path";
import { Store, serviceDay } from "../server/store.js";
import { createApp } from "../server/app.js";
import { hashPassword } from "../server/auth.js";

function fixture(t) {
  let now = Date.UTC(2026, 10, 16, 5);
  const store = new Store(":memory:", { clock: () => now });
  t.after(() => store.close());
  const student = store.addUser(
      "campus",
      "First Student",
      "first@example.test",
      null,
    ),
    second = store.addUser(
      "campus",
      "Second Student",
      "second@example.test",
      null,
    ),
    staff = store.addUser(
      "campus",
      "Desk Staff",
      "staff@example.test",
      null,
      "staff",
    );
  const queue = store.all(
    "SELECT * FROM queues WHERE workspace_id=? ORDER BY rowid",
    "campus",
  )[0];
  const mutate = (actor, route, fn, key = randomUUID(), payload = {}) =>
    store.mutate(actor, route, key, payload, fn);
  const join = (actor = student, id = queue.id) =>
    mutate(actor, "join " + id, () => store.join(actor, id));
  const version = () => store.queue(queue.id, "campus").version;
  const act = (action) =>
    mutate(staff, action, () => store.act(staff, queue.id, action, version()));
  return {
    store,
    student,
    second,
    staff,
    queue,
    mutate,
    join,
    version,
    act,
    advance: (ms) => {
      now += ms;
    },
  };
}
test("FIFO includes the occupied counter in the student position", (t) => {
  const f = fixture(t);
  f.join();
  f.join(f.second);
  assert.equal(f.store.snapshot(f.second).visit.ahead, 1);
  assert.equal(f.store.snapshot(f.second).visit.position, 2);
  f.act("call");
  assert.equal(f.store.snapshot(f.student).visit.status, "called");
  assert.equal(f.store.snapshot(f.second).visit.ahead, 1);
  f.act("start");
  f.advance(120000);
  f.act("complete");
  assert.equal(f.store.snapshot(f.second).visit.position, 1);
  f.act("call");
  assert.equal(f.store.snapshot(f.second).visit.status, "called");
});
test("a student cannot hold active visits across two services", (t) => {
  const f = fixture(t);
  f.join();
  const q = f.store.all("SELECT id FROM queues")[1];
  assert.throws(
    () => f.join(f.student, q.id),
    (e) => e.status === 409 && e.code === "ACTIVE_VISIT",
  );
});
test("retrying one request returns the original token and creates no duplicate", (t) => {
  const f = fixture(t);
  const key = randomUUID();
  const fn = () => f.store.join(f.student, f.queue.id);
  const a = f.mutate(f.student, "join", fn, key),
    b = f.mutate(f.student, "join", fn, key);
  assert.deepEqual(a, b);
  assert.equal(f.store.get("SELECT count(*) AS n FROM tickets").n, 1);
});
test("a request key cannot be reused with different inputs", (t) => {
  const f = fixture(t);
  const key = randomUUID();
  f.mutate(f.student, "join", () => f.store.join(f.student, f.queue.id), key, {
    purpose: "A",
  });
  assert.throws(
    () => f.mutate(f.student, "join", () => ({}), key, { purpose: "B" }),
    (e) => e.status === 409,
  );
});
test("a second staff action cannot overwrite a changed queue version", (t) => {
  const f = fixture(t);
  f.join();
  const before = f.version();
  f.act("call");
  assert.throws(
    () =>
      f.mutate(f.staff, "call-again", () =>
        f.store.act(f.staff, f.queue.id, "call", before),
      ),
    (e) => e.code === "STALE_QUEUE",
  );
  assert.equal(
    f.store.all("SELECT * FROM tickets WHERE status='called'").length,
    1,
  );
});
test("an occupied counter prevents another call even with the latest version", (t) => {
  const f = fixture(t);
  f.join();
  f.join(f.second);
  f.act("call");
  assert.throws(
    () => f.act("call"),
    (e) => e.status === 409,
  );
});
test("completion requires an explicitly started visit", (t) => {
  const f = fixture(t);
  f.join();
  f.act("call");
  assert.throws(
    () => f.act("complete"),
    (e) => e.status === 409,
  );
  assert.equal(f.store.snapshot(f.student).visit.status, "called");
});
test("missed-turn grace period is enforced, then rejoining goes to the end", (t) => {
  const f = fixture(t);
  const a = f.join();
  f.join(f.second);
  f.act("call");
  assert.throws(
    () => f.act("miss"),
    (e) => e.code === "GRACE_PERIOD",
  );
  f.advance(120000);
  f.act("miss");
  assert.equal(f.store.snapshot(f.student).visit, null);
  const b = f.join();
  assert.notEqual(a.token, b.token);
  assert.equal(f.store.snapshot(f.student).visit.position, 2);
});
test("students may cancel waiting or called visits but not a serving visit", (t) => {
  const f = fixture(t);
  let a = f.join();
  f.mutate(f.student, "cancel", () => f.store.cancel(f.student, a.ticketId));
  assert.equal(f.store.snapshot(f.student).visit, null);
  a = f.join();
  f.act("call");
  f.mutate(f.student, "cancel2", () => f.store.cancel(f.student, a.ticketId));
  a = f.join();
  f.act("call");
  f.act("start");
  assert.throws(
    () =>
      f.mutate(f.student, "cancel3", () =>
        f.store.cancel(f.student, a.ticketId),
      ),
    (e) => e.status === 409,
  );
});
test("a visitor cannot cancel another visitor’s ticket", (t) => {
  const f = fixture(t);
  const a = f.join();
  assert.throws(
    () =>
      f.mutate(f.second, "cancel", () => f.store.cancel(f.second, a.ticketId)),
    (e) => e.status === 404,
  );
});
test("pause preserves places and permits completion, but blocks joins and new calls", (t) => {
  const f = fixture(t);
  f.join();
  f.act("call");
  f.act("start");
  f.mutate(f.staff, "pause", () =>
    f.store.setStatus(f.staff, f.queue.id, "paused", f.version()),
  );
  assert.throws(
    () => f.join(f.second),
    (e) => e.code === "QUEUE_UNAVAILABLE",
  );
  assert.equal(f.store.snapshot(f.student).visit.status, "serving");
  f.act("complete");
  assert.throws(
    () => f.act("call"),
    (e) => e.status === 409,
  );
});
test("closing joins still lets staff finish visitors already waiting", (t) => {
  const f = fixture(t);
  f.join();
  f.mutate(f.staff, "close", () =>
    f.store.setStatus(f.staff, f.queue.id, "closed", f.version()),
  );
  assert.throws(
    () => f.join(f.second),
    (e) => e.code === "QUEUE_UNAVAILABLE",
  );
  f.act("call");
  assert.equal(f.store.snapshot(f.student).visit.status, "called");
});
test("capacity counts both waiting and occupied visits", (t) => {
  const f = fixture(t);
  f.store.run("UPDATE queues SET capacity=1 WHERE id=?", f.queue.id);
  f.join();
  f.act("call");
  assert.throws(
    () => f.join(f.second),
    (e) => e.code === "QUEUE_FULL",
  );
});
test("midnight IST expires waiting/called records and starts a fresh daily sequence", (t) => {
  const f = fixture(t);
  f.join();
  f.act("call");
  f.advance(24 * 3600000);
  const snap = f.store.snapshot(f.student);
  assert.equal(snap.visit, null);
  const b = f.join();
  assert.equal(b.token, "AC-001");
  assert.equal(
    f.store.history(f.student).items.find((t) => t.status === "expired").token,
    "AC-001",
  );
});
test("an overnight serving visit is retained and blocks another call", (t) => {
  const f = fixture(t);
  f.join();
  f.act("call");
  f.act("start");
  f.advance(24 * 3600000);
  f.join(f.second);
  assert.equal(f.store.snapshot(f.student).visit.status, "serving");
  assert.throws(
    () => f.act("call"),
    (e) => e.status === 409,
  );
  f.act("complete");
  f.act("call");
  assert.equal(f.store.snapshot(f.second).visit.status, "called");
});
test("Asia/Kolkata day rolls over at 18:30 UTC", () => {
  assert.equal(serviceDay(Date.UTC(2026, 10, 16, 18, 29, 59)), "2026-11-16");
  assert.equal(serviceDay(Date.UTC(2026, 10, 16, 18, 30, 0)), "2026-11-17");
});
test("public summaries do not include visitor identities", (t) => {
  const f = fixture(t);
  f.join();
  f.act("call");
  const publicData = JSON.stringify(
    f.store.queueView(f.store.queue(f.queue.id, "campus")),
  );
  assert.ok(!publicData.includes("First Student"));
  assert.ok(!publicData.includes("first@example.test"));
  assert.ok(!publicData.includes(f.student.id));
});
test("student history is private and staff history includes all workspace records", (t) => {
  const f = fixture(t);
  f.join();
  f.join(f.second);
  assert.equal(f.store.history(f.student).total, 1);
  assert.equal(f.store.history(f.staff).total, 2);
  assert.ok(!("visitor" in f.store.history(f.student).items[0]));
  assert.ok("visitor" in f.store.history(f.staff).items[0]);
});
test("demo workspaces and reset are isolated from live and other demos", (t) => {
  const f = fixture(t);
  f.join();
  const a = f.store.createDemo(),
    b = f.store.createDemo();
  const qa = f.store.snapshot(a.student).queues[0];
  f.store.mutate(a.student, "join", randomUUID(), {}, () =>
    f.store.join(a.student, qa.id),
  );
  assert.ok(f.store.snapshot(a.student).visit);
  f.store.resetDemo(a.staff);
  assert.equal(f.store.snapshot(a.student).visit, null);
  assert.ok(f.store.snapshot(f.student).visit);
  assert.equal(f.store.snapshot(b.student).queues[0].waiting, 5);
  assert.throws(
    () => f.store.queue(qa.id, b.student.workspace_id),
    (e) => e.status === 404,
  );
  assert.throws(
    () => f.store.resetDemo(f.staff),
    (e) => e.status === 403,
  );
});
test("archiving retains history and is blocked for active services", (t) => {
  const f = fixture(t);
  f.join();
  assert.throws(
    () =>
      f.mutate(f.staff, "archive", () =>
        f.store.archive(f.staff, f.queue.id, f.version()),
      ),
    (e) => e.status === 409,
  );
  f.act("call");
  f.act("start");
  f.act("complete");
  f.mutate(f.staff, "close", () =>
    f.store.setStatus(f.staff, f.queue.id, "closed", f.version()),
  );
  f.mutate(f.staff, "archive", () =>
    f.store.archive(f.staff, f.queue.id, f.version()),
  );
  assert.ok(!f.store.snapshot(f.staff).queues.some((q) => q.id === f.queue.id));
  assert.equal(
    f.store.history(f.student).items[0].queueName,
    "Academic office",
  );
});
test("a service edit does not rename previously issued tokens", (t) => {
  const f = fixture(t);
  const a = f.join();
  const q = f.store.queue(f.queue.id, "campus");
  f.mutate(f.staff, "edit", () =>
    f.store.editQueue(
      f.staff,
      q.id,
      {
        name: q.name,
        prefix: "AD",
        location: q.location,
        description: q.description,
        requirements: q.requirements,
        averageMinutes: 5,
        capacity: 50,
      },
      q.version,
    ),
  );
  assert.equal(f.store.snapshot(f.student).visit.token, a.token);
});
test("SQLite visit records survive reopening the database", () => {
  mkdirSync("output/tests", { recursive: true });
  const dir = mkdtempSync(path.resolve("output/tests/persist-"));
  const file = path.join(dir, "queue.sqlite");
  let s = new Store(file);
  const user = s.addUser("campus", "Saved Student", "saved@example.test", null);
  const id = s.get("SELECT id FROM queues WHERE prefix=?", "AC").id;
  s.mutate(user, "join", randomUUID(), {}, () => s.join(user, id));
  s.close();
  s = new Store(file);
  assert.equal(s.snapshot(user).visit.token, "AC-001");
  s.close();
});

async function apiFixture(t, options = {}) {
  const store = new Store();
  const { app, auth } = createApp({
    store,
    secret: "test-only-signing-key-with-at-least-32-characters",
    limits: false,
    ...options,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.on("listening", r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const api = async (
    url,
    { token, method = "GET", body, key = randomUUID() } = {},
  ) => {
    const response = await fetch(base + url, {
      method,
      headers: {
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        "Idempotency-Key": key,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    let data;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    return { status: response.status, data };
  };
  return { store, auth, base, api };
}

test("health check tests the database and returns 503 when unavailable", async (t) => {
  const { store, api } = await apiFixture(t);
  assert.equal((await api("/api/health")).status, 200);
  const original = store.get;
  store.get = () => {
    throw new Error("simulated unavailable database");
  };
  try {
    assert.equal((await api("/api/health")).status, 503);
  } finally {
    store.get = original;
  }
});

test("showcase deployment blocks regular accounts while retaining isolated demos", async (t) => {
  const { api } = await apiFixture(t, { showcaseOnly: true });
  const visible = await api("/api/public");
  assert.equal(visible.data.showcaseOnly, true);
  const body = {
    name: "Example Student",
    email: "example@test.invalid",
    password: "test-password-123",
  };
  assert.equal(
    (await api("/api/auth/register", { method: "POST", body })).data.code,
    "SHOWCASE_ONLY",
  );
  assert.equal(
    (await api("/api/auth/login", { method: "POST", body })).data.code,
    "SHOWCASE_ONLY",
  );
  const demo = await api("/api/demo", { method: "POST", body: {} });
  assert.equal(demo.status, 201);
  assert.equal(
    (await api("/api/workspace", { token: demo.data.student.token })).status,
    200,
  );
});

test("proxy trust is explicit rather than trusting every forwarded address", (t) => {
  const f = fixture(t);
  const normal = createApp({
    store: f.store,
    secret: "test-signing-secret-long-enough-for-this-app",
    limits: false,
  });
  const hosted = createApp({
    store: f.store,
    secret: "test-signing-secret-long-enough-for-this-app",
    limits: false,
    trustProxy: 1,
  });
  assert.equal(normal.app.get("trust proxy"), false);
  assert.equal(hosted.app.get("trust proxy"), 1);
});
test("REST demo, join, live workspace, staff authorization and idempotency work together", async (t) => {
  const { api } = await apiFixture(t);
  const d = await api("/api/demo", { method: "POST", body: {} });
  assert.equal(d.status, 201);
  const { student, staff } = d.data;
  const snapshot = await api("/api/workspace", { token: student.token });
  const id = snapshot.data.queues[0].id;
  assert.equal(
    (await api(`/api/staff/queues/${id}`, { token: student.token })).status,
    403,
  );
  const key = randomUUID();
  const options = {
    token: student.token,
    method: "POST",
    body: { purpose: "Certificate" },
    key,
  };
  const a = await api(`/api/queues/${id}/tickets`, options),
    b = await api(`/api/queues/${id}/tickets`, options);
  assert.equal(a.status, 201);
  assert.deepEqual(a.data, b.data);
  assert.equal(
    (await api("/api/workspace", { token: student.token })).data.visit.token,
    a.data.token,
  );
  assert.equal(
    (
      await api(`/api/staff/queues/${id}`, { token: staff.token })
    ).data.waiting.at(-1).visitor,
    "Alex Morgan",
  );
});
test("parallel HTTP joins cannot issue two active visits to one student", async (t) => {
  const { api } = await apiFixture(t);
  const d = (await api("/api/demo", { method: "POST", body: {} })).data;
  const qs = (await api("/api/workspace", { token: d.student.token })).data
    .queues;
  const results = await Promise.all(
    qs.slice(0, 2).map((q) =>
      api(`/api/queues/${q.id}/tickets`, {
        token: d.student.token,
        method: "POST",
        body: {},
      }),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
});
test("parallel staff calls with one version result in one call and one conflict", async (t) => {
  const { api } = await apiFixture(t);
  const d = (await api("/api/demo", { method: "POST", body: {} })).data;
  let q = (await api("/api/workspace", { token: d.staff.token })).data
    .queues[0];
  await api(`/api/staff/queues/${q.id}/actions`, {
    token: d.staff.token,
    method: "POST",
    body: { action: "complete", version: q.version },
  });
  q = (await api("/api/workspace", { token: d.staff.token })).data.queues[0];
  const results = await Promise.all(
    [1, 2].map(() =>
      api(`/api/staff/queues/${q.id}/actions`, {
        token: d.staff.token,
        method: "POST",
        body: { action: "call", version: q.version },
      }),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
});
test("forged tokens, expired sessions and logout cannot read private records", async (t) => {
  const { api } = await apiFixture(t);
  assert.equal(
    (await api("/api/workspace", { token: "not-a-jwt" })).status,
    401,
  );
  const d = (await api("/api/demo", { method: "POST", body: {} })).data;
  assert.equal(
    (await api("/api/workspace", { token: d.student.token })).status,
    200,
  );
  await api("/api/auth/logout", {
    token: d.student.token,
    method: "POST",
    body: {},
  });
  assert.equal(
    (await api("/api/workspace", { token: d.student.token })).status,
    401,
  );
});
test("registration/login store hashed passwords and reject invalid input", async (t) => {
  const { api, store } = await apiFixture(t);
  assert.equal(
    (
      await api("/api/auth/register", {
        method: "POST",
        body: { name: "Al", email: "invalid", password: "short" },
      })
    ).status,
    400,
  );
  const body = {
    name: "Real Student",
    email: "student@example.test",
    password: "a-test-password-123",
  };
  assert.equal(
    (await api("/api/auth/register", { method: "POST", body })).status,
    201,
  );
  assert.notEqual(
    store.get("SELECT password_hash FROM users WHERE email=?", body.email)
      .password_hash,
    body.password,
  );
  assert.equal(
    (
      await api("/api/auth/login", {
        method: "POST",
        body: { ...body, password: "wrong-password-123" },
      })
    ).status,
    401,
  );
  assert.equal(
    (await api("/api/auth/login", { method: "POST", body })).status,
    200,
  );
  assert.equal(
    (await api("/api/auth/register", { method: "POST", body })).status,
    409,
  );
});
test("service creation validates data and supports create, read, update and archive", async (t) => {
  const { api } = await apiFixture(t);
  const d = (await api("/api/demo", { method: "POST", body: {} })).data;
  const token = d.staff.token;
  assert.equal(
    (
      await api("/api/staff/queues", {
        token,
        method: "POST",
        body: { name: "Bad" },
      })
    ).status,
    400,
  );
  const value = {
    name: "Student support",
    prefix: "SS",
    location: "Building B",
    description: "General student support",
    requirements: "College ID",
    averageMinutes: 5,
    capacity: 10,
  };
  const made = await api("/api/staff/queues", {
    token,
    method: "POST",
    body: value,
  });
  assert.equal(made.status, 201);
  let q = (await api("/api/workspace", { token })).data.queues.find(
    (q) => q.id === made.data.queueId,
  );
  assert.equal(q.name, value.name);
  assert.equal(
    (
      await api(`/api/staff/queues/${q.id}`, {
        token,
        method: "PATCH",
        body: { ...value, name: "Student hub", version: q.version },
      })
    ).status,
    200,
  );
  q = (await api("/api/workspace", { token })).data.queues.find(
    (x) => x.id === q.id,
  );
  await api(`/api/staff/queues/${q.id}/status`, {
    token,
    method: "PATCH",
    body: { status: "closed", version: q.version },
  });
  q = (await api("/api/workspace", { token })).data.queues.find(
    (x) => x.id === q.id,
  );
  assert.equal(
    (
      await api(`/api/staff/queues/${q.id}`, {
        token,
        method: "DELETE",
        body: { version: q.version },
      })
    ).status,
    200,
  );
});
test("history search treats SQL wildcard characters literally", (t) => {
  const f = fixture(t);
  f.join();
  assert.equal(f.store.history(f.staff, { search: "%" }).total, 0);
  assert.equal(f.store.history(f.staff, { search: "AC-001" }).total, 1);
});
