import asyncio
import json
import traceback
import datetime
import os
import requests
from dotenv import load_dotenv
import websockets
from websockets.exceptions import ConnectionClosed
from urllib.parse import parse_qs, urlparse
from websockets.http import Headers
from client import ChatClient
print("WEBSOCKETS MODULE LOADED:", websockets)   # ⚠️ Must be updated to WebSocket soon

clients = {}        # username -> websocket
chat_clients = {}   # username -> ChatClient
message_log = []    # For runtime log
LOG_FILE = "messages.log"
AI_BOT_NAME = "AI_BOT"
groups: dict[str, dict] = {}  # groupId -> { name: str, members: set[str] }

# Load environment variables from .env if present
load_dotenv()
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "meta-llama/llama-3.1-8b-instruct")


# ----------------------
# Utility Functions
# ----------------------

def log_to_file(entry):
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")
    except Exception as e:
        print(f"[ERROR] Failed to write log: {e}")


async def broadcast_user_list():
    """Send list of connected users to all clients"""
    current_users = list(clients.keys())
    print(f"[USER LIST] Broadcasting to {len(clients)} clients: {current_users}")

    for username, ws in list(clients.items()):
        others = [u for u in current_users if u != username]
        # Ensure AI bot is visible to each user
        if AI_BOT_NAME not in others:
            others.append(AI_BOT_NAME)
        sent = await safe_send(ws, {
            "type": "user_list",
            "users": others
        }, username_for_cleanup=username)
        if not sent:
            print(f"[WARN] Failed to send user_list to {username}; cleaned up if necessary")

async def send_group_list(username: str):
    """Send groups that the user is a member of."""
    try:
        ws = clients.get(username)
        if not ws:
            return
        user_groups = [gid for gid, g in groups.items() if username in g["members"]]
        await safe_send(ws, {"type": "group_list", "groups": [
            {"id": gid, "name": groups[gid]["name"], "members": list(groups[gid]["members"])}
            for gid in user_groups
        ]})
    except Exception as e:
        print(f"[WARN] send_group_list error for {username}: {e}")
# Safe send helper to avoid crashes on closed connections
async def safe_send(ws, payload, *, username_for_cleanup: str | None = None) -> bool:
    try:
        await ws.send(json.dumps(payload))
        return True
    except Exception as e:
        print(f"[WARN] send failed: {e}")
        if username_for_cleanup:
            await cleanup_user(username_for_cleanup)
        return False



async def cleanup_user(username):
    """Cleanup user and notify others"""
    if username in clients:
        del clients[username]

    if username in chat_clients:
        client = chat_clients.pop(username)
        try:
            close_method = getattr(client, "close", None)
            if close_method:
                result = close_method()
                if asyncio.iscoroutine(result):
                    await result
        except Exception as e:
            print(f"[WARN] Error closing chat client for {username}: {e}")

    await broadcast_user_list()
    print(f"[CLEANUP] {username} disconnected")


# ----------------------
# WebSocket Handler
# ----------------------

