// Runtime stubs for encrypted forum flows (deferred in creaton-forum MVP UI).
// forumRepository still references these symbols for paid/encrypted board support.

export type EncryptedForumContent = {
  version: 3;
  suite: string;
  epoch: string;
  salt: string | Uint8Array;
  nonce: string | Uint8Array;
  ciphertext: string | Uint8Array;
  committeeEpoch: number;
  keyCapsuleUri: string;
};

export function currentForumKeyEpoch(_date: Date) {
  return new Date().toISOString().slice(0, 10);
}

export function generateForumEpochKey() {
  return crypto.getRandomValues(new Uint8Array(32));
}

export async function encryptForumContent(_input: unknown): Promise<EncryptedForumContent> {
  throw new Error('Encrypted forum content is not enabled in creaton-forum MVP.');
}

export type ForumKeyCapsule = {
  version: 1;
  suite: string;
  boardUri: string;
  recordUri: string;
  committeeEpoch: number;
  policyHash: string;
  encapsulation: string;
  nonce: string;
  ciphertext: string;
  keyCommitment: string;
  createdAt: string;
};

export async function createForumKeyCapsule(_input: unknown): Promise<ForumKeyCapsule> {
  throw new Error('Encrypted forum content is not enabled in creaton-forum MVP.');
}

export function base64UrlToBytes(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function bytesToBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
