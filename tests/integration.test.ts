import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
const origin = process.env.TEST_ORIGIN ?? "http://127.0.0.1:8787";
let cookie = "";
const secrets = Object.fromEntries(
  fs
    .readFileSync(".dev.vars", "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
const tokenA = randomUUID() + randomUUID(),
  tokenUnverified = randomUUID() + randomUUID();
async function tool(name: string, body: unknown = {}, token = tokenA) {
  const response = await fetch(origin + "/api/tools/" + name, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tools-Key": secrets.TOOLS_SECRET,
      "X-Session-Token": token,
    },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    data: (await response.json()) as {
      error?: string;
      data: {
        appointments?: { id: string }[];
        slots?: { local_time: string; slot_id: string }[];
        operation_id?: string;
        appointment_id?: string;
        status?: string;
      };
    },
  };
}
let dashboard: { today: string; patients: { id: string }[] };
async function request(path: string, body?: unknown, auth = true) {
  const r = await fetch(origin + "/api" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(origin.includes("127.0.0.1")
        ? { "CF-Connecting-IP": "integration-" + tokenA.slice(0, 12) }
        : {}),
      ...(auth ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: r.status,
    data: (await r.json()) as Record<string, unknown>,
    response: r,
  };
}
function futureDay() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 25);
  while (d.getUTCDay() !== 2) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
beforeAll(async () => {
  const password = fs
    .readFileSync(".secrets/admin-password.txt", "utf8")
    .trim();
  const r = await request("/auth/login", { password }, false);
  expect(r.status).toBe(200);
  cookie = r.response.headers.get("set-cookie")!.split(";")[0];
  dashboard = (await request("/dashboard")).data as unknown as typeof dashboard;
  if (origin.includes("127.0.0.1")) {
    const expires = new Date(Date.now() + 1800000).toISOString();
    fs.writeFileSync(
      ".secrets/test-sessions.sql",
      [
        [tokenA, 1],
        [tokenUnverified, 0],
      ]
        .map(
          ([token, verified], i) =>
            `INSERT OR REPLACE INTO voice_sessions(id,token_hash,patient_id,verified,expires_at) VALUES('integration-session-${i}','${createHash("sha256").update(String(token)).digest("hex")}','patient-1',${verified},'${expires}');`,
        )
        .join("\n"),
      { mode: 0o600 },
    );
    execFileSync(
      "npx",
      [
        "wrangler",
        "d1",
        "execute",
        "sonrisa-demo",
        "--local",
        "--file",
        ".secrets/test-sessions.sql",
      ],
      { stdio: "pipe" },
    );
  }
});
describe("Clinic API integration", () => {
  it("protects patient data without authentication", async () => {
    expect((await request("/dashboard", undefined, false)).status).toBe(401);
    expect(
      (await request("/voice/session", { patient_id: "patient-1" }, false))
        .status,
    ).toBe(401);
  });
  it("serves seeded synthetic data from D1", async () => {
    const r = await request("/dashboard");
    expect(r.status).toBe(200);
    expect((r.data.patients as unknown[]).length).toBeGreaterThanOrEqual(20);
    expect((r.data.knowledge as unknown[]).length).toBeGreaterThanOrEqual(8);
    expect(r.data.environment).toBe("demo");
  });
  it("rejects cross-origin writes", async () => {
    const r = await fetch(origin + "/api/patients", {
      method: "POST",
      headers: {
        cookie,
        Origin: "https://attacker.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "No autorizado", phone: "+528100000000" }),
    });
    expect(r.status).toBe(403);
  });
  it("does not expose secrets in dashboard payload", async () => {
    const r = await request("/dashboard");
    const text = JSON.stringify(r.data);
    expect(text).not.toContain("sk_");
    expect(text).not.toContain("token_hash");
    expect(text).not.toContain("encrypted_value");
  });
  it("enforces service and provider compatibility", async () => {
    const r = await request("/appointments/prepare", {
      action: "create",
      patient_id: "patient-1",
      service_id: "ortodoncia",
      provider_id: "ana",
      starts_at: futureDay() + "T16:00:00.000Z",
      chair: 1,
    });
    expect(r.status).toBe(400);
  });
  it("denies unauthenticated server tools", async () => {
    expect((await request("/tools/get_my_appointments", {})).status).toBe(401);
  });
  it("checks verified identity on server tools, not model assertions", async () => {
    expect(
      (await tool("get_my_appointments", {}, tokenUnverified)).status,
    ).toBe(403);
    expect(
      (await tool("get_my_appointments", {}, "invented-session")).status,
    ).toBe(403);
    const own = await tool("get_my_appointments");
    expect(own.status).toBe(200);
    expect(own.data.data.appointments?.length).toBeGreaterThan(0);
  });
  it("denies modifying another patient through agent tools", async () => {
    const d = await request("/dashboard");
    const foreign = (
      d.data.appointments as {
        id: string;
        patient_id: string;
        status: string;
      }[]
    ).find((a) => a.patient_id === "patient-2" && a.status === "booked")!;
    expect(
      (
        await tool("prepare_appointment_change", {
          action: "cancel",
          appointment_id: foreign.id,
          patient_id: "patient-2",
        })
      ).status,
    ).toBe(404);
  });
  it("returns explicit clinic time so the agent never has to read UTC aloud", async () => {
    const r = await tool("search_availability", {
      service_id: "valoracion",
      date: futureDay(),
      provider_id: "ana",
      from_time: "09:00",
    });
    expect(r.status).toBe(200);
    expect(r.data.data.slots?.[0].local_time).toBe("09:00");
    expect(r.data.data.slots?.[0]).not.toHaveProperty("starts_at");
    expect(r.data.data.slots?.[0]).toHaveProperty("slot_id");
  });
  it("does not offer appointments on Sunday", async () => {
    const d = new Date(futureDay() + "T12:00:00Z");
    while (d.getUTCDay() !== 0) d.setUTCDate(d.getUTCDate() + 1);
    const r = await request(
      "/availability?service_id=valoracion&date=" +
        d.toISOString().slice(0, 10),
    );
    expect(r.status).toBe(200);
    expect(r.data.slots).toEqual([]);
  });
  it("prepares and commits an opaque slot for the authorized patient and recovers a repeated preparation", async () => {
    const available = await tool("search_availability", {
      service_id: "valoracion",
      date: futureDay(),
      provider_id: "ana",
    });
    const slot = available.data.data.slots?.[0];
    expect(slot).toBeDefined();
    const prepared = await tool("prepare_appointment_change", {
      action: "create",
      slot_id: slot!.slot_id,
      patient_id: "patient-2",
    });
    expect(prepared.status).toBe(200);
    const recovered = await tool("prepare_appointment_change", {
      action: "create",
      slot_id: slot!.slot_id,
    });
    expect(recovered.data.data.operation_id).toBe(
      prepared.data.data.operation_id,
    );
    const confirmed = await tool("commit_appointment_change");
    expect(confirmed.status).toBe(200);
    expect(confirmed.data.data.status).toBe("booked");
    const d = await request("/dashboard");
    const appointment = (
      d.data.appointments as { id: string; patient_id: string }[]
    ).find((a) => a.id === confirmed.data.data.appointment_id);
    expect(appointment?.patient_id).toBe("patient-1");
    const cancel = await tool("prepare_appointment_change", {
      action: "cancel",
      appointment_id: confirmed.data.data.appointment_id,
    });
    expect(cancel.status).toBe(200);
    expect(
      (
        await tool("commit_appointment_change")
      ).data.data.status,
    ).toBe("cancelled");
  });
  it("keeps reservations and moves atomic, rejects duplicate holds and retries idempotently", async () => {
    const r = await request(
      "/availability?service_id=valoracion&date=" + futureDay(),
    );
    expect(r.status).toBe(200);
    const slots = r.data.slots as {
      starts_at: string;
      provider_id: string;
      chair: number;
    }[];
    expect(slots.length).toBeGreaterThan(3);
    const input = {
      action: "create",
      patient_id: "patient-1",
      service_id: "valoracion",
      ...slots[0],
    };
    const attempts = await Promise.all([
      request("/appointments/prepare", input),
      request("/appointments/prepare", input),
    ]);
    expect(attempts.some((a) => a.status === 200)).toBe(true);
    expect(attempts.every((a) => a.status === 200 || a.status === 409)).toBe(
      true,
    );
    if (attempts.every((a) => a.status === 200))
      expect(attempts[0].data.operation_id).toBe(attempts[1].data.operation_id);
    const prepared = attempts.find((a) => a.status === 200)!;
    const committed = await request("/appointments/commit", {
      operation_id: prepared.data.operation_id,
    });
    expect(committed.status).toBe(200);
    const retry = await request("/appointments/commit", {
      operation_id: prepared.data.operation_id,
    });
    expect(retry.data.appointment_id).toBe(committed.data.appointment_id);
    let d = await request("/dashboard");
    let a = (
      d.data.appointments as { id: string; starts_at: string; status: string }[]
    ).find((a) => a.id === committed.data.appointment_id)!;
    expect(a.starts_at).toBe(slots[0].starts_at);
    const next = (
      await request("/availability?service_id=valoracion&date=" + futureDay())
    ).data.slots as typeof slots;
    const moved = await request("/appointments/prepare", {
      action: "move",
      appointment_id: a.id,
      service_id: "valoracion",
      ...next[next.length - 1],
    });
    expect(moved.status).toBe(200);
    d = await request("/dashboard");
    expect(
      (d.data.appointments as (typeof a)[]).find((x) => x.id === a.id)
        ?.starts_at,
    ).toBe(slots[0].starts_at);
    expect(
      (
        await request("/appointments/commit", {
          operation_id: moved.data.operation_id,
        })
      ).status,
    ).toBe(200);
    d = await request("/dashboard");
    a = (d.data.appointments as (typeof a)[]).find((x) => x.id === a.id)!;
    expect(a.starts_at).toBe(next[next.length - 1].starts_at);
    const cancelled = await request("/appointments/prepare", {
      action: "cancel",
      appointment_id: a.id,
    });
    expect(cancelled.status).toBe(200);
    expect(
      (
        await request("/appointments/commit", {
          operation_id: cancelled.data.operation_id,
        })
      ).status,
    ).toBe(200);
    d = await request("/dashboard");
    expect(
      (d.data.appointments as (typeof a)[]).find((x) => x.id === a.id)?.status,
    ).toBe("cancelled");
  });
  it("returns a useful error for an operation belonging to another session", async () => {
    const r = await request("/appointments/commit", {
      operation_id: crypto.randomUUID(),
    });
    expect(r.status).toBe(404);
  });
});
