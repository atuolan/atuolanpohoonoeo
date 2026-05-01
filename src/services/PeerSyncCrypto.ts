import type { PeerEncryptedPayload } from "@/types/selfHostedSync";

const SESSION_TTL_MS = 10 * 60 * 1000;
const AES_GCM_IV_BYTES = 12;

type PeerSessionRecord = {
  peerDeviceId: string;
  sessionId: string;
  createdAt: number;
  lastUsedAt: number;
  keyPair?: CryptoKeyPair;
  sharedKey?: CryptoKey;
};

function sessionKey(peerDeviceId: string, sessionId: string): string {
  return `${peerDeviceId}::${sessionId}`;
}

function randomSessionId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

function base64ToUint8(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function importPeerPublicKey(publicKeyJwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    publicKeyJwk,
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    false,
    [],
  );
}

async function deriveSharedKey(privateKey: CryptoKey, publicKeyJwk: JsonWebKey): Promise<CryptoKey> {
  const peerPublicKey = await importPeerPublicKey(publicKeyJwk);
  return crypto.subtle.deriveKey(
    {
      name: "ECDH",
      public: peerPublicKey,
    },
    privateKey,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"],
  );
}

class PeerSyncCrypto {
  private readonly sessions = new Map<string, PeerSessionRecord>();

  private cleanupExpiredSessions(): void {
    const now = Date.now();
    for (const [key, record] of this.sessions.entries()) {
      if (now - record.lastUsedAt > SESSION_TTL_MS) {
        this.sessions.delete(key);
      }
    }
  }

  private getRecord(peerDeviceId: string, sessionId: string): PeerSessionRecord {
    this.cleanupExpiredSessions();
    const record = this.sessions.get(sessionKey(peerDeviceId, sessionId));
    if (!record) {
      throw new Error("peer-session-not-found");
    }
    record.lastUsedAt = Date.now();
    return record;
  }

  async createOffer(peerDeviceId: string): Promise<{ sessionId: string; publicKeyJwk: JsonWebKey }> {
    this.cleanupExpiredSessions();
    const keyPair = await crypto.subtle.generateKey(
      {
        name: "ECDH",
        namedCurve: "P-256",
      },
      true,
      ["deriveKey"],
    );
    const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const sessionId = randomSessionId();
    this.sessions.set(sessionKey(peerDeviceId, sessionId), {
      peerDeviceId,
      sessionId,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      keyPair,
    });
    return {
      sessionId,
      publicKeyJwk,
    };
  }

  async acceptOffer(
    peerDeviceId: string,
    sessionId: string,
    publicKeyJwk: JsonWebKey,
  ): Promise<{ publicKeyJwk: JsonWebKey }> {
    this.cleanupExpiredSessions();
    const keyPair = await crypto.subtle.generateKey(
      {
        name: "ECDH",
        namedCurve: "P-256",
      },
      true,
      ["deriveKey"],
    );
    const sharedKey = await deriveSharedKey(keyPair.privateKey, publicKeyJwk);
    const localPublicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
    this.sessions.set(sessionKey(peerDeviceId, sessionId), {
      peerDeviceId,
      sessionId,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      sharedKey,
    });
    return {
      publicKeyJwk: localPublicKeyJwk,
    };
  }

  async finalizeAnswer(peerDeviceId: string, sessionId: string, publicKeyJwk: JsonWebKey): Promise<void> {
    const record = this.getRecord(peerDeviceId, sessionId);
    if (!record.keyPair) {
      throw new Error("peer-session-missing-keypair");
    }
    record.sharedKey = await deriveSharedKey(record.keyPair.privateKey, publicKeyJwk);
    delete record.keyPair;
  }

  async encrypt<T>(peerDeviceId: string, sessionId: string, payload: T): Promise<PeerEncryptedPayload> {
    const record = this.getRecord(peerDeviceId, sessionId);
    if (!record.sharedKey) {
      throw new Error("peer-session-not-ready");
    }
    const iv = new Uint8Array(AES_GCM_IV_BYTES);
    crypto.getRandomValues(iv);
    const plainBytes = new TextEncoder().encode(JSON.stringify(payload));
    const encrypted = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv.buffer as ArrayBuffer,
      },
      record.sharedKey,
      plainBytes.buffer as ArrayBuffer,
    );
    return {
      version: 1,
      algorithm: "AES-GCM",
      iv: uint8ToBase64(iv),
      ciphertext: uint8ToBase64(new Uint8Array(encrypted)),
    };
  }

  async decrypt<T>(peerDeviceId: string, sessionId: string, payload: PeerEncryptedPayload): Promise<T> {
    const record = this.getRecord(peerDeviceId, sessionId);
    if (!record.sharedKey) {
      throw new Error("peer-session-not-ready");
    }
    const iv = base64ToUint8(payload.iv);
    const ciphertext = base64ToUint8(payload.ciphertext);
    try {
      const decrypted = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: iv.buffer as ArrayBuffer,
        },
        record.sharedKey,
        ciphertext.buffer as ArrayBuffer,
      );
      const text = new TextDecoder().decode(decrypted);
      return JSON.parse(text) as T;
    } catch (error) {
      throw Object.assign(new Error("peer-decrypt-failed"), {
        cause: error,
        peerReason: "peer-decrypt-failed",
      });
    }
  }

  dropSession(peerDeviceId: string, sessionId: string): void {
    this.sessions.delete(sessionKey(peerDeviceId, sessionId));
  }
}

const instances = new Map<string, PeerSyncCrypto>();

export function getPeerSyncCrypto(scope = "default"): PeerSyncCrypto {
  const existing = instances.get(scope);
  if (existing) {
    return existing;
  }
  const instance = new PeerSyncCrypto();
  instances.set(scope, instance);
  return instance;
}

export function resetPeerSyncCrypto(scope?: string): void {
  if (scope) {
    instances.delete(scope);
    return;
  }
  instances.clear();
}
