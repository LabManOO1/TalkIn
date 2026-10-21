import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import apiClient from "../../api/client";
import styles from "./Conference.module.scss";

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const WS_URL =
  import.meta.env.VITE_WS_URL || API_URL.replace(/^http/i, "ws").replace(/\/$/, "");

const getErrorMessage = (error, fallback) => {
  const detail = error.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (!error.response) return "Не удалось подключиться к серверу";
  return fallback;
};

const isRoomActive = (room) => {
  const status = String(room?.status || "active").toLowerCase();
  return status === "active";
};

const getRoomStatusError = (room) =>
  isRoomActive(room) ? "" : "Эта конференция уже завершена";

const decodeTokenPayload = (token) => {
  try {
    const rawPayload = token.split(".")[1];
    const normalized = rawPayload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );
    return JSON.parse(window.atob(padded));
  } catch {
    return null;
  }
};

const createClientId = () => {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const CHAT_MESSAGE_LIMIT = 1500;
const CHAT_HISTORY_LIMIT = 200;

const formatChatTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

function MicIcon({ off = false }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect x="11" y="4" width="10" height="16" rx="5" />
      <path d="M7 15a9 9 0 0 0 18 0M16 24v5M11 29h10" />
      {off && <path className={styles.slash} d="M4 4l24 24" />}
    </svg>
  );
}

function CameraIcon({ off = false }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect x="4" y="8" width="18" height="16" rx="4" />
      <path d="m22 13 6-4v14l-6-4" />
      {off && <path className={styles.slash} d="M4 4l24 24" />}
    </svg>
  );
}

function ScreenIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect x="3" y="5" width="26" height="18" rx="3" />
      <path d="M11 28h10M16 23v5M11 14l5-5 5 5M16 9v10" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect x="10" y="10" width="17" height="17" rx="3" />
      <path d="M22 10V7a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h3" />
    </svg>
  );
}

function HangupIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M5 21c3-3 6.7-4.5 11-4.5S24 18 27 21" />
      <path d="M5 21v5M27 21v5" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="11" cy="11" r="5" />
      <circle cx="22" cy="11" r="5" />
      <path d="M2 28c.4-8 3.5-12 9-12 4 0 6.7 2.1 8 6" />
      <path d="M13 28c.4-8 3.5-12 9-12s8.6 4 9 12H13Z" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M5 6h22v15H13l-7 6v-6H5V6Z" />
      <path d="M10 11h12M10 16h8" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="m4 15 24-10-8 22-5-9-11-3Z" />
      <path d="m15 18 13-13" />
    </svg>
  );
}

function VideoTile({
  stream,
  name,
  videoMuted = false,
  isMicOff = false,
  videoOff = false,
  isLocal = false,
  mirror = false,
  isPresentation = false,
  compact = false,
}) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream || null;
    }
  }, [stream]);

  const initials = (name || "Участник")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <article
      className={`${styles.videoTile} ${
        isPresentation ? styles.presentationTile : ""
      } ${compact ? styles.compactTile : ""}`}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={videoMuted}
        className={`${videoOff ? styles.videoHidden : ""} ${
          mirror ? styles.mirroredVideo : ""
        }`}
      />

      {(!stream || videoOff) && (
        <div className={styles.avatar} aria-hidden="true">
          {initials || "У"}
        </div>
      )}

      <div className={styles.tileFooter}>
        <span className={styles.participantName}>
          {isLocal ? `${name || "Вы"} (вы)` : name || "Участник"}
        </span>

        {(isMicOff || videoOff) && (
          <div className={styles.mediaBadges} aria-label="Статус устройств">
            {isMicOff && <MicIcon off />}
            {videoOff && <CameraIcon off />}
          </div>
        )}
      </div>
    </article>
  );
}

