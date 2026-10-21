import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../../components/Header/Header";
import Footer from "../../components/Footer/Footer";
import { useAuth } from "../../context/AuthContext";
import styles from "./Profile.module.scss";

function MailIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></svg>;
}
function UserIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c.4-6 3-9 8-9s7.6 3 8 9" /></svg>;
}

function Profile() {
  const navigate = useNavigate();
  const { user, logout, updateProfile, refreshUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState(user?.username || "");
  const [email, setEmail] = useState(user?.email || "");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setUsername(user?.username || "");
    setEmail(user?.email || "");
  }, [user]);

  useEffect(() => {
    if (!user?.email) void refreshUser().catch(() => undefined);
  }, [refreshUser, user?.email]);

  const displayName = user?.username?.trim() || "Пользователь";
  const displayEmail = user?.email?.trim() || "Email не указан";
  const initials = useMemo(
    () => displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "П",
    [displayName],
  );

  const save = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!username.trim() || !email.trim()) {
      setError("Заполните имя пользователя и email");
      return;
    }
    setSaving(true);
    const result = await updateProfile({ username: username.trim(), email: email.trim().toLowerCase() });
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setSuccess("Профиль обновлён");
    setEditing(false);
  };

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className={styles.page}>
      <Header />
      <main className={styles.main}>
        <section className={styles.profileCard} aria-labelledby="profile-title">
          <div className={styles.profileHero}>
            <div className={styles.avatar} aria-label={`Аватар пользователя ${displayName}`}>{initials}</div>
            <div className={styles.identity}>
              <span className={styles.eyebrow}>Личный кабинет</span>
              <h1 id="profile-title">{displayName}</h1>
              <p>{displayEmail}</p>
            </div>
            <button type="button" className={styles.editButton} onClick={() => { setError(""); setSuccess(""); setEditing(true); }}>
              Редактировать профиль
            </button>
          </div>

          <div className={styles.contentGrid}>
            <section className={styles.details} aria-labelledby="account-details-title">
              <div className={styles.sectionHeading}>
                <h2 id="account-details-title">Информация об аккаунте</h2>
                <p>Имя и почта используются для входа, приглашений и отображения в конференциях.</p>
              </div>
              <dl className={styles.infoList}>
                <div className={styles.infoItem}><span className={styles.infoIcon}><UserIcon /></span><div><dt>Имя пользователя</dt><dd>{displayName}</dd></div></div>
                <div className={styles.infoItem}><span className={styles.infoIcon}><MailIcon /></span><div><dt>Email</dt><dd className={!user?.email ? styles.missingValue : ""}>{displayEmail}</dd></div></div>
              </dl>
              {success && <p className={styles.success} role="status">{success}</p>}
            </section>

            <aside className={styles.sideCard}>
              <h2>Профиль</h2>
              <p>Фото пока не хранится в базе данных, поэтому используется аватар с вашими инициалами.</p>
              <div className={styles.accountNote}><strong>Безопасность</strong><span>Пароль никогда не отображается на странице профиля.</span></div>
              <div className={styles.actions}>
                <button type="button" className={styles.primaryButton} onClick={() => navigate("/meetings")}>Перейти к встречам</button>
                <button type="button" className={styles.logoutButton} onClick={handleLogout}>Выйти из аккаунта</button>
              </div>
            </aside>
          </div>
        </section>
      </main>
      <Footer />

      {editing && (
        <div className={styles.overlay} onMouseDown={() => !saving && setEditing(false)}>
          <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="edit-profile-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className={styles.closeButton} type="button" onClick={() => setEditing(false)} aria-label="Закрыть">×</button>
            <h2 id="edit-profile-title">Редактировать профиль</h2>
            <form onSubmit={save} className={styles.form}>
              <label><span>Имя пользователя</span><input value={username} onChange={(event) => setUsername(event.target.value)} maxLength={100} autoComplete="username" /></label>
              <label><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={255} autoComplete="email" /></label>
              {error && <p className={styles.formError} role="alert">{error}</p>}
              <button type="submit" disabled={saving}>{saving ? "Сохраняем…" : "Сохранить"}</button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

export default Profile;
