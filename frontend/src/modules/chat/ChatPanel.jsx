import { useCallback, useEffect, useRef, useState } from "react";
import apiClient from "../../api/client";
import styles from "../conference/Conference.module.scss";

const CHAT_MESSAGE_LIMIT = 1500;
const CHAT_HISTORY_LIMIT = 200;

const formatChatTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

function SendIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="m4 15 24-10-8 22-5-9-11-3Z" />
      <path d="m15 18 13-13" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M5 6h22v15H13l-7 6v-6H5V6Z" />
      <path d="M10 11h12M10 16h8" />
    </svg>
  );
}

function ChatPanel({
  open,
  active,
  inviteCode,
  currentUserId,
  onClose,
  onIncoming,
  onError,
}) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [connectionState, setConnectionState] = useState("disconnected");
  const socketRef = useRef(null);
  const listRef = useRef(null);
  const openRef = useRef(open);
  const onIncomingRef = useRef(onIncoming);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    onIncomingRef.current = onIncoming;
    onErrorRef.current = onError;
  }, [onError, onIncoming]);

  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    });
  }, [open, messages.length]);

  useEffect(() => {
    setMessages([]);
    setDraft("");
  }, [inviteCode]);

  useEffect(() => {
    if (!active || !inviteCode) {
      socketRef.current?.close();
      socketRef.current = null;
      setConnectionState("disconnected");
      return undefined;
    }

    const socket = apiClient.openChatSocket(inviteCode);
    socketRef.current = socket;
    setConnectionState("connecting");

    socket.onopen = () => {
      if (socketRef.current === socket) setConnectionState("connected");
    };

    socket.onmessage = (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }

      if (message.type === "history") {
        const history = (message.messages || []).map((item) => ({
          id: String(item.id),
          userId: item.user_id,
          username: item.username || "Участник",
          text: String(item.content || "").slice(0, CHAT_MESSAGE_LIMIT),
          sentAt: item.sent_at,
          isOwn:
            currentUserId != null &&
            item.user_id != null &&
            String(item.user_id) === String(currentUserId),
        }));
        setMessages(history.slice(-CHAT_HISTORY_LIMIT));
        return;
      }

      if (message.type === "message") {
        const text = String(message.content || "").trim().slice(0, CHAT_MESSAGE_LIMIT);
        if (!text) return;
        const isOwn =
          currentUserId != null &&
          message.user_id != null &&
          String(message.user_id) === String(currentUserId);
        setMessages((current) => {
          if (current.some((item) => item.id === String(message.id))) return current;
          return [
            ...current,
            {
              id: String(message.id),
              userId: message.user_id,
              username: message.username || "Участник",
              text,
              sentAt: message.sent_at,
              isOwn,
            },
          ].slice(-CHAT_HISTORY_LIMIT);
        });
        if (!isOwn && !openRef.current) onIncomingRef.current?.();
        return;
      }

      if (message.type === "message_deleted") {
        setMessages((current) =>
          current.filter((item) => item.id !== String(message.message_id)),
        );
        return;
      }

      if (message.type === "error" && message.detail) onErrorRef.current?.(message.detail);
    };

    socket.onerror = () => {
      if (socketRef.current === socket) setConnectionState("error");
    };

    socket.onclose = () => {
      if (socketRef.current !== socket) return;
      socketRef.current = null;
      setConnectionState("disconnected");
    };

    return () => {
      socket.close();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [active, currentUserId, inviteCode]);

  const sendMessage = useCallback(
    (event) => {
      event?.preventDefault();
      const text = draft.trim().slice(0, CHAT_MESSAGE_LIMIT);
      if (!text) return;
      const socket = socketRef.current;
      if (socket?.readyState !== WebSocket.OPEN) {
        onErrorRef.current?.("Чат подключается. Попробуйте отправить сообщение ещё раз");
        return;
      }
      socket.send(JSON.stringify({ type: "message", content: text }));
      setDraft("");
    },
    [draft],
  );

  const deleteMessage = (messageId) => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: "delete_message", message_id: messageId }));
  };

  return (
    <aside
      className={`${styles.chatPanel} ${open ? styles.panelOpen : ""}`}
      aria-hidden={!open}
    >
      <div className={styles.panelHeader}>
        <div>
          <h2>Чат встречи</h2>
          <small className={styles.chatConnectionStatus}>
            {connectionState === "connected"
              ? "История сохраняется"
              : connectionState === "connecting"
                ? "Подключение…"
                : "Чат временно недоступен"}
          </small>
        </div>
        <button type="button" onClick={onClose} aria-label="Закрыть чат">
          ×
        </button>
      </div>

      <div
        ref={listRef}
        className={styles.chatMessages}
        role="log"
        aria-live="polite"
        aria-label="Сообщения чата"
      >
        {messages.length === 0 ? (
          <div className={styles.chatEmpty}>
            <ChatIcon />
            <strong>Сообщений пока нет</strong>
            <span>Напишите первое сообщение участникам встречи.</span>
          </div>
        ) : (
          messages.map((message) => (
            <article
              key={message.id}
              className={`${styles.chatMessage} ${message.isOwn ? styles.ownChatMessage : ""}`}
            >
              <div className={styles.chatMessageMeta}>
                <strong>{message.isOwn ? "Вы" : message.username || "Участник"}</strong>
                <time dateTime={message.sentAt}>{formatChatTime(message.sentAt)}</time>
              </div>
              <p>{message.text}</p>
              {message.isOwn && (
                <button
                  type="button"
                  className={styles.deleteChatMessage}
                  onClick={() => deleteMessage(message.id)}
                  aria-label="Удалить сообщение"
                >
                  Удалить
                </button>
              )}
            </article>
          ))
        )}
      </div>

      <form className={styles.chatForm} onSubmit={sendMessage}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent?.isComposing) {
              event.preventDefault();
              sendMessage();
            }
          }}
          maxLength={CHAT_MESSAGE_LIMIT}
          rows={2}
          placeholder="Сообщение участникам"
          aria-label="Текст сообщения"
        />
        <button
          type="submit"
          className={styles.chatSendButton}
          disabled={!draft.trim() || connectionState !== "connected"}
          aria-label="Отправить сообщение"
        >
          <SendIcon />
        </button>
        <small className={styles.chatHint}>Enter — отправить, Shift+Enter — новая строка</small>
      </form>
    </aside>
  );
}

export default ChatPanel;
