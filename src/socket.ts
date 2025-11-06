// socket.ts
let socket: WebSocket | null = null;
let currentUsername = "";
let messageHandler: ((msg: any) => void) | null = null;
let userListHandler: ((users: string[]) => void) | null = null;
let groupListHandler: ((groups: Array<{id: string; name: string; members: string[]}>) => void) | null = null;

let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 2000; // base delay for exponential backoff

// (Optional) Expose socket for quick debugging in the browser console
const exposeSocket = (ws: WebSocket) => {
  if (typeof window !== "undefined") {
    (window as any).__chatSocket = ws;
  }
  return ws;
};

/** Get human-readable connection status */
export function getConnectionStatus(): string {
  if (!socket) return "disconnected";
  switch (socket.readyState) {
    case WebSocket.CONNECTING:
      return "connecting";
    case WebSocket.OPEN:
      return "connected";
    case WebSocket.CLOSING:
      return "closing";
    case WebSocket.CLOSED:
      return "disconnected";
    default:
      return "unknown";
  }
}

/** Subscribe to user list updates */
export function registerUserListCallback(callback: (users: string[]) => void) {
  userListHandler = callback;
}

/** Subscribe to group list updates */
export function registerGroupListCallback(callback: (groups: Array<{id: string; name: string; members: string[]}>) => void) {
  groupListHandler = callback;
}

/** Internal: safely deliver user list */
function handleUserList(users: unknown) {
  if (!Array.isArray(users)) {
    console.error("❌ Invalid user list format; expected array:", users);
    return;
  }
  if (userListHandler) {
    try {
      userListHandler(users as string[]);
    } catch (err) {
      console.error("❌ Error in userListHandler:", err);
    }
  } else {
    console.warn("⚠️ No userListHandler registered yet");
  }
}

/** Internal: schedule reconnect with exponential backoff */
function scheduleReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error("❌ Max reconnection attempts reached");
    if (messageHandler) {
      messageHandler({
        type: "system",
        text: "Connection lost. Please refresh the page to reconnect.",
        timestamp: new Date().toISOString(),
      });
    }
    return;
  }

  const delay = RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts);
  console.log(
    `🔁 Reconnecting in ${delay}ms (attempt ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`
  );

  setTimeout(() => {
    reconnectAttempts++;
    if (currentUsername && messageHandler) {
      connect(currentUsername, messageHandler);
    }
  }, delay);
}

/** Establish a WebSocket connection and wire up handlers */
export function connect(username: string, onMessage: (msg: any) => void) {
  currentUsername = username.trim();
  messageHandler = onMessage;

  if (!currentUsername) {
    console.error("❌ Username is required for WebSocket connection");
    return;
  }

  // Close any previous socket
  if (socket) {
    try {
      socket.close(1000, "Reconnecting...");
    } catch (e) {
      console.warn("⚠️ Error closing existing socket:", e);
    }
  }

  const wsUrl = `ws://localhost:8765?username=${encodeURIComponent(
    currentUsername
  )}`;
  console.log("🌐 Connecting to WebSocket at:", wsUrl);

  try {
    socket = exposeSocket(new WebSocket(wsUrl));
  } catch (err) {
    console.error("❌ Failed to create WebSocket:", err);
    scheduleReconnect();
    return;
  }

  socket.onopen = () => {
    console.log("✅ WebSocket connected");
    reconnectAttempts = 0;
  };

  socket.onerror = (event) => {
    console.error("❌ WebSocket error:", event);
  };

  socket.onclose = (event) => {
    console.log(
      `🔌 WebSocket closed: code=${event.code} reason=${
        event.reason || "(none)"
      }`
    );
    if (event.code !== 1000) {
      scheduleReconnect();
    }
  };

  socket.onmessage = (event: MessageEvent) => {
    let data: any;
    try {
      data = JSON.parse(event.data);
    } catch (e) {
      console.error("❌ Error parsing WebSocket message:", e, "Raw:", event.data);
      return;
    }

    if (!data || typeof data !== "object") {
      console.warn("⚠️ Ignoring non-object message:", data);
      return;
    }

    switch (data.type) {
      case "welcome": {
        console.log("👋 Welcome:", data.message);
        if (data.users) handleUserList(data.users);
        break;
      }
      case "user_list": {
        console.log("👥 User list:", data.users);
        handleUserList(data.users);
        break;
      }
      case "group_list": {
        console.log("👥 Groups:", data.groups);
        if (groupListHandler) groupListHandler(data.groups || []);
        break;
      }
      case "group_added": {
        console.log("➕ Group added:", data.group);
        if (groupListHandler) groupListHandler([data.group]);
        break;
      }
      case "group_event": {
        console.log("📣 Group event:", data);
        // let the app decide how to update
        if (messageHandler) messageHandler(data);
        break;
      }
      case "group_relay": {
        const delivered = {
          type: "group_message",
          groupId: data.groupId,
          from: data.from,
          ...data.payload,
          timestamp: data.timestamp || new Date().toISOString(),
        };
        if (messageHandler) messageHandler(delivered);
        break;
      }
      case "handshake_success": {
        console.log("🤝 Handshake success with:", data.peer);
        if (messageHandler) messageHandler(data);
        break;
      }
      case "relay": {
        // Server relays as: { type: "relay", from, payload: {...} }
        const from = data.from;
        const payload = data.payload || {};
        const delivered = {
          type: "message",
          from,
          ...payload, // e.g., { text: "hello" }
          timestamp: payload.timestamp || new Date().toISOString(),
        };
        if (messageHandler) messageHandler(delivered);
        break;
      }
      case "message": {
        // In case server ever sends direct message shape: {type:"message", from, text}
        if (messageHandler) messageHandler(data);
        break;
      }
      case "error": {
        console.error("🚫 Server error:", data.message || data);
        if (messageHandler) {
          messageHandler({
            type: "system",
            level: "error",
            text: data.message || "Server error",
            timestamp: new Date().toISOString(),
          });
        }
        break;
      }
      default: {
        console.warn("⚠️ Unhandled message type:", data.type, data);
        // Pass through unknown types to app in case it knows how to handle
        if (messageHandler) messageHandler(data);
        break;
      }
    }
  };
}

