import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import express from "express";
import { Server } from "socket.io";
import { Store } from "./store.js";
import { loadSecret } from "./auth.js";
import { createApp } from "./app.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const database =
  process.env.DATABASE_PATH || path.join(root, "data", "queueflow.sqlite");
const store = new Store(database);
const dev = process.argv.includes("--dev");
const { app, auth } = createApp({
  store,
  secret: loadSecret(database),
  allowDemo: process.env.ALLOW_DEMO !== "false",
  showcaseOnly: process.env.SHOWCASE_ONLY === "true",
  trustProxy: process.env.TRUST_PROXY === "1" ? 1 : false,
  dev,
});
const server = createServer(app);
const io = new Server(server, { serveClient: false, maxHttpBufferSize: 16000 });
io.use((socket, next) => {
  try {
    socket.data.session = auth.decode(socket.handshake.auth?.token);
    next();
  } catch {
    next(new Error("Please sign in again."));
  }
});
io.on("connection", (socket) => {
  socket.join(socket.data.session.user.workspace_id);
  const expiry = setInterval(() => {
    try {
      auth.decode(socket.handshake.auth?.token);
    } catch {
      socket.disconnect(true);
    }
  }, 60000);
  expiry.unref();
  socket.on("disconnect", () => clearInterval(expiry));
});
store.on("change", ({ workspaceId }) =>
  io.to(workspaceId).emit("queue:changed", { changed: true }),
);
let vite;
if (dev) {
  const { createServer: createVite } = await import("vite");
  vite = await createVite({
    root,
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  app.use(
    express.static(path.join(root, "dist"), { index: false, maxAge: "1h" }),
  );
  app.get("/{*path}", (req, res) =>
    res.sendFile(path.join(root, "dist", "index.html")),
  );
}
const port = Number(process.env.PORT || 3100);
const host = process.env.HOST || "127.0.0.1";
server.listen(port, host, () =>
  console.log(
    `QueueFlow ready at http://${host === "0.0.0.0" ? "localhost" : host}:${port}\n${dev ? "Development" : "Production"} · Node ${process.version} · ${os.platform()} · SQLite`,
  ),
);
function close() {
  io.close();
  server.close(async () => {
    await vite?.close();
    store.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on("SIGTERM", close);
process.on("SIGINT", close);
