const enc = new TextEncoder();
export async function digest(text: string) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text))),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function equal(a: string, b: string) {
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (value: string) =>
  Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
export async function seal(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret).slice(0, 32),
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(value),
  );
  return b64(iv) + "." + b64(new Uint8Array(data));
}
export async function unseal(value: string, secret: string) {
  const [iv, data] = value.split(".");
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret).slice(0, 32),
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64(iv) },
      key,
      unb64(data),
    ),
  );
}
export async function signature(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return Array.from(
    new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(value))),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function issueCookie(secret: string) {
  const body = `admin.${Date.now() + 12 * 3600_000}.${crypto.randomUUID()}`;
  return body + "." + (await signature(body, secret));
}
export async function validCookie(value: string | undefined, secret: string) {
  if (!value) return false;
  const parts = value.split(".");
  if (
    parts.length !== 4 ||
    parts[0] !== "admin" ||
    Number(parts[1]) < Date.now()
  )
    return false;
  return equal(parts[3], await signature(parts.slice(0, 3).join("."), secret));
}
export async function rateLimit(
  db: D1Database,
  key: string,
  limit: number,
  seconds: number,
) {
  const now = Math.floor(Date.now() / 1000);
  const row = await db
    .prepare(
      "INSERT INTO rate_limits(key,count,resets_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN resets_at<? THEN 1 ELSE count+1 END,resets_at=CASE WHEN resets_at<? THEN excluded.resets_at ELSE resets_at END RETURNING count",
    )
    .bind(key, now + seconds, now, now)
    .first<{ count: number }>();
  return (row?.count ?? limit + 1) <= limit;
}
