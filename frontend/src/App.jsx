import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Home from "./pages/Home/Home";
import Login from "./pages/Login/Login";
import Register from "./pages/Register/Register";
import Meetings from "./pages/Meetings/Meetings";
import JoinMeeting from "./pages/JoinMeeting/JoinMeeting";
import Conference from "./pages/Conference/Conference";
import Profile from "./pages/Profile/Profile";
import Calendar from "./pages/Calendar/Calendar";
import ScheduleMeeting from "./pages/ScheduleMeeting/ScheduleMeeting";

function RequireAuth({ children }) {
  const location = useLocation();
  const { loading, isAuthenticated } = useAuth();

  if (loading) {
    return <main aria-live="polite" style={{ minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: '"Manrope", sans-serif' }}>Загружаем профиль…</main>;
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }
  return children;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/meetings" element={<Meetings />} />
          <Route path="/meetings/join" element={<JoinMeeting />} />
          <Route path="/conference/:inviteCode" element={<Conference />} />
          <Route path="/calendar" element={<RequireAuth><Calendar /></RequireAuth>} />
          <Route path="/meetings/schedule" element={<RequireAuth><ScheduleMeeting /></RequireAuth>} />
          <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
