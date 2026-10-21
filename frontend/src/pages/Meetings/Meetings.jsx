import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../../components/Header/Header";
import Footer from "../../components/Footer/Footer";
import { useAuth } from "../../context/AuthContext";
import apiClient from "../../api/client";
import styles from "./Meetings.module.scss";

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

function CameraIcon() {
  return (
    <svg viewBox="0 0 120 96" aria-hidden="true">
      <rect x="13" y="17" width="72" height="62" rx="14" />
      <path d="M85 39 108 26v44L85 57" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 112 112" aria-hidden="true">
      <path d="M25 18v15M87 18v15" />
      <path d="M19 29h74a8 8 0 0 1 8 8v54a8 8 0 0 1-8 8H19a8 8 0 0 1-8-8V37a8 8 0 0 1 8-8Z" />
      <path d="M11 47h90" />
      <path d="M72 99V75h29" />
      <path d="m73 98 27-26" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg viewBox="0 0 120 112" aria-hidden="true">
      <circle cx="42" cy="39" r="16" />
      <circle cx="79" cy="39" r="16" />
      <path d="M12 91c1-21 12-31 30-31 13 0 22 6 27 18" />
      <path d="M49 91c1-21 12-31 30-31s29 10 30 31H49Z" />
    </svg>
  );
}

function Meetings() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const [dialog, setDialog] = useState(null);
  const [title, setTitle] = useState("");
  const [disableParticipantCamera, setDisableParticipantCamera] = useState(false);
  const [disableParticipantMicrophone, setDisableParticipantMicrophone] = useState(false);
  const [creatorOnlyScreenShare, setCreatorOnlyScreenShare] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const resetCreateForm = () => {
    setTitle("");
    setDisableParticipantCamera(false);
    setDisableParticipantMicrophone(false);
    setCreatorOnlyScreenShare(false);
    setSettingsOpen(true);
    setError("");
  };

  const closeDialog = () => {
    if (isLoading) return;
    setDialog(null);
    setError("");
  };

  useEffect(() => {
    if (!dialog) return undefined;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") closeDialog();
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [dialog, isLoading]);

  const openSchedulePage = () => {
    if (!isAuthenticated) {
      sessionStorage.setItem("redirect_after_login", "/meetings/schedule");
      navigate("/login", { state: { from: "/meetings/schedule" } });
      return;
    }
    navigate("/meetings/schedule");
  };

  const openCreateDialog = () => {
    resetCreateForm();

    if (!isAuthenticated) {
      setDialog("auth");
      return;
    }

    setDialog("create");
  };

  const handleCreateRoom = async (event) => {
    event.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await apiClient.post("/rooms/create", {
        title: title.trim() || "Новая конференция",
        camera_on_join: true,
        microphone_on_join: true,
        allow_participant_camera: !disableParticipantCamera,
        allow_participant_microphone: !disableParticipantMicrophone,
        screen_share_policy: creatorOnlyScreenShare ? "creator_only" : "everyone",
      });

      const room = response.data;
      sessionStorage.setItem("selected_room", JSON.stringify(room));
      navigate(`/conference/${encodeURIComponent(room.invite_code)}`, {
        state: { room },
      });
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Не удалось создать конференцию"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <Header />

      <main className={styles.main}>
        <section className={styles.actions} aria-label="Действия со встречами">
          <button
            type="button"
            className={`${styles.action} ${styles.primaryAction}`}
            onClick={openCreateDialog}
          >
            <span className={styles.iconBox}>
              <CameraIcon />
            </span>
            <span className={styles.actionLabel}>Создать конференцию</span>
          </button>

          <div className={styles.secondaryRow}>
            <button
              type="button"
              className={`${styles.action} ${styles.secondaryAction}`}
              onClick={openSchedulePage}
            >
              <span className={styles.iconBox}>
                <CalendarIcon />
              </span>
              <span className={styles.actionLabel}>Запланировать</span>
            </button>

            <button
              type="button"
              className={`${styles.action} ${styles.secondaryAction}`}
              onClick={() => navigate("/meetings/join")}
            >
              <span className={`${styles.iconBox} ${styles.usersIconBox}`}>
                <UsersIcon />
              </span>
              <span className={styles.actionLabel}>Подключиться</span>
            </button>
          </div>
        </section>
      </main>

      <Footer />

      {dialog && (
        <div className={styles.overlay} onMouseDown={closeDialog}>
          <div
            className={`${styles.dialog} ${dialog === "create" ? styles.createDialog : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="meeting-dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={styles.closeButton}
              onClick={closeDialog}
              aria-label="Закрыть окно"
            >
              ×
            </button>

            {dialog === "auth" && (
              <>
                <h2 id="meeting-dialog-title">Нужно войти</h2>
                <p className={styles.dialogText}>
                  Создавать конференции могут только авторизованные пользователи.
                </p>
                <button
                  type="button"
                  className={styles.dialogButton}
                  onClick={() => navigate("/login")}
                >
                  Перейти ко входу
                </button>
              </>
            )}

            {dialog === "create" && (
              <form onSubmit={handleCreateRoom} className={styles.createForm}>
                <h2 id="meeting-dialog-title">Новая конференция</h2>
                <p className={styles.dialogLead}>
                  Настройте права участников перед созданием комнаты.
                </p>

                <label className={styles.field}>
                  <span>Название</span>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Новая конференция"
                    maxLength={255}
                    autoFocus
                  />
                </label>

                <div className={styles.settingsBlock}>
                  <button
                    type="button"
                    className={styles.settingsToggle}
                    onClick={() => setSettingsOpen((value) => !value)}
                    aria-expanded={settingsOpen}
                  >
                    <span>Дополнительные настройки</span>
                    <strong aria-hidden="true">{settingsOpen ? "−" : "+"}</strong>
                  </button>

                  {settingsOpen && (
                    <div className={styles.settingsList}>
                      <p className={styles.settingsHint}>
                        Ограничения применяются только к участникам. Создатель комнаты сохраняет доступ к своим устройствам.
                      </p>

                      <label className={styles.switchRow}>
                        <input
                          type="checkbox"
                          checked={disableParticipantCamera}
                          onChange={(event) => setDisableParticipantCamera(event.target.checked)}
                        />
                        <span>
                          <strong>Запретить камеры участникам</strong>
                          <small>Участники не смогут включить видео во время встречи.</small>
                        </span>
                      </label>

                      <label className={styles.switchRow}>
                        <input
                          type="checkbox"
                          checked={disableParticipantMicrophone}
                          onChange={(event) => setDisableParticipantMicrophone(event.target.checked)}
                        />
                        <span>
                          <strong>Запретить микрофоны участникам</strong>
                          <small>Участники не смогут включить звук во время встречи.</small>
                        </span>
                      </label>

                      <label className={styles.switchRow}>
                        <input
                          type="checkbox"
                          checked={creatorOnlyScreenShare}
                          onChange={(event) => setCreatorOnlyScreenShare(event.target.checked)}
                        />
                        <span>
                          <strong>Запретить демонстрацию экрана участникам</strong>
                          <small>Демонстрацию сможет запускать только создатель встречи.</small>
                        </span>
                      </label>
                    </div>
                  )}
                </div>

                {error && (
                  <p className={styles.error} role="alert">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  className={styles.dialogButton}
                  disabled={isLoading}
                >
                  {isLoading ? "Создаём..." : "Создать и войти"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Meetings;
