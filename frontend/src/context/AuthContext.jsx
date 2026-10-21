import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import apiClient from "../api/client";

const AuthContext = createContext(null);
const TOKEN_KEY = "token";
const USER_KEY = "auth_user";

const parseApiError = (error, fallbackMessage) => {
  const detail = error.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return (
      detail
        .map((item) => item?.msg)
        .filter(Boolean)
        .join(". ") || fallbackMessage
    );
  }
  return error.response ? fallbackMessage : "Не удалось подключиться к серверу";
};

const decodeTokenPayload = (token) => {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );
    return JSON.parse(window.atob(padded));
  } catch {
    return null;
  }
};

const isExpired = (token) => {
  const payload = decodeTokenPayload(token);
  return Boolean(payload?.exp && payload.exp * 1000 <= Date.now());
};

const readStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || "null");
  } catch {
    return null;
  }
};

const normalizeUser = (value, fallback = {}) => ({
  id: value?.id ?? fallback?.id ?? null,
  username:
    value?.username?.trim() || fallback?.username?.trim() || "Пользователь",
  email: value?.email?.trim() || fallback?.email?.trim() || null,
  created_at: value?.created_at || fallback?.created_at || null,
});

const userFromToken = (token) => {
  const payload = decodeTokenPayload(token) || {};
  return normalizeUser({
    id: payload.sub ?? payload.user_id ?? null,
    username:
      payload.username ?? payload.preferred_username ?? payload.name ?? null,
    email: payload.email ?? null,
  });
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const clearSession = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
    setIsAuthenticated(false);
  }, []);

  const saveUser = useCallback((userData, fallback = {}) => {
    const normalized = normalizeUser(userData, fallback);
    localStorage.setItem(USER_KEY, JSON.stringify(normalized));
    setUser(normalized);
    setIsAuthenticated(true);
    return normalized;
  }, []);

  const refreshUser = useCallback(async () => {
    const response = await apiClient.get("/auth/me");
    return saveUser(response.data, readStoredUser() || {});
  }, [saveUser]);

  useEffect(() => {
    const handleUnauthorized = () => {
      clearSession();
      setLoading(false);
    };

    window.addEventListener("auth:unauthorized", handleUnauthorized);

    const token = localStorage.getItem(TOKEN_KEY);
    if (!token || isExpired(token)) {
      clearSession();
      setLoading(false);
      return () => {
        window.removeEventListener("auth:unauthorized", handleUnauthorized);
      };
    }

    // Профиль и защищённые маршруты становятся доступны сразу. Серверная
    // версия профиля подтягивается следом, не блокируя страницу из-за сети.
    const cachedUser = readStoredUser();
    const tokenUser = userFromToken(token);
    saveUser(cachedUser || tokenUser, tokenUser);
    setLoading(false);

    void refreshUser().catch((error) => {
      // 401 уже обработан interceptor-ом. При временной ошибке сервера
      // оставляем валидную локальную сессию, чтобы профиль не был пустым.
      if (error.response?.status === 401) clearSession();
    });

    return () => {
      window.removeEventListener("auth:unauthorized", handleUnauthorized);
    };
  }, [clearSession, refreshUser, saveUser]);

  const completeAuthentication = useCallback(
    async (response) => {
      const token = response.data?.access_token;
      if (!token) {
        return { success: false, error: "Сервер не вернул токен доступа" };
      }

      localStorage.setItem(TOKEN_KEY, token);
      const tokenUser = userFromToken(token);
      saveUser(response.data?.user || tokenUser, tokenUser);

      try {
        await refreshUser();
      } catch (error) {
        if (error.response?.status === 401) {
          clearSession();
          return {
            success: false,
            error: "Сессия не была подтверждена сервером. Войдите ещё раз",
          };
        }
        // Login/register уже успешны. Не отменяем вход из-за временной
        // недоступности /auth/me — данные есть в ответе и JWT.
      }

      return { success: true };
    },
    [clearSession, refreshUser, saveUser],
  );

  const register = useCallback(
    async (username, email, password) => {
      try {
        const response = await apiClient.post("/auth/register", {
          username,
          email,
          password,
        });
        return await completeAuthentication(response);
      } catch (error) {
        return {
          success: false,
          error: parseApiError(error, "Ошибка регистрации"),
        };
      }
    },
    [completeAuthentication],
  );

  const login = useCallback(
    async (username, password) => {
      try {
        const body = new URLSearchParams();
        body.set("username", username);
        body.set("password", password);
        const response = await apiClient.post("/auth/login", body, {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
        return await completeAuthentication(response);
      } catch (error) {
        return {
          success: false,
          error: parseApiError(error, "Ошибка входа"),
        };
      }
    },
    [completeAuthentication],
  );

  const updateProfile = useCallback(
    async ({ username, email }) => {
      try {
        const response = await apiClient.patch("/auth/me", { username, email });
        const updatedUser = saveUser(response.data, user || {});
        return { success: true, user: updatedUser };
      } catch (error) {
        return {
          success: false,
          error: parseApiError(error, "Не удалось обновить профиль"),
        };
      }
    },
    [saveUser, user],
  );

  const logout = useCallback(() => clearSession(), [clearSession]);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated,
      register,
      login,
      logout,
      refreshUser,
      updateProfile,
    }),
    [
      user,
      loading,
      isAuthenticated,
      register,
      login,
      logout,
      refreshUser,
      updateProfile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth должен использоваться внутри AuthProvider");
  }
  return context;
};
