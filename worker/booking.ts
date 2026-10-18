import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import {
  ZONE,
  now,
  type Appointment,
  type Provider,
  type Service,
} from "./data";
export class BusinessError extends Error {
  constructor(
    public code: string,
    public status = 409,
  ) {
    super(code);
  }
}
export interface Slot {
  starts_at: string;
  ends_at: string;
  occupied_until: string;
  provider_id: string;
  provider_name: string;
  chair: number;
  service_id: string;
}
interface Operation extends Slot {
  id: string;
  session_id: string;
  patient_id: string;
  action: string;
  appointment_id: string | null;
  original_version: number | null;
  state: string;
  expires_at: string;
  result: string | null;
}
const live = "('booked','confirmed','checked_in')";
export function localDateFields(iso: string) {
  const date = new Date(iso);
  return {
    local_date: formatInTimeZone(date, ZONE, "yyyy-MM-dd"),
    local_time: formatInTimeZone(date, ZONE, "HH:mm"),
    spoken_date: new Intl.DateTimeFormat("es-MX", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: ZONE,
    }).format(date),
    timezone: ZONE,
  };
}
export async function validateSlot(
  db: D1Database,
  serviceId: string,
  providerId: string,
  startsAt: string,
  chair: number,
): Promise<Slot> {
  const [s, p] = await Promise.all([
    db
      .prepare("SELECT * FROM services WHERE id=? AND enabled=1")
      .bind(serviceId)
      .first<Service>(),
    db
      .prepare("SELECT * FROM providers WHERE id=?")
      .bind(providerId)
      .first<Provider>(),
  ]);
  if (!s || !p || s.specialty !== p.specialty || ![1, 2].includes(chair))
    throw new BusinessError("INVALID_SERVICE_OR_PROVIDER", 400);
  const start = new Date(startsAt);
  if (
    !Number.isFinite(start.getTime()) ||
    start.getTime() < Date.now() ||
    start.getTime() > Date.now() + 90 * 86400_000
  )
    throw new BusinessError("INVALID_DATE", 400);
  const weekday = Number(formatInTimeZone(start, ZONE, "i")) % 7;
  const localHour = Number(formatInTimeZone(start, ZONE, "H")),
    minute = Number(formatInTimeZone(start, ZONE, "m"));
  if (
    !p.weekdays.split(",").map(Number).includes(weekday) ||
    weekday === 0 ||
    minute % 15 !== 0
  )
    throw new BusinessError("OUTSIDE_SCHEDULE", 400);
  const end = new Date(start.getTime() + s.duration * 60_000),
    occupied = new Date(end.getTime() + s.buffer * 60_000);
  const finish = localHour * 60 + minute + s.duration + s.buffer;
  if (
    localHour < Math.max(9, p.start_hour) ||
    finish > Math.min(weekday === 6 ? 14 : 19, p.end_hour) * 60
  )
    throw new BusinessError("OUTSIDE_SCHEDULE", 400);
  const blocked = await db
    .prepare(
      "SELECT id FROM blocks WHERE (provider_id IS NULL OR provider_id=?) AND (chair IS NULL OR chair=?) AND starts_at<? AND ends_at>? LIMIT 1",
    )
    .bind(providerId, chair, occupied.toISOString(), start.toISOString())
    .first();
  if (blocked) throw new BusinessError("SLOT_BLOCKED");
  return {
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    occupied_until: occupied.toISOString(),
    provider_id: providerId,
    provider_name: p.name,
    chair,
    service_id: serviceId,
  };
}
export async function availability(
  db: D1Database,
  serviceId: string,
  date: string,
  providerId?: string,
  excludeId?: string,
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new BusinessError("INVALID_DATE", 400);
  const startDay = fromZonedTime(date + "T00:00:00", ZONE);
  if (
    !Number.isFinite(startDay.getTime()) ||
    startDay.getTime() > Date.now() + 90 * 86400_000
  )
    throw new BusinessError("INVALID_DATE", 400);
  const endDay = new Date(startDay.getTime() + 86400_000).toISOString();
  const r = await db.batch<
    | Service
    | Provider
    | Appointment
    | Operation
    | {
        provider_id: string | null;
        chair: number | null;
        starts_at: string;
        ends_at: string;
      }
  >([
    db
      .prepare("SELECT * FROM services WHERE id=? AND enabled=1")
      .bind(serviceId),
    db.prepare("SELECT * FROM providers"),
    db
      .prepare(
        `SELECT * FROM appointments WHERE id!=? AND status IN ${live} AND starts_at<? AND occupied_until>?`,
      )
      .bind(excludeId ?? "", endDay, startDay.toISOString()),
    db
      .prepare(
        "SELECT * FROM operations WHERE state='prepared' AND action!='cancel' AND expires_at>? AND starts_at<? AND occupied_until>?",
      )
      .bind(now(), endDay, startDay.toISOString()),
    db
      .prepare("SELECT * FROM blocks WHERE starts_at<? AND ends_at>?")
      .bind(endDay, startDay.toISOString()),
  ]);
  const service = r[0].results[0] as Service;
  if (!service) throw new BusinessError("SERVICE_NOT_FOUND", 404);
  const providers = r[1].results as Provider[];
  const occupied = [...r[2].results, ...r[3].results].filter(
    (row): row is Appointment | Operation => "occupied_until" in row,
  );
  const blocks = r[4].results as {
    provider_id: string | null;
    chair: number | null;
    starts_at: string;
    ends_at: string;
  }[];
  const weekday = new Date(date + "T12:00:00Z").getUTCDay();
  const slots: Slot[] = [];
  for (const p of providers) {
    if (
      p.specialty !== service.specialty ||
      (providerId && p.id !== providerId) ||
      weekday === 0 ||
      !p.weekdays.split(",").map(Number).includes(weekday)
    )
      continue;
    const last =
      Math.min(p.end_hour, weekday === 6 ? 14 : 19) * 60 -
      service.duration -
      service.buffer;
    for (
      let minute = Math.max(9, p.start_hour) * 60;
      minute <= last;
      minute += 15
    ) {
      const start = fromZonedTime(
        `${date}T${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}:00`,
        ZONE,
      );
      if (start.getTime() < Date.now()) continue;
      const end = new Date(
        start.getTime() + service.duration * 60_000,
      ).toISOString();
      const until = new Date(
        start.getTime() + (service.duration + service.buffer) * 60_000,
      ).toISOString();
      const begins = start.toISOString();
      for (const chair of [1, 2]) {
        if (
          occupied.some(
            (a) =>
              (a.provider_id === p.id || a.chair === chair) &&
              a.starts_at < until &&
              a.occupied_until > begins,
          )
        )
          continue;
        if (
          blocks.some(
            (b) =>
              (!b.provider_id || b.provider_id === p.id) &&
              (!b.chair || b.chair === chair) &&
              b.starts_at < until &&
              b.ends_at > begins,
          )
        )
          continue;
        slots.push({
          starts_at: begins,
          ends_at: end,
          occupied_until: until,
          provider_id: p.id,
          provider_name: p.name,
          chair,
          service_id: serviceId,
        });
        break;
      }
    }
  }
  return slots
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .slice(0, 60);
}
export async function prepare(
  db: D1Database,
  sessionId: string,
  patientId: string,
  input: {
    action: "create" | "move" | "cancel";
    appointment_id?: string;
    service_id?: string;
    provider_id?: string;
    starts_at?: string;
    chair?: number;
  },
  staff = false,
) {
  let original: Appointment | null = null;
  if (input.action !== "create") {
    original = await db
      .prepare("SELECT * FROM appointments WHERE id=? AND patient_id=?")
      .bind(input.appointment_id ?? "", patientId)
      .first<Appointment>();
    if (!original || !["booked", "confirmed"].includes(original.status))
      throw new BusinessError("APPOINTMENT_NOT_FOUND", 404);
    if (
      !staff &&
      new Date(original.starts_at).getTime() - Date.now() < 86400_000
    )
      throw new BusinessError("POLICY_REQUIRES_STAFF");
  }
  const slot =
    input.action === "cancel" && original
      ? { ...original, provider_name: "" }
      : await validateSlot(
          db,
          input.service_id ?? original?.service_id ?? "",
          input.provider_id ?? "",
          input.starts_at ?? "",
          input.chair ?? 1,
        );
  const existing = await db
    .prepare(
      "SELECT id,expires_at FROM operations WHERE session_id=? AND patient_id=? AND action=? AND COALESCE(appointment_id,'')=? AND provider_id=? AND chair=? AND starts_at=? AND state='prepared' AND expires_at>? LIMIT 1",
    )
    .bind(
      sessionId,
      patientId,
      input.action,
      original?.id ?? "",
      slot.provider_id,
      slot.chair,
      slot.starts_at,
      now(),
    )
    .first<{ id: string; expires_at: string }>();
  const id = existing?.id ?? crypto.randomUUID();
  const expires =
    existing?.expires_at ?? new Date(Date.now() + 120_000).toISOString();
  try {
    if (!existing)
      await db
        .prepare(
          "INSERT INTO operations(id,session_id,patient_id,action,appointment_id,service_id,provider_id,chair,starts_at,ends_at,occupied_until,original_version,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          id,
          sessionId,
          patientId,
          input.action,
          original?.id ?? null,
          slot.service_id,
          slot.provider_id,
          slot.chair,
          slot.starts_at,
          slot.ends_at,
          slot.occupied_until,
          original?.version ?? null,
          expires,
        )
        .run();
  } catch (e) {
    if (String(e).includes("SLOT_UNAVAILABLE"))
      throw new BusinessError("SLOT_UNAVAILABLE");
    throw e;
  }
  const s = await db
    .prepare("SELECT name FROM services WHERE id=?")
    .bind(slot.service_id)
    .first<{ name: string }>();
  return {
    operation_id: id,
    action: input.action,
    expires_at: expires,
    service: s?.name,
    ...slot,
    display_date: formatInTimeZone(
      new Date(slot.starts_at),
      ZONE,
      "EEEE d 'de' MMMM, HH:mm",
    ),
    requires_confirmation: true,
    ...localDateFields(slot.starts_at),
  };
}
export async function commit(
  db: D1Database,
  sessionId: string,
  operationId: string,
) {
  const op = await db
    .prepare("SELECT * FROM operations WHERE id=? AND session_id=?")
    .bind(operationId, sessionId)
    .first<Operation>();
  if (!op) throw new BusinessError("OPERATION_NOT_FOUND", 404);
  if (op.state === "committed") return JSON.parse(op.result!);
  if (op.expires_at < now()) throw new BusinessError("OPERATION_EXPIRED");
  if (op.appointment_id) {
    const a = await db
      .prepare("SELECT version FROM appointments WHERE id=?")
      .bind(op.appointment_id)
      .first<{ version: number }>();
    if (a?.version !== op.original_version)
      throw new BusinessError("APPOINTMENT_CHANGED");
  }
  const appointmentId = op.appointment_id ?? "appt-" + op.id;
  const result = {
    status: op.action === "cancel" ? "cancelled" : "booked",
    appointment_id: appointmentId,
    operation_id: op.id,
    starts_at: op.starts_at,
    ...localDateFields(op.starts_at),
    notification: "disabled",
    message: "Operación guardada. SMS no conectado en esta demostración.",
  };
  const statements = [
    db
      .prepare(
        "UPDATE operations SET state='committing' WHERE id=? AND session_id=? AND state='prepared' AND expires_at>?",
      )
      .bind(op.id, sessionId, now()),
  ];
  const context = await db
    .prepare(
      "SELECT p.name patient_name,s.name service_name FROM operations o JOIN patients p ON p.id=o.patient_id JOIN services s ON s.id=o.service_id WHERE o.id=?",
    )
    .bind(op.id)
    .first<{ patient_name: string; service_name: string }>();
  if (op.action === "create")
    statements.push(
      db
        .prepare(
          "INSERT INTO appointments(id,patient_id,provider_id,service_id,chair,starts_at,ends_at,occupied_until,source) SELECT ?,patient_id,provider_id,service_id,chair,starts_at,ends_at,occupied_until,? FROM operations WHERE id=? AND state='committing'",
        )
        .bind(
          appointmentId,
          sessionId.startsWith("staff") ? "staff" : "agent",
          op.id,
        ),
    );
  else if (op.action === "move")
    statements.push(
      db
        .prepare(
          "UPDATE appointments SET provider_id=?,chair=?,starts_at=?,ends_at=?,occupied_until=?,version=version+1 WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM operations WHERE id=? AND state='committing')",
        )
        .bind(
          op.provider_id,
          op.chair,
          op.starts_at,
          op.ends_at,
          op.occupied_until,
          appointmentId,
          op.original_version,
          op.id,
        ),
    );
  else
    statements.push(
      db
        .prepare(
          "UPDATE appointments SET status='cancelled',version=version+1 WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM operations WHERE id=? AND state='committing')",
        )
        .bind(appointmentId, op.original_version, op.id),
    );
  statements.push(
    db
      .prepare(
        "INSERT INTO activities(id,type,title,detail,source) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM operations WHERE id=? AND state='committing')",
      )
      .bind(
        crypto.randomUUID(),
        "appointment",
        op.action === "create"
          ? "Nueva cita reservada"
          : op.action === "move"
            ? "Cita reprogramada"
            : "Cita cancelada",
        `${context?.patient_name ?? "Paciente"} · ${context?.service_name ?? "Cita"} · ${localDateFields(op.starts_at).local_date} ${localDateFields(op.starts_at).local_time}`,
        sessionId.startsWith("staff") ? "staff" : "agent",
        op.id,
      ),
  );
  statements.push(
    db
      .prepare(
        "INSERT INTO notification_jobs(id,appointment_id,type,due_at) SELECT ?,?,'confirmation',? WHERE EXISTS(SELECT 1 FROM operations WHERE id=? AND state='committing') ON CONFLICT(appointment_id,type) DO UPDATE SET status='disabled',due_at=excluded.due_at",
      )
      .bind(crypto.randomUUID(), appointmentId, now(), op.id),
  );
  statements.push(
    db
      .prepare(
        "UPDATE operations SET state='committed',result=? WHERE id=? AND state='committing'",
      )
      .bind(JSON.stringify(result), op.id),
  );
  try {
    await db.batch(statements);
  } catch (e) {
    if (String(e).includes("SLOT_"))
      throw new BusinessError("SLOT_UNAVAILABLE");
    if (String(e).includes("APPOINTMENT_CHANGED"))
      throw new BusinessError("APPOINTMENT_CHANGED");
    throw e;
  }
  const saved = await db
    .prepare("SELECT result FROM operations WHERE id=?")
    .bind(op.id)
    .first<{ result: string }>();
  if (!saved?.result) throw new BusinessError("RESULT_UNKNOWN");
  return JSON.parse(saved.result);
}
