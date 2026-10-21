import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../../components/Header/Header";
import Footer from "../../components/Footer/Footer";
import { useAuth } from "../../context/AuthContext";
import apiClient from "../../api/client";
import styles from "./JoinMeeting.module.scss";

const getErrorMessage = (error, fallback) => {
  const detail = error.response?.data?.detail;

  if (typeof detail === "string") return detail;

  if (Array.isArray(detail)) {
    return (
      detail
        .map((item) => item?.msg)
        .filter(Boolean)
        .join(". ") || fallback
    );
  }

  if (!error.response) return "Не удалось подключиться к серверу";

  return fallback;
};


const isRoomActive = (room) =>
  String(room?.status || "active").toLowerCase() === "active";

const extractInviteCode = (value) => {
  const trimmedValue = value.trim();
  if (!trimmedValue) return "";

  try {
    const url = new URL(trimmedValue, window.location.origin);
    const codeFromQuery =
      url.searchParams.get("code") || url.searchParams.get("invite_code");

    if (codeFromQuery) return codeFromQuery.trim().toUpperCase();

    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length > 0) return pathParts.at(-1).trim().toUpperCase();
  } catch {
    // Обычный invite-код обрабатывается ниже.
  }

  return (
    trimmedValue
      .replace(/[?#].*$/, "")
      .replace(/\/+$/, "")
      .split("/")
      .filter(Boolean)
      .at(-1)
      ?.trim()
      .toUpperCase() || ""
  );
};

function UsersIcon() {
  return (
    <svg viewBox="0 0 64 48" aria-hidden="true">
      <circle cx="24" cy="15" r="9" />
      <circle cx="42" cy="15" r="9" />
      <path d="M6 43c.7-12 7-18 18-18 8 0 13.5 3.8 16.4 10.7" />
      <path d="M27 43c.7-12 7-18 18-18s17.3 6 18 18H27Z" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 36 36" aria-hidden="true">
      <path d="M5 18h24" />
      <path d="m20 8 10 10-10 10" />
    </svg>
  );
}

function JoinMeeting() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [meetingValue, setMeetingValue] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    const inviteCode = extractInviteCode(meetingValue);

    if (!inviteCode) {
      setError("Укажите номер встречи или вставьте ссылку");
      return;
    }

    setIsLoading(true);

    try {
      const response = await apiClient.get(
        `/rooms/${encodeURIComponent(inviteCode)}`,
      );

      const room = response.data;

      if (!isRoomActive(room)) {
        setError("Эта конференция уже завершена");
        return;
      }

      const conferencePath = `/conference/${encodeURIComponent(inviteCode)}`;
      sessionStorage.setItem("selected_room", JSON.stringify(room));

      if (!isAuthenticated) {
        sessionStorage.setItem("redirect_after_login", conferencePath);
        navigate("/login", { state: { from: conferencePath } });
        return;
      }

      navigate(conferencePath, { state: { room } });
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Встреча не найдена"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <Header />

      <main className={styles.main}>
        <section className={styles.card} aria-labelledby="join-meeting-title">
          <UsersIcon />

          <h1 id="join-meeting-title">
            Укажите номер встречи
            <br />
            или вставьте ссылку
          </h1>

          <form className={styles.form} onSubmit={handleSubmit}>
            <input
              type="text"
              value={meetingValue}
              onChange={(event) => {
                setMeetingValue(event.target.value);
                setError("");
              }}
              aria-label="Номер встречи или ссылка"
              autoComplete="off"
              autoFocus
            />

            <button
              type="submit"
              className={styles.submitButton}
              aria-label="Подключиться к встрече"
              disabled={isLoading}
            >
              {isLoading ? <span className={styles.loader} /> : <ArrowIcon />}
            </button>
          </form>

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}

export default JoinMeeting;
