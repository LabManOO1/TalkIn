import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import styles from "./Login.module.scss";

function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    const normalizedUsername = username.trim();

    if (!normalizedUsername || !password) {
      setError("Введите имя пользователя и пароль");
      return;
    }

    setIsLoading(true);

    try {
      const result = await login(normalizedUsername, password);

      if (result.success) {
        const redirectTo =
          location.state?.from ||
          sessionStorage.getItem("redirect_after_login") ||
          "/";

        sessionStorage.removeItem("redirect_after_login");
        navigate(redirectTo, { replace: true });
        return;
      }

      setError(result.error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <Link to="/" className={styles.logo} aria-label="TalkSphere — на главную">
        TalkSphere
      </Link>

      <main className={styles.auth}>
        <nav className={styles.tabs} aria-label="Авторизация">
          <Link
            to="/login"
            className={`${styles.tab} ${styles.active}`}
            aria-current="page"
          >
            Вход
          </Link>
          <Link to="/register" className={styles.tab}>
            Регистрация
          </Link>
        </nav>

        <section className={styles.card}>
          <h1 className={styles.title}>Добро пожаловать!</h1>

          <form onSubmit={handleSubmit} className={styles.form} noValidate>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="login-username">
                Имя пользователя
              </label>
              <input
                id="login-username"
                type="text"
                className={styles.input}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                maxLength={100}
                required
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="login-password">
                Введите пароль
              </label>
              <input
                id="login-password"
                type="password"
                className={styles.input}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              className={styles.button}
              disabled={isLoading}
            >
              {isLoading ? "ВХОД..." : "ВОЙТИ"}
            </button>
          </form>
        </section>
      </main>

      <p className={styles.copyright}>© TalkSphere</p>
    </div>
  );
}

export default Login;
