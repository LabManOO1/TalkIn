import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../../modules/auth/AuthContext";
import MeetingInvitations from "../../../modules/meeting/Invitations";
import styles from "./Header.module.scss";
import profileIcon from "../../../assets/icons/profile.svg";

function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { user, isAuthenticated } = useAuth();

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

  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <Link to="/" className={styles.logo} onClick={closeMenu}>
          TalkSphere
        </Link>

        <div className={styles.right}>
          <nav className={`${styles.navigation} ${isMenuOpen ? styles.navigationOpen : ""}`}>
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

          <MeetingInvitations />

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
            className={`${styles.burger} ${isMenuOpen ? styles.burgerOpen : ""}`}
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
