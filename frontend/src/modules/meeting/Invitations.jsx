import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import apiClient from "../../api/client";
import styles from "../../shell/components/Header/Header.module.scss";

const getErrorMessage = (error, fallback) => {
  const detail = error.response?.data?.detail;
  if (typeof detail === "string") return detail;
  return error.response ? fallback : "Нет соединения с сервером";
};

const formatInvitationDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </svg>
  );
}

function MeetingInvitations() {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [invitations, setInvitations] = useState([]);
  const [invitationError, setInvitationError] = useState("");
  const [invitationsLoading, setInvitationsLoading] = useState(false);
  const [respondingId, setRespondingId] = useState(null);
  const notificationsRef = useRef(null);
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const unreadCount = useMemo(
    () => invitations.filter((invitation) => !invitation.invitation_is_read).length,
    [invitations],
  );

  const loadInvitations = async ({ silent = false } = {}) => {
    if (!isAuthenticated) return null;
    if (!silent) setInvitationsLoading(true);
    setInvitationError("");

    try {
      const response = await apiClient.listInvitations();
      const loaded = Array.isArray(response.data?.invitations) ? response.data.invitations : [];
      setInvitations(loaded);
      return loaded;
    } catch (error) {
      if (!silent) {
        setInvitationError(getErrorMessage(error, "Не удалось загрузить приглашения"));
      }
      return null;
    } finally {
      if (!silent) setInvitationsLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      setInvitations([]);
      setNotificationsOpen(false);
      return undefined;
    }

    void loadInvitations();
    const interval = window.setInterval(() => void loadInvitations({ silent: true }), 45_000);
    const handleFocus = () => void loadInvitations({ silent: true });
    window.addEventListener("focus", handleFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target)) {
        setNotificationsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const markVisibleInvitationsRead = async (source = invitations) => {
    const unread = source.filter((invitation) => !invitation.invitation_is_read);
    if (!unread.length) return;

    setInvitations((current) =>
      current.map((invitation) => ({ ...invitation, invitation_is_read: true })),
    );

    await Promise.allSettled(
      unread.map((invitation) => apiClient.markInvitationRead(invitation.id)),
    );
  };

  const toggleNotifications = () => {
    const nextOpen = !notificationsOpen;
    setNotificationsOpen(nextOpen);

    if (nextOpen) {
      void (async () => {
        const loaded = await loadInvitations({ silent: invitations.length > 0 });
        await markVisibleInvitationsRead(loaded || invitations);
      })();
    }
  };

  const respondToInvitation = async (invitation, status) => {
    setRespondingId(invitation.id);
    setInvitationError("");

    try {
      const response = await apiClient.respondToInvitation(invitation.id, status);

      if (status === "declined") {
        setInvitations((current) => current.filter((item) => item.id !== invitation.id));
        return;
      }

      setInvitations((current) =>
        current.map((item) =>
          item.id === invitation.id
            ? { ...item, ...response.data, invitation_is_read: true }
            : item,
        ),
      );
    } catch (error) {
      setInvitationError(getErrorMessage(error, "Не удалось ответить на приглашение"));
    } finally {
      setRespondingId(null);
    }
  };

  const openInvitationInCalendar = (invitation) => {
    const date = new Date(invitation.scheduled_start);
    const dateKey = Number.isNaN(date.getTime())
      ? ""
      : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    setNotificationsOpen(false);
    navigate(`/calendar${dateKey ? `?date=${encodeURIComponent(dateKey)}` : ""}`);
  };

  if (!isAuthenticated) return null;

  return (
    <div className={styles.notifications} ref={notificationsRef}>
      <button
        type="button"
        className={styles.notificationButton}
        onClick={toggleNotifications}
        aria-label={
          unreadCount ? `Приглашения: ${unreadCount} новых` : "Приглашения на встречи"
        }
        aria-expanded={notificationsOpen}
        aria-haspopup="dialog"
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className={styles.notificationBadge}>
            {Math.min(unreadCount, 9)}
            {unreadCount > 9 ? "+" : ""}
          </span>
        )}
      </button>

      {notificationsOpen && (
        <section className={styles.notificationsPanel} role="dialog" aria-label="Приглашения на встречи">
          <div className={styles.notificationsHeader}>
            <div>
              <strong>Приглашения</strong>
              <small>Запланированные для вас встречи</small>
            </div>
            <button type="button" onClick={() => setNotificationsOpen(false)} aria-label="Закрыть приглашения">
              ×
            </button>
          </div>

          {invitationError && (
            <p className={styles.notificationError} role="alert">
              {invitationError}
            </p>
          )}

          <div className={styles.notificationList}>
            {invitationsLoading && invitations.length === 0 ? (
              <p className={styles.notificationEmpty}>Загружаем приглашения…</p>
            ) : invitations.length === 0 ? (
              <p className={styles.notificationEmpty}>Новых приглашений пока нет</p>
            ) : (
              invitations.map((invitation) => {
                const pending = invitation.invitation_status === "pending";
                const cancelled = invitation.status === "cancelled";
                const busy = respondingId === invitation.id;

                return (
                  <article
                    className={`${styles.notificationCard} ${cancelled ? styles.cancelledNotification : ""}`}
                    key={invitation.id}
                  >
                    <button
                      type="button"
                      className={styles.notificationMain}
                      onClick={() => openInvitationInCalendar(invitation)}
                    >
                      <span className={styles.notificationKicker}>
                        {cancelled
                          ? "Встреча отменена"
                          : pending
                            ? "Вас пригласили"
                            : "Приглашение принято"}
                      </span>
                      <strong>{invitation.title}</strong>
                      <small>
                        {invitation.created_by} · {formatInvitationDate(invitation.scheduled_start)}
                      </small>
                    </button>

                    {pending && !cancelled && (
                      <div className={styles.notificationActions}>
                        <button
                          type="button"
                          onClick={() => respondToInvitation(invitation, "accepted")}
                          disabled={busy}
                        >
                          Принять
                        </button>
                        <button
                          type="button"
                          className={styles.declineInvitation}
                          onClick={() => respondToInvitation(invitation, "declined")}
                          disabled={busy}
                        >
                          Отклонить
                        </button>
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </div>

          <button
            type="button"
            className={styles.openCalendarButton}
            onClick={() => {
              setNotificationsOpen(false);
              navigate("/calendar");
            }}
          >
            Открыть календарь
          </button>
        </section>
      )}
    </div>
  );
}

export default MeetingInvitations;
