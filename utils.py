import base64
import os
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ed25519
from cryptography.hazmat.primitives import serialization as ser

# === BASE64 helpers ===
def b64(b: bytes) -> str:
    return base64.b64encode(b).decode()

def ub64(s: str) -> bytes:
    return base64.b64decode(s.encode())

# === Derive symmetric key from shared secret ===
def derive_shared_key(shared_secret: bytes, info: bytes = b"session") -> bytes:
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=None,
        info=info
    )
    return hkdf.derive(shared_secret)

# === Identity key management ===
def load_or_create_identity(path="identity_ed25519.key"):
    """Load existing Ed25519 private key or create a new one."""
    if os.path.exists(path):
        with open(path, "rb") as f:
            data = f.read()
        return ser.load_pem_private_key(data, password=None)
    else:
        priv = ed25519.Ed25519PrivateKey.generate()
        pem = priv.private_bytes(
            encoding=ser.Encoding.PEM,
            format=ser.PrivateFormat.PKCS8,
            encryption_algorithm=ser.NoEncryption()
        )
        with open(path, "wb") as f:
            f.write(pem)
        print(f"[KEYGEN] Created new identity key at {path}")
        return priv