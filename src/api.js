export async function request(
  path,
  { token, method = "GET", body, key, blob = false } = {},
) {
  let response;
  try {
    response = await fetch(path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw Object.assign(
      new Error(
        "We couldn’t reach the server. Your last saved visit is safe. Check your connection and retry.",
      ),
      { network: true },
    );
  }
  if (!response.ok) {
    let data;
    try {
      data = await response.json();
    } catch {
      data = {};
    }
    throw Object.assign(
      new Error(
        data.message || "This request could not be completed. Please retry.",
      ),
      { status: response.status, code: data.code },
    );
  }
  return blob ? response.blob() : response.json();
}
export function readSession(key) {
  try {
    return JSON.parse(sessionStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}
export const estimate = (e) => (e ? `${e.low}–${e.high} min` : "On hold");
export const dateTime = (ms) =>
  ms
    ? new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "Asia/Kolkata",
      }).format(ms)
    : "—";
