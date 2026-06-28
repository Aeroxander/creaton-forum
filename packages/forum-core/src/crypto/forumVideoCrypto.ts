import type { CreatonForumVideoEncryption } from "../forumTypes";
import { bytesToBase64Url, currentForumKeyEpoch } from "./forumContentCrypto";
import type { PackagedHlsBundle, PackagedHlsFile } from "../video/pdsVideoUpload";
import { isHlsPlaylistPath, isHlsSegmentPath } from "../video/videoBlobUtils";

export const FORUM_VIDEO_KEY_URI = "creaton://forum-video-key";

const VIDEO_ENCRYPTION_SUITE = "AES-128-CBC-HLS+HKDF-SHA256/AES-GCM" as const;

function toBufferSource(data: Uint8Array): BufferSource {
  return data as unknown as BufferSource;
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function deriveVideoWrapKey(
  boardEpochKey: Uint8Array,
  keyEpochUri: string,
  keyNonce: Uint8Array,
): Promise<CryptoKey> {
  const ikm = await crypto.subtle.importKey("raw", toBufferSource(boardEpochKey), "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: toBufferSource(keyNonce),
      info: new TextEncoder().encode(`app.creaton.forum.video-key.v1\n${keyEpochUri}`),
    },
    ikm,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export function formatHlsIv(iv: Uint8Array): string {
  if (iv.byteLength !== 16) {
    throw new Error("HLS IV must be 16 bytes.");
  }
  return `0x${Array.from(iv)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

function isMediaPlaylist(content: string): boolean {
  return content.includes("#EXTINF");
}

function injectHlsKeyTag(content: string, iv: Uint8Array): string {
  const keyLine = `#EXT-X-KEY:METHOD=AES-128,URI="${FORUM_VIDEO_KEY_URI}",IV=${formatHlsIv(iv)}`;
  const lines = content.split("\n");
  const extm3uIndex = lines.findIndex((line) => line.trim() === "#EXTM3U");
  if (extm3uIndex === -1) {
    return [keyLine, ...lines].join("\n");
  }
  const insertAt = extm3uIndex + 1;
  if (lines.some((line) => line.includes("#EXT-X-KEY"))) {
    return lines
      .map((line) =>
        line.includes("#EXT-X-KEY")
          ? `#EXT-X-KEY:METHOD=AES-128,URI="${FORUM_VIDEO_KEY_URI}",IV=${formatHlsIv(iv)}`
          : line,
      )
      .join("\n");
  }
  lines.splice(insertAt, 0, keyLine);
  return lines.join("\n");
}

async function encryptAes128Cbc(
  plaintext: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array,
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey("raw", toBufferSource(key), "AES-CBC", false, [
    "encrypt",
  ]);
  return new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-CBC", iv: toBufferSource(iv) }, cryptoKey, plaintext),
  );
}

export async function decryptAes128Cbc(
  ciphertext: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array,
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey("raw", toBufferSource(key), "AES-CBC", false, [
    "decrypt",
  ]);
  return new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-CBC", iv: toBufferSource(iv) }, cryptoKey, ciphertext),
  );
}

export type EncryptedHlsPackagingResult = {
  bundle: PackagedHlsBundle;
  key: Uint8Array;
  iv: Uint8Array;
};

/**
 * Encrypt HLS transport segments with AES-128-CBC and tag media playlists for HLS players.
 */
export async function encryptPackagedHlsForForum(
  bundle: PackagedHlsBundle,
): Promise<EncryptedHlsPackagingResult> {
  const key = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(16));

  const files: PackagedHlsFile[] = await Promise.all(
    bundle.files.map(async (file) => {
      if (isHlsSegmentPath(file.path)) {
        return {
          ...file,
          bytes: await encryptAes128Cbc(file.bytes, key, iv),
        };
      }

      if (isHlsPlaylistPath(file.path)) {
        const text = new TextDecoder().decode(file.bytes);
        if (!isMediaPlaylist(text)) {
          return file;
        }
        const encryptedPlaylist = injectHlsKeyTag(text, iv);
        return {
          ...file,
          bytes: new TextEncoder().encode(encryptedPlaylist),
        };
      }

      return file;
    }),
  );

  return {
    bundle: {
      ...bundle,
      files,
    },
    key,
    iv,
  };
}

export async function wrapForumVideoKey(input: {
  key: Uint8Array;
  iv: Uint8Array;
  boardEpochKey: Uint8Array;
  keyEpochUri: string;
  epoch?: string;
}): Promise<CreatonForumVideoEncryption> {
  if (input.key.byteLength !== 16 || input.iv.byteLength !== 16) {
    throw new Error("Forum video encryption requires a 16-byte AES key and IV.");
  }

  const keyNonce = crypto.getRandomValues(new Uint8Array(12));
  const wrapKey = await deriveVideoWrapKey(input.boardEpochKey, input.keyEpochUri, keyNonce);
  const keyMaterial = new Uint8Array(32);
  keyMaterial.set(input.key, 0);
  keyMaterial.set(input.iv, 16);

  const wrappedKey = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toBufferSource(keyNonce) },
    wrapKey,
    keyMaterial,
  );

  return {
    version: 1,
    suite: VIDEO_ENCRYPTION_SUITE,
    epoch: input.epoch ?? currentForumKeyEpoch(new Date()),
    keyEpochUri: input.keyEpochUri,
    keyNonce: { $bytes: bytesToBase64Url(keyNonce) },
    wrappedKey: { $bytes: bytesToBase64Url(new Uint8Array(wrappedKey)) },
    iv: { $bytes: bytesToBase64Url(input.iv) },
  };
}

export async function unwrapForumVideoKey(
  encryption: CreatonForumVideoEncryption,
  boardEpochKey: Uint8Array,
): Promise<{ key: Uint8Array; iv: Uint8Array }> {
  const keyNonce = base64UrlToBytes(encryption.keyNonce.$bytes);
  const wrappedKey = base64UrlToBytes(encryption.wrappedKey.$bytes);
  const wrapKey = await deriveVideoWrapKey(boardEpochKey, encryption.keyEpochUri, keyNonce);
  const keyMaterial = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toBufferSource(keyNonce) },
      wrapKey,
      wrappedKey,
    ),
  );

  return {
    key: keyMaterial.slice(0, 16),
    iv: keyMaterial.slice(16, 32),
  };
}

export function isEncryptedForumVideo(
  encryption: CreatonForumVideoEncryption | undefined,
): encryption is CreatonForumVideoEncryption {
  return !!encryption && encryption.version === 1;
}
