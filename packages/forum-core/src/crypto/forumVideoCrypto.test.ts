import { describe, expect, it } from "vitest";

import {
  decryptAes128Cbc,
  encryptPackagedHlsForForum,
  unwrapForumVideoKey,
  wrapForumVideoKey,
  FORUM_VIDEO_KEY_URI,
} from "./forumVideoCrypto";
import type { PackagedHlsBundle } from "../video/pdsVideoUpload";

describe("encryptPackagedHlsForForum", () => {
  it("encrypts transport segments and tags media playlists", async () => {
    const bundle: PackagedHlsBundle = {
      masterPath: "master.m3u8",
      files: [
        {
          path: "master.m3u8",
          bytes: new TextEncoder().encode("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nindex.m3u8\n"),
          mimeType: "application/vnd.apple.mpegurl",
        },
        {
          path: "index.m3u8",
          bytes: new TextEncoder().encode("#EXTM3U\n#EXTINF:6.0,\nseg_000.ts\n"),
          mimeType: "application/vnd.apple.mpegurl",
        },
        {
          path: "seg_000.ts",
          bytes: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]),
          mimeType: "video/mp2t",
        },
      ],
    };

    const encrypted = await encryptPackagedHlsForForum(bundle);
    const mediaPlaylist = new TextDecoder().decode(
      encrypted.bundle.files.find((file) => file.path === "index.m3u8")!.bytes,
    );

    expect(mediaPlaylist).toContain(FORUM_VIDEO_KEY_URI);
    expect(encrypted.key).toHaveLength(16);
    expect(encrypted.iv).toHaveLength(16);

    const ciphertext = encrypted.bundle.files.find((file) => file.path === "seg_000.ts")!.bytes;
    expect(ciphertext).not.toEqual(bundle.files[2]!.bytes);

    const roundtrip = await decryptAes128Cbc(ciphertext, encrypted.key, encrypted.iv);
    expect(roundtrip).toEqual(bundle.files[2]!.bytes);
  });
});

describe("wrapForumVideoKey", () => {
  it("wraps and unwraps the AES key material", async () => {
    const boardEpochKey = crypto.getRandomValues(new Uint8Array(32));
    const key = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(16));

    const wrapped = await wrapForumVideoKey({
      key,
      iv,
      boardEpochKey,
      keyEpochUri: "at://did:plc:test/app.creaton.forum.keyCapsule/abc",
      epoch: "2025-01",
    });

    const unwrapped = await unwrapForumVideoKey(wrapped, boardEpochKey);
    expect(unwrapped.key).toEqual(key);
    expect(unwrapped.iv).toEqual(iv);
  });
});
