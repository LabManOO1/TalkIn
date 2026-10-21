import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import apiClient from "../../api/client";
import styles from "./Header.module.scss";
import profileIcon from "../../assets/icons/profile.svg";

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

function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [invitations, setInvitations] = useState([]);
  const [invitationError, setInvitationError] = useState("");
  const [invitationsLoading, setInvitationsLoading] = useState(false);
  const [respondingId, setRespondingId] = useState(null);
  const notificationsRef = useRef(null);
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const closeMenu = () => setIsMenuOpen(false);
  const profilePath = isAuthenticated ? "/profile" : "/login";
  const profileLabel = isAuthenticated
    ? `Открыть профиль ${user?.username || "пользователя"}`
    : "Войти в аккаунт";

  const initials = useMemo(
    () =>
      (user?.username || "")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join(""),
    [user?.username],
  );

  const unreadCount = useMemo(
    () => invitations.filter((invitation) => !invitation.invitation_is_read).length,
    [invitations],
  );

  const loadInvitations = async ({ silent = false } = {}) => {
    if (!isAuthenticated) return;
    if (!silent) setInvitationsLoading(true);
    setInvitationError("");

    try {
      const response = await apiClient.get("/schedule/invitations", {
        params: { unread_only: false, limit: 30 },
      });
      const loaded = Array.isArray(response.data?.invitations)
        ? response.data.invitations
        : [];
      setInvitations(loaded);
      return loaded;
    } catch (error) {
      if (!silent) {
        setInvitationError(
          getErrorMessage(error, "Не удалось загрузить приглашения"),
        );
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
    const interval = window.setInterval(
      () => void loadInvitations({ silent: true }),
      45_000,
    );
    const handleFocus = () => void loadInvitations({ silent: true });
    window.addEventListener("focus", handleFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (
        notificationsRef.current &&
        !notificationsRef.current.contains(event.target)
      ) {
        setNotificationsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const markVisibleInvitationsRead = async (source = invitations) => {
    const unread = source.filter(
      (invitation) => !invitation.invitation_is_read,
    );
    if (!unread.length) return;

    setInvitations((current) =>
      current.map((invitation) => ({
        ...invitation,
        invitation_is_read: true,
      })),
    );

    await Promise.allSettled(
      unread.map((invitation) =>
        apiClient.patch(
          `/schedule/invitations/${encodeURIComponent(invitation.id)}/read`,
        ),
      ),
    );
  };

  const toggleNotifications = () => {
    const nextOpen = !notificationsOpen;
    setNotificationsOpen(nextOpen);
    setIsMenuOpen(false);

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
      const response = await apiClient.post(
        `/schedule/${encodeURIComponent(invitation.id)}/respond`,
        { status },
      );

      if (status === "declined") {
        setInvitations((current) =>
          current.filter((item) => item.id !== invitation.id),
        );
        return;
      }

      setInvitations((current) =>
        current.map((item) =>
          item.id === invitation.id
            ? {
                ...item,
                ...response.data,
                invitation_is_read: true,
              }
            : item,
        ),
      );
    } catch (error) {
      setInvitationError(
        getErrorMessage(error, "Не удалось ответить на приглашение"),
      );
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

  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <Link to="/" className={styles.logo} onClick={closeMenu}>
          TalkSphere
        </Link>

        <div className={styles.right}>
          <nav
            className={`${styles.navigation} ${
              isMenuOpen ? styles.navigationOpen : ""
            }`}
          >
            <Link to="/" onClick={closeMenu}>
              Главная
            </Link>
            <Link to="/meetings" onClick={closeMenu}>
              Встречи
            </Link>
            <Link to="/calendar" onClick={closeMenu}>
              Календарь
            </Link>
          </nav>

          {isAuthenticated && (
            <div className={styles.notifications} ref={notificationsRef}>
              <button
                type="button"
                className={styles.notificationButton}
                onClick={toggleNotifications}
                aria-label={
                  unreadCount
                    ? `Приглашения: ${unreadCount} новых`
                    : "Приглашения на встречи"
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
                <section
                  className={styles.notificationsPanel}
                  role="dialog"
                  aria-label="Приглашения на встречи"
                >
                  <div className={styles.notificationsHeader}>
                    <div>
                      <strong>Приглашения</strong>
                      <small>Запланированные для вас встречи</small>
                    </div>
                    <button
                      type="button"
                      onClick={() => setNotificationsOpen(false)}
                      aria-label="Закрыть приглашения"
                    >
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
                      <p className={styles.notificationEmpty}>
                        Загружаем приглашения…
                      </p>
                    ) : invitations.length === 0 ? (
                      <p className={styles.notificationEmpty}>
                        Новых приглашений пока нет
                      </p>
                    ) : (
                      invitations.map((invitation) => {
                        const pending =
                          invitation.invitation_status === "pending";
                        const cancelled = invitation.status === "cancelled";
                        const busy = respondingId === invitation.id;

                        return (
                          <article
                            className={`${styles.notificationCard} ${
                              cancelled ? styles.cancelledNotification : ""
                            }`}
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
                                  onClick={() =>
                                    respondToInvitation(invitation, "accepted")
                                  }
                                  disabled={busy}
                                >
                                  Принять
                                </button>
                                <button
                                  type="button"
                                  className={styles.declineInvitation}
                                  onClick={() =>
                                    respondToInvitation(invitation, "declined")
                                  }
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
          )}

          <Link
            to={profilePath}
            className={`${styles.profileButton} ${
              isAuthenticated ? styles.profileButtonAuthenticated : ""
            }`}
            onClick={closeMenu}
            aria-label={profileLabel}
            title={profileLabel}
          >
            {isAuthenticated && initials ? (
              <span aria-hidden="true">{initials}</span>
            ) : (
              <img src={profileIcon} alt="" aria-hidden="true" />
            )}
          </Link>

          <button
            type="button"
            className={`${styles.burger} ${
              isMenuOpen ? styles.burgerOpen : ""
            }`}
            onClick={() => setIsMenuOpen((prev) => !prev)}
            aria-label={isMenuOpen ? "Закрыть меню" : "Открыть меню"}
            aria-expanded={isMenuOpen}
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>
      </div>
    </header>
  );
}

export default Header;
