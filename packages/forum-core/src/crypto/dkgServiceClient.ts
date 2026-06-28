const DEFAULT_DKG_SERVICE_URL = "http://localhost:3021";

export type BoardCommitment = {
  boardId: string;
  epoch: number;
  threshold: number;
  publicKey: string;
  commitment: string;
  transcriptHash: string;
};

export type KeyCapsule = {
  encapsulation: string;
  nonce: string;
  ciphertext: string;
  keyCommitment: string;
};

export type HealthResponse = {
  status?: string;
  goldenSetupReady: boolean;
};

export type PartialDecryptionResponse = {
  partial: string;
};

function getBaseUrl(): string {
  if (typeof process !== "undefined" && process.env?.VITE_DKG_SERVICE_URL) {
    return process.env.VITE_DKG_SERVICE_URL;
  }
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_DKG_SERVICE_URL) {
    return import.meta.env.VITE_DKG_SERVICE_URL;
  }
  return DEFAULT_DKG_SERVICE_URL;
}

function joinUrl(baseUrl: string, path: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return `${trimmed}${path}`;
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`DKG service ${response.status} ${response.statusText}: ${body}`);
  }
  return response.json() as Promise<T>;
}

export async function healthCheck(baseUrl = getBaseUrl()): Promise<HealthResponse> {
  return fetchJson<HealthResponse>(joinUrl(baseUrl, "/health"));
}

export async function getBoardCommitment(
  boardId: string,
  baseUrl = getBaseUrl(),
): Promise<BoardCommitment> {
  return fetchJson<BoardCommitment>(
    joinUrl(baseUrl, `/v1/boards/${encodeURIComponent(boardId)}/commitment`),
  );
}

export async function encapsulateContentKey(
  boardId: string,
  contentKey: Uint8Array,
  context?: Uint8Array,
  baseUrl = getBaseUrl(),
): Promise<KeyCapsule> {
  const body: Record<string, string> = {
    contentKey: bytesToBase64Url(contentKey),
  };
  if (context !== undefined) {
    body.context = bytesToBase64Url(context);
  }
  return fetchJson<KeyCapsule>(
    joinUrl(baseUrl, `/v1/boards/${encodeURIComponent(boardId)}/encapsulate`),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

export async function decryptContentKey(
  boardId: string,
  capsule: KeyCapsule,
  participantIds: string[],
  context?: Uint8Array,
  baseUrl = getBaseUrl(),
): Promise<Uint8Array> {
  const body: Record<string, unknown> = {
    encapsulation: capsule.encapsulation,
    nonce: capsule.nonce,
    ciphertext: capsule.ciphertext,
    keyCommitment: capsule.keyCommitment,
    participantIds,
  };
  if (context !== undefined) {
    body.context = bytesToBase64Url(context);
  }
  const response = await fetchJson<{ contentKey: string }>(
    joinUrl(baseUrl, `/v1/boards/${encodeURIComponent(boardId)}/decrypt`),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return base64UrlToBytes(response.contentKey);
}

export async function requestPartialDecryption(
  boardId: string,
  participantId: string,
  capsule: KeyCapsule,
  context?: Uint8Array,
  baseUrl = getBaseUrl(),
): Promise<PartialDecryptionResponse> {
  const body: Record<string, string> = {
    participantId,
    ciphertext: capsule.ciphertext,
    nonce: capsule.nonce,
    capsule: capsule.encapsulation,
  };
  if (context !== undefined) {
    body.context = bytesToBase64Url(context);
  }
  return fetchJson<PartialDecryptionResponse>(
    joinUrl(baseUrl, `/v1/boards/${encodeURIComponent(boardId)}/partial-decrypt`),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

export function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
