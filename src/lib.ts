import type {
  AgentSettings,
  Appointment,
  Patient,
  Provider,
  Service,
  Knowledge,
} from "../worker/data";
export type {
  AgentSettings,
  Appointment,
  Patient,
  Provider,
  Service,
  Knowledge,
};
export interface Conversation {
  id: string;
  patient_id: string;
  status: string;
  duration: number;
  summary: string;
  intent: string;
  transcript: string;
  is_demo: number;
  started_at: string;
}
export interface Activity {
  id: string;
  type: string;
  title: string;
  detail: string;
  source: string;
  created_at: string;
}
export interface StaffRequest {
  id: string;
  patient_name: string | null;
  category: string;
  reason: string;
  priority: string;
  status: string;
  created_at: string;
}
export interface Dashboard {
  appointments: Appointment[];
  patients: Patient[];
  providers: Provider[];
  services: Service[];
  conversations: Conversation[];
  activities: Activity[];
  knowledge: Knowledge[];
  requests: StaffRequest[];
  settings: AgentSettings;
  integration: { connected: boolean; agent_id: string; sms_connected: boolean };
  today: string;
  timezone: string;
  environment: string;
  waitlist: unknown[];
  notifications: { id: string; type: string; status: string; detail: string }[];
  publications: {
    id: string;
    state: string;
    detail: string;
    created_at: string;
  }[];
}
export async function api<T = Record<string, unknown>>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch("/api" + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = (await response.json()) as { error?: string };
  if (!response.ok)
    throw new Error(data.error ?? "No se pudo completar la solicitud.");
  return data as T;
}
export const post = <T = Record<string, unknown>>(
  path: string,
  body: unknown = {},
) => api<T>(path, { method: "POST", body: JSON.stringify(body) });
export const money = (value: number | null | undefined) =>
  value == null
    ? "Por valoración"
    : new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN",
        maximumFractionDigits: 0,
      }).format(value);
export const time = (value: string) =>
  new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Monterrey",
  }).format(new Date(value));
export const day = (value: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Monterrey",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date(value))
    .replace(/(\d{2})\/(\d{2})\/(\d{4})/, "$3-$1-$2");
export const dateLabel = (
  value: string,
  options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    day: "numeric",
    month: "long",
  },
) =>
  new Intl.DateTimeFormat("es-MX", {
    ...options,
    timeZone: "America/Monterrey",
  }).format(new Date(value.length === 10 ? value + "T12:00:00-06:00" : value));
export const addDays = (value: string, n: number) => {
  const d = new Date(value + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const statusLabel: Record<string, string> = {
  booked: "Reservada",
  confirmed: "Confirmada",
  checked_in: "En clínica",
  completed: "Completada",
  cancelled: "Cancelada",
  no_show: "No asistió",
  done: "Finalizada",
  active: "En curso",
  processing: "Procesando",
  open: "Pendiente",
  in_progress: "En revisión",
  resolved: "Resuelta",
};
export const errorLabel = (e: unknown) => {
  const msg = e instanceof Error ? e.message : "Ocurrió un error";
  return (
    (
      {
        SLOT_UNAVAILABLE: "Ese horario acaba de ocuparse. Elige otra opción.",
        OPERATION_EXPIRED: "La opción caducó. Consulta de nuevo los horarios.",
        APPOINTMENT_CHANGED:
          "La cita cambió mientras la editabas. Actualiza e inténtalo otra vez.",
        OUTSIDE_SCHEDULE:
          "El horario está fuera de la jornada del profesional.",
        POLICY_REQUIRES_STAFF: "Este cambio necesita revisión de recepción.",
      } as Record<string, string>
    )[msg] ?? msg
  );
};
