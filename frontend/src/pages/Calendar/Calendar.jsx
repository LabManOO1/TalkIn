import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import Header from "../../components/Header/Header";
import Footer from "../../components/Footer/Footer";
import apiClient from "../../api/client";
import styles from "./Calendar.module.scss";

const MONTHS = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const pad = (value) => String(value).padStart(2, "0");
const toDateKey = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const fromDateKey = (value) => {
  const [year, month, day] = String(value || "").split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  return Number.isNaN(date.getTime()) ? new Date() : date;
};
const isSameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();
const meetingDateKey = (meeting) => toDateKey(new Date(meeting.scheduled_start));
const getErrorMessage = (error, fallback) =>
  typeof error.response?.data?.detail === "string"
    ? error.response.data.detail
    : error.response
      ? fallback
      : "Не удалось подключиться к серверу";

function ChevronIcon({ direction = "down" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={
        direction === "left"
          ? styles.chevronLeft
          : direction === "right"
            ? styles.chevronRight
            : ""
      }
    >
      <path d="m7 9 5 5 5-5" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M13 5v8M35 5v8" />
      <rect x="5" y="10" width="38" height="33" rx="5" />
      <path d="M5 20h38" />
      <path d="m27 36 9-9M29 27h7v7" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg viewBox="0 0 34 28" aria-hidden="true">
      <circle cx="11" cy="8" r="5" />
      <circle cx="23" cy="8" r="5" />
      <path d="M1 26c.3-8 3.7-12 10-12 4.5 0 7.5 2.2 9 6.5" />
      <path d="M13 26c.3-8 3.7-12 10-12s9.7 4 10 12H13Z" />
    </svg>
  );
}

