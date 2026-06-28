import { describe, expect, it } from "vitest";

import { buildPdsBlobUrl, rewriteM3u8Playlist } from "./videoBlobUtils";

describe("rewriteM3u8Playlist", () => {
  it("rewrites segment lines and URI attributes", () => {
    const input = [
      "#EXTM3U",
      "#EXT-X-KEY:METHOD=AES-128,URI=\"seg.key\"",
      "seg_000.ts",
      "media/index.m3u8",
    ].join("\n");

    const output = rewriteM3u8Playlist(input, (uri) => `https://pds.example/${uri}`);

    expect(output).toContain('URI="https://pds.example/seg.key"');
    expect(output).toContain("https://pds.example/seg_000.ts");
    expect(output).toContain("https://pds.example/media/index.m3u8");
  });
});

describe("buildPdsBlobUrl", () => {
  it("builds a getBlob URL", () => {
    expect(
      buildPdsBlobUrl({
        did: "did:plc:abc",
        cid: "bafytest",
        pdsUrl: "http://127.0.0.1:2583/",
      }),
    ).toBe(
      "http://127.0.0.1:2583/xrpc/com.atproto.sync.getBlob?did=did%3Aplc%3Aabc&cid=bafytest",
    );
  });
});
