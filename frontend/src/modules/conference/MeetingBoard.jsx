import { useEffect, useRef, useState } from "react";
import apiClient from "../../api/client";
import styles from "./MeetingBoard.module.scss";

function MeetingBoard({ inviteCode, active, onClose }) {
  const [shapes, setShapes] = useState([]);
  const [cursors, setCursors] = useState({});
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState("Подключение к доске…");
  const revisionRef = useRef(0);
  const surfaceRef = useRef(null);

  useEffect(() => {
    if (!active || !inviteCode) return undefined;

    const socket = apiClient.openBoardSocket(inviteCode);
    setStatus("Подключение к доске…");

    const applySnapshot = (snapshot) => {
      if (!snapshot) return;
      setShapes(Array.isArray(snapshot.shapes) ? snapshot.shapes : []);
      setCursors(snapshot.cursors || {});
      const nextRevision = Number(snapshot.revision || 0);
      revisionRef.current = nextRevision;
      setRevision(nextRevision);
    };

    socket.onopen = () => setStatus("Доска подключена");
    socket.onmessage = (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.type === "error") {
        setStatus(message.detail || "Доска недоступна");
        return;
      }
      if (message.type === "conflict") {
        applySnapshot(message.snapshot);
        setStatus("Доска уже изменена, снимок обновлён");
        return;
      }
      applySnapshot(message.snapshot || message);
      if (message.type === "joined") setStatus("Доска подключена");
    };
    socket.onerror = () => setStatus("Нет соединения с доской");
    socket.onclose = () => setStatus("Доска отключена");

    const send = (type, payload) => {
      if (socket.readyState !== WebSocket.OPEN) return;
      socket.send(
        JSON.stringify({
          type,
          payload,
          base_revision: revisionRef.current,
        }),
      );
    };

    const surface = surfaceRef.current;
    const onPointerMove = (event) => {
      const rect = surface?.getBoundingClientRect();
      if (!rect) return;
      send("cursor", {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    };
    const onClick = (event) => {
      if (event.target !== surface) return;
      const rect = surface.getBoundingClientRect();
      send("shape", {
        kind: "rect",
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        width: 96,
        height: 56,
        color: "#a40000",
        text: "",
      });
    };

    surface?.addEventListener("pointermove", onPointerMove);
    surface?.addEventListener("click", onClick);

    return () => {
      surface?.removeEventListener("pointermove", onPointerMove);
      surface?.removeEventListener("click", onClick);
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "cursor", payload: { remove: true } }));
      }
      socket.close();
    };
  }, [active, inviteCode]);

  return (
    <section className={styles.panel} aria-label="Общая доска">
      <header className={styles.header}>
        <div>
          <strong>Общая доска</strong>
          <small>{status} · ревизия {revision}</small>
        </div>
        <button type="button" onClick={onClose} aria-label="Закрыть доску">
          ×
        </button>
      </header>
      <div ref={surfaceRef} className={styles.surface}>
        {shapes.map((shape) => (
          <span
            key={shape.id}
            className={styles.shape}
            style={{
              left: Number(shape.x) || 0,
              top: Number(shape.y) || 0,
              width: Number(shape.width) || 96,
              height: Number(shape.height) || 56,
              background: shape.color || "#a40000",
            }}
          >
            {shape.text}
          </span>
        ))}
        {Object.values(cursors).map((cursor) => (
          <i
            key={cursor.user_id}
            className={styles.cursor}
            style={{ left: Number(cursor.x) || 0, top: Number(cursor.y) || 0 }}
          />
        ))}
      </div>
      <p className={styles.hint}>Щелчок ставит фигуру, движение мыши отправляет курсор.</p>
    </section>
  );
}

export default MeetingBoard;