function Calendar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const today = useMemo(() => new Date(), []);
  const queryDate = searchParams.get("date");
  const initialDate = queryDate ? fromDateKey(queryDate) : today;
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [visibleMonth, setVisibleMonth] = useState(
    new Date(initialDate.getFullYear(), initialDate.getMonth(), 1),
  );
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(
    location.state?.createdMeeting ? "Встреча запланирована" : "",
  );
  const [respondingId, setRespondingId] = useState(null);
  const calendarRef = useRef(null);

  const calendarDays = useMemo(() => {
    const first = new Date(
      visibleMonth.getFullYear(),
      visibleMonth.getMonth(),
      1,
    );
    const start = new Date(first);
    start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [visibleMonth]);

  const markInvitationsRead = useCallback(async (loadedMeetings) => {
    const unreadInvitations = loadedMeetings.filter(
      (meeting) =>
        !meeting.is_creator &&
        meeting.invitation_status &&
        meeting.invitation_is_read === false,
    );
    if (!unreadInvitations.length) return;

    await Promise.allSettled(
      unreadInvitations.map((meeting) =>
        apiClient.patch(
          `/schedule/invitations/${encodeURIComponent(meeting.id)}/read`,
        ),
      ),
    );
  }, []);

  const loadMeetings = useCallback(async () => {
    const start = new Date(calendarDays[0]);
    start.setHours(0, 0, 0, 0);
    const end = new Date(calendarDays.at(-1));
    end.setDate(end.getDate() + 1);
    end.setHours(0, 0, 0, 0);
    setLoading(true);
    setError("");

    try {
      const response = await apiClient.get("/schedule/calendar", {
        params: {
          start_date: start.toISOString(),
          end_date: end.toISOString(),
        },
      });
      const loaded = Array.isArray(response.data?.conferences)
        ? response.data.conferences
        : [];
      setMeetings(
        loaded.map((meeting) => ({
          ...meeting,
          invitation_is_read:
            meeting.is_creator || !meeting.invitation_status
              ? meeting.invitation_is_read
              : true,
        })),
      );
      void markInvitationsRead(loaded);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Не удалось загрузить календарь"));
    } finally {
      setLoading(false);
    }
  }, [calendarDays, markInvitationsRead]);

  useEffect(() => {
    void loadMeetings();
  }, [loadMeetings]);

  useEffect(() => {
    const close = (event) => {
      if (
        calendarRef.current &&
        !calendarRef.current.contains(event.target)
      ) {
        setCalendarOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(""), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const selectedKey = toDateKey(selectedDate);
  const selectedMeetings = useMemo(
    () =>
      meetings
        .filter((meeting) => meetingDateKey(meeting) === selectedKey)
        .sort(
          (a, b) =>
            new Date(a.scheduled_start) - new Date(b.scheduled_start),
        ),
    [meetings, selectedKey],
  );

  const chooseDate = (date) => {
    setSelectedDate(date);
    setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    setCalendarOpen(false);
  };

  const moveMonth = (offset) =>
    setVisibleMonth(
      (current) =>
        new Date(current.getFullYear(), current.getMonth() + offset, 1),
    );

  const formatSelectedDate = (date) => {
    if (isSameDay(date, today)) return "Сегодня";
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    if (isSameDay(date, tomorrow)) return "Завтра";
    return new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "long",
    }).format(date);
  };

  const cancelMeeting = async (meeting) => {
    if (!window.confirm(`Отменить встречу «${meeting.title}»?`)) return;
    setError("");
    try {
      await apiClient.delete(`/schedule/${encodeURIComponent(meeting.id)}`);
      setMeetings((current) =>
        current.map((item) =>
          item.id === meeting.id ? { ...item, status: "cancelled" } : item,
        ),
      );
      setNotice("Встреча отменена");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Не удалось отменить встречу"));
    }
  };

  const respondToInvitation = async (meeting, status) => {
    setRespondingId(meeting.id);
    setError("");

    try {
      const response = await apiClient.post(
        `/schedule/${encodeURIComponent(meeting.id)}/respond`,
        { status },
      );

      if (status === "declined") {
        setMeetings((current) =>
          current.filter((item) => item.id !== meeting.id),
        );
        setNotice("Приглашение отклонено");
        return;
      }

      setMeetings((current) =>
        current.map((item) =>
          item.id === meeting.id
            ? {
                ...item,
                ...response.data,
                invitation_is_read: true,
              }
            : item,
        ),
      );
      setNotice("Приглашение принято");
    } catch (requestError) {
      setError(
        getErrorMessage(requestError, "Не удалось ответить на приглашение"),
      );
    } finally {
      setRespondingId(null);
    }
  };

  return (
    <div className={styles.page}>
      <Header />
      <main className={styles.main}>
        <div className={styles.datePicker} ref={calendarRef}>
          <button
            type="button"
            className={styles.dateButton}
            onClick={() => setCalendarOpen((value) => !value)}
            aria-expanded={calendarOpen}
            aria-haspopup="dialog"
          >
            <span>{formatSelectedDate(selectedDate)}</span>
            <ChevronIcon />
          </button>

          {calendarOpen && (
            <section
              className={styles.calendarPopover}
              role="dialog"
              aria-label="Выбор даты"
            >
              <div className={styles.calendarHeader}>
                <button
                  type="button"
                  onClick={() => moveMonth(-1)}
                  aria-label="Предыдущий месяц"
                >
                  <ChevronIcon direction="left" />
                </button>
                <strong>
                  {MONTHS[visibleMonth.getMonth()]} {visibleMonth.getFullYear()}
                </strong>
                <button
                  type="button"
                  onClick={() => moveMonth(1)}
                  aria-label="Следующий месяц"
                >
                  <ChevronIcon direction="right" />
                </button>
              </div>

              <div className={styles.weekdays} aria-hidden="true">
                {WEEKDAYS.map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </div>

              <div className={styles.calendarGrid}>
                {calendarDays.map((date) => {
                  const key = toDateKey(date);
                  const hasMeeting = meetings.some(
                    (meeting) =>
                      meetingDateKey(meeting) === key &&
                      meeting.status !== "cancelled",
                  );
                  const hasPendingInvitation = meetings.some(
                    (meeting) =>
                      meetingDateKey(meeting) === key &&
                      meeting.invitation_status === "pending" &&
                      meeting.status !== "cancelled",
                  );

                  return (
                    <button
                      type="button"
                      key={key}
                      className={`${styles.dayButton} ${
                        date.getMonth() !== visibleMonth.getMonth()
                          ? styles.outsideMonth
                          : ""
                      } ${
                        isSameDay(date, selectedDate) ? styles.selectedDay : ""
                      } ${isSameDay(date, today) ? styles.today : ""}`}
                      onClick={() => chooseDate(date)}
                    >
                      {date.getDate()}
                      {hasMeeting && (
                        <span
                          className={`${styles.meetingDot} ${
                            hasPendingInvitation ? styles.invitationDot : ""
                          }`}
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                className={styles.goTodayButton}
                onClick={() => chooseDate(new Date())}
              >
                Перейти к сегодняшнему дню
              </button>
            </section>
          )}
        </div>

        {notice && (
          <p className={styles.notice} role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <section className={styles.calendarContent}>
          <div className={styles.meetingsList} aria-live="polite">
            {loading ? (
              <article className={`${styles.meetingCard} ${styles.emptyCard}`}>
                Загружаем встречи…
              </article>
            ) : selectedMeetings.length === 0 ? (
              <article className={`${styles.meetingCard} ${styles.emptyCard}`}>
                Встреч не запланировано
              </article>
            ) : (
              selectedMeetings.map((meeting) => {
                const start = new Date(meeting.scheduled_start);
                const end = meeting.scheduled_end
                  ? new Date(meeting.scheduled_end)
                  : null;
                const cancelled = meeting.status === "cancelled";
                const pendingInvitation =
                  !meeting.is_creator &&
                  meeting.invitation_status === "pending";
                const acceptedInvitation =
                  !meeting.is_creator &&
                  meeting.invitation_status === "accepted";
                const busy = respondingId === meeting.id;
                const inviteCode =
                  meeting.invite_code || meeting.room_invite_code;

                return (
                  <article
                    className={`${styles.meetingCard} ${
                      cancelled ? styles.cancelledCard : ""
                    } ${
                      pendingInvitation ? styles.pendingInvitationCard : ""
                    }`}
                    key={meeting.id}
                  >
                    <div className={styles.cardTop}>
                      <div>
                        <small>
                          {meeting.is_creator
                            ? "Вы организатор"
                            : pendingInvitation
                              ? `Вас пригласил: ${meeting.created_by}`
                              : `Организатор: ${meeting.created_by}`}
                        </small>
                        <h2>{meeting.title}</h2>
                      </div>
                      <span className={styles.status}>
                        {cancelled
                          ? "Отменена"
                          : pendingInvitation
                            ? "Требует ответа"
                            : acceptedInvitation
                              ? "Вы участвуете"
                              : meeting.status === "scheduled"
                                ? "Запланирована"
                                : meeting.status}
                      </span>
                    </div>

                    {pendingInvitation && !cancelled && (
                      <p className={styles.invitationNote}>
                        Эта встреча добавлена в ваш календарь как приглашение.
                        Подтвердите участие или отклоните его.
                      </p>
                    )}

                    <div className={styles.meetingMeta}>
                      <span className={styles.participantsMeta}>
                        <UsersIcon />
                        {meeting.participants_count
                          ? `Участников: ${meeting.participants_count}`
                          : "Без приглашённых"}
                      </span>
                      <time dateTime={meeting.scheduled_start}>
                        {new Intl.DateTimeFormat("ru-RU", {
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(start)}
                        {end
                          ? `–${new Intl.DateTimeFormat("ru-RU", {
                              hour: "2-digit",
                              minute: "2-digit",
                            }).format(end)}`
                          : ""}
                      </time>
                    </div>

                    {!cancelled && (
                      <div className={styles.cardActions}>
                        {pendingInvitation ? (
                          <>
                            <button
                              type="button"
                              className={styles.acceptButton}
                              onClick={() =>
                                respondToInvitation(meeting, "accepted")
                              }
                              disabled={busy}
                            >
                              {busy ? "Сохраняем…" : "Принять"}
                            </button>
                            <button
                              type="button"
                              className={styles.declineButton}
                              onClick={() =>
                                respondToInvitation(meeting, "declined")
                              }
                              disabled={busy}
                            >
                              Отклонить
                            </button>
                          </>
                        ) : (
                          inviteCode && (
                            <button
                              type="button"
                              onClick={() =>
                                navigate(
                                  `/conference/${encodeURIComponent(inviteCode)}`,
                                )
                              }
                            >
                              Открыть конференцию
                            </button>
                          )
                        )}

                        {meeting.is_creator && (
                          <button
                            type="button"
                            className={styles.cancelButton}
                            onClick={() => cancelMeeting(meeting)}
                          >
                            Отменить
                          </button>
                        )}
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </div>

          <button
            type="button"
            className={styles.scheduleButton}
            onClick={() =>
              navigate(
                `/meetings/schedule?date=${encodeURIComponent(selectedKey)}`,
              )
            }
          >
            <CalendarIcon />
            <span>Запланировать встречу</span>
          </button>
        </section>
      </main>
      <Footer />
    </div>
  );
}

export default Calendar;
