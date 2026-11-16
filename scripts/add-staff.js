import { Store } from "../server/store.js";
import { hashPassword } from "../server/auth.js";
const [email, name] = process.argv.slice(2);
const password = process.env.QUEUEFLOW_STAFF_PASSWORD;
if (
  !email ||
  !name ||
  !password ||
  password.length < 10 ||
  password.length > 128 ||
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
) {
  console.error(
    'Set QUEUEFLOW_STAFF_PASSWORD to a private 10–128 character password, then run npm run staff:add -- email "Full name".',
  );
  process.exit(1);
}
const store = new Store(process.env.DATABASE_PATH || "./data/queueflow.sqlite");
try {
  store.addUser(
    "campus",
    name.trim().slice(0, 60),
    email.trim().toLowerCase(),
    await hashPassword(password),
    "staff",
  );
  console.log("Staff account created. Sign in through the staff portal.");
} finally {
  store.close();
}