/** Politely close the connection (e.g., on logout/unmount) */
export function disconnect(reason = "Client closing") {
  if (socket && socket.readyState === WebSocket.OPEN) {
    try {
      socket.close(1000, reason);
    } catch (e) {
      console.warn("⚠️ Error closing socket:", e);
    }
  }
  socket = null;
  reconnectAttempts = 0;
}

/** Initiate handshake with a peer (matches server: type="handshake", peer) */
export function initiateHandshake(peer: string): boolean {
  if (!socket) {
    console.error("❌ WebSocket not initialized");
    return false;
  }
  if (socket.readyState !== WebSocket.OPEN) {
    console.error("❌ WebSocket not open — current state:", getConnectionStatus());
    scheduleReconnect();
    return false;
  }
  if (!peer || peer === currentUsername) {
    console.error("❌ Invalid peer for handshake");
    return false;
  }

  try {
    const msg = { type: "handshake", peer };
    console.log("🤝 Sending handshake to:", peer);
    socket.send(JSON.stringify(msg));
    return true;
  } catch (err) {
    console.error("❌ Error sending handshake:", err);
    return false;
  }
}

/** Send a text or image message (matches server: type="message", to, text) */
export function sendMessage(peer: string, text?: string, imageBase64?: string) {
  if (!socket) {
    console.error("❌ WebSocket not initialized");
    return;
  }
  if (socket.readyState !== WebSocket.OPEN) {
    console.error("❌ WebSocket not open — current state:", getConnectionStatus());
    if (messageHandler) {
      messageHandler({
        type: "system",
        text: "Connection lost. Attempting to reconnect...",
        timestamp: new Date().toISOString(),
      });
    }
    scheduleReconnect();
    return;
  }

  if (!peer) {
    console.error("❌ Missing peer");
    return;
  }

  const payload: any = { type: "message", to: peer };

  if (imageBase64) {
    // If you want to support images, your server should handle this in its "message" branch.
    payload.image = imageBase64;
  } else if (text && text.trim()) {
    payload.text = text.trim();
  } else {
    console.warn("⚠️ Empty message ignored");
    return;
  }

  try {
    console.log("✉️ Sending:", payload);
    socket.send(JSON.stringify(payload));
  } catch (err) {
    console.error("❌ Failed to send message:", err);
  }
}

/** Create an open group and add members (no approval) */
export function createGroup(name: string, members: string[], groupId?: string) {
  if (!socket) {
    console.error("❌ WebSocket not initialized");
    return;
  }
  const payload: any = {
    type: "create_group",
    name,
    members,
  };
  if (groupId) payload.groupId = groupId;
  try {
    console.log("👥 Creating group:", payload);
    socket.send(JSON.stringify(payload));
  } catch (err) {
    console.error("❌ Failed to create group:", err);
  }
}

/** Send a message to a group */
export function sendGroupMessage(groupId: string, text?: string, imageBase64?: string) {
  if (!socket) {
    console.error("❌ WebSocket not initialized");
    return;
  }
  const payload: any = { type: "group_message", groupId };
  if (imageBase64) {
    payload.image = imageBase64;
  } else if (text && text.trim()) {
    payload.text = text.trim();
  } else {
    console.warn("⚠️ Empty group message ignored");
    return;
  }
  try {
    console.log("✉️ Sending group:", payload);
    socket.send(JSON.stringify(payload));
  } catch (err) {
    console.error("❌ Failed to send group message:", err);
  }
}