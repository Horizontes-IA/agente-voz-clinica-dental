import fs from "node:fs";
import { randomBytes } from "node:crypto";
if (fs.existsSync(".dev.vars")) {
  console.log(".dev.vars ya existe. No se modificó ningún secreto.");
  process.exit(0);
}
fs.mkdirSync(".secrets", { recursive: true });
const secrets = {
  ADMIN_PASSWORD: randomBytes(18).toString("base64url"),
  SESSION_SECRET: randomBytes(48).toString("base64url"),
  ENCRYPTION_KEY: randomBytes(32).toString("hex"),
  TOOLS_SECRET: randomBytes(48).toString("base64url"),
  ...(process.env.ELEVENLABS_API_KEY
    ? { ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY }
    : {}),
};
fs.writeFileSync(
  ".dev.vars",
  Object.entries(secrets)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n") + "\n",
  { mode: 0o600 },
);
fs.writeFileSync(".secrets/worker-secrets.json", JSON.stringify(secrets), {
  mode: 0o600,
});
fs.writeFileSync(".secrets/admin-password.txt", secrets.ADMIN_PASSWORD + "\n", {
  mode: 0o600,
});
console.log(
  "Secretos creados. La contraseña está en .secrets/admin-password.txt; ningún valor se imprimió.",
);