async def handler(websocket, path):
    # CORS is handled by the handle_cors_request function
    query = parse_qs(urlparse(path).query)
    username = query.get("username", [None])[0]

    if not username:
        await websocket.close(4000, "Missing username")
        return

    if username in clients:
        await safe_send(websocket, {
            "type": "error",
            "message": f"Username {username} is already connected"
        })
        try:
            await websocket.close(4001, "Username taken")
        except Exception:
            pass
        return

    clients[username] = websocket
    print(f"[CONNECT] {username} connected from {websocket.remote_address}")

    await broadcast_user_list()

    # Create backend ChatClient (will fix later)
    chat_client = ChatClient(username)
    chat_clients[username] = chat_client
    await chat_client.connect()

    # Bridge backend events to the browser websocket
    pending_outbound: dict[str, list[str]] = {}

    async def forward_backend_event(evt):
        # Normalize to include timestamp for the UI
        if isinstance(evt, dict):
            if "type" not in evt:
                evt["type"] = "message"
            if "timestamp" not in evt:
                evt["timestamp"] = datetime.datetime.utcnow().isoformat()
            # On handshake success, flush any queued outbound messages
            if evt["type"] == "handshake_success":
                peer = evt.get("peer")
                if peer and peer in pending_outbound and pending_outbound[peer]:
                    msgs = pending_outbound.pop(peer)
                    for text in msgs:
                        try:
                            await chat_client.send_message(peer, text)
                            print(f"[FLUSH] {username} -> {peer}: (encrypted)")
                        except Exception as e:
                            print(f"[ERROR] flush send failed: {e}")
            await safe_send(websocket, evt, username_for_cleanup=username)
    chat_client.on_message = forward_backend_event

    ok = await safe_send(websocket, {
        "type": "welcome",
        "message": f"Welcome {username}",
        "users": [u for u in clients if u != username] + [AI_BOT_NAME]
    }, username_for_cleanup=username)
    if not ok:
        return

    # Auto-complete handshake with AI bot for convenience
    await safe_send(websocket, {"type": "handshake_success", "peer": AI_BOT_NAME, "timestamp": datetime.datetime.utcnow().isoformat()})
    # Send current groups for this user
    await send_group_list(username)

    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                msg_type = data.get("type")

                if msg_type == "message":
                    peer = data.get("to")
                    text = data.get("text")
                    image = data.get("image")
                    # Handle messages to AI bot locally (no encryption)
                    if peer == AI_BOT_NAME and (text or image):
                        reply_text = None
                        if text:
                            # Compose prompt
                            payload = {
                                "model": OPENROUTER_MODEL,
                                "messages": [
                                    {"role": "system", "content": "You are a helpful, concise assistant in a messaging app."},
                                    {"role": "user", "content": text}
                                ]
                            }
                            headers = {
                                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                                "Content-Type": "application/json",
                                "HTTP-Referer": "http://localhost:5173",
                                "X-Title": "Secure Chat App"
                            }
                            try:
                                res = requests.post(OPENROUTER_URL, headers=headers, json=payload, timeout=30)
                                data_out = res.json()
                                reply_text = (data_out.get("choices", [{}])[0].get("message", {}).get("content")
                                              or "(No response)")
                            except Exception as e:
                                print(f"[AI] Error: {e}")
                                reply_text = "⚠️ AI service unavailable, please try again later."

                        # Send bot reply back to this user as a normal relay
                        await safe_send(websocket, {
                            "type": "relay",
                            "from": AI_BOT_NAME,
                            "payload": {"text": reply_text or "(image received)"},
                            "timestamp": datetime.datetime.utcnow().isoformat(),
                        }, username_for_cleanup=username)
                        continue
                    if peer and text:
                        try:
                            if hasattr(chat_client, "has_session") and chat_client.has_session(peer):
                                await chat_client.send_message(peer, text)
                                print(f"[MSG] {username} -> {peer}: (encrypted)")
                            else:
                                # queue and initiate handshake
                                pending_outbound.setdefault(peer, []).append(text)
                                await chat_client.initiate_handshake(peer)
                                await safe_send(websocket, {"type": "system", "text": f"Initiating handshake with {peer}..."})
                        except Exception as e:
                            print(f"[ERROR] send_message failed: {e}")
                    elif peer and image:
                        # For now, relay images in plaintext to peer via gateway
                        if peer in clients:
                            sent = await safe_send(clients[peer], {
                                "type": "relay",
                                "from": username,
                                "payload": {"image": image}
                            }, username_for_cleanup=peer)
                            if sent:
                                print(f"[IMG] {username} -> {peer}: (relayed image)")
                    else:
                        await safe_send(websocket, {"type": "error", "message": "Missing peer, text or image"}, username_for_cleanup=username)

                elif msg_type == "handshake":
                    peer = data.get("peer")
                    if peer == AI_BOT_NAME:
                        # Instantly succeed handshakes to AI bot
                        await safe_send(websocket, {"type": "handshake_success", "peer": AI_BOT_NAME, "timestamp": datetime.datetime.utcnow().isoformat()})
                    elif peer in clients:
                        await chat_client.initiate_handshake(peer)
                    else:
                        await safe_send(websocket, {
                            "type": "error",
                            "message": f"{peer} is offline"
                        }, username_for_cleanup=username)

                elif msg_type == "create_group":
                    # { type, groupId?, name, members: [user...] }
                    name = (data.get("name") or "Group").strip() or "Group"
                    group_id = data.get("groupId") or f"grp:{username}:{int(datetime.datetime.utcnow().timestamp())}"
                    member_list = set(filter(None, [username] + list(data.get("members") or [])))
                    # Validate all members exist (must be connected users or AI bot)
                    invalid = [m for m in member_list if m != AI_BOT_NAME and m not in clients]
                    if invalid:
                        await safe_send(websocket, {
                            "type": "error",
                            "message": f"Invalid users in group: {', '.join(invalid)}"
                        }, username_for_cleanup=username)
                        break
                    groups[group_id] = {"name": name, "members": set(member_list)}
                    # notify members
                    for member in list(member_list):
                        await send_group_list(member)
                        ws_m = clients.get(member)
                        if ws_m:
                            await safe_send(ws_m, {"type": "group_added", "group": {"id": group_id, "name": name, "members": list(member_list)}})

                elif msg_type == "join_group":
                    gid = data.get("groupId")
                    if gid in groups:
                        groups[gid]["members"].add(username)
                        for member in list(groups[gid]["members"]):
                            await send_group_list(member)
                            ws_m = clients.get(member)
                            if ws_m:
                                await safe_send(ws_m, {"type": "group_event", "groupId": gid, "action": "join", "by": username, "timestamp": datetime.datetime.utcnow().isoformat()})

                elif msg_type == "leave_group":
                    gid = data.get("groupId")
                    if gid in groups and username in groups[gid]["members"]:
                        groups[gid]["members"].discard(username)
                        for member in list(groups[gid]["members"]):
                            await send_group_list(member)
                            ws_m = clients.get(member)
                            if ws_m:
                                await safe_send(ws_m, {"type": "group_event", "groupId": gid, "action": "leave", "by": username, "timestamp": datetime.datetime.utcnow().isoformat()})

                elif msg_type == "group_message":
                    # { type, groupId, text?|image? }
                    gid = data.get("groupId")
                    text = data.get("text")
                    image = data.get("image")
                    if gid in groups and (text or image):
                        recipients = groups[gid]["members"] - {username}
                        for member in recipients:
                            ws_m = clients.get(member)
                            if ws_m:
                                await safe_send(ws_m, {
                                    "type": "group_relay",
                                    "groupId": gid,
                                    "from": username,
                                    "payload": ({"text": text} if text else {"image": image}),
                                    "timestamp": datetime.datetime.utcnow().isoformat(),
                                }, username_for_cleanup=member)

            except json.JSONDecodeError:
                print(f"[WARN] Invalid JSON from {username}")
            except Exception as e:
                print(f"[ERROR] {e}")
                traceback.print_exc()

    except ConnectionClosed:
        print(f"[DISCONNECT] {username}")

    finally:
        await cleanup_user(username)


