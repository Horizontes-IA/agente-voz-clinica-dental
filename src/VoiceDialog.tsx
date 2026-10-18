import React, { useState, useRef, useCallback } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import {
  AudioLines,
  Mic,
  MicOff,
  Pause,
  ShieldCheck,
  CircleHelp,
  Send,
} from "lucide-react";
import { post, errorLabel, type Dashboard } from "./lib";
import { Modal, Spinner } from "./ui";
function VoiceModal({
  data,
  close,
  refresh,
  notify,
}: {
  data: Dashboard;
  close: () => void;
  refresh: () => Promise<void>;
  notify: (s: string, e?: boolean) => void;
}) {
  const [patient, setPatient] = useState(data.patients[0]?.id ?? ""),
    [busy, setBusy] = useState(false),
    [messages, setMessages] = useState<{ role: string; message: string }[]>([]),
    [input, setInput] = useState("");
  const session = useRef(""),
    conversationId = useRef("");
  const finish = useCallback(async () => {
    const id = session.current;
    if (id) {
      await post("/voice/" + id + "/end").catch(() => {});
      session.current = "";
    }
    if (conversationId.current) {
      await post("/conversations/" + conversationId.current + "/sync").catch(
        () => {},
      );
    }
    await refresh();
  }, [refresh]);
  const conversation = useConversation({
    onMessage: (m) =>
      setMessages((prev) => [...prev, { role: m.source, message: m.message }]),
    onConnect: ({ conversationId: id }) => {
      setBusy(false);
      conversationId.current = id;
      void post("/voice/" + session.current + "/attach", {
        conversation_id: id,
      })
        .then(refresh)
        .catch((e) => notify(errorLabel(e), true));
    },
    onDisconnect: () => {
      setBusy(false);
      void finish();
    },
    onError: (message) => {
      setBusy(false);
      notify(message, true);
      void finish();
    },
  });
  const connected = conversation.status === "connected",
    connecting = conversation.status === "connecting" || busy;
  const start = async () => {
    setBusy(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      const r = await post<{
        signed_url: string;
        session_id: string;
        dynamic_variables: Record<string, string>;
      }>("/voice/session", { patient_id: patient });
      session.current = r.session_id;
      setMessages([]);
      conversation.startSession({
        signedUrl: r.signed_url,
        connectionType: "websocket",
        dynamicVariables: r.dynamic_variables,
      });
    } catch (e) {
      setBusy(false);
      notify(errorLabel(e), true);
    }
  };
  const stop = () => {
    conversation.endSession();
    void finish();
  };
  const dismiss = () => {
    if (connected || connecting) stop();
    close();
  };
  return (
    <Modal
      title="Una conversación con Sofía"
      subtitle="Voz real de ElevenLabs · acciones reales sobre datos ficticios."
      onClose={dismiss}
      wide
    >
      <div className="voice-test-layout">
        <div className="voice-test-main">
          <div
            className={"voice-orb test-orb " + (connected ? "animated" : "")}
          >
            <div />
            <div />
            <div />
            <AudioLines size={52} />
          </div>
          <h2>
            {connected
              ? conversation.isSpeaking
                ? "Sofía está hablando…"
                : "Te escucho."
              : "Hablemos de tu próxima visita."}
          </h2>
          <p>
            {connected
              ? "Puedes hablar con naturalidad e interrumpir cuando lo necesites."
              : "Elige un paciente ficticio y permite el acceso al micrófono."}
          </p>
          <label className="voice-patient">
            Paciente de prueba
            <select
              disabled={connected || connecting}
              value={patient}
              onChange={(e) => setPatient(e.target.value)}
            >
              {data.patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {!data.settings.remote_agent_id ? (
            <div className="inline-note">
              <CircleHelp size={18} />
              <span>
                Publica el agente desde «Agente de voz» para iniciar la primera
                conversación.
              </span>
            </div>
          ) : (
            <div className="voice-test-controls">
              {connected ? (
                <>
                  <button
                    className="icon-button mute-button"
                    aria-label={
                      conversation.isMuted
                        ? "Activar micrófono"
                        : "Silenciar micrófono"
                    }
                    onClick={() => conversation.setMuted(!conversation.isMuted)}
                  >
                    {conversation.isMuted ? (
                      <MicOff size={21} />
                    ) : (
                      <Mic size={21} />
                    )}
                  </button>
                  <button className="button danger" onClick={stop}>
                    <Pause size={17} /> Terminar prueba
                  </button>
                </>
              ) : (
                <button
                  className="button primary"
                  disabled={connecting}
                  onClick={() => void start()}
                >
                  {connecting ? <Spinner /> : <Mic size={18} />}{" "}
                  {connecting ? "Conectando…" : "Iniciar conversación"}
                </button>
              )}
            </div>
          )}
          <span className="voice-security">
            <ShieldCheck size={14} /> Identidad de prueba preseleccionada. Sin
            OTP ni SMS.
          </span>
        </div>
        <div className="voice-live-transcript">
          <div className="card-heading">
            <h3>En esta conversación</h3>
            <span className={"small-dot " + (connected ? "green" : "")} />
          </div>
          <div className="live-messages">
            {messages.length ? (
              messages.map((m, i) => (
                <div key={i} className={"transcript-message " + m.role}>
                  <span>{m.role === "ai" ? "Sofía" : "Tú"}</span>
                  <p>{m.message}</p>
                </div>
              ))
            ) : (
              <div className="suggestions">
                <AudioLines size={26} />
                <p>La conversación aparecerá aquí.</p>
                <span>Prueba con…</span>
                <blockquote>“¿Qué servicios tienen?”</blockquote>
                <blockquote>
                  “Quiero agendar una valoración para mañana.”
                </blockquote>
                <blockquote>“¿Cuándo es mi próxima cita?”</blockquote>
              </div>
            )}
          </div>
          {connected && (
            <form
              className="voice-text-input"
              onSubmit={(e) => {
                e.preventDefault();
                if (input.trim()) {
                  conversation.sendUserMessage(input);
                  setMessages((prev) => [
                    ...prev,
                    { role: "user", message: input },
                  ]);
                  setInput("");
                }
              }}
            >
              <input
                aria-label="Enviar un mensaje al agente"
                placeholder="También puedes escribir…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
              <button aria-label="Enviar mensaje" disabled={!input.trim()}>
                <Send size={17} />
              </button>
            </form>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default function VoiceDialog(props: Parameters<typeof VoiceModal>[0]) {
  return (
    <ConversationProvider>
      <VoiceModal {...props} />
    </ConversationProvider>
  );
}
