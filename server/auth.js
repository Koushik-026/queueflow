import {
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import jwt from "jsonwebtoken";
import { insist } from "./store.js";

const scrypt = promisify(scryptCallback);
export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64);
  return `${salt}:${hash.toString("hex")}`;
}
export async function verifyPassword(password, record) {
  // An absent account still performs the expensive password operation.
  const [salt, hex] = (record || `${"0".repeat(32)}:${"0".repeat(128)}`).split(
    ":",
  );
  const hash = await scrypt(password, salt, 64);
  const expected = Buffer.from(hex, "hex");
  return (
    hash.length === expected.length &&
    timingSafeEqual(hash, expected) &&
    Boolean(record)
  );
}
export function loadSecret(databasePath) {
  if (process.env.JWT_SECRET) {
    insist(
      process.env.JWT_SECRET.length >= 32,
      500,
      "JWT_SECRET must be at least 32 characters.",
    );
    return process.env.JWT_SECRET;
  }
  const file = path.join(
    path.dirname(path.resolve(databasePath)),
    ".signing-key",
  );
  mkdirSync(path.dirname(file), { recursive: true });
  if (!existsSync(file))
    writeFileSync(file, randomBytes(48).toString("base64url"), {
      mode: 0o600,
      flag: "wx",
    });
  return readFileSync(file, "utf8").trim();
}
export function authentication(store, secret) {
  function issue(user) {
    const id = randomUUID();
    const seconds = Math.floor(store.clock() / 1000);
    store.run(
      "INSERT INTO sessions VALUES(?,?,?)",
      id,
      user.id,
      store.clock() + 12 * 3600000,
    );
    return {
      token: jwt.sign(
        { sub: user.id, jti: id, iat: seconds, exp: seconds + 12 * 3600 },
        secret,
        { algorithm: "HS256", issuer: "queueflow", audience: "queueflow-web" },
      ),
      user,
    };
  }
  function decode(token) {
    try {
      const claims = jwt.verify(token, secret, {
        algorithms: ["HS256"],
        issuer: "queueflow",
        audience: "queueflow-web",
        clockTimestamp: Math.floor(store.clock() / 1000),
      });
      const session = store.get(
        "SELECT * FROM sessions WHERE id=? AND user_id=? AND expires_at>?",
        claims.jti,
        claims.sub,
        store.clock(),
      );
      insist(
        session,
        401,
        "Your session ended. Please sign in again.",
        "SESSION_EXPIRED",
      );
      const user = store.user(claims.sub);
      insist(user, 401, "Please sign in again.");
      store.workspace(user.workspace_id);
      return { user, sessionId: claims.jti };
    } catch (e) {
      if (e.status) throw e;
      insist(
        false,
        401,
        "Your session ended. Please sign in again.",
        "SESSION_EXPIRED",
      );
    }
  }
  function middleware(req, res, next) {
    try {
      const header = req.get("authorization") || "";
      insist(
        header.startsWith("Bearer "),
        401,
        "Sign in to continue.",
        "SIGN_IN_REQUIRED",
      );
      const session = decode(header.slice(7));
      req.actor = session.user;
      req.sessionId = session.sessionId;
      next();
    } catch (e) {
      next(e);
    }
  }
  return { issue, decode, middleware };
}