# ----------------------
# CORS Handler (websockets 12.x)
# ----------------------

def handle_cors_request(path, request_headers):
    # Debug: Print incoming request details
    print("\n=== New Request ===")
    print(f"Path: {path}")
    print("Headers:")
    for k, v in request_headers.items():
        print(f"  {k}: {v}")
    
    # For WebSocket handshake, we only need to check these headers
    upgrade = request_headers.get("upgrade", "").lower()
    connection = request_headers.get("connection", "").lower()
    
    print(f"\nUpgrade: {upgrade}")
    print(f"Connection: {connection}")
    
    # Accept WebSocket connection if upgrade header is 'websocket' and connection is 'upgrade'
    if upgrade == "websocket" and "upgrade" in connection:
        print("✓ Accepting WebSocket connection")
        return None  # Return None to accept the WebSocket connection
    
    # For OPTIONS (preflight) requests
    if request_headers.get("method") == "OPTIONS" or request_headers.get(":method") == "OPTIONS":
        print("Handling OPTIONS request")
        headers = [
            ("Access-Control-Allow-Origin", request_headers.get("origin", "*")),
            ("Access-Control-Allow-Methods", "GET, POST, OPTIONS"),
            ("Access-Control-Allow-Headers", "Content-Type, Authorization"),
            ("Access-Control-Allow-Credentials", "true"),
            ("Access-Control-Max-Age", "3600"),
        ]
        return 200, Headers(headers), b""
    
    # For all other requests, return 404
    print("✗ Rejecting request (not a WebSocket upgrade)")
    return 404, Headers([("Content-Type", "text/plain")]), b"Not Found"


# ----------------------
# Start Server
# ----------------------

async def main():
    print("🚀 Starting WebSocket Gateway...")
    server = await websockets.serve(
        handler,
        "0.0.0.0",
        8765,
        process_request=handle_cors_request,
        ping_interval=20,
        ping_timeout=60,
        max_size=10 * 1024 * 1024
    )
    print("🌐 Running on ws://0.0.0.0:8765")
    await server.wait_closed()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n🛑 Server stopped")