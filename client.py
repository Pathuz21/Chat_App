import asyncio
import base64
import json
import os
import sys
import datetime
import secrets
from cryptography.hazmat.primitives.asymmetric import x25519, ed25519
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes, serialization as ser
from cryptography.hazmat.primitives.ciphers.aead import ChaCha20Poly1305
from cryptography.exceptions import InvalidSignature
import websockets


IDENTITY_FILE = "identity_key.pem"
LOG_KEY = ChaCha20Poly1305.generate_key()

# ========== Utility Functions ==========

def b64(x: bytes) -> str:
    return base64.b64encode(x).decode()

def ub64(s: str) -> bytes:
    return base64.b64decode(s.encode())

def save_identity(priv: ed25519.Ed25519PrivateKey, path=IDENTITY_FILE):
    pem = priv.private_bytes(
        encoding=ser.Encoding.PEM,
        format=ser.PrivateFormat.PKCS8,
        encryption_algorithm=ser.NoEncryption()
    )
    with open(path, "wb") as f:
        f.write(pem)

def load_or_create_identity(path=IDENTITY_FILE):
    if os.path.exists(path):
        with open(path, "rb") as f:
            pem = f.read()
        priv = ser.load_pem_private_key(pem, password=None)
        if not isinstance(priv, ed25519.Ed25519PrivateKey):
            raise RuntimeError("Identity key is not Ed25519")
        return priv
    else:
        priv = ed25519.Ed25519PrivateKey.generate()
        save_identity(priv, path)
        return priv

def derive_shared_key(shared_secret: bytes, info=b"handshake v1", length=32):
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=length,
        salt=None,
        info=info,
    )
    return hkdf.derive(shared_secret)


# ========== Chat Client ==========

class ChatClient:
    def __init__(self, username, host="127.0.0.1", port=9000):
        self.username = username
        self.host = host
        self.port = port
        self.identity_priv = load_or_create_identity()
        self.identity_pub = self.identity_priv.public_key()
        self.websocket = None
        self.sessions = {}
        self.my_eph_priv = None
        self.on_message = None

    async def connect(self):
        uri = f"ws://{self.host}:{self.port}"
        self.websocket = await websockets.connect(uri)
        await self.websocket.send(json.dumps({"type": "register", "username": self.username}))
        print(f"[✅ CONNECTED] {self.username} registered to {self.host}:{self.port}")
        asyncio.create_task(self._message_loop())

    async def ensure_connected(self):
        if self.websocket is None or self.websocket.closed:
            print(f"[INFO] Reconnecting backend client for {self.username}...")
            await self.connect()

    async def _message_loop(self):
        try:
            async for message in self.websocket:
                try:
                    msg = json.loads(message)
                    if "from" in msg and "payload" in msg:
                        await self._handle_incoming(msg["from"], msg["payload"])
                    else:
                        print("SERVER:", msg)
                except json.JSONDecodeError:
                    print("❌ Received invalid JSON:", message)
        except websockets.exceptions.ConnectionClosed:
            print("❌ Connection to server closed")
        except Exception as e:
            print(f"❌ Error in message loop: {e}")

    async def _send_relay(self, to, payload):
        await self.ensure_connected()
        if self.websocket:
            msg = {"type": "relay", "to": to, "payload": payload}
            await self.websocket.send(json.dumps(msg))

    def has_session(self, peer: str) -> bool:
        return peer in self.sessions

    # ========== HANDSHAKE ==========


    async def _handle_message(self, from_user, payload):
        typ = payload.get("type")

        if typ == "handshake_init":
            await self._handle_handshake_init(from_user, payload)

        elif typ == "handshake_ack":
            await self._handle_handshake_ack(from_user, payload)

        elif typ == "message" or typ == "image":
            await self._handle_chat_message(from_user, payload)

        else:
            print(f"[WARN] Unknown payload type from {from_user}: {payload}")

    # 🔁 Relay unwrap
        if typ == "relay":
            payload = msg["payload"]
            sender = msg["from"]
            if sender not in self.sessions:
                print(f"⚠️ No session key with {sender}")
                await self._initiate_handshake(sender)
                return
            try:
                ciphertext = b64(payload["ciphertext"])
                nonce = b64(payload["nonce"])
                plaintext = self.sessions[sender].decrypt(ciphertext, nonce)
                text = plaintext.decode()
                print(f"[{sender}] → {text}")
            except Exception as e:
                print(f"❌ Failed to decrypt from {sender}: {e}")
                return
        elif typ == "handshake-init":
            await self._handle_handshake_init(msg)

        elif typ == "handshake":
            await self._handle_handshake(msg)


    # -------------------------
# Handshake + incoming handlers
# -------------------------

