import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
const bundledRuntime =
  "C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1112-737-0_26.1112.737.0_x64__3k8sg7r9htsxt/dependencies/node/package.json";
const runtime =
  process.env.PLAYWRIGHT_MODULE_PATH ||
  (fs.existsSync(path.join(path.dirname(bundledRuntime), "node_modules/playwright/package.json"))
    ? bundledRuntime
    : import.meta.url);
const { chromium } = createRequire(runtime)("playwright");
const executable = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((p) => fs.existsSync(p));
const base = process.env.QUEUEFLOW_TEST_URL || "http://127.0.0.1:3100";
const out = path.resolve("output/browser");
fs.mkdirSync(out, { recursive: true });
const checks = [],
  errors = [];
const check = (value, label) => {
  assert.ok(value, label);
  checks.push(label);
  console.log("PASS", label);
};
const browser = await chromium.launch({
  headless: true,
  ...(executable ? { executablePath: executable } : {}),
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
  acceptDownloads: true,
  reducedMotion: "reduce",
});
const page = await context.newPage();
function observe(p) {
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => {
    if (m.type() === "error" && !/401|409|400/.test(m.text()))
      errors.push(m.text());
  });
}
observe(page);
async function dismiss(p) {
  const b = p.getByRole("button", { name: "Dismiss message" });
  if (await b.isVisible()) await b.click();
}
async function openNav(p, name) {
  const button = p.getByRole("button", { name: "Toggle navigation" });
  if (
    (await button.isVisible()) &&
    (await button.getAttribute("aria-expanded")) === "false"
  )
    await button.click();
  await p
    .getByRole("navigation")
    .getByRole("button", { name: new RegExp("^" + name + "(?:\\s*\\d+)?$") })
    .click();
}
try {
  await page.goto(base);
  await page.getByRole("heading", { name: "Where are you headed?" }).waitFor();
  check(
    (await page.locator(".service-card").count()) === 4,
    "all four live service cards render",
  );
  await page.screenshot({
    path: path.join(out, "01-home-desktop.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Try the live demo" }).click();
  await page
    .getByRole("button", { name: "Student view", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Close walkthrough" }).click();
  await dismiss(page);
  check(
    (await page.locator(".service-card").count()) === 4,
    "practice mode loads populated services",
  );
  check(
    (await page.locator(".service-card").first().innerText()).includes("5"),
    "practice academic queue has five waiting visitors",
  );
  await page
    .locator(".service-card")
    .filter({ hasText: "Library services" })
    .getByRole("button", { name: "View service" })
    .click();
  await page.getByRole("dialog").waitFor();
  check(
    await page.getByRole("button", { name: "Get my token" }).isDisabled(),
    "paused service clearly disables joining",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .locator(".service-card")
    .filter({ hasText: "Academic office" })
    .getByRole("button", { name: "View service" })
    .click();
  check(
    (await page.getByRole("dialog").innerText()).includes("College ID"),
    "service details explain required documents",
  );
  await page
    .getByLabel("What can we help with?")
    .fill("A bonafide certificate");
  await page.getByRole("button", { name: "Get my token" }).click();
  await page.locator(".live-ticket h2").filter({ hasText: "AC-048" }).waitFor();
  check(
    (await page.locator(".ticket-stats").innerText()).includes("#7"),
    "joining produces the correct token and queue position",
  );
  await dismiss(page);
  await page.screenshot({
    path: path.join(out, "02-my-visit-desktop.png"),
    fullPage: true,
  });
  await page.reload();
  await page.locator(".live-ticket h2").filter({ hasText: "AC-048" }).waitFor();
  check(true, "visit and session survive a browser refresh");
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Second tab" }).click();
  const staff = await popupPromise;
  observe(staff);
  await staff
    .getByRole("button", { name: "Complete visit", exact: true })
    .waitFor();
  if (
    await staff.getByRole("button", { name: "Close walkthrough" }).isVisible()
  )
    await staff.getByRole("button", { name: "Close walkthrough" }).click();
  check(
    (await staff.locator(".current-token").innerText()).includes("AC-042"),
    "second tab opens staff view in the same workspace",
  );
  await staff
    .getByLabel("YOUR SERVICE")
    .selectOption({ label: "IT help desk" });
  await staff.locator(".current-token").filter({ hasText: "IT-042" }).waitFor();
  await staff
    .getByLabel("YOUR SERVICE")
    .selectOption({ label: "Academic office" });
  await staff.locator(".current-token").filter({ hasText: "AC-042" }).waitFor();
  check(
    true,
    "staff service dropdown switches the counter and visitor correctly",
  );
  await staff.screenshot({
    path: path.join(out, "03-staff-desktop.png"),
    fullPage: true,
  });
  await staff
    .getByRole("button", { name: "Complete visit", exact: true })
    .click();
  await staff
    .getByRole("button", { name: "Call next visitor", exact: true })
    .waitFor();
  await page
    .locator(".ticket-stats strong")
    .filter({ hasText: "#6" })
    .waitFor({ timeout: 7000 });
  check(true, "staff completion updates the student position live across tabs");
  await dismiss(staff);
  await staff
    .getByRole("button", { name: "Call next visitor", exact: true })
    .click();
  await staff.locator(".current-token").filter({ hasText: "AC-043" }).waitFor();
  check(
    await staff.getByRole("button", { name: /Missed\? Wait/ }).isDisabled(),
    "arrival grace countdown prevents an immediate missed-turn action",
  );
  await staff
    .getByRole("button", { name: "Mark as missed", exact: true })
    .waitFor({ timeout: 22000 });
  check(
    await staff
      .getByRole("button", { name: "Mark as missed", exact: true })
      .isEnabled(),
    "arrival countdown enables the missed-turn action at the correct time",
  );
  await staff
    .getByRole("button", { name: "Mark as missed", exact: true })
    .click();
  await staff
    .getByRole("button", { name: "Call next visitor", exact: true })
    .waitFor();
  check(
    true,
    "marking a missed visitor frees the counter without auto-calling another",
  );
  await dismiss(staff);
  await staff
    .getByRole("button", { name: "Call next visitor", exact: true })
    .click();
  await staff
    .getByRole("button", { name: "Start visit", exact: true })
    .waitFor();
  await dismiss(staff);
  await staff.getByRole("button", { name: "Start visit", exact: true }).click();
  await staff
    .getByRole("button", { name: "Complete visit", exact: true })
    .waitFor();
  await dismiss(staff);
  await staff
    .getByRole("button", { name: "Complete visit", exact: true })
    .click();
  await staff
    .getByRole("button", { name: "Call next visitor", exact: true })
    .waitFor();
  check(true, "call → start → complete works from visible staff controls");
  await dismiss(staff);
  await openNav(staff, "Visit history");
  await staff.locator(".history-panel tbody tr").first().waitFor();
  await staff
    .getByRole("combobox", { name: "Filter by status" })
    .selectOption("completed");
  await staff.waitForFunction(
    () =>
      [...document.querySelectorAll(".history-panel tbody .status")].length >
        0 &&
      [...document.querySelectorAll(".history-panel tbody .status")].every(
        (e) => e.textContent.includes("Completed"),
      ),
  );
  check(true, "history status dropdown filters actual records");
  const downloadPromise = staff.waitForEvent("download");
  await staff.getByRole("button", { name: "Export all visits" }).click();
  const download = await downloadPromise;
  const csv = fs.readFileSync(await download.path(), "utf8");
  check(
    csv.includes("AC-048") && csv.includes("Alex Morgan"),
    "staff CSV export contains the workspace visit records",
  );
  await openNav(staff, "Manage services");
  await staff.getByRole("button", { name: "Add service", exact: true }).click();
  await staff
    .getByLabel("Service name", { exact: true })
    .fill("Student support");
  await staff.getByLabel("Token prefix", { exact: false }).fill("SS");
  await staff.getByLabel("Counter location").fill("Block B · Counter 05");
  await staff
    .getByLabel("What this service helps with")
    .fill("General support for student questions.");
  await staff
    .getByRole("button", { name: "Save service", exact: true })
    .click();
  await staff
    .locator(".manage-card")
    .filter({ hasText: "Student support" })
    .waitFor();
  check(true, "staff can create a service through the form");
  const card = staff
    .locator(".manage-card")
    .filter({ hasText: "Student support" });
  await dismiss(staff);
  await card.getByRole("button", { name: "Edit details" }).click();
  await staff.getByLabel("Counter location").fill("Block B · Counter 06");
  await staff
    .getByRole("button", { name: "Save service", exact: true })
    .click();
  await staff.getByRole("dialog").waitFor({ state: "hidden" });
  check(
    (await card.innerText()).includes("Counter 06"),
    "service edits persist and refresh the directory",
  );
  await dismiss(staff);
  await card.getByRole("button", { name: "Pause", exact: true }).click();
  await card.locator(".status.paused").waitFor();
  await page.goto(base);
  await page
    .locator(".service-card")
    .filter({ hasText: "Student support" })
    .locator(".status.paused")
    .waitFor();
  check(true, "service pause reaches the student directory");
  await dismiss(staff);
  await card.getByRole("button", { name: "Close joins", exact: true }).click();
  await card.locator(".status.closed").waitFor();
  await dismiss(staff);
  await card
    .getByRole("button", { name: "Archive Student support", exact: true })
    .click();
  await staff
    .getByRole("dialog")
    .getByRole("button", { name: "Archive service", exact: true })
    .click();
  await card.waitFor({ state: "hidden" });
  check(true, "a closed empty service can be archived");
  await openNav(page, "My visit");
  await page.locator(".live-ticket h2").waitFor();
  await page.getByRole("button", { name: "Leave queue", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Keep my place" })
    .click();
  check(
    await page.locator(".live-ticket h2").isVisible(),
    "cancellation confirmation can preserve the current visit",
  );
  await page.getByRole("button", { name: "Leave queue", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Leave queue", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "No active visit, no waiting around." })
    .waitFor();
  check(true, "confirmed cancellation removes the active token");
  await dismiss(page);
  await openNav(page, "Visit history");
  await page.locator(".history-panel tbody tr").waitFor();
  check(
    (await page.locator(".history-panel").innerText()).includes("Cancelled"),
    "student history retains cancelled visits",
  );
  check(
    !(await page.locator(".history-panel").innerText()).includes("Riya Shah"),
    "student history excludes other visitors",
  );
  await openNav(staff, "Counter display");
  await staff.locator(".display-card").first().waitFor();
  check(
    !(await staff.locator(".display-grid").innerText()).includes("Riya Shah"),
    "counter display contains tokens rather than visitor names",
  );
  await staff.reload();
  await staff.locator(".display-card").first().waitFor();
  check(
    await staff
      .getByRole("navigation")
      .getByRole("button", { name: "Service desk", exact: true })
      .isVisible(),
    "refreshing the counter display preserves the staff role in that tab",
  );
  await dismiss(staff);
  await staff.screenshot({
    path: path.join(out, "04-counter-display.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base);
  await page.locator(".service-card").first().waitFor();
  check(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "390px student home has no horizontal overflow",
  );
  await page.screenshot({
    path: path.join(out, "05-home-mobile.png"),
    fullPage: true,
  });
  await openNav(page, "My visit");
  check(
    await page
      .getByRole("heading", { name: "No active visit, no waiting around." })
      .isVisible(),
    "mobile navigation opens My visit",
  );
  await staff.setViewportSize({ width: 390, height: 844 });
  await openNav(staff, "Service desk");
  await staff.locator(".current-visitor").waitFor();
  check(
    await staff.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "390px staff desk has no horizontal overflow",
  );
  await staff.screenshot({
    path: path.join(out, "06-staff-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Open account" }).click();
  await page.getByRole("button", { name: "Reset practice visits" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Reset practice", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  check(
    true,
    "student practice controls can reset via the scoped demo staff session",
  );
  await page.goto(base);
  await page.locator(".service-card").first().waitFor();
  await dismiss(page);
  check(
    (await page.locator(".service-card").first().innerText()).includes("5"),
    "reset restores the prepared queue",
  );
  check(
    (await page.locator(".service-card").count()) === 4,
    "reset keeps the archived custom service out of the directory",
  );
  check(errors.length === 0, "no uncaught browser or asset errors");
  fs.writeFileSync(
    path.join(out, "validation.json"),
    JSON.stringify(
      { checks: checks.length, passed: checks, errors, base },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ checks: checks.length, errors }));
} catch (e) {
  await page
    .screenshot({ path: path.join(out, "failure.png"), fullPage: true })
    .catch(() => {});
  fs.writeFileSync(
    path.join(out, "failure.json"),
    JSON.stringify({ checks, errors, error: e.stack }, null, 2),
  );
  throw e;
} finally {
  await browser.close();
}
