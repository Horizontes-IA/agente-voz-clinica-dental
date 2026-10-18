import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { z } from "zod";
import { bodyLimit } from "hono/body-limit";
import { formatInTimeZone } from "date-fns-tz";
import {
  seed,
  activity,
  appointmentQuery,
  getSettings,
  putSettings,
  today,
  now,
  ZONE,
  type AgentSettings,
  type Appointment,
  type Patient,
  type Knowledge,
} from "./data";
import {
  equal,
  issueCookie,
  validCookie,
  rateLimit,
  digest,
  seal,
  signature,
} from "./security";
import {
  availability,
  prepare,
  commit,
  BusinessError,
  localDateFields,
} from "./booking";
import { apiKey, eleven, publish } from "./eleven";

const app = new Hono<{ Bindings: Env; Variables: { actor: string } }>();
app.use(
  "/api/*",
  bodyLimit({
    maxSize: 500_000,
    onError: (c) => c.json({ error: "Solicitud demasiado grande" }, 413),
  }),
);
const changeSchema = z.object({
  action: z.enum(["create", "move", "cancel"]),
  appointment_id: z.string().max(100).optional(),
  patient_id: z.string().max(100).optional(),
  service_id: z.string().max(100).optional(),
  provider_id: z.string().max(100).optional(),
  starts_at: z.string().max(50).optional(),
  chair: z.number().int().min(1).max(2).optional(),
});
app.use("/api/*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "same-origin");
  if (Number(c.req.header("Content-Length") ?? 0) > 300_000)
    return c.json({ error: "Solicitud demasiado grande" }, 413);
  if (
    ["POST", "PUT", "PATCH", "DELETE"].includes(c.req.method) &&
    !c.req.path.startsWith("/api/tools/") &&
    !c.req.path.startsWith("/api/webhooks/")
  ) {
    const origin = c.req.header("Origin");
    const url = new URL(c.req.url);
    if (
      origin &&
      new URL(origin).host !== url.host &&
      !(
        ["127.0.0.1:8787", "localhost:8787"].includes(url.host) &&
        ["127.0.0.1:5173", "localhost:5173"].includes(new URL(origin).host)
      )
    )
      return c.json({ error: "Origen no permitido" }, 403);
  }
  const publicRoutes = ["/api/auth/login", "/api/auth/me", "/api/health"];
  if (
    !publicRoutes.includes(c.req.path) &&
    !c.req.path.startsWith("/api/tools/") &&
    !c.req.path.startsWith("/api/webhooks/")
  ) {
    if (
      !(await validCookie(getCookie(c, "clinic_session"), c.env.SESSION_SECRET))
    )
      return c.json({ error: "Inicia sesión para continuar" }, 401);
    c.set("actor", "admin");
  }
  await next();
});
app.get("/api/health", (c) => c.json({ ok: true, environment: c.env.APP_ENV }));
app.get("/api/auth/me", async (c) =>
  c.json({
    authenticated: await validCookie(
      getCookie(c, "clinic_session"),
      c.env.SESSION_SECRET,
    ),
  }),
);
app.post("/api/auth/login", async (c) => {
  if (
    !(await rateLimit(
      c.env.DB,
      "login:" + (c.req.header("CF-Connecting-IP") ?? "local"),
      10,
      900,
    ))
  )
    return c.json({ error: "Demasiados intentos. Intenta más tarde." }, 429);
  const { password } = z
    .object({ password: z.string().min(1).max(200) })
    .parse(await c.req.json());
  if (!(await equal(password, c.env.ADMIN_PASSWORD)))
    return c.json({ error: "La contraseña no es correcta" }, 401);
  setCookie(c, "clinic_session", await issueCookie(c.env.SESSION_SECRET), {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Strict",
    path: "/",
    maxAge: 12 * 3600,
  });
  await seed(c.env.DB);
  return c.json({ ok: true });
});
app.post("/api/auth/logout", (c) => {
  deleteCookie(c, "clinic_session", { path: "/" });
  return c.json({ ok: true });
});
app.get("/api/dashboard", async (c) => {
  const db = c.env.DB;
  const results = await db.batch([
    db.prepare(`${appointmentQuery} ORDER BY a.starts_at LIMIT 250`),
    db.prepare("SELECT * FROM patients ORDER BY name"),
    db.prepare("SELECT * FROM providers"),
    db.prepare("SELECT * FROM services"),
    db.prepare(
      "SELECT * FROM conversations ORDER BY started_at DESC LIMIT 100",
    ),
    db.prepare(
      "SELECT * FROM activities ORDER BY created_at DESC,rowid DESC LIMIT 50",
    ),
    db.prepare("SELECT * FROM knowledge_documents ORDER BY id"),
    db.prepare(
      "SELECT r.*,p.name patient_name FROM staff_requests r LEFT JOIN patients p ON p.id=r.patient_id ORDER BY r.created_at DESC LIMIT 100",
    ),
    db.prepare("SELECT * FROM waitlist ORDER BY created_at DESC LIMIT 100"),
    db.prepare(
      "SELECT id,type,status,due_at,detail FROM notification_jobs ORDER BY due_at DESC LIMIT 50",
    ),
    db.prepare(
      "SELECT * FROM publication_jobs ORDER BY created_at DESC LIMIT 10",
    ),
  ]);
  const [
    appointments,
    patients,
    providers,
    services,
    conversations,
    activities,
    knowledge,
    requests,
    waitlist,
    notifications,
    publications,
  ] = results.map((r) => r.results);
  const settings = await getSettings(db),
    connected = !!(await apiKey(c.env));
  return c.json({
    appointments,
    patients,
    providers,
    services,
    conversations,
    activities,
    knowledge,
    requests,
    waitlist,
    notifications,
    publications,
    settings,
    integration: {
      connected,
      agent_id: settings.remote_agent_id,
      sms_connected: false,
    },
    today: today(),
    timezone: ZONE,
    environment: "demo",
  });
});
app.get("/api/availability", async (c) =>
  c.json({
    slots: await availability(
      c.env.DB,
      c.req.query("service_id") ?? "valoracion",
      c.req.query("date") ?? today(),
      c.req.query("provider_id"),
      c.req.query("appointment_id"),
    ),
  }),
);
app.post("/api/appointments/prepare", async (c) => {
  const input = changeSchema.parse(await c.req.json());
  let patientId = input.patient_id;
  if (input.action !== "create") {
    const row = await c.env.DB.prepare(
      "SELECT patient_id FROM appointments WHERE id=?",
    )
      .bind(input.appointment_id ?? "")
      .first<{ patient_id: string }>();
    patientId = row?.patient_id;
  }
  if (
    !patientId ||
    !(await c.env.DB.prepare("SELECT id FROM patients WHERE id=?")
      .bind(patientId)
      .first())
  )
    throw new BusinessError("PATIENT_NOT_FOUND", 404);
  return c.json(await prepare(c.env.DB, "staff-admin", patientId, input, true));
});
app.post("/api/appointments/commit", async (c) => {
  const { operation_id } = z
    .object({ operation_id: z.string().uuid() })
    .parse(await c.req.json());
  return c.json(await commit(c.env.DB, "staff-admin", operation_id));
});
app.patch("/api/appointments/:id", async (c) => {
  const { status } = z
    .object({
      status: z.enum(["confirmed", "checked_in", "completed", "no_show"]),
    })
    .parse(await c.req.json());
  const updated = await c.env.DB.prepare(
    "UPDATE appointments SET status=?,version=version+1 WHERE id=? AND status IN ('booked','confirmed','checked_in') RETURNING id",
  )
    .bind(status, c.req.param("id"))
    .first();
  if (!updated) throw new BusinessError("APPOINTMENT_NOT_FOUND", 404);
  await activity(c.env.DB, "appointment", "Estado de cita actualizado", status);
  return c.json({ ok: true });
});
app.post("/api/patients", async (c) => {
  const p = z
    .object({
      name: z.string().trim().min(3).max(100),
      phone: z
        .string()
        .trim()
        .regex(/^\+?[0-9 ()-]{8,22}$/),
      email: z.union([z.email(), z.literal("")]).optional(),
    })
    .parse(await c.req.json());
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO patients(id,name,phone,email,initials) VALUES(?,?,?,?,?)",
  )
    .bind(
      id,
      p.name,
      p.phone,
      p.email || null,
      p.name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((x) => x[0])
        .join(""),
    )
    .run();
  await activity(c.env.DB, "patient", "Paciente de prueba registrado", p.name);
  return c.json({ id });
});
app.patch("/api/requests/:id", async (c) => {
  const { status } = z
    .object({ status: z.enum(["open", "in_progress", "resolved"]) })
    .parse(await c.req.json());
  await c.env.DB.prepare("UPDATE staff_requests SET status=? WHERE id=?")
    .bind(status, c.req.param("id"))
    .run();
  return c.json({ ok: true });
});
app.put("/api/knowledge/:id", async (c) => {
  const d = z
    .object({
      title: z.string().trim().min(3).max(120),
      category: z.string().max(60),
      content: z.string().min(20).max(20000),
      version: z.number().int(),
    })
    .parse(await c.req.json());
  const [updated] = await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE knowledge_documents SET title=?,category=?,content=?,version=version+1,updated_at=datetime('now') WHERE id=? AND version=? RETURNING version",
    ).bind(d.title, d.category, d.content, c.req.param("id"), d.version),
    c.env.DB.prepare(
      "INSERT INTO knowledge_revisions(id,document_id,version,content) SELECT ?,id,version,content FROM knowledge_documents WHERE id=? AND version=? ON CONFLICT(document_id,version) DO NOTHING",
    ).bind(crypto.randomUUID(), c.req.param("id"), d.version + 1),
  ]);
  if (!updated.meta.changes)
    throw new BusinessError("El documento cambió. Recarga antes de guardar.");
  await activity(
    c.env.DB,
    "knowledge",
    "Conocimiento actualizado",
    d.title + " · borrador v" + (d.version + 1),
  );
  return c.json({ ok: true, version: d.version + 1 });
});
app.post("/api/knowledge", async (c) => {
  const d = z
    .object({
      title: z.string().trim().min(3).max(120),
      category: z.string().max(60),
      content: z.string().min(20).max(20000),
    })
    .parse(await c.req.json());
  const id = crypto.randomUUID();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO knowledge_documents(id,title,category,content) VALUES(?,?,?,?)",
    ).bind(id, d.title, d.category, d.content),
    c.env.DB.prepare(
      "INSERT INTO knowledge_revisions(id,document_id,version,content) VALUES(?,?,1,?)",
    ).bind(crypto.randomUUID(), id, d.content),
  ]);
  return c.json({ id });
});
app.get("/api/knowledge/:id/revisions", async (c) =>
  c.json(
    (
      await c.env.DB.prepare(
        "SELECT version,content,created_at FROM knowledge_revisions WHERE document_id=? ORDER BY version DESC",
      )
        .bind(c.req.param("id"))
        .all()
    ).results,
  ),
);
app.put("/api/agent", async (c) => {
  const s = z
    .object({
      name: z.string().trim().min(2).max(50),
      first_message: z.string().min(10).max(600),
      instructions: z.string().min(20).max(6000),
      voice_id: z.string().max(100),
      llm: z.enum(["gemini-2.5-flash", "gpt-4.1", "gpt-4.1-mini"]),
      active: z.boolean(),
      speed: z.number().min(0.7).max(1.2),
      max_duration: z.number().int().min(60).max(1200),
      version: z.number().int(),
    })
    .parse(await c.req.json());
  const current = await getSettings(c.env.DB);
  if (current.version !== s.version)
    throw new BusinessError(
      "La configuración cambió. Recarga antes de guardar.",
    );
  const updated = await c.env.DB.prepare(
    "UPDATE settings SET value=?,updated_at=datetime('now') WHERE key='agent' AND json_extract(value,'$.version')=? RETURNING key",
  )
    .bind(
      JSON.stringify({ ...current, ...s, version: current.version + 1 }),
      s.version,
    )
    .first();
  if (!updated)
    throw new BusinessError(
      "La configuración cambió. Recarga antes de guardar.",
    );
  await activity(
    c.env.DB,
    "settings",
    "Ajustes del agente guardados",
    "Borrador v" + (current.version + 1),
  );
  return c.json({ ok: true });
});
app.post("/api/integrations/elevenlabs", async (c) => {
  const { api_key } = z
    .object({ api_key: z.string().trim().min(20).max(300) })
    .parse(await c.req.json());
  await eleven(api_key, "/v1/convai/agents?page_size=1");
  await c.env.DB.prepare(
    "INSERT INTO integrations(name,encrypted_value) VALUES('elevenlabs',?) ON CONFLICT(name) DO UPDATE SET encrypted_value=excluded.encrypted_value,updated_at=datetime('now')",
  )
    .bind(await seal(api_key, c.env.ENCRYPTION_KEY))
    .run();
  await activity(
    c.env.DB,
    "integration",
    "ElevenLabs conectado",
    "Credencial verificada y cifrada.",
  );
  return c.json({ ok: true });
});
app.get("/api/voices", async (c) => {
  const key = await apiKey(c.env);
  if (!key)
    throw new BusinessError("Conecta ElevenLabs para consultar voces.", 400);
  const r = await eleven<{
    voices: {
      voice_id: string;
      name: string;
      labels: Record<string, string>;
      preview_url: string;
      sharing?: { live_moderation_enabled?: boolean };
    }[];
  }>(key, "/v1/voices");
  return c.json({
    voices: r.voices
      .filter((v) => !v.sharing?.live_moderation_enabled)
      .map((v) => ({
        id: v.voice_id,
        name: v.name,
        labels: v.labels,
        preview_url: v.preview_url,
      })),
  });
});
app.post("/api/agent/publish", async (c) =>
  c.json(await publish(c.env, new URL(c.req.url).origin)),
);
app.post("/api/voice/session", async (c) => {
  const { patient_id } = z
    .object({ patient_id: z.string().min(1).max(100) })
    .parse(await c.req.json());
  const [s, key, p] = await Promise.all([
    getSettings(c.env.DB),
    apiKey(c.env),
    c.env.DB.prepare("SELECT * FROM patients WHERE id=? AND is_demo=1")
      .bind(patient_id)
      .first<Patient>(),
  ]);
  if (!p || c.env.APP_ENV !== "demo")
    throw new BusinessError(
      "Solo se permiten pacientes ficticios en esta demo.",
      403,
    );
  if (!s.active) throw new BusinessError("El agente está pausado.", 409);
  if (!key || !s.remote_agent_id)
    throw new BusinessError(
      "Publica el agente en ElevenLabs para iniciar la prueba.",
      400,
    );
  const token = crypto.randomUUID() + crypto.randomUUID();
  const id = crypto.randomUUID();
  const signed = await eleven<{ signed_url: string }>(
    key,
    `/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(s.remote_agent_id)}`,
  );
  await c.env.DB.prepare(
    "INSERT INTO voice_sessions(id,token_hash,patient_id,verified,expires_at) VALUES(?,?,?,1,?)",
  )
    .bind(
      id,
      await digest(token),
      p.id,
      new Date(
        Date.now() + Math.min(s.max_duration + 120, 1500) * 1000,
      ).toISOString(),
    )
    .run();
  return c.json({
    signed_url: signed.signed_url,
    session_id: id,
    dynamic_variables: {
      session_token: token,
      patient_name: p.name,
      clinic_date: today(),
      pending_operation_id: "",
    },
    mode: "demo",
  });
});
app.get("/api/voice/:id/status", async (c) => {
  const session = await c.env.DB.prepare(
    "SELECT id,pending_operation_id FROM voice_sessions WHERE id=?",
  )
    .bind(c.req.param("id"))
    .first<{ id: string; pending_operation_id: string | null }>();
  if (!session) throw new BusinessError("SESSION_NOT_FOUND", 404);
  const operation = session.pending_operation_id
    ? await c.env.DB.prepare(
        "SELECT id,state,action,starts_at,result FROM operations WHERE id=? AND session_id=?",
      )
        .bind(session.pending_operation_id, session.id)
        .first<{
          id: string;
          state: string;
          action: string;
          starts_at: string;
          result: string | null;
        }>()
    : null;
  return c.json({
    operation: operation
      ? {
          id: operation.id,
          state: operation.state,
          action: operation.action,
          ...localDateFields(operation.starts_at),
        }
      : null,
  });
});
app.post("/api/voice/:id/attach", async (c) => {
  const { conversation_id } = z
    .object({ conversation_id: z.string().max(100) })
    .parse(await c.req.json());
  const session = await c.env.DB.prepare(
    "SELECT patient_id FROM voice_sessions WHERE id=? AND expires_at>?",
  )
    .bind(c.req.param("id"), now())
    .first<{ patient_id: string }>();
  if (!session) throw new BusinessError("SESSION_EXPIRED", 403);
  const key = await apiKey(c.env);
  if (!key) throw new BusinessError("No hay conexión a ElevenLabs.", 400);
  const remote = await eleven<{
    agent_id: string;
    metadata?: { user_id?: string };
  }>(key, `/v1/convai/conversations/${encodeURIComponent(conversation_id)}`);
  const s = await getSettings(c.env.DB);
  if (remote.agent_id !== s.remote_agent_id)
    throw new BusinessError("CONVERSATION_NOT_AUTHORIZED", 403);
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE voice_sessions SET conversation_id=? WHERE id=?",
    ).bind(conversation_id, c.req.param("id")),
    c.env.DB.prepare(
      "INSERT INTO conversations(id,patient_id) VALUES(?,?) ON CONFLICT(id) DO NOTHING",
    ).bind(conversation_id, session.patient_id),
  ]);
  return c.json({ ok: true });
});
app.post("/api/conversations/:id/sync", async (c) => {
  const exists = await c.env.DB.prepare(
    "SELECT id FROM conversations WHERE id=?",
  )
    .bind(c.req.param("id"))
    .first();
  if (!exists) throw new BusinessError("CONVERSATION_NOT_FOUND", 404);
  const key = await apiKey(c.env);
  if (!key) throw new BusinessError("No hay conexión a ElevenLabs.", 400);
  const r = await eleven<{
    status: string;
    metadata?: { call_duration_secs?: number };
    analysis?: { transcript_summary?: string; call_successful?: string };
    transcript?: {
      role: string;
      message: string | null;
      time_in_call_secs: number;
    }[];
  }>(key, `/v1/convai/conversations/${encodeURIComponent(c.req.param("id"))}`);
  await c.env.DB.prepare(
    "UPDATE conversations SET status=?,duration=?,summary=?,transcript=? WHERE id=?",
  )
    .bind(
      r.status,
      r.metadata?.call_duration_secs ?? 0,
      r.analysis?.transcript_summary ?? "",
      JSON.stringify(r.transcript ?? []),
      c.req.param("id"),
    )
    .run();
  return c.json({ ok: true });
});
app.post("/api/voice/:id/end", async (c) => {
  await c.env.DB.prepare("UPDATE voice_sessions SET expires_at=? WHERE id=?")
    .bind(now(), c.req.param("id"))
    .run();
  return c.json({ ok: true });
});

