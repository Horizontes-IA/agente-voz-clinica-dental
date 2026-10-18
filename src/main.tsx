import React, { useEffect, useState, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity as ActivityIcon,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Cloud,
  FileText,
  Headphones,
  LayoutDashboard,
  Loader2,
  LogOut,
  Mic,
  MicOff,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Users,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  api,
  post,
  money,
  time,
  day,
  dateLabel,
  addDays,
  statusLabel,
  errorLabel,
  type Dashboard,
  type Appointment,
  type Patient,
  type Knowledge,
  type AgentSettings,
  type Conversation,
} from "./lib";
import "./styles.css";
import { Modal, Spinner } from "./ui";
const VoiceDialog = React.lazy(() => import("./VoiceDialog"));

type Page =
  "overview" | "agenda" | "patients" | "conversations" | "knowledge" | "agent";
type Toast = { message: string; error?: boolean };
type ModalType =
  | { type: "booking"; appointment?: Appointment; action?: "move" | "cancel" }
  | { type: "patient"; patient?: Patient }
  | { type: "conversation"; conversation: Conversation }
  | { type: "voice" }
  | { type: "requests" }
  | null;
const nav: { id: Page; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Resumen", icon: LayoutDashboard },
  { id: "agenda", label: "Agenda", icon: CalendarDays },
  { id: "patients", label: "Pacientes", icon: Users },
  { id: "conversations", label: "Conversaciones", icon: AudioLines },
  { id: "knowledge", label: "Conocimiento", icon: BookOpen },
  { id: "agent", label: "Agente de voz", icon: Sparkles },
];
function Tooth({ size = 30 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M11 6c-7 1-8 9-5 15 3 5 2 13 6 13 3 0 3-10 8-10s5 10 8 10c4 0 3-8 6-13 3-6 2-14-5-15-4-1-6 2-9 2s-5-3-9-2Z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path
        d="M15 13c3 2 7 2 10 0"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
function Badge({
  status,
  children,
}: {
  status?: string;
  children?: React.ReactNode;
}) {
  return (
    <span className={"badge " + (status ?? "neutral")}>
      <span className="badge-dot" />
      {children ?? statusLabel[status ?? ""] ?? status}
    </span>
  );
}
function Avatar({
  initials,
  color,
  size = 34,
}: {
  initials: string;
  color?: string;
  size?: number;
}) {
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        background: color ? color + "18" : undefined,
        color: color ?? "#43806f",
      }}
    >
      {initials}
    </span>
  );
}
function Empty({
  icon: Icon = AudioLines,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={28} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
function App() {
  const [auth, setAuth] = useState<boolean | null>(null),
    [data, setData] = useState<Dashboard | null>(null),
    [page, setPage] = useState<Page>("overview"),
    [modal, setModal] = useState<ModalType>(null),
    [toast, setToast] = useState<Toast | null>(null),
    [loading, setLoading] = useState(false),
    [search, setSearch] = useState("");
  const notify = useCallback(
    (message: string, error = false) => setToast({ message, error }),
    [],
  );
  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setData(await api<Dashboard>("/dashboard"));
    } catch (e) {
      notify(errorLabel(e), true);
    } finally {
      setLoading(false);
    }
  }, [notify]);
  useEffect(() => {
    void api<{ authenticated: boolean }>("/auth/me")
      .then((r) => setAuth(r.authenticated))
      .catch(() => setAuth(false));
  }, []);
  useEffect(() => {
    if (auth) {
      void refresh();
      const id = setInterval(() => void refresh(), 30000);
      return () => clearInterval(id);
    }
  }, [auth, refresh]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const publishAgent = async () => {
    setLoading(true);
    try {
      await post("/agent/publish");
      notify("Agente y conocimiento publicados en ElevenLabs.");
      await refresh();
    } catch (e) {
      notify(errorLabel(e), true);
    } finally {
      setLoading(false);
    }
  };
  if (auth === null)
    return (
      <div className="loading-screen">
        <Tooth size={45} />
        <Spinner />
      </div>
    );
  if (!auth) return <Login onLogin={() => setAuth(true)} />;
  if (!data)
    return (
      <div className="loading-screen">
        <Tooth size={45} />
        <p>Preparando tu clínica…</p>
        <Spinner />
      </div>
    );
  const pending = data.requests.filter((r) => r.status !== "resolved").length;
  const goto = (p: Page) => {
    setPage(p);
    setSearch("");
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            goto("overview");
          }}
        >
          <span className="brand-mark">
            <Tooth />
          </span>
          <span>
            sonrisa norte<small>CLINIC OS</small>
          </span>
        </a>
        <div className="workspace">
          <span className="workspace-icon">
            <Stethoscope size={17} />
          </span>
          <span>
            Clínica Monterrey<small>Tu espacio de trabajo</small>
          </span>
          <ChevronDown size={14} />
        </div>
        <div className="nav-label">PRINCIPAL</div>
        <nav>
          {nav.map((n) => (
            <button
              key={n.id}
              className={"nav-item " + (page === n.id ? "active" : "")}
              onClick={() => goto(n.id)}
            >
              <n.icon size={19} />
              <span>{n.label}</span>
              {n.id === "agent" && <span className="nav-new">IA</span>}
              {n.id === "conversations" && data.conversations.length > 0 && (
                <span className="nav-count">{data.conversations.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-agent">
            <div className="agent-status">
              <span
                className={
                  "status-orb " +
                  (data.settings.remote_agent_id && data.settings.active
                    ? ""
                    : "offline")
                }
              />
              <span>{data.settings.name}, tu asistente</span>
            </div>
            <p>
              {data.settings.remote_agent_id
                ? data.settings.active
                  ? "Lista para recibir pacientes"
                  : "Agente pausado"
                : "Lista para configurar su voz"}
            </p>
            <button onClick={() => setModal({ type: "voice" })}>
              Probar agente <ArrowUpRight size={15} />
            </button>
          </div>
          <button
            className="help-link"
            onClick={() =>
              notify(
                "Este entorno usa pacientes ficticios. La voz se conecta a ElevenLabs; las acciones se guardan en Cloudflare.",
              )
            }
          >
            <CircleHelp size={17} /> Acerca de esta demo
          </button>
          <div className="profile">
            <Avatar initials="SN" size={35} />
            <span>
              Administración<small>Sonrisa Norte</small>
            </span>
            <button
              aria-label="Cerrar sesión"
              className="icon-button"
              onClick={() =>
                void post("/auth/logout").then(() => {
                  setAuth(false);
                  setData(null);
                })
              }
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">
            Clínica Monterrey <ChevronRight size={13} />
            <strong>{nav.find((n) => n.id === page)?.label}</strong>
          </div>
          <div className="top-actions">
            <span className="demo-pill">
              <span /> Entorno de prueba
            </span>
            <button
              className="icon-button"
              onClick={() => void refresh()}
              aria-label="Actualizar datos"
            >
              <RefreshCw size={17} className={loading ? "spin" : ""} />
            </button>
            <button
              className="notification-button icon-button"
              aria-label="Ver solicitudes"
              onClick={() => setModal({ type: "requests" })}
            >
              <Bell size={19} />
              {pending > 0 && <span>{pending}</span>}
            </button>
            <Avatar initials="SN" size={32} />
          </div>
        </header>
        <div className="content">
          <div className="mobile-nav">
            {nav.map((n) => (
              <button
                key={n.id}
                className={page === n.id ? "selected" : ""}
                onClick={() => goto(n.id)}
              >
                <n.icon size={17} />
                {n.label}
              </button>
            ))}
          </div>
          {page === "overview" && (
            <Overview data={data} open={setModal} go={goto} />
          )}
          {page === "agenda" && (
            <Agenda
              data={data}
              open={setModal}
              search={search}
              setSearch={setSearch}
              refresh={refresh}
              notify={notify}
            />
          )}
          {page === "patients" && (
            <Patients
              data={data}
              open={setModal}
              search={search}
              setSearch={setSearch}
            />
          )}
          {page === "conversations" && (
            <Conversations
              data={data}
              open={setModal}
              refresh={refresh}
              notify={notify}
            />
          )}
          {page === "knowledge" && (
            <KnowledgePage
              data={data}
              refresh={refresh}
              notify={notify}
              publish={publishAgent}
              loading={loading}
            />
          )}
          {page === "agent" && (
            <AgentPage
              data={data}
              refresh={refresh}
              notify={notify}
              publish={publishAgent}
              loading={loading}
              test={() => setModal({ type: "voice" })}
            />
          )}
          <footer className="footer">
            <span>
              <Tooth size={15} /> Sonrisa Norte{" "}
              <span className="footer-dot">·</span> Cuidamos cada conversación.
            </span>
            <span>
              <Cloud size={14} /> Cloudflare{" "}
              <span className="footer-dot">/</span> ElevenLabs
            </span>
          </footer>
        </div>
      </main>
      {modal?.type === "booking" && (
        <BookingModal
          data={data}
          appointment={modal.appointment}
          action={modal.action}
          close={() => setModal(null)}
          done={() => {
            setModal(null);
            void refresh();
            notify("La agenda se actualizó correctamente.");
          }}
          notify={notify}
        />
      )}
      {modal?.type === "patient" && (
        <PatientModal
          data={data}
          patient={modal.patient}
          close={() => setModal(null)}
          done={() => {
            setModal(null);
            void refresh();
            notify("Paciente de prueba registrado.");
          }}
          notify={notify}
        />
      )}
      {modal?.type === "conversation" && (
        <TranscriptModal
          conversation={modal.conversation}
          close={() => setModal(null)}
        />
      )}
      {modal?.type === "voice" && (
        <React.Suspense
          fallback={
            <div className="modal-backdrop">
              <Spinner />
            </div>
          }
        >
          <VoiceDialog
            data={data}
            close={() => {
              setModal(null);
              void refresh();
            }}
            refresh={refresh}
            notify={notify}
          />
        </React.Suspense>
      )}
      {modal?.type === "requests" && (
        <Modal
          title="Solicitudes de recepción"
          subtitle="Casos que necesitan la atención del equipo."
          onClose={() => setModal(null)}
        >
          {data.requests.length === 0 ? (
            <Empty
              icon={CheckCheck}
              title="Todo en orden"
              description="Las solicitudes del agente aparecerán aquí cuando un paciente necesite ayuda del equipo."
            />
          ) : (
            <div className="request-list">
              {data.requests.map((r) => (
                <div key={r.id} className="request-item">
                  <div>
                    <Badge status={r.status} />
                    {r.priority === "high" && (
                      <span className="text-warning"> Prioridad alta</span>
                    )}
                    <h4>{r.patient_name ?? "Solicitud general"}</h4>
                    <p>{r.reason}</p>
                  </div>
                  <select
                    value={r.status}
                    onChange={(e) =>
                      void api("/requests/" + r.id, {
                        method: "PATCH",
                        body: JSON.stringify({ status: e.target.value }),
                      })
                        .then(refresh)
                        .catch((e) => notify(errorLabel(e), true))
                    }
                  >
                    <option value="open">Pendiente</option>
                    <option value="in_progress">En revisión</option>
                    <option value="resolved">Resuelta</option>
                  </select>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
      {toast && (
        <div className={"toast " + (toast.error ? "error" : "")} role="status">
          {toast.error ? <CircleHelp size={18} /> : <Check size={18} />}
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} aria-label="Cerrar aviso">
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await post("/auth/login", { password });
      onLogin();
    } catch (e) {
      setError(errorLabel(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="login">
      <div className="login-story">
        <div className="brand">
          <span className="brand-mark">
            <Tooth />
          </span>
          <span>
            sonrisa norte<small>CLINIC OS</small>
          </span>
        </div>
        <div className="login-art">
          <div className="art-circle">
            <Tooth size={135} />
          </div>
          <div className="floating-chip chip-one">
            <CalendarDays size={18} /> Cada cita, en su lugar.
          </div>
          <div className="floating-chip chip-two">
            <AudioLines size={19} /> Una voz que cuida.
          </div>
        </div>
        <h1>
          Más tiempo para
          <br />
          hacer sonreír.
        </h1>
        <p>
          Tu clínica, tu equipo y tu asistente de voz.
          <br />
          Todo conectado en un mismo espacio.
        </p>
        <div className="login-powered">
          <Cloud size={16} /> Cloudflare <span>+</span> ElevenLabs
        </div>
      </div>
      <div className="login-form">
        <span className="eyebrow">BIENVENIDO A TU CLÍNICA</span>
        <h2>Qué gusto verte.</h2>
        <p>Entra al centro de operaciones de Sonrisa Norte.</p>
        <form onSubmit={submit}>
          <label>
            Contraseña de administración
            <input
              type="password"
              autoComplete="current-password"
              autoFocus
              placeholder="Ingresa tu contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && <div className="form-error">{error}</div>}
          <button className="button primary full" disabled={busy}>
            {busy ? (
              <Spinner />
            ) : (
              <>
                Entrar al dashboard <ArrowRight size={17} />
              </>
            )}
          </button>
        </form>
        <div className="login-note">
          <ShieldCheck size={19} />
          <span>
            Acceso privado al entorno de demostración.
            <br />
            Los pacientes de esta clínica son ficticios.
          </span>
        </div>
      </div>
    </div>
  );
}
function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action && <div className="heading-actions">{action}</div>}
    </div>
  );
}
function Overview({
  data,
  open,
  go,
}: {
  data: Dashboard;
  open: (m: ModalType) => void;
  go: (p: Page) => void;
}) {
  const todays = data.appointments.filter(
    (a) => day(a.starts_at) === data.today && a.status !== "cancelled",
  );
  const upcoming = data.appointments
    .filter(
      (a) => new Date(a.starts_at) > new Date() && a.status !== "cancelled",
    )
    .slice(0, 5);
  const visible = todays.length ? todays : upcoming;
  const confirmed = todays.filter((a) => a.status === "confirmed").length;
  const requests = data.requests.filter((r) => r.status !== "resolved").length;
  const metrics = [
    {
      label: "Citas de hoy",
      value: todays.length,
      detail: dateLabel(data.today, {
        weekday: "long",
        day: "numeric",
        month: "short",
      }),
      icon: CalendarDays,
      color: "green",
    },
    {
      label: "Conversaciones",
      value: data.conversations.length,
      detail: "En este entorno de prueba",
      icon: AudioLines,
      color: "blue",
    },
    {
      label: "Citas confirmadas",
      value: confirmed,
      detail: todays.length
        ? `${Math.round((confirmed / todays.length) * 100)}% de la agenda de hoy`
        : "Sin citas para hoy",
      icon: CheckCheck,
      color: "purple",
    },
    {
      label: "Requieren atención",
      value: requests,
      detail: requests
        ? "Solicitudes pendientes del equipo"
        : "Todo está al día",
      icon: Headphones,
      color: "amber",
    },
  ];
  return (
    <>
      <PageHeading
        eyebrow={dateLabel(data.today).toUpperCase()}
        title="Tu clínica, en sintonía."
        description="Una vista clara de tu día. Más espacio para cuidar a tus pacientes."
        action={
          <>
            <button
              className="button secondary"
              onClick={() => open({ type: "voice" })}
            >
              <AudioLines size={17} /> Probar agente
            </button>
            <button
              className="button primary"
              onClick={() => open({ type: "booking" })}
            >
              <Plus size={17} /> Nueva cita
            </button>
          </>
        }
      />
      <div className="demo-note">
        <span className="tiny-spark">
          <Sparkles size={14} />
        </span>
        <span>
          Tu clínica de demostración está lista. Explora con{" "}
          <strong>20 pacientes ficticios</strong>; las acciones se guardan en tu
          base de datos.
        </span>
        <span className="demo-note-tag">DEMO</span>
      </div>
      <div className="metrics">
        {metrics.map((m) => (
          <div className="metric" key={m.label}>
            <div className="metric-top">
              <span>{m.label}</span>
              <span className={"metric-icon " + m.color}>
                <m.icon size={18} />
              </span>
            </div>
            <strong>{m.value.toString().padStart(2, "0")}</strong>
            <small>
              {m.icon === Headphones && requests === 0 ? (
                <Check size={12} />
              ) : (
                <span className={"small-dot " + m.color} />
              )}{" "}
              {m.detail}
            </small>
          </div>
        ))}
      </div>
      <div className="overview-grid">
        <div className="card agenda-card">
          <div className="card-heading">
            <div>
              <h2>
                {todays.length ? "La agenda de hoy" : "Las próximas citas"}{" "}
                <span className="count-pill">{visible.length}</span>
              </h2>
              <p>
                {todays.length
                  ? "Cada paciente, en el momento indicado."
                  : "Hoy no hay citas. Así se ven los próximos días."}
              </p>
            </div>
            <button className="text-button" onClick={() => go("agenda")}>
              Ver agenda <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="agenda-table-wrap">
            <table className="data-table home-table">
              <thead>
                <tr>
                  <th>HORA</th>
                  <th>PACIENTE / SERVICIO</th>
                  <th>PROFESIONAL</th>
                  <th>ESTADO</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <strong className="time-value">
                        {time(a.starts_at)}
                      </strong>
                      <small>
                        {todays.length
                          ? `${Math.round((new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime()) / 60000)} min`
                          : dateLabel(a.starts_at, {
                              day: "numeric",
                              month: "short",
                            })}
                      </small>
                    </td>
                    <td>
                      <div className="person-cell">
                        <Avatar initials={a.initials ?? "P"} />
                        <span>
                          <strong>{a.patient_name}</strong>
                          <small>{a.service_name}</small>
                        </span>
                      </div>
                    </td>
                    <td>
                      <span
                        className="provider-dot"
                        style={{ background: a.color }}
                      />
                      {a.provider_name
                        ?.replace("Dra. ", "")
                        .replace("Dr. ", "")}
                    </td>
                    <td>
                      <Badge status={a.status} />
                    </td>
                    <td>
                      <button
                        className="icon-button"
                        aria-label={"Editar cita de " + a.patient_name}
                        onClick={() =>
                          open({
                            type: "booking",
                            appointment: a,
                            action: "move",
                          })
                        }
                      >
                        <MoreHorizontal size={19} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card-bottom">
            <span>
              <Clock3 size={14} /> Horarios de Monterrey
            </span>
            <button
              className="text-button"
              onClick={() => open({ type: "booking" })}
            >
              Agendar paciente <Plus size={14} />
            </button>
          </div>
        </div>
        <div className="agent-summary">
          <div className="agent-summary-top">
            <span className="eyebrow">TU RECEPCIÓN VIRTUAL</span>
            <span className="spark-icon">
              <Sparkles size={20} />
            </span>
          </div>
          <div className="voice-orb mini">
            <div />
            <div />
            <div />
            <AudioLines size={38} />
          </div>
          <h2>Hola, soy {data.settings.name}.</h2>
          <p>
            Resuelvo dudas, encuentro horarios
            <br />y acompaño a tus pacientes.
          </p>
          <span
            className={
              "agent-ready " + (!data.settings.remote_agent_id ? "pending" : "")
            }
          >
            <span />
            {data.settings.remote_agent_id
              ? data.settings.active
                ? "Agente publicado"
                : "Agente pausado"
              : "Pendiente de publicación"}
          </span>
          <button
            className="button cream full"
            onClick={() => open({ type: "voice" })}
          >
            <Mic size={17} /> Iniciar conversación <ArrowUpRight size={15} />
          </button>
          <button className="agent-settings-link" onClick={() => go("agent")}>
            Personalizar agente <Settings2 size={14} />
          </button>
        </div>
      </div>
      <div className="overview-lower">
        <div className="card">
          <div className="card-heading">
            <div>
              <h2>Actividad reciente</h2>
              <p>Lo que va pasando en tu clínica.</p>
            </div>
            <span className="live-label">
              <span /> Actualizado
            </span>
          </div>
          <div className="activity-list">
            {data.activities.slice(0, 4).map((a, i) => (
              <div className="activity-row" key={a.id}>
                <div
                  className={
                    "activity-icon " + (a.source === "agent" ? "blue" : "green")
                  }
                >
                  {a.type === "appointment" ? (
                    <CalendarDays size={16} />
                  ) : a.type === "knowledge" ? (
                    <FileText size={16} />
                  ) : a.type === "tool" ? (
                    <Zap size={16} />
                  ) : (
                    <Check size={16} />
                  )}
                </div>
                <div>
                  <strong>{a.title}</strong>
                  <p>{a.detail}</p>
                  <small>
                    {a.source === "agent"
                      ? "Agente de voz"
                      : a.source === "demo"
                        ? "Datos de demostración"
                        : "Administración"}
                  </small>
                </div>
                <span className="activity-time">
                  {i === 0
                    ? "Reciente"
                    : dateLabel(a.created_at.replace(" ", "T") + "Z", {
                        day: "numeric",
                        month: "short",
                      })}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="card knowledge-summary">
          <div className="card-heading">
            <div>
              <h2>Conocimiento que acompaña</h2>
              <p>La información que conoce tu agente.</p>
            </div>
            <BookOpen size={21} />
          </div>
          <div className="knowledge-count">
            <strong>{data.knowledge.length.toString().padStart(2, "0")}</strong>
            <span>
              documentos
              <br />
              en su biblioteca
            </span>
            <div className="stacked-docs">
              <FileText size={27} />
              <FileText size={27} />
            </div>
          </div>
          <div className="knowledge-progress">
            <div
              style={{
                width: `${data.knowledge.length ? (data.knowledge.filter((k) => k.version === k.published_version).length / data.knowledge.length) * 100 : 0}%`,
              }}
            />
          </div>
          <p className="knowledge-progress-label">
            {
              data.knowledge.filter((k) => k.version === k.published_version)
                .length
            }{" "}
            publicados{" "}
            <span>
              {
                data.knowledge.filter((k) => k.version !== k.published_version)
                  .length
              }{" "}
              por publicar
            </span>
          </p>
          <button
            className="button secondary full"
            onClick={() => go("knowledge")}
          >
            Explorar conocimiento <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </>
  );
}
function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="search-field">
      <Search size={17} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button onClick={() => onChange("")} aria-label="Limpiar búsqueda">
          <X size={14} />
        </button>
      )}
    </div>
  );
}
function Agenda({
  data,
  open,
  search,
  setSearch,
  refresh,
  notify,
}: {
  data: Dashboard;
  open: (m: ModalType) => void;
  search: string;
  setSearch: (v: string) => void;
  refresh: () => Promise<void>;
  notify: (s: string, e?: boolean) => void;
}) {
  const [date, setDate] = useState(data.today),
    [filter, setFilter] = useState("all"),
    [mode, setMode] = useState<"day" | "week">("day");
  const matches = (a: Appointment) =>
    `${a.patient_name} ${a.service_name}`
      .toLowerCase()
      .includes(search.toLowerCase()) &&
    (filter === "all" || a.provider_id === filter);
  const appointments = data.appointments.filter(
    (a) => day(a.starts_at) === date && matches(a),
  );
  return (
    <>
      <PageHeading
        eyebrow="TU DÍA, BIEN ORGANIZADO"
        title="Agenda de la clínica"
        description="Personas, profesionales y horarios. Todo en su lugar."
        action={
          <button
            className="button primary"
            onClick={() => open({ type: "booking" })}
          >
            <Plus size={17} /> Nueva cita
          </button>
        }
      />
      <div className="card">
        <div className="agenda-toolbar">
          <div className="date-controls">
            <button
              className="button secondary compact"
              onClick={() => setDate(data.today)}
            >
              Hoy
            </button>
            <button
              className="icon-button"
              aria-label="Día anterior"
              onClick={() => setDate(addDays(date, mode === "week" ? -7 : -1))}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              className="icon-button"
              aria-label="Día siguiente"
              onClick={() => setDate(addDays(date, mode === "week" ? 7 : 1))}
            >
              <ChevronRight size={18} />
            </button>
            <input
              aria-label="Fecha de agenda"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="segmented">
            <button
              className={mode === "day" ? "selected" : ""}
              onClick={() => setMode("day")}
            >
              Día
            </button>
            <button
              className={mode === "week" ? "selected" : ""}
              onClick={() => setMode("week")}
            >
              7 días
            </button>
          </div>
        </div>
        <div className="filter-toolbar">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Buscar paciente o servicio…"
          />
          <select
            aria-label="Filtrar por profesional"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">Todos los profesionales</option>
            {data.providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <span className="muted small">
            <Clock3 size={13} /> Monterrey
          </span>
        </div>
        {mode === "day" ? (
          appointments.length ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>HORARIO</th>
                    <th>PACIENTE</th>
                    <th>SERVICIO</th>
                    <th>PROFESIONAL</th>
                    <th>ESTADO</th>
                    <th>ACCIONES</th>
                  </tr>
                </thead>
                <tbody>
                  {appointments.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <strong>
                          {time(a.starts_at)} — {time(a.ends_at)}
                        </strong>
                        <small>Sillón {a.chair}</small>
                      </td>
                      <td>
                        <div className="person-cell">
                          <Avatar initials={a.initials ?? "P"} />
                          <strong>{a.patient_name}</strong>
                        </div>
                      </td>
                      <td>
                        {a.service_name}
                        <small>
                          {a.source === "agent"
                            ? "Agendada por Sofía"
                            : a.source === "demo"
                              ? "Cita de demostración"
                              : "Recepción"}
                        </small>
                      </td>
                      <td>
                        <span
                          className="provider-dot"
                          style={{ background: a.color }}
                        />
                        {a.provider_name}
                      </td>
                      <td>
                        <Badge status={a.status} />
                      </td>
                      <td>
                        <div className="row-actions">
                          {["booked", "confirmed"].includes(a.status) && (
                            <>
                              <button
                                className="text-button"
                                onClick={() =>
                                  open({
                                    type: "booking",
                                    appointment: a,
                                    action: "move",
                                  })
                                }
                              >
                                Cambiar
                              </button>
                              <button
                                className="icon-button danger-text"
                                aria-label={
                                  "Cancelar cita de " + a.patient_name
                                }
                                onClick={() =>
                                  open({
                                    type: "booking",
                                    appointment: a,
                                    action: "cancel",
                                  })
                                }
                              >
                                <X size={16} />
                              </button>
                            </>
                          )}
                          {a.status === "booked" && (
                            <button
                              className="icon-button"
                              aria-label="Confirmar asistencia"
                              onClick={() =>
                                void api("/appointments/" + a.id, {
                                  method: "PATCH",
                                  body: JSON.stringify({ status: "confirmed" }),
                                })
                                  .then(refresh)
                                  .catch((e) => notify(errorLabel(e), true))
                              }
                            >
                              <Check size={16} />
                            </button>
                          )}
                          {a.status === "confirmed" && (
                            <button
                              className="text-button"
                              onClick={() =>
                                void api("/appointments/" + a.id, {
                                  method: "PATCH",
                                  body: JSON.stringify({
                                    status: "checked_in",
                                  }),
                                }).then(refresh)
                              }
                            >
                              Llegó
                            </button>
                          )}
                          {a.status === "checked_in" && (
                            <button
                              className="text-button"
                              onClick={() =>
                                void api("/appointments/" + a.id, {
                                  method: "PATCH",
                                  body: JSON.stringify({ status: "completed" }),
                                }).then(refresh)
                              }
                            >
                              Completar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              icon={CalendarDays}
              title="Un espacio disponible"
              description="No hay citas para este día con los filtros seleccionados."
              action={
                <button
                  className="button secondary"
                  onClick={() => open({ type: "booking" })}
                >
                  <Plus size={16} /> Agendar una cita
                </button>
              }
            />
          )
        ) : (
          <div className="week-grid">
            {Array.from({ length: 7 }, (_, i) => addDays(date, i)).map((d) => (
              <div className="week-day" key={d}>
                <div
                  className={
                    "week-day-heading " + (d === data.today ? "today" : "")
                  }
                >
                  <span>{dateLabel(d, { weekday: "short" })}</span>
                  <strong>{dateLabel(d, { day: "numeric" })}</strong>
                </div>
                <div className="week-events">
                  {data.appointments
                    .filter(
                      (a) =>
                        day(a.starts_at) === d &&
                        matches(a) &&
                        a.status !== "cancelled",
                    )
                    .map((a) => (
                      <button
                        key={a.id}
                        className="week-event"
                        style={{ borderLeftColor: a.color }}
                        onClick={() =>
                          open({
                            type: "booking",
                            appointment: a,
                            action: "move",
                          })
                        }
                      >
                        <small>{time(a.starts_at)}</small>
                        <strong>{a.patient_name}</strong>
                        <span>{a.service_name}</span>
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
function Patients({
  data,
  open,
  search,
  setSearch,
}: {
  data: Dashboard;
  open: (m: ModalType) => void;
  search: string;
  setSearch: (v: string) => void;
}) {
  const patients = data.patients.filter((p) =>
    `${p.name} ${p.phone} ${p.email}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHeading
        eyebrow="EL CENTRO DE TODO"
        title="Tus pacientes"
        description="Conoce su próxima visita y mantén sus datos a la mano."
        action={
          <button
            className="button primary"
            onClick={() => open({ type: "patient" })}
          >
            <Plus size={17} /> Nuevo paciente
          </button>
        }
      />
      <div className="card">
        <div className="filter-toolbar">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Buscar por nombre, teléfono o correo…"
          />
          <span className="muted small">
            {patients.length} pacientes · datos ficticios
          </span>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>PACIENTE</th>
                <th>CONTACTO</th>
                <th>PRÓXIMA VISITA</th>
                <th>CITAS</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {patients.map((p) => {
                const appointments = data.appointments.filter(
                    (a) => a.patient_id === p.id,
                  ),
                  next = appointments.find(
                    (a) =>
                      new Date(a.starts_at) > new Date() &&
                      a.status !== "cancelled",
                  );
                return (
                  <tr
                    key={p.id}
                    onClick={() => open({ type: "patient", patient: p })}
                    className="clickable"
                  >
                    <td>
                      <div className="person-cell">
                        <Avatar initials={p.initials} size={39} />
                        <span>
                          <strong>{p.name}</strong>
                          <small>Paciente de demostración</small>
                        </span>
                      </div>
                    </td>
                    <td>
                      {p.phone}
                      <small>{p.email}</small>
                    </td>
                    <td>
                      {next ? (
                        <>
                          <strong>
                            {dateLabel(next.starts_at, {
                              day: "numeric",
                              month: "short",
                            })}{" "}
                            · {time(next.starts_at)}
                          </strong>
                          <small>{next.service_name}</small>
                        </>
                      ) : (
                        <span className="muted">Sin cita programada</span>
                      )}
                    </td>
                    <td>
                      {
                        appointments.filter((a) => a.status !== "cancelled")
                          .length
                      }
                    </td>
                    <td>
                      <button
                        className="icon-button"
                        aria-label={"Ver a " + p.name}
                        onClick={(e) => {
                          e.stopPropagation();
                          open({ type: "patient", patient: p });
                        }}
                      >
                        <ArrowUpRight size={18} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {patients.length === 0 && (
            <Empty
              icon={Users}
              title="Sin coincidencias"
              description="Prueba con otro nombre o contacto."
            />
          )}
        </div>
      </div>
    </>
  );
}
function Conversations({
  data,
  open,
  refresh,
  notify,
}: {
  data: Dashboard;
  open: (m: ModalType) => void;
  refresh: () => Promise<void>;
  notify: (s: string, e?: boolean) => void;
}) {
  const [busy, setBusy] = useState("");
  const sync = async (id: string) => {
    setBusy(id);
    try {
      await post("/conversations/" + id + "/sync");
      await refresh();
      notify("Conversación sincronizada.");
    } catch (e) {
      notify(errorLabel(e), true);
    } finally {
      setBusy("");
    }
  };
  return (
    <>
      <PageHeading
        eyebrow="ESCUCHA LO QUE IMPORTA"
        title="Cada conversación cuenta"
        description="Revisa lo que dijo tu agente y las acciones que realizó."
        action={
          <button
            className="button primary"
            onClick={() => open({ type: "voice" })}
          >
            <Mic size={17} /> Probar conversación
          </button>
        }
      />
      <div className="metrics three">
        <div className="metric">
          <span>Conversaciones registradas</span>
          <strong>
            {data.conversations.length.toString().padStart(2, "0")}
          </strong>
          <small>Desde que conectaste tu agente</small>
        </div>
        <div className="metric">
          <span>Tiempo de conversación</span>
          <strong>
            {Math.round(
              data.conversations.reduce((n, c) => n + c.duration, 0) / 60,
            )}
            <em> min</em>
          </strong>
          <small>Duración reportada por ElevenLabs</small>
        </div>
        <div className="metric">
          <span>Acciones del agente</span>
          <strong>
            {data.activities
              .filter((a) => a.source === "agent")
              .length.toString()
              .padStart(2, "0")}
          </strong>
          <small>Actividad reciente registrada</small>
        </div>
      </div>
      <div className="card">
        {data.conversations.length === 0 ? (
          <Empty
            title="La primera conversación empieza contigo"
            description="Prueba al agente desde el navegador. Aquí aparecerán la transcripción, la duración y el resumen real de cada conversación."
            action={
              <button
                className="button primary"
                onClick={() => open({ type: "voice" })}
              >
                <AudioLines size={17} /> Hablar con {data.settings.name}
              </button>
            }
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>PACIENTE</th>
                  <th>FECHA</th>
                  <th>DURACIÓN</th>
                  <th>ESTADO</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.conversations.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="person-cell">
                        <span className="conversation-icon">
                          <ArrowDownLeft size={18} />
                        </span>
                        <span>
                          <strong>
                            {data.patients.find((p) => p.id === c.patient_id)
                              ?.name ?? "Prueba de voz"}
                          </strong>
                          <small>Web · paciente ficticio</small>
                        </span>
                      </div>
                    </td>
                    <td>
                      {dateLabel(
                        c.started_at.includes("T")
                          ? c.started_at
                          : c.started_at.replace(" ", "T") + "Z",
                        {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )}
                    </td>
                    <td>
                      {Math.floor(c.duration / 60)}:
                      {String(c.duration % 60).padStart(2, "0")}
                    </td>
                    <td>
                      <Badge status={c.status} />
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="icon-button"
                          onClick={() => void sync(c.id)}
                          aria-label="Sincronizar conversación"
                        >
                          {busy === c.id ? (
                            <Spinner />
                          ) : (
                            <RefreshCw size={16} />
                          )}
                        </button>
                        <button
                          className="text-button"
                          onClick={() =>
                            open({ type: "conversation", conversation: c })
                          }
                        >
                          Ver detalle <ArrowUpRight size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="inline-note">
        <ShieldCheck size={17} />
        <span>
          Las citas se guardan durante la conversación. La transcripción sirve
          para revisar la atención y no modifica la agenda.
        </span>
      </div>
    </>
  );
}

function KnowledgePage({
  data,
  refresh,
  notify,
  publish,
  loading,
}: {
  data: Dashboard;
  refresh: () => Promise<void>;
  notify: (s: string, e?: boolean) => void;
  publish: () => Promise<void>;
  loading: boolean;
}) {
  const [selected, setSelected] = useState(data.knowledge[0]?.id ?? ""),
    [draft, setDraft] = useState<Knowledge | null>(null),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [showNew, setShowNew] = useState(false),
    [history, setHistory] = useState<
      { version: number; content: string; created_at: string }[] | null
    >(null);
  useEffect(() => {
    setDraft(data.knowledge.find((d) => d.id === selected) ?? null);
  }, [
    selected,
    data.knowledge.find((d) => d.id === selected)?.version,
    data.knowledge.find((d) => d.id === selected)?.published_version,
  ]);
  const save = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      await api("/knowledge/" + draft.id, {
        method: "PUT",
        body: JSON.stringify(draft),
      });
      await refresh();
      notify("Documento guardado como borrador. Publícalo cuando esté listo.");
    } catch (e) {
      notify(errorLabel(e), true);
    } finally {
      setBusy(false);
    }
  };
  const changed =
    !!draft &&
    (draft.content !== data.knowledge.find((d) => d.id === draft.id)?.content ||
      draft.title !== data.knowledge.find((d) => d.id === draft.id)?.title);
  return (
    <>
      <PageHeading
        eyebrow="LA BIBLIOTECA DE TU AGENTE"
        title="Conocimiento con propósito"
        description="Información clara y aprobada para responder con confianza."
        action={
          <>
            <button
              className="button secondary"
              onClick={() => setShowNew(true)}
            >
              <Plus size={17} /> Añadir documento
            </button>
            <button
              className="button primary"
              onClick={() => void publish()}
              disabled={loading || changed}
            >
              {loading ? <Spinner /> : <Cloud size={17} />} Publicar en
              ElevenLabs
            </button>
          </>
        }
      />
      <div className="knowledge-layout">
        <div className="card document-sidebar">
          <div className="document-sidebar-head">
            <h3>
              Documentos <span>{data.knowledge.length}</span>
            </h3>
            <SearchField
              value={query}
              onChange={setQuery}
              placeholder="Buscar documento…"
            />
          </div>
          <div className="document-list">
            {data.knowledge
              .filter((d) =>
                d.title.toLowerCase().includes(query.toLowerCase()),
              )
              .map((d) => (
                <button
                  key={d.id}
                  className={
                    "document-item " + (selected === d.id ? "selected" : "")
                  }
                  onClick={() => {
                    if (changed) {
                      notify(
                        "Guarda los cambios antes de abrir otro documento.",
                        true,
                      );
                      return;
                    }
                    setSelected(d.id);
                  }}
                >
                  <span className="document-icon">
                    <FileText size={19} />
                  </span>
                  <span>
                    <strong>{d.title}</strong>
                    <small>
                      {d.category} · v{d.version}
                    </small>
                  </span>
                  <span
                    className={
                      "doc-state " +
                      (d.published_version === d.version
                        ? "published"
                        : "draft")
                    }
                    title={
                      d.published_version === d.version
                        ? "Publicado"
                        : "Borrador"
                    }
                  />
                </button>
              ))}
          </div>
          <div className="document-sidebar-note">
            <ShieldCheck size={19} />
            <p>
              Solo información general de la clínica. Los datos de pacientes se
              consultan con permisos.
            </p>
          </div>
        </div>
        <div className="card document-editor">
          {draft ? (
            <>
              <div className="editor-toolbar">
                <span className="editor-type">
                  <FileText size={17} /> DOCUMENTO DE CONOCIMIENTO
                </span>
                <div className="row-actions">
                  <Badge
                    status={
                      draft.version === draft.published_version
                        ? "confirmed"
                        : "booked"
                    }
                  >
                    {draft.version === draft.published_version
                      ? "Publicado"
                      : "Borrador"}
                  </Badge>
                  <button
                    className="icon-button"
                    title="Ver versiones"
                    aria-label="Ver versiones"
                    onClick={() =>
                      void api<
                        {
                          version: number;
                          content: string;
                          created_at: string;
                        }[]
                      >("/knowledge/" + draft.id + "/revisions")
                        .then(setHistory)
                        .catch((e) => notify(errorLabel(e), true))
                    }
                  >
                    <Clock3 size={17} />
                  </button>
                </div>
              </div>
              <div className="document-editor-body">
                <label className="sr-only" htmlFor="doc-title">
                  Título del documento
                </label>
                <input
                  id="doc-title"
                  className="document-title"
                  value={draft.title}
                  onChange={(e) =>
                    setDraft({ ...draft, title: e.target.value })
                  }
                />
                <div className="document-meta">
                  <span>{draft.category}</span>
                  <span>Versión {draft.version}</span>
                  <span>
                    {draft.content.length.toLocaleString("es-MX")} caracteres
                  </span>
                </div>
                <label className="sr-only" htmlFor="doc-content">
                  Contenido del documento
                </label>
                <textarea
                  id="doc-content"
                  className="document-content"
                  value={draft.content}
                  onChange={(e) =>
                    setDraft({ ...draft, content: e.target.value })
                  }
                  spellCheck={false}
                />
              </div>
              <div className="editor-footer">
                <span>
                  {changed ? (
                    <>
                      <span className="unsaved-dot" /> Cambios sin guardar
                    </>
                  ) : (
                    <>
                      <Check size={14} /> Guardado en Cloudflare
                    </>
                  )}
                </span>
                <button
                  className="button primary compact"
                  disabled={!changed || busy}
                  onClick={() => void save()}
                >
                  {busy ? <Spinner /> : <Save size={15} />} Guardar borrador
                </button>
              </div>
            </>
          ) : (
            <Empty
              icon={BookOpen}
              title="Tu biblioteca empieza aquí"
              description="Añade un documento para que tu agente conozca la clínica."
            />
          )}
        </div>
      </div>
      <div className="inline-note">
        <Sparkles size={17} />
        <span>
          Guardar conserva un borrador. Publicar actualiza el conocimiento del
          agente en ElevenLabs y mantiene un historial de versiones.
        </span>
      </div>
      {showNew && (
        <NewDocumentModal
          close={() => setShowNew(false)}
          done={async (id) => {
            setShowNew(false);
            await refresh();
            setSelected(id);
            notify("Documento añadido a la biblioteca.");
          }}
          notify={notify}
        />
      )}
      {history && (
        <Modal
          title="Historial del documento"
          subtitle="Versiones conservadas en Cloudflare."
          onClose={() => setHistory(null)}
          wide
        >
          <div className="revision-list">
            {history.map((h) => (
              <details key={h.version}>
                <summary>
                  Versión {h.version}
                  <span>{h.created_at}</span>
                </summary>
                <pre>{h.content}</pre>
              </details>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
function NewDocumentModal({
  close,
  done,
  notify,
}: {
  close: () => void;
  done: (id: string) => Promise<void>;
  notify: (s: string, e?: boolean) => void;
}) {
  const [title, setTitle] = useState(""),
    [category, setCategory] = useState("Clínica"),
    [content, setContent] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title="Nuevo documento"
      subtitle="Añade información que el agente pueda consultar."
      onClose={close}
    >
      <form
        className="form-body"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const r = await post<{ id: string }>("/knowledge", {
              title,
              category,
              content,
            });
            await done(r.id);
          } catch (e) {
            notify(errorLabel(e), true);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Título
          <input
            required
            minLength={3}
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Por ejemplo: estacionamiento y acceso"
          />
        </label>
        <label>
          Categoría
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {[
              "Clínica",
              "Servicios",
              "Políticas",
              "Administración",
              "Pacientes",
              "Protocolos",
            ].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Contenido
          <textarea
            required
            minLength={20}
            rows={9}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Escribe información clara, vigente y aprobada…"
          />
        </label>
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={close}>
            Cancelar
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? <Spinner /> : <Plus size={16} />} Añadir documento
          </button>
        </div>
      </form>
    </Modal>
  );
}
interface VoiceOption {
  id: string;
  name: string;
  labels: Record<string, string>;
  preview_url: string;
}
function AgentPage({
  data,
  refresh,
  notify,
  publish,
  loading,
  test,
}: {
  data: Dashboard;
  refresh: () => Promise<void>;
  notify: (s: string, e?: boolean) => void;
  publish: () => Promise<void>;
  loading: boolean;
  test: () => void;
}) {
  const [s, setS] = useState<AgentSettings>(data.settings),
    [tab, setTab] = useState("personality"),
    [voices, setVoices] = useState<VoiceOption[]>([]),
    [key, setKey] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(
    () => setS(data.settings),
    [
      data.settings.version,
      data.settings.published_version,
      data.settings.remote_agent_id,
    ],
  );
  useEffect(() => {
    if (data.integration.connected)
      void api<{ voices: VoiceOption[] }>("/voices")
        .then((r) =>
          setVoices(
            r.voices.sort(
              (a, b) =>
                Number(b.labels.language === "es") -
                Number(a.labels.language === "es"),
            ),
          ),
        )
        .catch((e) => notify(errorLabel(e), true));
  }, [data.integration.connected, notify]);
  const update = <K extends keyof AgentSettings>(
    k: K,
    value: AgentSettings[K],
  ) => setS({ ...s, [k]: value });
  const dirty = JSON.stringify(s) !== JSON.stringify(data.settings);
  const save = async () => {
    setBusy(true);
    try {
      await api("/agent", { method: "PUT", body: JSON.stringify(s) });
      await refresh();
      notify("Configuración guardada. Publica para aplicarla a ElevenLabs.");
    } catch (e) {
      notify(errorLabel(e), true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeading
        eyebrow="UNA VOZ, TU PERSONALIDAD"
        title="Conoce a tu agente"
        description="Dale el tono de tu clínica y acompaña cada conversación."
        action={
          <>
            <button className="button secondary" onClick={test}>
              <Play size={16} /> Probar agente
            </button>
            <button
              className="button primary"
              disabled={loading || busy || dirty}
              onClick={() => void publish()}
            >
              {loading ? <Spinner /> : <Cloud size={17} />} Publicar cambios
            </button>
          </>
        }
      />
      <div className="agent-layout">
        <div>
          <div className="card agent-config">
            <div className="tabs">
              <button
                className={tab === "personality" ? "active" : ""}
                onClick={() => setTab("personality")}
              >
                <Sparkles size={16} /> Personalidad
              </button>
              <button
                className={tab === "voice" ? "active" : ""}
                onClick={() => setTab("voice")}
              >
                <AudioLines size={16} /> Voz y conversación
              </button>
              <button
                className={tab === "connections" ? "active" : ""}
                onClick={() => setTab("connections")}
              >
                <Zap size={16} /> Conexiones
              </button>
            </div>
            {tab === "personality" && (
              <div className="form-body">
                <div className="section-label">
                  <span className="section-icon">
                    <Sparkles size={18} />
                  </span>
                  <div>
                    <h3>Así se presenta tu clínica</h3>
                    <p>Una bienvenida que se sienta cercana.</p>
                  </div>
                </div>
                <div className="form-grid">
                  <label>
                    Nombre del agente
                    <input
                      value={s.name}
                      onChange={(e) => update("name", e.target.value)}
                    />
                  </label>
                  <label>
                    Idioma
                    <input value="Español · México" disabled />
                  </label>
                </div>
                <label>
                  Mensaje de bienvenida
                  <textarea
                    rows={3}
                    value={s.first_message}
                    onChange={(e) => update("first_message", e.target.value)}
                  />
                  <small>Lo primero que escucharán tus pacientes.</small>
                </label>
                <label>
                  Estilo e instrucciones de atención
                  <textarea
                    rows={7}
                    value={s.instructions}
                    onChange={(e) => update("instructions", e.target.value)}
                  />
                  <small>
                    Describe el tono, las expresiones y cómo quieres que
                    atienda.
                  </small>
                </label>
                <div className="locked-note">
                  <ShieldCheck size={19} />
                  <div>
                    <strong>Los límites de atención están protegidos</strong>
                    <p>
                      El agente no diagnostica, no receta y verifica permisos
                      para modificar citas. Estas reglas se mantienen al
                      publicar.
                    </p>
                  </div>
                </div>
              </div>
            )}
            {tab === "voice" && (
              <div className="form-body">
                <div className="section-label">
                  <span className="section-icon">
                    <AudioLines size={18} />
                  </span>
                  <div>
                    <h3>Una voz que inspira confianza</h3>
                    <p>Elige una voz disponible en tu cuenta de ElevenLabs.</p>
                  </div>
                </div>
                <label>
                  Voz del agente
                  <select
                    value={s.voice_id}
                    onChange={(e) => update("voice_id", e.target.value)}
                  >
                    <option value="">Selecciona una voz</option>
                    {voices.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                        {v.labels.language === "es" ? " · Español" : ""}
                        {v.labels.accent ? " · " + v.labels.accent : ""}
                      </option>
                    ))}
                  </select>
                </label>
                {voices.find((v) => v.id === s.voice_id)?.preview_url && (
                  <div className="voice-preview">
                    <span>Escucha una muestra</span>
                    <audio
                      controls
                      src={voices.find((v) => v.id === s.voice_id)?.preview_url}
                    />
                  </div>
                )}
                <label>
                  Velocidad{" "}
                  <span className="range-value">{s.speed.toFixed(2)}×</span>
                  <input
                    type="range"
                    min="0.7"
                    max="1.2"
                    step="0.05"
                    value={s.speed}
                    onChange={(e) => update("speed", Number(e.target.value))}
                  />
                  <small>
                    Una conversación pausada ayuda a confirmar los detalles.
                  </small>
                </label>
                <div className="form-grid">
                  <label>
                    Modelo de conversación
                    <select
                      value={s.llm}
                      onChange={(e) => update("llm", e.target.value)}
                    >
                      <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                      <option value="gpt-4.1">GPT-4.1</option>
                      <option value="gpt-4.1-mini">GPT-4.1 mini</option>
                    </select>
                  </label>
                  <label>
                    Duración máxima
                    <select
                      value={s.max_duration}
                      onChange={(e) =>
                        update("max_duration", Number(e.target.value))
                      }
                    >
                      <option value={300}>5 minutos</option>
                      <option value={600}>10 minutos</option>
                      <option value={900}>15 minutos</option>
                      <option value={1200}>20 minutos</option>
                    </select>
                  </label>
                </div>
              </div>
            )}
            {tab === "connections" && (
              <div className="form-body">
                <div className="connection-card">
                  <span className="integration-logo">Ⅱ</span>
                  <div>
                    <h3>ElevenLabs Agents</h3>
                    <p>Voz, conversación y conocimiento del agente.</p>
                  </div>
                  <Badge
                    status={data.integration.connected ? "confirmed" : "booked"}
                  >
                    {data.integration.connected ? "Conectado" : "Pendiente"}
                  </Badge>
                </div>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    try {
                      await post("/integrations/elevenlabs", { api_key: key });
                      setKey("");
                      await refresh();
                      notify("ElevenLabs conectado correctamente.");
                    } catch (e) {
                      notify(errorLabel(e), true);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <label>
                    {data.integration.connected
                      ? "Actualizar API key"
                      : "API key de ElevenLabs"}
                    <input
                      type="password"
                      autoComplete="off"
                      value={key}
                      onChange={(e) => setKey(e.target.value)}
                      placeholder="La clave se guarda cifrada; nunca vuelve al navegador."
                      required
                      minLength={20}
                    />
                  </label>
                  <button className="button secondary" disabled={busy || !key}>
                    {busy ? <Spinner /> : <ShieldCheck size={16} />} Verificar y
                    guardar clave
                  </button>
                </form>
                <div className="connection-card">
                  <span className="integration-logo cloud">
                    <Cloud size={24} />
                  </span>
                  <div>
                    <h3>Cloudflare Workers + D1</h3>
                    <p>Agenda, pacientes, configuración y actividad.</p>
                  </div>
                  <Badge status="confirmed">Conectado</Badge>
                </div>
                <div className="connection-card">
                  <span className="integration-logo muted">
                    <Send size={22} />
                  </span>
                  <div>
                    <h3>SMS y telefonía</h3>
                    <p>Etapa posterior. No se envían mensajes en esta demo.</p>
                  </div>
                  <Badge status="neutral">Sin conectar</Badge>
                </div>
                <div className="inline-note">
                  <ShieldCheck size={18} />
                  <p>
                    Esta versión usa pacientes ficticios elegidos por
                    administración. La verificación OTP con pacientes reales
                    requiere conectar SMS y aprobar el flujo.
                  </p>
                </div>
              </div>
            )}
            <div className="editor-footer">
              <span>
                {dirty ? (
                  <>
                    <span className="unsaved-dot" /> Cambios sin guardar
                  </>
                ) : (
                  <>
                    <Check size={14} /> Borrador guardado · v{s.version}
                  </>
                )}
              </span>
              <button
                className="button primary compact"
                disabled={!dirty || busy}
                onClick={() => void save()}
              >
                {busy ? <Spinner /> : <Save size={15} />} Guardar cambios
              </button>
            </div>
          </div>
          <div className="card publication-card">
            <div>
              <h3>Control de publicación</h3>
              <p>
                {s.published_version
                  ? `Versión ${s.published_version} publicada. Los borradores no cambian conversaciones existentes.`
                  : "El agente necesita una primera publicación para recibir conversaciones."}
              </p>
            </div>
            <Badge
              status={
                s.version === s.published_version ? "confirmed" : "booked"
              }
            >
              {s.version === s.published_version ? "Al día" : "Por publicar"}
            </Badge>
          </div>
          {data.publications.length > 0 && (
            <div className="publication-history">
              {data.publications.slice(0, 3).map((p) => (
                <p key={p.id}>
                  <span
                    className={
                      "doc-state " +
                      (p.state === "completed" ? "published" : "draft")
                    }
                  />
                  {p.detail || "Publicación en curso"}
                </p>
              ))}
            </div>
          )}
        </div>
        <div className="agent-preview-column">
          <div className="agent-summary tall">
            <div className="agent-summary-top">
              <span className="eyebrow">ASÍ SE SENTIRÁ TU AGENTE</span>
              <Sparkles size={19} />
            </div>
            <div className="voice-orb">
              <div />
              <div />
              <div />
              <AudioLines size={44} />
            </div>
            <h2>{s.name}</h2>
            <p>Asistente virtual de Sonrisa Norte</p>
            <div className="greeting-preview">“{s.first_message}”</div>
            <button className="button cream full" onClick={test}>
              <Mic size={17} /> Escuchar al agente
            </button>
            <span className="preview-caption">
              La prueba usa la última versión publicada.
            </span>
          </div>
          <div className="card pause-card">
            <div>
              <strong>Disponibilidad del agente</strong>
              <p>
                {s.active
                  ? "Permite iniciar pruebas de voz"
                  : "Las nuevas sesiones están pausadas"}
              </p>
            </div>
            <button
              className={"toggle " + (s.active ? "on" : "")}
              role="switch"
              aria-checked={s.active}
              aria-label="Disponibilidad del agente"
              onClick={() => update("active", !s.active)}
            >
              <span />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
function BookingModal({
  data,
  appointment,
  action,
  close,
  done,
  notify,
}: {
  data: Dashboard;
  appointment?: Appointment;
  action?: "move" | "cancel";
  close: () => void;
  done: () => void;
  notify: (s: string, e?: boolean) => void;
}) {
  const [patient, setPatient] = useState(
      appointment?.patient_id ?? data.patients[0]?.id ?? "",
    ),
    [service, setService] = useState(appointment?.service_id ?? "valoracion"),
    [date, setDate] = useState(
      appointment ? day(appointment.starts_at) : data.today,
    ),
    [provider, setProvider] = useState(""),
    [slots, setSlots] = useState<
      {
        starts_at: string;
        provider_id: string;
        provider_name: string;
        chair: number;
      }[]
    >([]),
    [slot, setSlot] = useState(""),
    [busy, setBusy] = useState(false),
    [operation, setOperation] = useState<{
      operation_id: string;
      service: string;
      starts_at: string;
      provider_name: string;
    } | null>(null),
    [searched, setSearched] = useState(false);
  const search = async () => {
    setBusy(true);
    setSlot("");
    try {
      const q = new URLSearchParams({ service_id: service, date });
      if (provider) q.set("provider_id", provider);
      if (appointment) q.set("appointment_id", appointment.id);
      const r = await api<{ slots: typeof slots }>("/availability?" + q);
      setSlots(r.slots);
      setSearched(true);
    } catch (e) {
      notify(errorLabel(e), true);
    } finally {
      setBusy(false);
    }
  };
  const prepareChange = async () => {
    setBusy(true);
    try {
      const selected = slots.find((s, i) => String(i) === slot);
      const r = await post<{
        operation_id: string;
        service: string;
        starts_at: string;
        provider_name: string;
      }>("/appointments/prepare", {
        action: action ?? "create",
        appointment_id: appointment?.id,
        patient_id: patient,
        service_id: service,
        ...selected,
      });
      setOperation(r);
    } catch (e) {
      notify(errorLabel(e), true);
    } finally {
      setBusy(false);
    }
  };
  const commitChange = async () => {
    if (!operation) return;
    setBusy(true);
    try {
      await post("/appointments/commit", {
        operation_id: operation.operation_id,
      });
      done();
    } catch (e) {
      notify(errorLabel(e), true);
      setOperation(null);
      setSlots([]);
      setSearched(false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={
        action === "cancel"
          ? "Cancelar cita"
          : action === "move"
            ? "Reprogramar cita"
            : "Una nueva visita"
      }
      subtitle={
        operation
          ? "Revisa los detalles antes de confirmar."
          : "Encuentra el momento indicado para tu paciente."
      }
      onClose={close}
    >
      <div className="form-body">
        {operation ? (
          <>
            <div className="booking-confirm">
              <span className="confirm-icon">
                {action === "cancel" ? (
                  <X size={27} />
                ) : (
                  <CalendarDays size={27} />
                )}
              </span>
              <h3>
                {action === "cancel"
                  ? "¿Confirmas la cancelación?"
                  : "¿Todo está correcto?"}
              </h3>
              <p>{data.patients.find((p) => p.id === patient)?.name}</p>
              <dl>
                <div>
                  <dt>Servicio</dt>
                  <dd>{operation.service}</dd>
                </div>
                <div>
                  <dt>Fecha</dt>
                  <dd>{dateLabel(operation.starts_at)}</dd>
                </div>
                <div>
                  <dt>Hora</dt>
                  <dd>{time(operation.starts_at)} · Monterrey</dd>
                </div>
                {operation.provider_name && (
                  <div>
                    <dt>Profesional</dt>
                    <dd>{operation.provider_name}</dd>
                  </div>
                )}
              </dl>
            </div>
            <div className="inline-note">
              <Clock3 size={16} />
              <span>
                Esta opción se mantiene durante 2 minutos. La agenda cambia al
                confirmar.
              </span>
            </div>
            <div className="form-actions">
              <button
                className="button secondary"
                onClick={() => setOperation(null)}
              >
                Volver
              </button>
              <button
                className={
                  "button " + (action === "cancel" ? "danger" : "primary")
                }
                disabled={busy}
                onClick={() => void commitChange()}
              >
                {busy ? <Spinner /> : <Check size={17} />}{" "}
                {action === "cancel"
                  ? "Confirmar cancelación"
                  : "Confirmar cita"}
              </button>
            </div>
          </>
        ) : action === "cancel" ? (
          <>
            <div className="cancel-summary">
              <CalendarDays size={30} />
              <h3>{appointment?.patient_name}</h3>
              <p>{appointment?.service_name}</p>
              <strong>
                {appointment && dateLabel(appointment.starts_at)} ·{" "}
                {appointment && time(appointment.starts_at)}
              </strong>
            </div>
            <p className="muted">
              La cita quedará en el historial como cancelada y se liberará el
              horario.
            </p>
            <button
              className="button danger full"
              onClick={() => void prepareChange()}
              disabled={busy}
            >
              {busy ? <Spinner /> : "Revisar cancelación"}
            </button>
          </>
        ) : (
          <>
            <label>
              Paciente
              <select
                value={patient}
                disabled={!!appointment}
                onChange={(e) => setPatient(e.target.value)}
              >
                {data.patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Servicio
              <select
                value={service}
                onChange={(e) => {
                  setService(e.target.value);
                  setSearched(false);
                  setSlots([]);
                  setProvider("");
                }}
              >
                {data.services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.duration} min · {money(s.price)}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-grid">
              <label>
                Fecha
                <input
                  type="date"
                  min={data.today}
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setSearched(false);
                    setSlots([]);
                  }}
                />
              </label>
              <label>
                Profesional
                <select
                  value={provider}
                  onChange={(e) => {
                    setProvider(e.target.value);
                    setSlots([]);
                    setSearched(false);
                  }}
                >
                  <option value="">Cualquier disponible</option>
                  {data.providers
                    .filter(
                      (p) =>
                        p.specialty ===
                        data.services.find((s) => s.id === service)?.specialty,
                    )
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <button
              className="button secondary full"
              onClick={() => void search()}
              disabled={busy}
            >
              {busy ? <Spinner /> : <Search size={16} />} Consultar
              disponibilidad
            </button>
            {searched &&
              (slots.length ? (
                <div className="slot-section">
                  <label>Elige un horario</label>
                  <div className="slot-grid">
                    {slots.map((s, i) => (
                      <button
                        key={i}
                        className={
                          "slot " + (slot === String(i) ? "selected" : "")
                        }
                        onClick={() => setSlot(String(i))}
                      >
                        <strong>{time(s.starts_at)}</strong>
                        <small>
                          {s.provider_name
                            .replace("Dra. ", "")
                            .replace("Dr. ", "")}
                        </small>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="form-error">
                  No hay horarios disponibles. Prueba otra fecha o profesional.
                </p>
              ))}
            <div className="form-actions">
              <button className="button secondary" onClick={close}>
                Cancelar
              </button>
              <button
                className="button primary"
                disabled={!slot || busy}
                onClick={() => void prepareChange()}
              >
                Revisar cita <ArrowRight size={16} />
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
function PatientModal({
  data,
  patient,
  close,
  done,
  notify,
}: {
  data: Dashboard;
  patient?: Patient;
  close: () => void;
  done: () => void;
  notify: (s: string, e?: boolean) => void;
}) {
  const [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [email, setEmail] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title={patient ? "Perfil del paciente" : "Nuevo paciente de prueba"}
      subtitle="Este entorno solo utiliza información ficticia."
      onClose={close}
    >
      {patient ? (
        <div className="form-body">
          <div className="patient-profile">
            <Avatar initials={patient.initials} size={62} />
            <div>
              <h3>{patient.name}</h3>
              <p>{patient.phone}</p>
              <p>{patient.email}</p>
            </div>
          </div>
          <h3>Visitas registradas</h3>
          <div className="patient-visits">
            {data.appointments
              .filter((a) => a.patient_id === patient.id)
              .map((a) => (
                <div key={a.id}>
                  <span>
                    <strong>{a.service_name}</strong>
                    <small>
                      {dateLabel(a.starts_at, {
                        day: "numeric",
                        month: "long",
                      })}{" "}
                      · {time(a.starts_at)}
                    </small>
                  </span>
                  <Badge status={a.status} />
                </div>
              ))}
          </div>
        </div>
      ) : (
        <form
          className="form-body"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await post("/patients", { name, phone, email });
              done();
            } catch (e) {
              notify(errorLabel(e), true);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Nombre completo
            <input
              required
              minLength={3}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre del paciente ficticio"
            />
          </label>
          <label>
            Teléfono de prueba
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+52 81 0000 0000"
            />
          </label>
          <label>
            Correo (opcional)
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="paciente@example.com"
            />
          </label>
          <div className="form-actions">
            <button type="button" className="button secondary" onClick={close}>
              Cancelar
            </button>
            <button className="button primary" disabled={busy}>
              {busy ? <Spinner /> : <Plus size={16} />} Registrar paciente
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
function TranscriptModal({
  conversation,
  close,
}: {
  conversation: Conversation;
  close: () => void;
}) {
  let transcript: {
    role: string;
    message: string | null;
    time_in_call_secs: number;
  }[] = [];
  try {
    transcript = JSON.parse(conversation.transcript);
  } catch {
    /* Show empty state for unavailable transcripts. */
  }
  return (
    <Modal
      title="Detalle de conversación"
      subtitle={conversation.id}
      onClose={close}
      wide
    >
      <div className="form-body">
        {conversation.summary && (
          <div className="conversation-summary">
            <Sparkles size={19} />
            <div>
              <strong>Resumen de la conversación</strong>
              <p>{conversation.summary}</p>
            </div>
          </div>
        )}
        <div className="transcript">
          {transcript.length ? (
            transcript
              .filter((t) => t.message)
              .map((t, i) => (
                <div key={i} className={"transcript-message " + t.role}>
                  <span>
                    {t.role === "agent" ? "Asistente" : "Paciente"}{" "}
                    <small>{Math.floor(t.time_in_call_secs)} s</small>
                  </span>
                  <p>{t.message}</p>
                </div>
              ))
          ) : (
            <Empty
              icon={FileText}
              title="Transcripción pendiente"
              description="Sincroniza la conversación cuando ElevenLabs termine de procesarla."
            />
          )}
        </div>
      </div>
    </Modal>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