function Conference() {
  const { inviteCode: rawInviteCode } = useParams();
  const inviteCode = useMemo(
    () => decodeURIComponent(rawInviteCode || "").trim().toUpperCase(),
    [rawInviteCode],
  );
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading: authLoading, isAuthenticated } = useAuth();

  const token = localStorage.getItem("token");
  const tokenPayload = decodeTokenPayload(token || "");
  const currentUserId = user?.id || tokenPayload?.sub || null;
  const currentUsername = user?.username || "Участник";

  const [room, setRoom] = useState(location.state?.room || null);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState("");
  const [connectionState, setConnectionState] = useState("connecting");
  const [localPreview, setLocalPreview] = useState(null);
  const [remoteParticipants, setRemoteParticipants] = useState([]);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [isSharing, setIsSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatConnectionState, setChatConnectionState] = useState("disconnected");
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [isJoined, setIsJoined] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [participantAction, setParticipantAction] = useState("");

  const isRoomCreator =
    room?.created_by != null &&
    currentUserId != null &&
    String(room.created_by) === String(currentUserId);
  const canUseCamera = room?.allow_participant_camera !== false || isRoomCreator;
  const canUseMicrophone =
    room?.allow_participant_microphone !== false || isRoomCreator;

  const clientIdRef = useRef(createClientId());
  const wsRef = useRef(null);
  const chatWsRef = useRef(null);
  const localStreamRef = useRef(null);
  const cameraTrackRef = useRef(null);
  const screenTrackRef = useRef(null);
  const peerConnectionsRef = useRef(new Map());
  const remoteStreamsRef = useRef(new Map());
  const queuedCandidatesRef = useRef(new Map());
  const remoteParticipantsRef = useRef([]);
  const isLeavingRef = useRef(false);
  const micEnabledRef = useRef(true);
  const cameraEnabledRef = useRef(true);
  const isSharingRef = useRef(false);
  const sessionLockKeyRef = useRef(null);
  const sessionHeartbeatRef = useRef(null);
  const redirectTimerRef = useRef(null);
  const microphoneActionRef = useRef(false);
  const cameraActionRef = useRef(false);
  const joinActionRef = useRef(false);
  const joinedRef = useRef(false);
  const participantPollRef = useRef(null);
  const chatOpenRef = useRef(false);
  const chatMessagesRef = useRef(null);
  const forcedControlActionRef = useRef(null);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverscroll = document.body.style.overscrollBehavior;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overscrollBehavior = previousBodyOverscroll;
    };
  }, []);

  useEffect(() => {
    remoteParticipantsRef.current = remoteParticipants;
  }, [remoteParticipants]);

  useEffect(() => {
    chatOpenRef.current = chatOpen;

    if (!chatOpen) return;

    setUnreadChatCount(0);
    window.requestAnimationFrame(() => {
      const container = chatMessagesRef.current;
      if (container) container.scrollTop = container.scrollHeight;
    });
  }, [chatOpen, chatMessages.length]);

  useEffect(() => {
    setChatMessages([]);
    setChatDraft("");
    setChatConnectionState("disconnected");
    setUnreadChatCount(0);
    setChatOpen(false);
    chatOpenRef.current = false;
  }, [inviteCode]);

  const updateRemoteParticipant = useCallback((peerId, patch) => {
    if (!peerId) return;

    setRemoteParticipants((current) => {
      const incomingUserId = patch.userId == null ? null : String(patch.userId);
      const existing = current.find((participant) => participant.peerId === peerId);
      const sameUser = incomingUserId
        ? current.find(
            (participant) =>
              participant.peerId !== peerId &&
              participant.userId != null &&
              String(participant.userId) === incomingUserId,
          )
        : null;

      if (existing) {
        return current
          .filter(
            (participant) =>
              participant.peerId === peerId ||
              !incomingUserId ||
              participant.userId == null ||
              String(participant.userId) !== incomingUserId,
          )
          .map((participant) =>
            participant.peerId === peerId ? { ...participant, ...patch } : participant,
          );
      }

      if (sameUser) {
        return current.map((participant) =>
          participant.peerId === sameUser.peerId
            ? { ...participant, ...patch, peerId }
            : participant,
        );
      }

      return [
        ...current,
        {
          peerId,
          userId: null,
          username: "Участник",
          stream: null,
          isMuted: false,
          isVideoOff: false,
          isScreenSharing: false,
          ...patch,
        },
      ];
    });
  }, []);

  const updateParticipantStatusByUserId = useCallback((userId, patch) => {
    if (userId == null) return;
    const normalizedUserId = String(userId);

    setRemoteParticipants((current) =>
      current.map((participant) =>
        participant.userId != null &&
        String(participant.userId) === normalizedUserId
          ? { ...participant, ...patch }
          : participant,
      ),
    );

    setRoom((current) => {
      if (!current?.participants) return current;

      return {
        ...current,
        participants: current.participants.map((participant) => {
          if (
            participant.user_id == null ||
            String(participant.user_id) !== normalizedUserId
          ) {
            return participant;
          }

          return {
            ...participant,
            is_muted:
              patch.isMuted ?? patch.is_muted ?? participant.is_muted,
            is_video_off:
              patch.isVideoOff ??
              patch.is_video_off ??
              participant.is_video_off,
            is_screen_sharing:
              patch.isScreenSharing ??
              patch.is_screen_sharing ??
              participant.is_screen_sharing,
          };
        }),
      };
    });
  }, []);

  const removeParticipantFromUi = useCallback((userId) => {
    if (userId == null) return;
    const normalizedUserId = String(userId);

    remoteParticipantsRef.current
      .filter(
        (participant) =>
          participant.userId != null &&
          String(participant.userId) === normalizedUserId,
      )
      .forEach((participant) => {
        const connection = peerConnectionsRef.current.get(participant.peerId);
        if (connection) connection.close();
        peerConnectionsRef.current.delete(participant.peerId);
        remoteStreamsRef.current.delete(participant.peerId);
        queuedCandidatesRef.current.delete(participant.peerId);
      });

    setRemoteParticipants((current) =>
      current.filter(
        (participant) =>
          participant.userId == null ||
          String(participant.userId) !== normalizedUserId,
      ),
    );

    setRoom((current) => {
      if (!current?.participants) return current;

      const participants = current.participants.filter(
        (participant) =>
          participant.user_id == null ||
          String(participant.user_id) !== normalizedUserId,
      );

      return {
        ...current,
        participants,
        participants_count: participants.length,
      };
    });
  }, []);

  const removePeer = useCallback((peerId) => {
    const connection = peerConnectionsRef.current.get(peerId);
    if (connection) connection.close();

    peerConnectionsRef.current.delete(peerId);
    remoteStreamsRef.current.delete(peerId);
    queuedCandidatesRef.current.delete(peerId);
    setRemoteParticipants((current) =>
      current.filter((participant) => participant.peerId !== peerId),
    );
  }, []);

  const sendSignal = useCallback((message) => {
    const socket = wsRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return;

    const payload = {
      ...message,
      from: clientIdRef.current,
      clientId: clientIdRef.current,
      userId: currentUserId,
      username: currentUsername,
    };

    if (message.target) payload.target_client_id = message.target;

    socket.send(JSON.stringify(payload));
  }, [currentUserId, currentUsername]);

  const appendChatMessage = useCallback(
    (incomingMessage) => {
      const text = String(incomingMessage.text || "")
        .trim()
        .slice(0, CHAT_MESSAGE_LIMIT);

      if (!text) return;

      const userId = incomingMessage.userId ?? null;
      const sentAt = incomingMessage.sentAt || new Date().toISOString();
      const isOwn =
        Boolean(incomingMessage.isOwn) ||
        (userId != null &&
          currentUserId != null &&
          String(userId) === String(currentUserId));
      const id = String(
        incomingMessage.id ||
          `${userId || incomingMessage.username || "participant"}:${sentAt}:${text}`,
      );

      setChatMessages((current) => {
        if (current.some((message) => message.id === id)) return current;

        return [
          ...current,
          {
            id,
            userId,
            username: incomingMessage.username || "Участник",
            text,
            sentAt,
            isOwn,
          },
        ].slice(-CHAT_HISTORY_LIMIT);
      });

      if (!isOwn && !chatOpenRef.current) {
        setUnreadChatCount((current) => Math.min(current + 1, 99));
      }
    },
    [currentUserId],
  );

  const closeChatPanel = useCallback(() => {
    chatOpenRef.current = false;
    setChatOpen(false);
  }, []);

  const toggleChatPanel = useCallback(() => {
    const nextOpen = !chatOpenRef.current;
    chatOpenRef.current = nextOpen;
    setChatOpen(nextOpen);

    if (nextOpen) {
      setParticipantsOpen(false);
      setUnreadChatCount(0);
    }
  }, []);

  const toggleParticipantsPanel = useCallback(() => {
    closeChatPanel();
    setParticipantsOpen((current) => !current);
  }, [closeChatPanel]);

  const handleChatSocketMessage = useCallback(
    (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }

      if (message.type === "history") {
        const history = (message.messages || []).map((item) => ({
          id: String(item.id),
          userId: item.user_id,
          username: item.username || "Участник",
          text: String(item.content || "").slice(0, CHAT_MESSAGE_LIMIT),
          sentAt: item.sent_at,
          isOwn:
            currentUserId != null &&
            item.user_id != null &&
            String(item.user_id) === String(currentUserId),
        }));
        setChatMessages(history.slice(-CHAT_HISTORY_LIMIT));
        return;
      }

      if (message.type === "message") {
        appendChatMessage({
          id: message.id,
          userId: message.user_id,
          username: message.username,
          text: message.content,
          sentAt: message.sent_at,
        });
        return;
      }

      if (message.type === "message_deleted") {
        setChatMessages((current) =>
          current.filter((item) => item.id !== String(message.message_id)),
        );
        return;
      }

      if (message.type === "error" && message.detail) {
        setError(message.detail);
      }
    },
    [appendChatMessage, currentUserId],
  );

  const connectChat = useCallback(() => {
    if (!token || !inviteCode) return;

    const previousSocket = chatWsRef.current;
    if (
      previousSocket?.readyState === WebSocket.OPEN ||
      previousSocket?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    setChatConnectionState("connecting");
    const socket = new WebSocket(
      `${WS_URL}/ws/chat/${encodeURIComponent(inviteCode)}?token=${encodeURIComponent(token)}`,
    );
    chatWsRef.current = socket;

    socket.onopen = () => {
      if (chatWsRef.current === socket) setChatConnectionState("connected");
    };
    socket.onmessage = handleChatSocketMessage;
    socket.onerror = () => {
      if (chatWsRef.current === socket) setChatConnectionState("error");
    };
    socket.onclose = () => {
      if (chatWsRef.current !== socket) return;
      chatWsRef.current = null;
      setChatConnectionState(isLeavingRef.current ? "disconnected" : "error");
    };
  }, [handleChatSocketMessage, inviteCode, token]);

  const sendChatMessage = useCallback(
    (event) => {
      event?.preventDefault();
      const text = chatDraft.trim().slice(0, CHAT_MESSAGE_LIMIT);
      if (!text) return;

      const socket = chatWsRef.current;
      if (socket?.readyState !== WebSocket.OPEN) {
        setError("Чат подключается. Попробуйте отправить сообщение ещё раз");
        connectChat();
        return;
      }

      socket.send(JSON.stringify({ type: "message", content: text }));
      setChatDraft("");
    },
    [chatDraft, connectChat],
  );

  const deleteChatMessage = useCallback((messageId) => {
    const socket = chatWsRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: "delete_message", message_id: messageId }));
  }, []);

  const handleChatKeyDown = useCallback(
    (event) => {
      if (
        event.key === "Enter" &&
        !event.shiftKey &&
        !event.nativeEvent?.isComposing
      ) {
        event.preventDefault();
        sendChatMessage();
      }
    },
    [sendChatMessage],
  );

  const flushQueuedCandidates = useCallback(async (peerId, connection) => {
    const queued = queuedCandidatesRef.current.get(peerId) || [];

    for (const candidate of queued) {
      try {
        await connection.addIceCandidate(candidate);
      } catch (candidateError) {
        console.error("Не удалось добавить ICE-кандидат", candidateError);
      }
    }

    queuedCandidatesRef.current.delete(peerId);
  }, []);

  const createPeerConnection = useCallback(
    (peerId, username, userId = null) => {
      const existing = peerConnectionsRef.current.get(peerId);
      if (existing) {
        if (username || userId) {
          updateRemoteParticipant(peerId, {
            ...(username ? { username } : {}),
            ...(userId ? { userId } : {}),
          });
        }
        return existing;
      }

      const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peerConnectionsRef.current.set(peerId, connection);
      updateRemoteParticipant(peerId, {
        username: username || "Участник",
        userId,
      });

      localStreamRef.current?.getTracks().forEach((track) => {
        connection.addTrack(track, localStreamRef.current);
      });

      connection.onicecandidate = (event) => {
        if (!event.candidate) return;
        sendSignal({ type: "ice-candidate", target: peerId, candidate: event.candidate });
      };

      connection.ontrack = (event) => {
        let remoteStream = event.streams?.[0];

        if (!remoteStream) {
          remoteStream = remoteStreamsRef.current.get(peerId) || new MediaStream();
          remoteStream.addTrack(event.track);
        }

        remoteStreamsRef.current.set(peerId, remoteStream);
        updateRemoteParticipant(peerId, { stream: remoteStream });
      };

      connection.onconnectionstatechange = () => {
        if (["failed", "closed"].includes(connection.connectionState)) {
          removePeer(peerId);
        }
      };

      return connection;
    },
    [removePeer, sendSignal, updateRemoteParticipant],
  );

  const createOffer = useCallback(
    async (peerId, username, userId = null) => {
      try {
        const connection = createPeerConnection(peerId, username, userId);
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);

        sendSignal({
          type: "offer",
          target: peerId,
          sdp: connection.localDescription,
        });
      } catch (offerError) {
        console.error("Не удалось создать WebRTC offer", offerError);
      }
    },
    [createPeerConnection, sendSignal],
  );

  const broadcastMediaStatus = useCallback(
    (next = {}) => {
      sendSignal({
        type: "media-status",
        isMuted: next.isMuted ?? !micEnabledRef.current,
        isVideoOff: next.isVideoOff ?? !cameraEnabledRef.current,
        isScreenSharing: next.isScreenSharing ?? isSharingRef.current,
      });
    },
    [sendSignal],
  );

  const updateStatusOnServer = useCallback(
    async (statusPatch) => {
      try {
        await apiClient.patch(
          `/rooms/${encodeURIComponent(inviteCode)}/participants/status`,
          statusPatch,
        );
      } catch {
        // Статус интерфейса уже изменён локально; запрос повторится при следующем действии.
      }
    },
    [inviteCode],
  );

  const releaseSessionLock = useCallback(() => {
    if (sessionHeartbeatRef.current) {
      window.clearInterval(sessionHeartbeatRef.current);
      sessionHeartbeatRef.current = null;
    }

    const key = sessionLockKeyRef.current;
    if (!key) return;

    try {
      const current = JSON.parse(localStorage.getItem(key) || "null");
      if (current?.clientId === clientIdRef.current) {
        localStorage.removeItem(key);
      }
    } catch {
      localStorage.removeItem(key);
    }

    sessionLockKeyRef.current = null;
  }, []);

  const claimSessionLock = useCallback(() => {
    if (!currentUserId) return true;

    const key = `talksphere:conference:${inviteCode}:${currentUserId}`;
    const now = Date.now();
    const ttl = 15000;

    try {
      const existing = JSON.parse(localStorage.getItem(key) || "null");
      if (
        existing?.clientId &&
        existing.clientId !== clientIdRef.current &&
        now - Number(existing.updatedAt || 0) < ttl
      ) {
        return false;
      }
    } catch {
      // Поврежденная блокировка будет перезаписана ниже.
    }

    const writeLock = () => {
      localStorage.setItem(
        key,
        JSON.stringify({
          clientId: clientIdRef.current,
          updatedAt: Date.now(),
        }),
      );
    };

    writeLock();
    sessionLockKeyRef.current = key;
    sessionHeartbeatRef.current = window.setInterval(writeLock, 5000);
    return true;
  }, [currentUserId, inviteCode]);

  const handleSignalMessage = useCallback(
    async (event) => {
      let message;

      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }

      if (!message?.type) return;

      const messageUserId =
        message.userId ?? message.user_id ?? message.from_user_id ?? null;
      const messageUsername =
        message.username ?? message.from_username ?? "Участник";
      const messageFrom =
        message.from ?? message.clientId ?? message.client_id ?? null;
      const messageTarget = message.target ?? message.target_client_id ?? null;

      if (messageTarget && messageTarget !== clientIdRef.current) return;

      if (["chat-message", "chat_message", "chat"].includes(message.type)) {
        return;
      }

      if (message.type === "control_action") {
        setError(message.reason || "Организатор изменил настройки ваших устройств");
        void forcedControlActionRef.current?.(message.action);
        return;
      }

      if (message.type === "participant_removed") {
        removeParticipantFromUi(messageUserId);
        return;
      }

      if (message.type === "media-status") {
        const statusPatch = {
          username: messageUsername,
          userId: messageUserId,
          isMuted: Boolean(message.isMuted ?? message.is_muted),
          isVideoOff: Boolean(message.isVideoOff ?? message.is_video_off),
          isScreenSharing: Boolean(
            message.isScreenSharing ?? message.is_screen_sharing,
          ),
        };

        if (
          messageUserId != null &&
          currentUserId != null &&
          String(messageUserId) === String(currentUserId)
        ) {
          if (statusPatch.isMuted) {
            const audioTrack = localStreamRef.current?.getAudioTracks()[0];
            if (audioTrack) audioTrack.enabled = false;
            micEnabledRef.current = false;
            setMicEnabled(false);
          }

          if (statusPatch.isVideoOff) {
            const videoTrack = cameraTrackRef.current;
            if (videoTrack) videoTrack.enabled = false;
            cameraEnabledRef.current = false;
            setCameraEnabled(false);
          }

          if (!statusPatch.isScreenSharing && isSharingRef.current) {
            void forcedControlActionRef.current?.("screen_off");
          }
          return;
        }

        if (messageFrom) {
          updateRemoteParticipant(messageFrom, statusPatch);
        } else {
          updateParticipantStatusByUserId(messageUserId, statusPatch);
        }
        return;
      }

      if (message.type === "permission_denied") {
        setError(message.detail || "Действие запрещено организатором");

        if (message.permission === "screen_share" && screenTrackRef.current) {
          void stopScreenShare();
        }

        if (message.permission === "camera") {
          const videoTrack = cameraTrackRef.current;
          if (videoTrack) videoTrack.enabled = false;
          cameraEnabledRef.current = false;
          setCameraEnabled(false);
        }

        if (message.permission === "microphone") {
          const audioTrack = localStreamRef.current?.getAudioTracks()[0];
          if (audioTrack) audioTrack.enabled = false;
          micEnabledRef.current = false;
          setMicEnabled(false);
        }
        return;
      }

      if (message.type === "room_state") {
        const settings = message.roomSettings || {};
        setRoom((current) => ({
          ...(current || {}),
          camera_on_join: settings.cameraOnJoin ?? current?.camera_on_join,
          microphone_on_join:
            settings.microphoneOnJoin ?? current?.microphone_on_join,
          allow_participant_camera:
            settings.allowParticipantCamera ?? current?.allow_participant_camera,
          allow_participant_microphone:
            settings.allowParticipantMicrophone ?? current?.allow_participant_microphone,
          screen_share_policy:
            settings.screenSharePolicy ?? current?.screen_share_policy,
          created_by: settings.createdBy ?? current?.created_by,
        }));

        (message.participants || []).forEach((participant) => {
          const userId = participant.userId ?? participant.user_id ?? null;
          if (
            userId != null &&
            currentUserId != null &&
            String(userId) === String(currentUserId)
          ) {
            return;
          }

          const peerId =
            participant.clientId ??
            participant.client_id ??
            (userId != null ? `pending:${userId}` : null);

          updateRemoteParticipant(peerId, {
            userId,
            username: participant.username || "Участник",
            isMuted: Boolean(participant.isMuted ?? participant.is_muted),
            isVideoOff: Boolean(participant.isVideoOff ?? participant.is_video_off),
            isScreenSharing: Boolean(
              participant.isScreenSharing ?? participant.is_screen_sharing,
            ),
          });
        });
        return;
      }

      if (message.type === "participant_joined") {
        if (
          messageUserId != null &&
          currentUserId != null &&
          String(messageUserId) === String(currentUserId)
        ) {
          return;
        }

        const peerId =
          messageFrom ||
          (messageUserId != null ? `pending:${messageUserId}` : null);
        updateRemoteParticipant(peerId, {
          userId: messageUserId,
          username: messageUsername,
        });
        return;
      }

      if (message.type === "participant_left") {
        setRemoteParticipants((current) =>
          current.filter((participant) => {
            if (messageFrom && participant.peerId === messageFrom) return false;
            if (
              messageUserId != null &&
              participant.userId != null &&
              String(participant.userId) === String(messageUserId)
            ) {
              return false;
            }
            return true;
          }),
        );
        return;
      }

      if (messageFrom === clientIdRef.current) return;

      if (message.type === "duplicate-session") {
        isLeavingRef.current = true;
        setConnectionState("error");
        setError("Эта учетная запись уже подключена к конференции");
        wsRef.current?.close(1000, "Duplicate session");
        peerConnectionsRef.current.forEach((connection) => connection.close());
        localStreamRef.current?.getTracks().forEach((track) => track.stop());
        releaseSessionLock();
        redirectTimerRef.current = window.setTimeout(() => {
          navigate("/meetings", { replace: true });
        }, 1800);
        return;
      }

      const peerId = messageFrom;
      if (!peerId) return;

      try {
        if (message.type === "join") {
          if (
            messageUserId != null &&
            currentUserId != null &&
            String(messageUserId) === String(currentUserId)
          ) {
            sendSignal({
              type: "duplicate-session",
              target: peerId,
            });
            return;
          }

          updateRemoteParticipant(peerId, {
            userId: messageUserId,
            username: messageUsername,
          });
          await createOffer(peerId, messageUsername, messageUserId);
          broadcastMediaStatus();
          return;
        }

        if (message.type === "offer") {
          const connection = createPeerConnection(
            peerId,
            messageUsername,
            messageUserId,
          );
          await connection.setRemoteDescription(message.sdp);
          await flushQueuedCandidates(peerId, connection);

          const answer = await connection.createAnswer();
          await connection.setLocalDescription(answer);
          sendSignal({
            type: "answer",
            target: peerId,
            sdp: connection.localDescription,
          });
          broadcastMediaStatus();
          return;
        }

        if (message.type === "answer") {
          const connection = peerConnectionsRef.current.get(peerId);
          if (!connection) return;

          await connection.setRemoteDescription(message.sdp);
          await flushQueuedCandidates(peerId, connection);
          return;
        }

        if (message.type === "ice-candidate") {
          const connection =
            peerConnectionsRef.current.get(peerId) ||
            createPeerConnection(peerId, messageUsername, messageUserId);

          if (connection.remoteDescription) {
            await connection.addIceCandidate(message.candidate);
          } else {
            const queued = queuedCandidatesRef.current.get(peerId) || [];
            queued.push(message.candidate);
            queuedCandidatesRef.current.set(peerId, queued);
          }
          return;
        }

        if (message.type === "leave") removePeer(peerId);
      } catch (signalError) {
        console.error("Ошибка обработки сигнального сообщения", signalError);
      }
    },
    [
      appendChatMessage,
      broadcastMediaStatus,
      createOffer,
      createPeerConnection,
      flushQueuedCandidates,
      currentUserId,
      navigate,
      releaseSessionLock,
      removeParticipantFromUi,
      removePeer,
      sendSignal,
      updateParticipantStatusByUserId,
      updateRemoteParticipant,
    ],
  );

  const acquireInitialMedia = useCallback(async ({ video, audio }) => {
    if (!video && !audio) return new MediaStream();

    try {
      return await navigator.mediaDevices.getUserMedia({ video, audio });
    } catch (combinedError) {
      const stream = new MediaStream();

      if (video) {
        try {
          const videoStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
          videoStream.getVideoTracks().forEach((track) => stream.addTrack(track));
        } catch (videoError) {
          console.warn("Камера недоступна", videoError);
        }
      }

      if (audio) {
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: true,
          });
          audioStream.getAudioTracks().forEach((track) => stream.addTrack(track));
        } catch (audioError) {
          console.warn("Микрофон недоступен", audioError);
        }
      }

      if (stream.getTracks().length === 0) {
        console.warn("Разрешённые устройства недоступны", combinedError);
      }

      return stream;
    }
  }, []);

  const stopMedia = useCallback(() => {
    screenTrackRef.current?.stop();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenTrackRef.current = null;
    cameraTrackRef.current = null;
    localStreamRef.current = null;
    setLocalPreview(null);
  }, []);

  const closeConnections = useCallback(() => {
    peerConnectionsRef.current.forEach((connection) => connection.close());
    peerConnectionsRef.current.clear();
    remoteStreamsRef.current.clear();
    queuedCandidatesRef.current.clear();
  }, []);

  useEffect(() => {
    if (authLoading) return undefined;

    if (!isAuthenticated || !token) {
      const path = `/conference/${encodeURIComponent(inviteCode)}`;
      sessionStorage.setItem("redirect_after_login", path);
      navigate("/login", {
        replace: true,
        state: {
          from: path,
          message: "Для подключения к конференции необходимо войти",
        },
      });
      return undefined;
    }

    let cancelled = false;

    const prepareConference = async () => {
      try {
        const roomResponse = await apiClient.get(
          `/rooms/${encodeURIComponent(inviteCode)}`,
        );

        if (cancelled) return;

        const statusError = getRoomStatusError(roomResponse.data);
        if (statusError) {
          setRoom(null);
          setError(statusError);
          setConnectionState("error");
          return;
        }

        setRoom(roomResponse.data);

        const creator =
          roomResponse.data?.created_by != null &&
          currentUserId != null &&
          String(roomResponse.data.created_by) === String(currentUserId);
        const cameraAllowed =
          roomResponse.data?.allow_participant_camera !== false || creator;
        const microphoneAllowed =
          roomResponse.data?.allow_participant_microphone !== false || creator;

        const mediaStream = await acquireInitialMedia({
          video: cameraAllowed,
          audio: microphoneAllowed,
        });
        if (cancelled) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }

        const hasMicrophone = mediaStream.getAudioTracks().length > 0;
        const hasCamera = mediaStream.getVideoTracks().length > 0;
        const microphoneStartsOn =
          microphoneAllowed &&
          hasMicrophone &&
          roomResponse.data?.microphone_on_join !== false;
        const cameraStartsOn =
          cameraAllowed && hasCamera && roomResponse.data?.camera_on_join !== false;

        mediaStream.getAudioTracks().forEach((track) => {
          track.enabled = microphoneStartsOn;
        });
        mediaStream.getVideoTracks().forEach((track) => {
          track.enabled = cameraStartsOn;
        });

        micEnabledRef.current = microphoneStartsOn;
        cameraEnabledRef.current = cameraStartsOn;
        setMicEnabled(microphoneStartsOn);
        setCameraEnabled(cameraStartsOn);
        localStreamRef.current = mediaStream;
        cameraTrackRef.current = mediaStream.getVideoTracks()[0] || null;
        setLocalPreview(new MediaStream(mediaStream.getTracks()));
        setConnectionState("ready");
      } catch (requestError) {
        if (!cancelled) {
          setRoom(null);
          setError(getErrorMessage(requestError, "Конференция не найдена"));
          setConnectionState("error");
        }
      } finally {
        if (!cancelled) setPageLoading(false);
      }
    };

    void prepareConference();

    return () => {
      cancelled = true;
    };
  }, [
    acquireInitialMedia,
    authLoading,
    currentUserId,
    inviteCode,
    isAuthenticated,
    navigate,
    token,
  ]);

  const startParticipantPolling = useCallback(() => {
    if (participantPollRef.current) {
      window.clearInterval(participantPollRef.current);
    }

    participantPollRef.current = window.setInterval(async () => {
      try {
        const response = await apiClient.get(
          `/rooms/${encodeURIComponent(inviteCode)}`,
        );

        if (!isRoomActive(response.data)) {
          isLeavingRef.current = true;
          setConnectionState("error");
          setError("Конференция завершена");
          wsRef.current?.close(1000, "Room ended");
          releaseSessionLock();
          redirectTimerRef.current = window.setTimeout(() => {
            navigate("/meetings", { replace: true });
          }, 1800);
          return;
        }

        setRoom(response.data);
      } catch {
        // Временная ошибка обновления списка не прерывает звонок.
      }
    }, 4000);
  }, [inviteCode, navigate, releaseSessionLock]);

  const joinConference = useCallback(async () => {
    if (joinActionRef.current || joinedRef.current) return;

    joinActionRef.current = true;
    setIsJoining(true);
    setConnectionState("connecting");
    setError("");

    try {
      const roomResponse = await apiClient.get(
        `/rooms/${encodeURIComponent(inviteCode)}`,
      );
      const statusError = getRoomStatusError(roomResponse.data);

      if (statusError) {
        setRoom(null);
        setError(statusError);
        setConnectionState("error");
        joinActionRef.current = false;
        setIsJoining(false);
        return;
      }

      setRoom(roomResponse.data);

      if (!claimSessionLock()) {
        setError("Эта учетная запись уже подключена к конференции в другой вкладке");
        setConnectionState("ready");
        joinActionRef.current = false;
        setIsJoining(false);
        return;
      }

      isLeavingRef.current = false;

      const socket = new WebSocket(
        `${WS_URL}/ws/signal/${encodeURIComponent(inviteCode)}?token=${encodeURIComponent(token)}`,
      );
      wsRef.current = socket;

      socket.onopen = () => {
        if (wsRef.current !== socket) return;

        joinedRef.current = true;
        joinActionRef.current = false;
        setIsJoined(true);
        setIsJoining(false);
        setConnectionState("connected");
        connectChat();
        sendSignal({ type: "join" });
        broadcastMediaStatus({
          isMuted: !micEnabledRef.current,
          isVideoOff: !cameraEnabledRef.current,
          isScreenSharing: isSharingRef.current,
        });
        startParticipantPolling();
      };

      socket.onmessage = handleSignalMessage;

      socket.onerror = () => {
        if (wsRef.current !== socket) return;

        setConnectionState("error");
        setError("Не удалось подключиться к серверу конференции");

        if (!joinedRef.current) {
          joinActionRef.current = false;
          setIsJoining(false);
          releaseSessionLock();
        }
      };

      socket.onclose = (closeEvent) => {
        if (wsRef.current !== socket) return;

        wsRef.current = null;
        chatWsRef.current?.close();
        chatWsRef.current = null;
        setChatConnectionState("disconnected");
        joinActionRef.current = false;

        if (participantPollRef.current) {
          window.clearInterval(participantPollRef.current);
          participantPollRef.current = null;
        }

        const closeReason = String(closeEvent?.reason || "");
        const wasRemoved = /исключ/i.test(closeReason);
        const roomWasEnded = /завершен|завершена/i.test(closeReason);

        if (wasRemoved || roomWasEnded) {
          isLeavingRef.current = true;
          joinedRef.current = false;
          setIsJoined(false);
          setIsJoining(false);
          setConnectionState("error");
          setError(
            closeReason ||
              (wasRemoved
                ? "Организатор исключил вас из встречи"
                : "Конференция завершена"),
          );
          closeConnections();
          stopMedia();
          releaseSessionLock();
          redirectTimerRef.current = window.setTimeout(() => {
            navigate("/meetings", { replace: true });
          }, 2200);
          return;
        }

        if (!joinedRef.current) {
          setIsJoining(false);
          releaseSessionLock();
          return;
        }

        joinedRef.current = false;
        setIsJoined(false);
        if (!isLeavingRef.current) {
          setConnectionState("error");
          setError("Соединение с конференцией прервано");
        }
      };
    } catch {
      joinActionRef.current = false;
      setIsJoining(false);
      setConnectionState("error");
      setError("Не удалось подключиться к серверу конференции");
      releaseSessionLock();
    }
  }, [
    broadcastMediaStatus,
    claimSessionLock,
    closeConnections,
    connectChat,
    handleSignalMessage,
    inviteCode,
    navigate,
    releaseSessionLock,
    sendSignal,
    startParticipantPolling,
    stopMedia,
    token,
  ]);

  useEffect(() => {
    const handleBeforeUnload = () => releaseSessionLock();
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);

      if (participantPollRef.current) {
        window.clearInterval(participantPollRef.current);
        participantPollRef.current = null;
      }

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "leave",
            from: clientIdRef.current,
            clientId: clientIdRef.current,
            userId: currentUserId,
            username: currentUsername,
          }),
        );
      }

      isLeavingRef.current = true;
      joinedRef.current = false;
      wsRef.current?.close();
      wsRef.current = null;
      chatWsRef.current?.close();
      chatWsRef.current = null;
      closeConnections();
      stopMedia();
      releaseSessionLock();

      if (redirectTimerRef.current) {
        window.clearTimeout(redirectTimerRef.current);
        redirectTimerRef.current = null;
      }
    };
  }, [
    closeConnections,
    currentUserId,
    currentUsername,
    releaseSessionLock,
    stopMedia,
  ]);

  const toggleMicrophone = async () => {
    if (!canUseMicrophone) {
      setError("Организатор запретил участникам включать микрофон");
      return;
    }
    if (microphoneActionRef.current) return;
    microphoneActionRef.current = true;
    setError("");

    const nextEnabled = !micEnabledRef.current;

    try {
      let audioTrack = localStreamRef.current?.getAudioTracks()[0] || null;

      if (nextEnabled && (!audioTrack || audioTrack.readyState === "ended")) {
        const audioStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: true,
        });
        audioTrack = audioStream.getAudioTracks()[0] || null;

        if (audioTrack) {
          const nextStream = new MediaStream([
            ...(localStreamRef.current?.getVideoTracks() || []),
            audioTrack,
          ]);
          localStreamRef.current = nextStream;
          setLocalPreview((current) =>
            isSharingRef.current ? current : new MediaStream(nextStream.getTracks()),
          );

          for (const [peerId, connection] of peerConnectionsRef.current.entries()) {
            const sender = connection
              .getSenders()
              .find((item) => item.track?.kind === "audio");

            if (sender) await sender.replaceTrack(audioTrack);
            else {
              connection.addTrack(audioTrack, nextStream);
              await createOffer(peerId);
            }
          }
        }
      }

      if (audioTrack) audioTrack.enabled = nextEnabled;

      const actualEnabled = Boolean(audioTrack && nextEnabled);
      micEnabledRef.current = actualEnabled;
      setMicEnabled(actualEnabled);
      if (joinedRef.current) {
        broadcastMediaStatus({ isMuted: !actualEnabled });
        await updateStatusOnServer({ is_muted: !actualEnabled });
      }

      if (nextEnabled && !audioTrack) {
        setError("Микрофон недоступен. Разрешите доступ в настройках браузера");
      }
    } catch {
      setError("Не удалось включить микрофон. Проверьте разрешения браузера");
    } finally {
      microphoneActionRef.current = false;
    }
  };

  const toggleCamera = async () => {
    if (!canUseCamera) {
      setError("Организатор запретил участникам включать камеру");
      return;
    }
    if (isSharingRef.current || cameraActionRef.current) return;
    cameraActionRef.current = true;
    setError("");

    const nextEnabled = !cameraEnabledRef.current;

    try {
      let videoTrack = cameraTrackRef.current;

      if (nextEnabled && (!videoTrack || videoTrack.readyState === "ended")) {
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        videoTrack = videoStream.getVideoTracks()[0] || null;
        cameraTrackRef.current = videoTrack;

        if (videoTrack) {
          const nextStream = new MediaStream([
            videoTrack,
            ...(localStreamRef.current?.getAudioTracks() || []),
          ]);
          localStreamRef.current = nextStream;
          setLocalPreview(new MediaStream(nextStream.getTracks()));

          for (const [peerId, connection] of peerConnectionsRef.current.entries()) {
            const sender = connection
              .getSenders()
              .find((item) => item.track?.kind === "video");

            if (sender) await sender.replaceTrack(videoTrack);
            else {
              connection.addTrack(videoTrack, nextStream);
              await createOffer(peerId);
            }
          }
        }
      }

      if (videoTrack) videoTrack.enabled = nextEnabled;

      const actualEnabled = Boolean(videoTrack && nextEnabled);
      cameraEnabledRef.current = actualEnabled;
      setCameraEnabled(actualEnabled);
      if (joinedRef.current) {
        broadcastMediaStatus({ isVideoOff: !actualEnabled });
        await updateStatusOnServer({ is_video_off: !actualEnabled });
      }

      if (nextEnabled && !videoTrack) {
        setError("Камера недоступна. Разрешите доступ в настройках браузера");
      }
    } catch {
      setError("Не удалось включить камеру. Проверьте разрешения браузера");
    } finally {
      cameraActionRef.current = false;
    }
  };

  const stopScreenShare = useCallback(async () => {
    const screenTrack = screenTrackRef.current;
    if (!screenTrack) return;

    screenTrack.onended = null;
    screenTrack.stop();
    screenTrackRef.current = null;

    const cameraTrack = cameraTrackRef.current;

    for (const connection of peerConnectionsRef.current.values()) {
      const sender = connection
        .getSenders()
        .find((item) => item.track?.kind === "video" || item.track === screenTrack);

      if (sender) await sender.replaceTrack(cameraTrack || null);
    }

    setLocalPreview(localStreamRef.current);
    isSharingRef.current = false;
    setIsSharing(false);
    broadcastMediaStatus({ isScreenSharing: false, isVideoOff: !cameraEnabled });
    await updateStatusOnServer({ is_screen_sharing: false });
  }, [broadcastMediaStatus, cameraEnabled, updateStatusOnServer]);

  useEffect(() => {
    forcedControlActionRef.current = async (action) => {
      if (action === "mute") {
        const audioTrack = localStreamRef.current?.getAudioTracks()[0];
        if (audioTrack) audioTrack.enabled = false;
        micEnabledRef.current = false;
        setMicEnabled(false);
        return;
      }

      if (action === "video_off") {
        const videoTrack = cameraTrackRef.current;
        if (videoTrack) videoTrack.enabled = false;
        cameraEnabledRef.current = false;
        setCameraEnabled(false);
        return;
      }

      if (action === "screen_off") {
        await stopScreenShare();
      }
    };

    return () => {
      forcedControlActionRef.current = null;
    };
  }, [stopScreenShare]);

  const canShareScreen =
    room?.screen_share_policy !== "creator_only" || isRoomCreator;

  const toggleScreenShare = async () => {
    if (!canShareScreen) {
      setError("Демонстрация экрана разрешена только создателю встречи");
      return;
    }

    if (isSharing) {
      await stopScreenShare();
      return;
    }

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const screenTrack = displayStream.getVideoTracks()[0];
      if (!screenTrack) return;

      screenTrackRef.current = screenTrack;
      screenTrack.onended = () => void stopScreenShare();

      for (const [peerId, connection] of peerConnectionsRef.current.entries()) {
        const videoSender = connection
          .getSenders()
          .find((sender) => sender.track?.kind === "video");

        if (videoSender) {
          await videoSender.replaceTrack(screenTrack);
        } else {
          connection.addTrack(screenTrack, displayStream);
          await createOffer(peerId);
        }
      }

      const preview = new MediaStream([
        screenTrack,
        ...(localStreamRef.current?.getAudioTracks() || []),
      ]);
      setLocalPreview(preview);
      isSharingRef.current = true;
      setIsSharing(true);
      broadcastMediaStatus({ isScreenSharing: true, isVideoOff: false });
      await updateStatusOnServer({ is_screen_sharing: true });
    } catch (shareError) {
      if (shareError?.name !== "NotAllowedError") {
        setError("Не удалось включить демонстрацию экрана");
      }
    }
  };

  const copyMeetingLink = async () => {
    const link = `${window.location.origin}/conference/${encodeURIComponent(inviteCode)}`;

    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Не удалось скопировать ссылку");
    }
  };

  const runParticipantAction = useCallback(
    async (participant, action) => {
      if (!isRoomCreator || participant?.isSelf || !participant?.userId) return;

      if (
        action === "remove" &&
        !window.confirm(`Исключить участника «${participant.name}» из встречи?`)
      ) {
        return;
      }

      const actionKey = `${participant.userId}:${action}`;
      setParticipantAction(actionKey);
      setError("");

      const participantPath = `/rooms/${encodeURIComponent(
        inviteCode,
      )}/participants/${encodeURIComponent(participant.userId)}`;

      try {
        if (action === "mute") {
          await apiClient.patch(`${participantPath}/mute`);
          updateParticipantStatusByUserId(participant.userId, { isMuted: true });
        } else if (action === "video_off") {
          await apiClient.patch(`${participantPath}/video-off`);
          updateParticipantStatusByUserId(participant.userId, {
            isVideoOff: true,
          });
        } else if (action === "screen_off") {
          await apiClient.patch(`${participantPath}/screen-off`);
          updateParticipantStatusByUserId(participant.userId, {
            isScreenSharing: false,
          });
        } else if (action === "remove") {
          await apiClient.delete(participantPath);
          removeParticipantFromUi(participant.userId);
          if (participant.peerId) removePeer(participant.peerId);
        }
      } catch (actionError) {
        setError(
          getErrorMessage(
            actionError,
            "Не удалось выполнить действие с участником",
          ),
        );
      } finally {
        setParticipantAction("");
      }
    },
    [
      inviteCode,
      isRoomCreator,
      removeParticipantFromUi,
      removePeer,
      updateParticipantStatusByUserId,
    ],
  );

  const leaveConference = async () => {
    isLeavingRef.current = true;
    joinedRef.current = false;
    setIsJoined(false);
    sendSignal({ type: "leave" });

    if (participantPollRef.current) {
      window.clearInterval(participantPollRef.current);
      participantPollRef.current = null;
    }

    try {
      await apiClient.post(`/rooms/${encodeURIComponent(inviteCode)}/leave`);
    } catch {
      // Закрытие WebSocket также удаляет участника на текущем бэкенде.
    }

    wsRef.current?.close();
    chatWsRef.current?.close();
    chatWsRef.current = null;
    closeConnections();
    stopMedia();
    releaseSessionLock();
    navigate("/meetings", { replace: true });
  };

  const handleControlClick = (event, action) => {
    event.preventDefault();
    event.stopPropagation();
    void action();
  };

  const visibleRemoteParticipants = useMemo(() => {
    const seenUsers = new Set();

    return remoteParticipants.filter((participant) => {
      const userKey = participant.userId
        ? String(participant.userId)
        : `peer:${participant.peerId}`;

      if (
        participant.userId &&
        currentUserId &&
        String(participant.userId) === String(currentUserId)
      ) {
        return false;
      }

      if (seenUsers.has(userKey)) return false;
      seenUsers.add(userKey);
      return true;
    });
  }, [currentUserId, remoteParticipants]);

  const displayedParticipants = useMemo(() => {
    const participants = new Map();
    const creatorId = room?.created_by == null ? null : String(room.created_by);

    const mergeParticipant = ({
      userId = null,
      peerId = null,
      name = "Участник",
      isMuted,
      isVideoOff,
      isScreenSharing,
      isSelf = false,
    }) => {
      const key = String(userId || peerId || name);
      const previous = participants.get(key) || {};
      const normalizedUserId = userId == null ? previous.userId ?? null : String(userId);

      participants.set(key, {
        ...previous,
        id: key,
        userId: normalizedUserId,
        peerId: peerId || previous.peerId || null,
        name: name || previous.name || "Участник",
        isMuted: isMuted ?? previous.isMuted ?? false,
        isVideoOff: isVideoOff ?? previous.isVideoOff ?? false,
        isScreenSharing:
          isScreenSharing ?? previous.isScreenSharing ?? false,
        isSelf: isSelf || previous.isSelf || false,
        isCreator:
          normalizedUserId != null && creatorId != null
            ? normalizedUserId === creatorId
            : previous.isCreator || false,
      });
    };

    mergeParticipant({
      userId: currentUserId,
      peerId: "local",
      name: currentUsername,
      isMuted: !micEnabled,
      isVideoOff: !cameraEnabled && !isSharing,
      isScreenSharing: isSharing,
      isSelf: true,
    });

    (room?.participants || []).forEach((participant) => {
      mergeParticipant({
        userId: participant.user_id,
        name: participant.username,
        isMuted: Boolean(participant.is_muted),
        isVideoOff: Boolean(participant.is_video_off),
        isScreenSharing: Boolean(participant.is_screen_sharing),
      });
    });

    visibleRemoteParticipants.forEach((participant) => {
      mergeParticipant({
        userId: participant.userId,
        peerId: participant.peerId,
        name: participant.username || "Участник",
        isMuted: participant.isMuted,
        isVideoOff: participant.isVideoOff,
        isScreenSharing: participant.isScreenSharing,
      });
    });

    return Array.from(participants.values()).sort((first, second) => {
      if (first.isSelf !== second.isSelf) return first.isSelf ? -1 : 1;
      if (first.isCreator !== second.isCreator) return first.isCreator ? -1 : 1;
      return first.name.localeCompare(second.name, "ru");
    });
  }, [
    cameraEnabled,
    currentUserId,
    currentUsername,
    isSharing,
    micEnabled,
    room?.created_by,
    room?.participants,
    visibleRemoteParticipants,
  ]);

  const videoParticipants = [
    {
      peerId: "local",
      userId: currentUserId,
      username: currentUsername,
      stream: localPreview,
      isMuted: !micEnabled,
      isVideoOff: !cameraEnabled && !isSharing,
      isScreenSharing: isSharing,
      isLocal: true,
    },
    ...visibleRemoteParticipants.map((participant) => ({
      ...participant,
      isLocal: false,
    })),
  ];

  const screenSharingParticipants = videoParticipants.filter(
    (participant) => participant.isScreenSharing,
  );
  const regularVideoParticipants = videoParticipants.filter(
    (participant) => !participant.isScreenSharing,
  );
  const hasScreenShares = screenSharingParticipants.length > 0;

  const getGridLayoutClass = (count) =>
    count === 1
      ? styles.singleVideo
      : count === 2
        ? styles.twoVideos
        : count === 3
          ? styles.threeVideos
          : count === 4
            ? styles.fourVideos
            : count <= 6
              ? styles.sixVideos
              : styles.manyVideos;

  const totalVideoTiles = videoParticipants.length;
  const gridLayoutClass = getGridLayoutClass(totalVideoTiles);

  const presentationGridClass =
    screenSharingParticipants.length === 1
      ? styles.onePresentation
      : screenSharingParticipants.length === 2
        ? styles.twoPresentations
        : screenSharingParticipants.length <= 4
          ? styles.fourPresentations
          : styles.manyPresentations;

  const regularPreviewLimit =
    screenSharingParticipants.length === 1 ? 4 : 6;
  const visibleRegularPreviews = regularVideoParticipants.slice(
    0,
    regularPreviewLimit,
  );
  const hiddenRegularCount = Math.max(
    0,
    regularVideoParticipants.length - visibleRegularPreviews.length,
  );
  const railItemsCount =
    visibleRegularPreviews.length + (hiddenRegularCount > 0 ? 1 : 0);

  const cameraOnParticipants = regularVideoParticipants.filter(
    (participant) => !participant.isVideoOff,
  );
  const cameraOffParticipants = regularVideoParticipants.filter(
    (participant) => participant.isVideoOff,
  );
  const useCameraFocusLayout =
    !hasScreenShares &&
    cameraOnParticipants.length > 0 &&
    cameraOffParticipants.length > 0;
  const cameraStageGridClass = getGridLayoutClass(cameraOnParticipants.length);
  const visibleCameraOffParticipants = cameraOffParticipants.slice(0, 6);
  const hiddenCameraOffCount = Math.max(
    0,
    cameraOffParticipants.length - visibleCameraOffParticipants.length,
  );
  const cameraRailItemsCount =
    visibleCameraOffParticipants.length + (hiddenCameraOffCount > 0 ? 1 : 0);

  const renderParticipantTile = (
    participant,
    { presentation = false, compact = false } = {},
  ) => (
    <VideoTile
      key={participant.peerId}
      stream={participant.stream}
      name={participant.username}
      videoMuted={participant.isLocal}
      isMicOff={participant.isMuted}
      videoOff={participant.isVideoOff}
      isLocal={participant.isLocal}
      mirror={participant.isLocal && !participant.isScreenSharing}
      isPresentation={presentation}
      compact={compact}
    />
  );

  if (pageLoading || authLoading) {
    return (
      <main className={styles.loadingPage}>
        <span className={styles.loader} />
        <p>Проверяем камеру и микрофон…</p>
      </main>
    );
  }

  if (error && !room) {
    return (
      <main className={styles.errorPage}>
        <a href="/" className={styles.brand}>TalkSphere</a>
        <section>
          <h1>Не удалось открыть конференцию</h1>
          <p>{error}</p>
          <button type="button" onClick={() => navigate("/meetings")}>
            Вернуться ко встречам
          </button>
        </section>
      </main>
    );
  }

  if (!isJoined) {
    const participantsWaiting = room?.participants?.length || 0;

    return (
      <div className={styles.prejoinPage}>
        <header className={styles.prejoinHeader}>
          <button
            type="button"
            className={styles.brand}
            onClick={() => navigate("/")}
          >
            TalkSphere
          </button>

          <button
            type="button"
            className={styles.prejoinBack}
            onClick={() => navigate("/meetings")}
          >
            Вернуться ко встречам
          </button>
        </header>

        {error && <div className={styles.prejoinToast}>{error}</div>}

        <main className={styles.prejoinMain}>
          <section className={styles.prejoinPreviewCard}>
            <div className={styles.prejoinPreview}>
              <VideoTile
                stream={localPreview}
                name={currentUsername}
                videoMuted
                isMicOff={!micEnabled}
                videoOff={!cameraEnabled}
                isLocal
                mirror
              />
            </div>

            <div className={styles.prejoinControls} aria-label="Настройки устройств">
              <button
                type="button"
                className={`${styles.prejoinControl} ${
                  !micEnabled ? styles.prejoinControlOff : ""
                }`}
                onClick={(event) => handleControlClick(event, toggleMicrophone)}
                disabled={!canUseMicrophone}
                title={!canUseMicrophone ? "Микрофон запрещён организатором" : undefined}
                aria-pressed={micEnabled}
                aria-label={
                  !canUseMicrophone
                    ? "Микрофон запрещён организатором"
                    : micEnabled
                      ? "Выключить микрофон"
                      : "Включить микрофон"
                }
              >
                <MicIcon off={!micEnabled} />
                <span>
                  {!canUseMicrophone
                    ? "Микрофон запрещён"
                    : micEnabled
                      ? "Микрофон включён"
                      : "Микрофон выключен"}
                </span>
              </button>

              <button
                type="button"
                className={`${styles.prejoinControl} ${
                  !cameraEnabled ? styles.prejoinControlOff : ""
                }`}
                onClick={(event) => handleControlClick(event, toggleCamera)}
                disabled={!canUseCamera}
                title={!canUseCamera ? "Камера запрещена организатором" : undefined}
                aria-pressed={cameraEnabled}
                aria-label={
                  !canUseCamera
                    ? "Камера запрещена организатором"
                    : cameraEnabled
                      ? "Выключить камеру"
                      : "Включить камеру"
                }
              >
                <CameraIcon off={!cameraEnabled} />
                <span>
                  {!canUseCamera
                    ? "Камера запрещена"
                    : cameraEnabled
                      ? "Камера включена"
                      : "Камера выключена"}
                </span>
              </button>
            </div>
          </section>

          <aside className={styles.prejoinPanel}>
            <p className={styles.prejoinEyebrow}>Проверка перед входом</p>
            <h1>{room?.title || "Конференция"}</h1>
            <p className={styles.prejoinDescription}>
              Настройте камеру и микрофон. В конференцию вы войдёте только после
              нажатия кнопки «Подключиться».
            </p>

            <div className={styles.prejoinRoomMeta}>
              <span>Код встречи</span>
              <strong>{inviteCode}</strong>
            </div>

            <div className={styles.prejoinStatusList}>
              <div>
                <span className={micEnabled ? styles.deviceReady : styles.deviceOff}>
                  <MicIcon off={!micEnabled} />
                </span>
                <p>
                  <strong>Микрофон</strong>
                  <small>
                    {!canUseMicrophone
                      ? "Запрещён организатором"
                      : micEnabled
                        ? "Будет включён при входе"
                        : "Вход без звука"}
                  </small>
                </p>
              </div>

              <div>
                <span className={cameraEnabled ? styles.deviceReady : styles.deviceOff}>
                  <CameraIcon off={!cameraEnabled} />
                </span>
                <p>
                  <strong>Камера</strong>
                  <small>
                    {!canUseCamera
                      ? "Запрещена организатором"
                      : cameraEnabled
                        ? "Будет включена при входе"
                        : "Вход без видео"}
                  </small>
                </p>
              </div>
            </div>

            <p className={styles.prejoinParticipants}>
              {participantsWaiting > 0
                ? `Сейчас во встрече: ${participantsWaiting}`
                : "Во встрече пока никого нет"}
            </p>

            <button
              type="button"
              className={styles.prejoinJoinButton}
              onClick={(event) => handleControlClick(event, joinConference)}
              disabled={isJoining}
            >
              {isJoining ? (
                <>
                  <span className={styles.joinSpinner} />
                  Подключаемся…
                </>
              ) : (
                "Подключиться"
              )}
            </button>

            <button
              type="button"
              className={styles.prejoinSecondaryButton}
              onClick={() => navigate("/meetings")}
              disabled={isJoining}
            >
              Отмена
            </button>
          </aside>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <button type="button" className={styles.brand} onClick={() => navigate("/")}>
          TalkSphere
        </button>

        <div className={styles.roomInfo}>
          <strong>{room?.title || "Конференция"}</strong>
          <span>Код: {inviteCode}</span>
        </div>

        <div className={`${styles.connection} ${styles[connectionState]}`}>
          <span />
          {connectionState === "connected" ? "В эфире" : "Подключение"}
        </div>
      </header>

      <main
        className={`${styles.conference} ${
          hasScreenShares ? styles.conferenceSharing : ""
        }`}
      >
        {error && <div className={styles.toast}>{error}</div>}
        {copied && <div className={styles.toast}>Ссылка скопирована</div>}

        {hasScreenShares ? (
          <section
            className={`${styles.presentationLayout} ${
              screenSharingParticipants.length === 1
                ? styles.singleShareLayout
                : styles.multipleShareLayout
            } ${railItemsCount === 0 ? styles.presentationOnly : ""}`}
          >
            <div
              className={`${styles.presentationStage} ${presentationGridClass}`}
            >
              {screenSharingParticipants.map((participant) =>
                renderParticipantTile(participant, { presentation: true }),
              )}
            </div>

            {railItemsCount > 0 && (
              <aside
                className={styles.participantRail}
                style={{ "--rail-items": railItemsCount }}
                aria-label="Участники без демонстрации экрана"
              >
                {visibleRegularPreviews.map((participant) =>
                  renderParticipantTile(participant, { compact: true }),
                )}

                {hiddenRegularCount > 0 && (
                  <div className={styles.collapsedParticipants}>
                    <strong>+{hiddenRegularCount}</strong>
                    <span>ещё участников</span>
                  </div>
                )}
              </aside>
            )}
          </section>
        ) : useCameraFocusLayout ? (
          <section className={styles.cameraFocusLayout}>
            <div className={`${styles.cameraStage} ${cameraStageGridClass}`}>
              {cameraOnParticipants.map((participant) =>
                renderParticipantTile(participant),
              )}
            </div>

            <aside
              className={styles.participantRail}
              style={{ "--rail-items": cameraRailItemsCount }}
              aria-label="Участники с выключенной камерой"
            >
              {visibleCameraOffParticipants.map((participant) =>
                renderParticipantTile(participant, { compact: true }),
              )}

              {hiddenCameraOffCount > 0 && (
                <div className={styles.collapsedParticipants}>
                  <strong>+{hiddenCameraOffCount}</strong>
                  <span>ещё участников</span>
                </div>
              )}
            </aside>
          </section>
        ) : (
          <section className={`${styles.videoGrid} ${gridLayoutClass}`}>
            {videoParticipants.map((participant) =>
              renderParticipantTile(participant),
            )}
          </section>
        )}

        <aside className={`${styles.participantsPanel} ${participantsOpen ? styles.panelOpen : ""}`}>
          <div className={styles.panelHeader}>
            <h2>Участники ({displayedParticipants.length})</h2>
            <button
              type="button"
              onClick={() => setParticipantsOpen(false)}
              aria-label="Закрыть список участников"
            >
              ×
            </button>
          </div>

          <ul>
            {displayedParticipants.map((participant) => {
              const muteActionKey = `${participant.userId}:mute`;
              const videoActionKey = `${participant.userId}:video_off`;
              const screenActionKey = `${participant.userId}:screen_off`;
              const removeActionKey = `${participant.userId}:remove`;
              const actionInProgress = Boolean(participantAction);

              return (
                <li key={participant.id} className={styles.participantItem}>
                  <div className={styles.participantSummary}>
                    <span className={styles.participantAvatar}>
                      {participant.name.slice(0, 1).toUpperCase()}
                    </span>

                    <div className={styles.participantIdentity}>
                      <strong>{participant.name}</strong>
                      <small>
                        {participant.isSelf
                          ? "Вы"
                          : participant.isCreator
                            ? "Организатор"
                            : "Участник"}
                      </small>
                    </div>

                    <div
                      className={styles.participantStatuses}
                      aria-label="Статус устройств участника"
                    >
                      {participant.isMuted && (
                        <span title="Микрофон выключен">
                          <MicIcon off />
                        </span>
                      )}
                      {participant.isVideoOff && (
                        <span title="Камера выключена">
                          <CameraIcon off />
                        </span>
                      )}
                      {participant.isScreenSharing && (
                        <span
                          className={styles.screenSharingStatus}
                          title="Идёт демонстрация экрана"
                        >
                          <ScreenIcon />
                        </span>
                      )}
                    </div>
                  </div>

                  {isRoomCreator && !participant.isSelf && (
                    <div className={styles.participantActions}>
                      <button
                        type="button"
                        onClick={() =>
                          void runParticipantAction(participant, "mute")
                        }
                        disabled={
                          !participant.userId ||
                          participant.isMuted ||
                          actionInProgress
                        }
                        title={
                          participant.isMuted
                            ? "Микрофон уже выключен"
                            : "Выключить микрофон"
                        }
                      >
                        <MicIcon off />
                        <span>Микрофон</span>
                        {participantAction === muteActionKey && (
                          <i className={styles.actionSpinner} />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          void runParticipantAction(participant, "video_off")
                        }
                        disabled={
                          !participant.userId ||
                          participant.isVideoOff ||
                          actionInProgress
                        }
                        title={
                          participant.isVideoOff
                            ? "Камера уже выключена"
                            : "Выключить камеру"
                        }
                      >
                        <CameraIcon off />
                        <span>Камера</span>
                        {participantAction === videoActionKey && (
                          <i className={styles.actionSpinner} />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          void runParticipantAction(participant, "screen_off")
                        }
                        disabled={
                          !participant.userId ||
                          !participant.isScreenSharing ||
                          actionInProgress
                        }
                        title={
                          participant.isScreenSharing
                            ? "Остановить демонстрацию экрана"
                            : "Участник не демонстрирует экран"
                        }
                      >
                        <ScreenIcon />
                        <span>Экран</span>
                        {participantAction === screenActionKey && (
                          <i className={styles.actionSpinner} />
                        )}
                      </button>

                      <button
                        type="button"
                        className={styles.removeParticipantButton}
                        onClick={() =>
                          void runParticipantAction(participant, "remove")
                        }
                        disabled={!participant.userId || actionInProgress}
                        title="Исключить участника"
                      >
                        <span aria-hidden="true">×</span>
                        <span>Исключить</span>
                        {participantAction === removeActionKey && (
                          <i className={styles.actionSpinner} />
                        )}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </aside>

        <aside
          className={`${styles.chatPanel} ${chatOpen ? styles.panelOpen : ""}`}
          aria-hidden={!chatOpen}
        >
          <div className={styles.panelHeader}>
            <div>
              <h2>Чат встречи</h2>
              <small className={styles.chatConnectionStatus}>
                {chatConnectionState === "connected"
                  ? "История сохраняется"
                  : chatConnectionState === "connecting"
                    ? "Подключение…"
                    : "Чат временно недоступен"}
              </small>
            </div>
            <button
              type="button"
              onClick={closeChatPanel}
              aria-label="Закрыть чат"
            >
              ×
            </button>
          </div>

          <div
            ref={chatMessagesRef}
            className={styles.chatMessages}
            role="log"
            aria-live="polite"
            aria-label="Сообщения чата"
          >
            {chatMessages.length === 0 ? (
              <div className={styles.chatEmpty}>
                <ChatIcon />
                <strong>Сообщений пока нет</strong>
                <span>Напишите первое сообщение участникам встречи.</span>
              </div>
            ) : (
              chatMessages.map((message) => (
                <article
                  key={message.id}
                  className={`${styles.chatMessage} ${
                    message.isOwn ? styles.ownChatMessage : ""
                  }`}
                >
                  <div className={styles.chatMessageMeta}>
                    <strong>
                      {message.isOwn ? "Вы" : message.username || "Участник"}
                    </strong>
                    <time dateTime={message.sentAt}>
                      {formatChatTime(message.sentAt)}
                    </time>
                  </div>
                  <p>{message.text}</p>
                  {message.isOwn && (
                    <button
                      type="button"
                      className={styles.deleteChatMessage}
                      onClick={() => deleteChatMessage(message.id)}
                      aria-label="Удалить сообщение"
                    >
                      Удалить
                    </button>
                  )}
                </article>
              ))
            )}
          </div>

          <form className={styles.chatForm} onSubmit={sendChatMessage}>
            <textarea
              value={chatDraft}
              onChange={(event) => setChatDraft(event.target.value)}
              onKeyDown={handleChatKeyDown}
              maxLength={CHAT_MESSAGE_LIMIT}
              rows={2}
              placeholder="Сообщение участникам"
              aria-label="Текст сообщения"
            />
            <button
              type="submit"
              className={styles.chatSendButton}
              disabled={!chatDraft.trim() || chatConnectionState !== "connected"}
              aria-label="Отправить сообщение"
            >
              <SendIcon />
            </button>
            <small className={styles.chatHint}>
              Enter — отправить, Shift+Enter — новая строка
            </small>
          </form>
        </aside>
      </main>

      <footer className={styles.controlsBar}>
        <button
          type="button"
          className={!micEnabled ? styles.controlOff : ""}
          onClick={(event) => handleControlClick(event, toggleMicrophone)}
          disabled={!canUseMicrophone}
          title={!canUseMicrophone ? "Микрофон запрещён организатором" : undefined}
          aria-label={
            !canUseMicrophone
              ? "Микрофон запрещён организатором"
              : micEnabled
                ? "Выключить микрофон"
                : "Включить микрофон"
          }
        >
          <MicIcon off={!micEnabled} />
          <span>
            {!canUseMicrophone ? "Микрофон запрещён" : micEnabled ? "Микрофон" : "Без звука"}
          </span>
        </button>

        <button
          type="button"
          className={!cameraEnabled ? styles.controlOff : ""}
          onClick={(event) => handleControlClick(event, toggleCamera)}
          disabled={isSharing || !canUseCamera}
          title={!canUseCamera ? "Камера запрещена организатором" : undefined}
          aria-label={
            !canUseCamera
              ? "Камера запрещена организатором"
              : cameraEnabled
                ? "Выключить камеру"
                : "Включить камеру"
          }
        >
          <CameraIcon off={!cameraEnabled} />
          <span>
            {!canUseCamera ? "Камера запрещена" : cameraEnabled ? "Камера" : "Без видео"}
          </span>
        </button>

        <button
          type="button"
          className={isSharing ? styles.controlActive : ""}
          onClick={(event) => handleControlClick(event, toggleScreenShare)}
          disabled={!canShareScreen}
          title={!canShareScreen ? "Демонстрация экрана доступна только создателю" : undefined}
          aria-label="Демонстрация экрана"
        >
          <ScreenIcon />
          <span>{isSharing ? "Остановить показ" : "Показать экран"}</span>
        </button>

        <button
          type="button"
          onClick={(event) => handleControlClick(event, copyMeetingLink)}
          aria-label="Скопировать ссылку"
        >
          <CopyIcon />
          <span>Ссылка</span>
        </button>

        <button
          type="button"
          className={`${styles.chatControl} ${chatOpen ? styles.controlActive : ""}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleChatPanel();
          }}
          aria-label={
            unreadChatCount > 0
              ? `Чат: ${unreadChatCount} непрочитанных сообщений`
              : "Открыть чат"
          }
          aria-pressed={chatOpen}
        >
          <span className={styles.chatIcon} aria-hidden="true">
            <ChatIcon />
            {unreadChatCount > 0 && <strong>{unreadChatCount}</strong>}
          </span>
          <span>Чат</span>
        </button>

        <button
          type="button"
          className={`${styles.participantsControl} ${
            participantsOpen ? styles.controlActive : ""
          }`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleParticipantsPanel();
          }}
          aria-label={`Участники: ${displayedParticipants.length}`}
          aria-pressed={participantsOpen}
        >
          <span className={styles.participantsIcon} aria-hidden="true">
            <PeopleIcon />
            <strong>{displayedParticipants.length}</strong>
          </span>
          <span>Участники</span>
        </button>

        <button
          type="button"
          className={styles.hangup}
          onClick={(event) => handleControlClick(event, leaveConference)}
          aria-label="Выйти из конференции"
        >
          <HangupIcon />
          <span>Выйти</span>
        </button>
      </footer>
    </div>
  );
}

export default Conference;