app.post("/api/tools/:name", async (c) => {
  if (!(await equal(c.req.header("X-Tools-Key") ?? "", c.env.TOOLS_SECRET)))
    return c.json({ error: "UNAUTHORIZED" }, 401);
  const token = c.req.header("X-Session-Token") ?? "";
  if (!token) return c.json({ error: "SESSION_REQUIRED" }, 403);
  const session = await c.env.DB.prepare(
    "SELECT id,patient_id,verified,pending_operation_id FROM voice_sessions WHERE token_hash=? AND expires_at>?",
  )
    .bind(await digest(token), now())
    .first<{
      id: string;
      patient_id: string;
      verified: number;
      pending_operation_id: string | null;
    }>();
  if (!session) return c.json({ error: "SESSION_EXPIRED" }, 403);
  if (!(await rateLimit(c.env.DB, "tool:" + session.id, 150, 900)))
    return c.json({ error: "RATE_LIMIT" }, 429);
  const input: Record<string, unknown> = await c.req.json();
  const name = c.req.param("name");
  const db = c.env.DB;
  let result: unknown;
  if (name === "get_service_catalog")
    result = {
      services: (
        await db.prepare("SELECT * FROM services WHERE enabled=1").all()
      ).results,
    };
  else if (name === "get_clinic_status")
    result = {
      date: today(),
      timezone: ZONE,
      hours: "Lunes a viernes 09:00–19:00; sábado 09:00–14:00; domingo cerrado",
      demo: true,
    };
  else if (name === "get_verification_status")
    result = {
      verified: !!session.verified,
      method: "admin_selected_synthetic_patient",
      mode: "demo",
      message:
        "Identidad ficticia elegida por el administrador para esta prueba. No se realizó OTP.",
    };
  else if (name === "create_staff_request") {
    const p = z
      .object({
        category: z.string().min(1).max(80),
        reason: z.string().min(3).max(1000),
        priority: z.enum(["normal", "high"]).default("normal"),
      })
      .parse(input);
    const id = crypto.randomUUID();
    await db
      .prepare(
        "INSERT INTO staff_requests(id,patient_id,category,reason,priority) VALUES(?,?,?,?,?)",
      )
      .bind(id, session.patient_id, p.category, p.reason, p.priority)
      .run();
    result = {
      request_id: id,
      status: "open",
      message:
        "Solicitud registrada. Recepción revisará el caso; no hay transferencia en vivo.",
    };
  } else {
    if (!session.verified) throw new BusinessError("AUTH_REQUIRED", 403);
    if (name === "get_my_appointments")
      result = {
        appointments: (
          await db
            .prepare(
              `${appointmentQuery} WHERE a.patient_id=? AND a.status IN ('booked','confirmed') ORDER BY a.starts_at`,
            )
            .bind(session.patient_id)
            .all<Appointment>()
        ).results.map((a) => ({
          id: a.id,
          service_id: a.service_id,
          service_name: a.service_name,
          provider_id: a.provider_id,
          provider_name: a.provider_name,
          starts_at: a.starts_at,
          ends_at: a.ends_at,
          status: a.status,
          ...localDateFields(a.starts_at),
        })),
      };
    else if (name === "search_availability") {
      const p = z
        .object({
          service_id: z.string(),
          date: z.string(),
          from_time: z
            .string()
            .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
            .optional(),
          provider_id: z.string().optional(),
          appointment_id: z.string().optional(),
        })
        .parse(input);
      if (
        p.appointment_id &&
        !(await db
          .prepare("SELECT id FROM appointments WHERE id=? AND patient_id=?")
          .bind(p.appointment_id, session.patient_id)
          .first())
      )
        throw new BusinessError("APPOINTMENT_NOT_FOUND", 404);
      result = {
        slots: (
          await availability(
            db,
            p.service_id,
            p.date,
            p.provider_id,
            p.appointment_id,
          )
        )
          .filter(
            (s) =>
              !p.from_time ||
              formatInTimeZone(new Date(s.starts_at), ZONE, "HH:mm") >=
                p.from_time,
          )
          .slice(0, 3)
          .map((slot) => ({ ...slot, slot_id: crypto.randomUUID() })),
        timezone: ZONE,
      };
      const slots = (
        result as { slots: (import("./booking").Slot & { slot_id: string })[] }
      ).slots;
      if (slots.length)
        await db.batch(
          slots.map((slot) =>
            db
              .prepare(
                "INSERT INTO availability_options(id,session_id,slot_json,expires_at) VALUES(?,?,?,?)",
              )
              .bind(
                slot.slot_id,
                session.id,
                JSON.stringify(slot),
                new Date(Date.now() + 300000).toISOString(),
              ),
          ),
        );
      result = {
        slots: slots.map((slot) => ({
          slot_id: slot.slot_id,
          provider_name: slot.provider_name,
          service_id: slot.service_id,
          ...localDateFields(slot.starts_at),
        })),
        timezone: ZONE,
      };
    } else if (name === "prepare_appointment_change") {
      const p = z
        .object({
          action: z.enum(["create", "move", "cancel"]),
          appointment_id: z.string().optional(),
          slot_id: z.string().uuid().optional(),
        })
        .parse(input);
      let selected: Partial<import("./booking").Slot> = {};
      if (p.action !== "cancel") {
        const option = await db
          .prepare(
            "SELECT slot_json FROM availability_options WHERE id=? AND session_id=? AND expires_at>?",
          )
          .bind(p.slot_id ?? "", session.id, now())
          .first<{ slot_json: string }>();
        if (!option) throw new BusinessError("SLOT_SELECTION_EXPIRED");
        selected = JSON.parse(option.slot_json) as import("./booking").Slot;
      }
      const prepared = await prepare(db, session.id, session.patient_id, {
        ...selected,
        action: p.action,
        appointment_id: p.appointment_id,
      });
      await db
        .prepare("UPDATE voice_sessions SET pending_operation_id=? WHERE id=?")
        .bind(prepared.operation_id, session.id)
        .run();
      result = {
        operation_id: prepared.operation_id,
        action: prepared.action,
        service: prepared.service,
        provider_name: prepared.provider_name,
        requires_confirmation: true,
        ...localDateFields(prepared.starts_at),
      };
    } else if (name === "commit_appointment_change")
      result = await commit(
        db,
        session.id,
        z
          .string()
          .uuid()
          .parse(input.operation_id || session.pending_operation_id),
      );
    else if (name === "get_operation_status") {
      const op = await db
        .prepare(
          "SELECT state,result FROM operations WHERE id=? AND session_id=?",
        )
        .bind(
          z
            .string()
            .uuid()
            .parse(input.operation_id || session.pending_operation_id),
          session.id,
        )
        .first<{ state: string; result: string | null }>();
      result = op
        ? { state: op.state, result: op.result ? JSON.parse(op.result) : null }
        : { state: "not_found" };
    } else if (name === "join_waitlist") {
      const p = z
        .object({
          service_id: z.string(),
          preferences: z.string().min(3).max(500),
        })
        .parse(input);
      const id = crypto.randomUUID();
      await db
        .prepare(
          "INSERT INTO waitlist(id,patient_id,service_id,preferences) VALUES(?,?,?,?)",
        )
        .bind(id, session.patient_id, p.service_id, p.preferences)
        .run();
      result = { id, status: "waiting" };
    } else throw new BusinessError("TOOL_NOT_FOUND", 404);
  }
  const toolTitles: Record<string, string> = {
    get_service_catalog: "Servicios y precios consultados",
    get_clinic_status: "Horario de la clínica consultado",
    get_verification_status: "Sesión de prueba comprobada",
    get_my_appointments: "Próximas citas consultadas",
    search_availability: "Horarios disponibles consultados",
    prepare_appointment_change: "Cambio de agenda preparado",
    commit_appointment_change: "Cambio de agenda confirmado",
    get_operation_status: "Resultado de una operación consultado",
    join_waitlist: "Paciente añadido a lista de espera",
    create_staff_request: "Solicitud enviada a recepción",
  };
  await activity(
    db,
    "tool",
    toolTitles[name] ?? "Acción del asistente",
    "Herramienta ejecutada sobre paciente de prueba.",
    "agent",
  );
  return c.json({ ok: true, data: result });
});
app.post("/api/webhooks/elevenlabs", async (c) => {
  const saved = await c.env.DB.prepare(
    "SELECT encrypted_value FROM integrations WHERE name='webhook_secret'",
  ).first<{ encrypted_value: string }>();
  if (!saved) return c.json({ error: "Webhook no configurado" }, 503);
  const { unseal } = await import("./security");
  const secret = await unseal(saved.encrypted_value, c.env.ENCRYPTION_KEY);
  const raw = await c.req.text();
  const header = c.req.header("elevenlabs-signature") ?? "";
  const timestamp = header
    .split(",")
    .find((x) => x.trim().startsWith("t="))
    ?.split("=")[1];
  const signatures = header
    .split(",")
    .filter((x) => x.trim().startsWith("v0="))
    .map((x) => x.trim().slice(3));
  if (!timestamp || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300)
    return c.json({ error: "Invalid timestamp" }, 401);
  const expected = await signature(timestamp + "." + raw, secret);
  if (
    !(await Promise.all(signatures.map((s) => equal(s, expected)))).some(
      Boolean,
    )
  )
    return c.json({ error: "Invalid signature" }, 401);
  const event = JSON.parse(raw) as {
    type: string;
    data: {
      conversation_id: string;
      status?: string;
      metadata?: { call_duration_secs?: number };
      analysis?: { transcript_summary?: string };
      transcript?: unknown[];
    };
  };
  const id = event.type + ":" + event.data.conversation_id;
  const known = await c.env.DB.prepare(
    "SELECT id FROM conversations WHERE id=?",
  )
    .bind(event.data.conversation_id)
    .first();
  if (!known) return c.json({ ok: true, ignored: true });
  if (event.type !== "post_call_transcription")
    return c.json({ ok: true, ignored: true });
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE conversations SET status='done',duration=?,summary=?,transcript=? WHERE id=? AND NOT EXISTS(SELECT 1 FROM webhook_events WHERE id=?)",
    ).bind(
      event.data.metadata?.call_duration_secs ?? 0,
      event.data.analysis?.transcript_summary ?? "",
      JSON.stringify(event.data.transcript ?? []),
      event.data.conversation_id,
      id,
    ),
    c.env.DB.prepare(
      "INSERT INTO webhook_events(id) VALUES(?) ON CONFLICT(id) DO NOTHING",
    ).bind(id),
  ]);
  return c.json({ ok: true });
});
app.post("/api/integrations/webhook", async (c) => {
  const { secret } = z
    .object({ secret: z.string().min(10).max(300) })
    .parse(await c.req.json());
  await c.env.DB.prepare(
    "INSERT INTO integrations(name,encrypted_value) VALUES('webhook_secret',?) ON CONFLICT(name) DO UPDATE SET encrypted_value=excluded.encrypted_value",
  )
    .bind(await seal(secret, c.env.ENCRYPTION_KEY))
    .run();
  return c.json({ ok: true });
});
app.notFound((c) => c.json({ error: "Ruta no encontrada" }, 404));
app.onError(async (e, c) => {
  if (e instanceof z.ZodError)
    return c.json(
      {
        error: "Revisa los datos enviados",
        fields: e.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      },
      400,
    );
  if (e instanceof BusinessError) {
    if (c.req.path.startsWith("/api/tools/"))
      await activity(
        c.env.DB,
        "tool_error",
        "Acción del asistente necesita revisión",
        e.code,
        "agent",
      );
    return c.json({ error: e.code }, e.status as 400);
  }
  console.error(
    JSON.stringify({
      event: "request_error",
      path: c.req.path,
      name: e.name,
      message: e.message
        .replace(/sk_[a-zA-Z0-9]+/g, "[redacted]")
        .slice(0, 300),
    }),
  );
  return c.json(
    {
      error:
        "No se pudo completar la operación. Consulta el estado antes de reintentar.",
    },
    500,
  );
});
export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env) {
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE operations SET state='expired' WHERE state='prepared' AND expires_at<?",
      ).bind(now()),
      env.DB.prepare("DELETE FROM rate_limits WHERE resets_at<?").bind(
        Math.floor(Date.now() / 1000),
      ),
      env.DB.prepare(
        "DELETE FROM availability_options WHERE expires_at<?",
      ).bind(now()),
      env.DB.prepare("DELETE FROM voice_sessions WHERE expires_at<?").bind(
        new Date(Date.now() - 7 * 86400_000).toISOString(),
      ),
    ]);
  },
} satisfies ExportedHandler<Env>;
