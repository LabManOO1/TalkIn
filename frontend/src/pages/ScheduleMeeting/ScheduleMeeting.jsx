import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Header from "../../components/Header/Header";
import Footer from "../../components/Footer/Footer";
import apiClient from "../../api/client";
import styles from "./ScheduleMeeting.module.scss";

const pad = (value) => String(value).padStart(2, "0");
const localDateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const getErrorMessage = (error, fallback) => {
  const detail = error.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((item) => item?.msg).filter(Boolean).join(". ") || fallback;
  return error.response ? fallback : "Не удалось подключиться к серверу";
};

function ScheduleIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M13 7v8M35 7v8" />
      <rect x="7" y="11" width="34" height="29" rx="5" />
      <path d="M7 20h34M28 40V29h13M29 39l11-11" />
    </svg>
  );
}

function ScheduleMeeting() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const today = useMemo(() => new Date(), []);
  const initialDate = searchParams.get("date") || localDateKey(today);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState("14:00");
  const [duration, setDuration] = useState("60");
  const [participants, setParticipants] = useState("");
  const [description, setDescription] = useState("");
  const [disableParticipantCamera, setDisableParticipantCamera] = useState(false);
  const [disableParticipantMicrophone, setDisableParticipantMicrophone] = useState(false);
  const [creatorOnlyScreenShare, setCreatorOnlyScreenShare] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      setError("Введите название встречи");
      return;
    }

    const start = new Date(`${date}T${time}:00`);
    const durationMinutes = Number(duration);
    if (Number.isNaN(start.getTime()) || start.getTime() < Date.now() - 60_000) {
      setError("Укажите будущую дату и время");
      return;
    }
    if (!Number.isFinite(durationMinutes) || durationMinutes < 15 || durationMinutes > 1440) {
      setError("Длительность должна быть от 15 минут до 24 часов");
      return;
    }

    const participantEmails = Array.from(
      new Set(
        participants
          .split(/[\s,;]+/)
          .map((value) => value.trim().toLowerCase())
          .filter(Boolean),
      ),
    );
    const invalidEmail = participantEmails.find((value) => !/^\S+@\S+\.\S+$/.test(value));
    if (invalidEmail) {
      setError(`Некорректный email: ${invalidEmail}`);
      return;
    }

    const end = new Date(start.getTime() + durationMinutes * 60_000);
    setLoading(true);
    try {
      const response = await apiClient.post("/schedule/", {
        title: normalizedTitle,
        description: description.trim() || null,
        scheduled_start: start.toISOString(),
        scheduled_end: end.toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        participant_emails: participantEmails,
        camera_on_join: true,
        microphone_on_join: true,
        allow_participant_camera: !disableParticipantCamera,
        allow_participant_microphone: !disableParticipantMicrophone,
        screen_share_policy: creatorOnlyScreenShare ? "creator_only" : "everyone",
      });
      navigate(`/calendar?date=${encodeURIComponent(date)}&created=${encodeURIComponent(response.data.id)}`, {
        replace: true,
        state: { createdMeeting: response.data },
      });
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Не удалось запланировать встречу"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <Header />
      <main className={styles.main}>
        <section className={styles.card} aria-labelledby="schedule-page-title">
          <ScheduleIcon />
          <h1 id="schedule-page-title">Запланировать встречу</h1>
          <form onSubmit={submit} className={styles.form}>
            <label className={styles.field}>
              <span>Название встречи</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={255} autoFocus />
            </label>

            <fieldset className={styles.group}>
              <legend>Дата и время</legend>
              <div className={styles.dateRow}>
                <input type="date" value={date} min={localDateKey(today)} onChange={(event) => setDate(event.target.value)} required />
                <input type="time" value={time} onChange={(event) => setTime(event.target.value)} required />
              </div>
            </fieldset>

            <label className={styles.field}>
              <span>Длительность</span>
              <select value={duration} onChange={(event) => setDuration(event.target.value)}>
                <option value="30">30 минут</option>
                <option value="45">45 минут</option>
                <option value="60">1 час</option>
                <option value="90">1 час 30 минут</option>
                <option value="120">2 часа</option>
                <option value="180">3 часа</option>
              </select>
            </label>

            <label className={styles.field}>
              <span>Участники</span>
              <input value={participants} onChange={(event) => setParticipants(event.target.value)} placeholder="email1@example.com, email2@example.com" />
              <small>
                Укажите email зарегистрированных пользователей через запятую. Им придёт уведомление внутри TalkSphere, а встреча появится в их календаре.
              </small>
            </label>

            <div className={styles.settingsBlock}>
              <button type="button" className={styles.settingsToggle} onClick={() => setSettingsOpen((value) => !value)} aria-expanded={settingsOpen}>
                <span>Дополнительные настройки</span><strong>{settingsOpen ? "−" : "+"}</strong>
              </button>
              {settingsOpen && (
                <div className={styles.settingsList}>
                  <p className={styles.settingsHint}>
                    Ограничения применяются к участникам. Создатель встречи сохраняет доступ к своим устройствам.
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
                  <label className={styles.descriptionField}><span>Описание</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={3000} rows={3} placeholder="Повестка, ссылки и заметки" /></label>
                </div>
              )}
            </div>

            {error && <p className={styles.error} role="alert">{error}</p>}
            <button type="submit" className={styles.submit} disabled={loading}>{loading ? "Планируем…" : "Запланировать"}</button>
          </form>
        </section>
      </main>
      <Footer />
    </div>
  );
}

export default ScheduleMeeting;
