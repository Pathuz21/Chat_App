import asyncio
import json
import websockets
from websockets.exceptions import ConnectionClosed


clients = {}  # username -> websocket


async def send(ws, message: dict):
    """Send JSON message to a WebSocket client."""
    try:
        await ws.send(json.dumps(message))
    except Exception:
        pass


async def broadcast_user_list():
    """Send updated user list to all connected clients."""
    users = list(clients.keys())
    msg = {"type": "user_list", "users": users}

    for ws in list(clients.values()):
        try:
            await send(ws, msg)
        except:
            pass


async def handler(websocket, path):
    username = None
    addr = websocket.remote_address
    print(f"🌐 Connection from {addr}")

    try:
        # First message must be register
        raw = await websocket.recv()
        msg = json.loads(raw)

        if msg.get("type") != "register" or "username" not in msg:
            await send(websocket, {"type": "error", "message": "First message must be register"})
            await websocket.close()
            return

        username = msg["username"]

        if username in clients:
            await send(websocket, {"type": "error", "message": "Username already taken"})
            await websocket.close()
            return

        clients[username] = websocket
        print(f"✅ {username} registered")
        await broadcast_user_list()

        # Main loop
        async for raw in websocket:
            try:
                obj = json.loads(raw)
            except json.JSONDecodeError:
                await send(websocket, {"type": "error", "message": "Invalid JSON"})
                continue

            if obj.get("type") == "relay" and "to" in obj and "payload" in obj:
                target = obj["to"]
                payload = obj["payload"]

                if target in clients:
                    await send(clients[target], {
                        "type": "relay",
                        "from": username,
                        "payload": payload
                    })
                else:
                    await send(websocket, {
                        "type": "error",
                        "message": f"User '{target}' is offline"
                    })
            else:
                await send(websocket, {"type": "error", "message": "Unknown message type"})

    except ConnectionClosed:
        print(f"❌ {username} disconnected")

    finally:
        if username in clients:
            del clients[username]
            await broadcast_user_list()


async def main():
    print("🚀 Starting WebSocket server on ws://0.0.0.0:9000")
    async with websockets.serve(handler, "0.0.0.0", 9000):
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n🛑 Server stopped")