# Inside class ChatClient:
# =====================================================
# ✅ Add this inside ChatClient class
# =====================================================
    async def initiate_handshake(self, peer: str):
        """
        Start a secure handshake with the given peer.
        Called by ws_gateway when browser initiates handshake.
        """
        print(f"[🤝] Initiating handshake with {peer}")

    # Generate a fresh ephemeral key pair for this session
        self.my_eph_priv = x25519.X25519PrivateKey.generate()
        my_eph_pub = self.my_eph_priv.public_key().public_bytes(
            encoding=ser.Encoding.Raw,
            format=ser.PublicFormat.Raw
        )

    # Sign our ephemeral public key using our long-term identity
        sig = self.identity_priv.sign(my_eph_pub)

    # Prepare handshake-init message
        obj = {
            "type": "handshake_init",
            "identity": b64(self.identity_pub.public_bytes(
                encoding=ser.Encoding.Raw, format=ser.PublicFormat.Raw
            )),
            "ephemeral": b64(my_eph_pub),
            "sig": b64(sig)
        }

    # Send via relay server
        await self._send_relay(peer, obj)
        print(f"[SENT] Handshake-init to {peer}")


    async def _handle_incoming(self, sender, payload):
        """Dispatch incoming relay payloads to the right handler."""
        typ = payload.get("type")
        if typ == "handshake_init":
            await self._handle_handshake_init(sender, payload)
        elif typ == "handshake":
            await self._handle_handshake(sender, payload)
        elif typ == "ciphertext":
            await self._handle_ciphertext(sender, payload)
        else:
        # unknown payload type: log for debugging
            print(f"⚠️ Unknown payload type from {sender}: {payload}")


    async def _handle_handshake_init(self, sender, payload):
        """
        Responder: received handshake_init from peer.
        Verify signature, create our ephemeral, sign it, send handshake reply,
        compute shared secret and derive symmetric key.
        """
        print(f"[🤝] Received handshake-init from {sender}")
        try:
            peer_id_b = ub64(payload["identity"])
            peer_eph_b = ub64(payload["ephemeral"])
            sig_b = ub64(payload["sig"])
        except Exception:
            print("❌ bad handshake-init format")
            return

    # verify peer's signature on their ephemeral
        try:
            peer_id_pub = ed25519.Ed25519PublicKey.from_public_bytes(peer_id_b)
            peer_id_pub.verify(sig_b, peer_eph_b)
        except InvalidSignature:
            print("❌ Invalid handshake-init signature")
            return
        except Exception as e:
            print("❌ Error verifying handshake-init signature:", e)
            return

    # create our ephemeral, sign and send handshake reply
        my_eph_priv = x25519.X25519PrivateKey.generate()
        my_eph_pub = my_eph_priv.public_key().public_bytes(
            encoding=ser.Encoding.Raw, format=ser.PublicFormat.Raw
        )
        sig = self.identity_priv.sign(my_eph_pub)

        handshake = {
            "type": "handshake",
            "identity": b64(self.identity_pub.public_bytes(
                encoding=ser.Encoding.Raw, format=ser.PublicFormat.Raw)),
            "ephemeral": b64(my_eph_pub),
            "sig": b64(sig)
        }

    # send handshake reply back to initiator
        await self._send_relay(sender, handshake)
        print(f"[SENT] Handshake reply to {sender}")

    # compute shared secret (responder side)
        try:
            peer_eph_pub = x25519.X25519PublicKey.from_public_bytes(peer_eph_b)
            shared = my_eph_priv.exchange(peer_eph_pub)
        except Exception as e:
            print("❌ error computing shared secret (responder):", e)
            return

    # derive symmetric key using identical pair_id ordering
        pair_id = f"session:{'|'.join(sorted([self.username, sender]))}".encode()
        key = derive_shared_key(shared, info=pair_id)
        self.sessions[sender] = key
        print(f"[🔐] Session key established with {sender} (responder)")
        # notify UI/gateway
        try:
            if hasattr(self, "on_message") and self.on_message:
                evt = {"type": "handshake_success", "peer": sender}
                if asyncio.iscoroutinefunction(self.on_message):
                    await self.on_message(evt)
                else:
                    self.on_message(evt)
        except Exception as _:
            pass


    async def _handle_handshake(self, sender, payload):
        """
        Initiator: received handshake reply from peer.
        Verify signature, compute shared secret using stored my_eph_priv,
        derive symmetric key and clear ephemeral private.
        """
        print(f"[🤝] Received handshake from {sender}")
        try:
            peer_id_b = ub64(payload["identity"])
            peer_eph_b = ub64(payload["ephemeral"])
            sig_b = ub64(payload["sig"])
        except Exception:
            print("❌ bad handshake format")
            return

    # verify signature
        try:
            peer_id_pub = ed25519.Ed25519PublicKey.from_public_bytes(peer_id_b)
            peer_id_pub.verify(sig_b, peer_eph_b)
        except InvalidSignature:
            print("❌ Invalid handshake signature")
            return
        except Exception as e:
            print("❌ Error verifying handshake signature:", e)
            return

    # ensure we have stored our ephemeral private from initiate_handshake
        if not hasattr(self, "my_eph_priv") or self.my_eph_priv is None:
            print("⚠️ No ephemeral key stored for initiator — cannot complete handshake")
            return

        try:
            peer_eph_pub = x25519.X25519PublicKey.from_public_bytes(peer_eph_b)
            shared = self.my_eph_priv.exchange(peer_eph_pub)
        except Exception as e:
            print("❌ error computing shared secret (initiator):", e)
            return

        pair_id = f"session:{'|'.join(sorted([self.username, sender]))}".encode()
        key = derive_shared_key(shared, info=pair_id)
        self.sessions[sender] = key

    # clear ephemeral private
        try:
            self.my_eph_priv = None
        except Exception:
            pass

        print(f"[🔐] Session key established with {sender} (initiator)")
        # notify UI/gateway
        try:
            if hasattr(self, "on_message") and self.on_message:
                evt = {"type": "handshake_success", "peer": sender}
                if asyncio.iscoroutinefunction(self.on_message):
                    await self.on_message(evt)
                else:
                    self.on_message(evt)
        except Exception as _:
            pass


    async def _handle_ciphertext(self, sender, payload):
        """
        Handle an encrypted ciphertext payload: decrypt using session key and
        route plaintext to on_message callback (UI/terminal).
        """
    # payload should be {"type":"ciphertext","nonce": b64, "ct": b64}
        try:
            ct_b = ub64(payload["ct"])
            nonce = ub64(payload["nonce"])
        except Exception:
            print("❌ bad ciphertext format")
            return

        key = self.sessions.get(sender)
        if not key:
            print(f"⚠️ No session key with {sender} — cannot decrypt")
            return

        aead = ChaCha20Poly1305(key)
        try:
            pt = aead.decrypt(nonce, ct_b, None)
            plaintext = pt.decode()
            print(f"[{sender}] -> {plaintext}")

        # notify UI / terminal
            if hasattr(self, "on_message") and self.on_message:
                msg_obj = {"type": "message", "from": sender, "text": plaintext}
                if asyncio.iscoroutinefunction(self.on_message):
                    await self.on_message(msg_obj)
                else:
                    self.on_message(msg_obj)

        except Exception as e:
            print("❌ decryption failed:", e)
    

    async def send_message(self, peer, plaintext):
        key = self.sessions.get(peer)
        if not key:
            print("⚠️ No session key with", peer, "- initiate handshake first.")
            return

    # Encrypt the message
        aead = ChaCha20Poly1305(key)
        nonce = secrets.token_bytes(12)
        ciphertext = aead.encrypt(nonce, plaintext.encode(), None)

    # Prepare payload for sending over the network
        payload = {
            "type": "ciphertext",
            "nonce": b64(nonce),
            "ct": b64(ciphertext)
        }

    # 🔐 Encrypted log entry (no plaintext)
        log_entry = {
            "from": self.username,
            "to": peer,
            "nonce": b64(nonce),
            "entry": b64(ciphertext),
            "timestamp": datetime.datetime.now().isoformat()
        }

    # Append encrypted message to file
        with open("messages.log", "a") as f:
            f.write(json.dumps(log_entry) + "\n")

    # Send encrypted message
        await self._send_relay(peer, payload)
        print(f"[🕊️ SENT] to {peer}: (encrypted)")
            
            


# ========== CLI ==========

async def repl_loop(client: ChatClient):
    print("Commands:\n  /handshake <peer>\n  /send <peer> <message>\n  /exit\n")
    while True:
        line = await asyncio.get_event_loop().run_in_executor(None, sys.stdin.readline)
        if not line:
            break
        line = line.strip()
        if line.startswith("/handshake "):
            peer = line.split(maxsplit=1)[1].strip()
            await client.initiate_handshake(peer)
        elif line.startswith("/send "):
            parts = line.split(maxsplit=2)
            if len(parts) < 3:
                print("Usage: /send <peer> <message>")
                continue
            _, peer, message = parts
            await client.send_message(peer, message)
        elif line == "/exit":
            client.close()
            break
        else:
            print("Unknown command")

async def main():
    if len(sys.argv) < 2:
        print("Usage: python client.py <username>")
        return
    username = sys.argv[1]
    client = ChatClient(username)
    await client.connect()
    await repl_loop(client)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nExited by user")