import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import styles from './Register.module.scss';

function Register() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    const normalizedUsername = username.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedUsername) {
      setError('Введите имя пользователя');
      return;
    }

    if (!normalizedEmail) {
      setError('Введите email');
      return;
    }

    if (password !== confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }

    if (password.length < 6) {
      setError('Пароль должен содержать не менее 6 символов');
      return;
    }

    setIsLoading(true);

    try {
      const result = await register(
        normalizedUsername,
        normalizedEmail,
        password,
      );

      if (result.success) {
        const redirectTo =
          location.state?.from ||
          sessionStorage.getItem('redirect_after_login') ||
          '/';

        sessionStorage.removeItem('redirect_after_login');
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
          <Link to="/login" className={styles.tab}>
            Вход
          </Link>
          <Link
            to="/register"
            className={`${styles.tab} ${styles.active}`}
            aria-current="page"
          >
            Регистрация
          </Link>
        </nav>

        <section className={`${styles.card} ${styles.registerCard}`}>
          <h1 className={styles.title}>Добро пожаловать!</h1>

          <form onSubmit={handleSubmit} className={styles.form} noValidate>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="register-username">
                Имя пользователя
              </label>
              <input
                id="register-username"
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
              <label className={styles.label} htmlFor="register-email">
                Email
              </label>
              <input
                id="register-email"
                type="email"
                className={styles.input}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                maxLength={255}
                required
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="register-password">
                Введите пароль
              </label>
              <input
                id="register-password"
                type="password"
                className={styles.input}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="register-password-repeat">
                Повторите пароль
              </label>
              <input
                id="register-password-repeat"
                type="password"
                className={styles.input}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
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
              {isLoading ? 'РЕГИСТРАЦИЯ...' : 'ЗАРЕГИСТРИРОВАТЬСЯ'}
            </button>
          </form>
        </section>
      </main>

      <p className={styles.copyright}>© TalkSphere</p>
    </div>
  );
}

export default Register;