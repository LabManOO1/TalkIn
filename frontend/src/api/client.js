import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const FILES_URL = import.meta.env.VITE_FILES_URL || "http://localhost:8002";
const WS_URL =
  import.meta.env.VITE_WS_URL || API_URL.replace(/^http/i, "ws").replace(/\/$/, "");
const BOARD_WS_URL = import.meta.env.VITE_BOARD_WS_URL || "ws://localhost:8001";

const attachAuth = (instance) => {
  instance.interceptors.request.use(
    (config) => {
      const token = localStorage.getItem("token");
      if (token) config.headers.Authorization = `Bearer ${token}`;
      return config;
    },
    (error) => Promise.reject(error),
  );

  instance.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("auth_user");
        window.dispatchEvent(new Event("auth:unauthorized"));
      }
      return Promise.reject(error);
    },
  );

  return instance;
};

const http = attachAuth(axios.create({ baseURL: API_URL, timeout: 15000 }));
const filesHttp = attachAuth(axios.create({ baseURL: FILES_URL, timeout: 30000 }));

const roomPath = (inviteCode) => encodeURIComponent(inviteCode);
const userPath = (userId) => encodeURIComponent(userId);

const openSocket = (baseUrl, path, inviteCode) => {
  const token = localStorage.getItem("token") || "";
  return new WebSocket(
    `${baseUrl}${path}/${roomPath(inviteCode)}?token=${encodeURIComponent(token)}`,
  );
};

const apiClient = {
  getMe() {
    return http.get("/auth/me");
  },

  register({ username, email, password }) {
    return http.post("/auth/register", { username, email, password });
  },

  login(username, password) {
    const body = new URLSearchParams();
    body.set("username", username);
    body.set("password", password);
    return http.post("/auth/login", body, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  },

  updateProfile({ username, email }) {
    return http.patch("/auth/me", { username, email });
  },

  createRoom(payload) {
    return http.post("/rooms/create", payload);
  },

  getRoom(inviteCode) {
    return http.get(`/rooms/${roomPath(inviteCode)}`);
  },

  leaveRoom(inviteCode) {
    return http.post(`/rooms/${roomPath(inviteCode)}/leave`);
  },

  updateOwnMediaStatus(inviteCode, patch) {
    return http.patch(`/rooms/${roomPath(inviteCode)}/participants/status`, patch);
  },

  muteParticipant(inviteCode, userId) {
    return http.patch(`/rooms/${roomPath(inviteCode)}/participants/${userPath(userId)}/mute`);
  },

  disableParticipantVideo(inviteCode, userId) {
    return http.patch(
      `/rooms/${roomPath(inviteCode)}/participants/${userPath(userId)}/video-off`,
    );
  },

  stopParticipantScreen(inviteCode, userId) {
    return http.patch(
      `/rooms/${roomPath(inviteCode)}/participants/${userPath(userId)}/screen-off`,
    );
  },

  removeParticipant(inviteCode, userId) {
    return http.delete(`/rooms/${roomPath(inviteCode)}/participants/${userPath(userId)}`);
  },

  assignParticipantRole(inviteCode, userId, role) {
    return http.patch(
      `/rooms/${roomPath(inviteCode)}/participants/${userPath(userId)}/role`,
      { role },
    );
  },

  createScheduledMeeting(payload) {
    return http.post("/schedule/", payload);
  },

  getCalendar(startDate, endDate) {
    return http.get("/schedule/calendar", {
      params: { start_date: startDate, end_date: endDate },
    });
  },

  cancelScheduledMeeting(meetingId) {
    return http.delete(`/schedule/${encodeURIComponent(meetingId)}`);
  },

  listInvitations() {
    return http.get("/schedule/invitations", {
      params: { unread_only: false, limit: 30 },
    });
  },

  markInvitationRead(invitationId) {
    return http.patch(`/schedule/invitations/${encodeURIComponent(invitationId)}/read`);
  },

  respondToInvitation(invitationId, status) {
    return http.post(`/schedule/${encodeURIComponent(invitationId)}/respond`, { status });
  },

  openSignalingSocket(inviteCode) {
    return openSocket(WS_URL, "/ws/signal", inviteCode);
  },

  openChatSocket(inviteCode) {
    return openSocket(WS_URL, "/ws/chat", inviteCode);
  },

  openBoardSocket(inviteCode) {
    return openSocket(BOARD_WS_URL, "/ws/board", inviteCode);
  },

  listMeetingFiles(inviteCode) {
    return filesHttp.get(`/files/${roomPath(inviteCode)}`);
  },

  uploadMeetingFile(inviteCode, file) {
    const body = new FormData();
    body.append("file", file);
    return filesHttp.post(`/files/${roomPath(inviteCode)}`, body);
  },

  downloadMeetingFile(inviteCode, fileId) {
    return filesHttp.get(`/files/${roomPath(inviteCode)}/${encodeURIComponent(fileId)}`, {
      responseType: "blob",
    });
  },
};

export default apiClient;
