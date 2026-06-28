import { Directory, File, Paths } from "expo-file-system";
import { decryptAes128Cbc } from "@creaton/forum-core";

function resolvePlaylistUrl(baseUrl: string, relative: string): string {
  if (relative.startsWith("http://") || relative.startsWith("https://")) {
    return relative;
  }
  return new URL(relative, baseUrl).href;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch playlist (${response.status}).`);
  }
  return response.text();
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch video segment (${response.status}).`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

function resolveMediaPlaylistUrl(masterUrl: string, content: string): string {
  const lines = content.split("\n").map((line) => line.trim());
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line?.includes("#EXT-X-STREAM-INF")) continue;
    const next = lines[index + 1];
    if (next && !next.startsWith("#")) {
      return resolvePlaylistUrl(masterUrl, next);
    }
  }
  return masterUrl;
}

/**
 * Fetch encrypted HLS from PDS, decrypt segments, and write a local plaintext playlist for native playback.
 */
export async function cacheDecryptedForumVideoPlaylist(input: {
  playlistUrl: string;
  key: Uint8Array;
  iv: Uint8Array;
}): Promise<string> {
  const jobId = `${Date.now()}`;
  const outputDir = new Directory(Paths.cache, "forum-video-decrypted", jobId);
  outputDir.create({ intermediates: true, idempotent: true });

  const masterText = await fetchText(input.playlistUrl);
  const mediaPlaylistUrl = resolveMediaPlaylistUrl(input.playlistUrl, masterText);
  const mediaText =
    mediaPlaylistUrl === input.playlistUrl
      ? masterText
      : await fetchText(mediaPlaylistUrl);

  const outputLines: string[] = [];
  let segmentIndex = 0;

  for (const line of mediaText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      outputLines.push(line);
      continue;
    }
    if (trimmed.startsWith("#")) {
      if (trimmed.includes("#EXT-X-KEY")) continue;
      outputLines.push(line);
      continue;
    }

    const segmentUrl = resolvePlaylistUrl(mediaPlaylistUrl, trimmed);
    const encrypted = await fetchBytes(segmentUrl);
    const decrypted = await decryptAes128Cbc(encrypted, input.key, input.iv);
    const segmentName = trimmed.split("/").pop() ?? `seg_${segmentIndex}.ts`;
    segmentIndex += 1;
    const segmentFile = new File(outputDir, segmentName);
    segmentFile.write(decrypted);
    outputLines.push(segmentFile.uri);
  }

  const playlistFile = new File(outputDir, "index.m3u8");
  playlistFile.write(outputLines.join("\n"));
  return playlistFile.uri;
}
