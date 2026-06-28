import type { CreatonAtprotoBlobRef } from "../forumTypes";

/** Extract a base64 CID from an ATProto blob ref. */
export function getAtprotoBlobCid(blob: CreatonAtprotoBlobRef | undefined): string | undefined {
  if (!blob) return undefined;

  const maybeJson = blob as {
    toJSON?: () => { ref?: { $link?: string } };
  };
  if (typeof maybeJson.toJSON === "function") {
    try {
      const link = maybeJson.toJSON().ref?.$link;
      if (link) return link;
    } catch {
      // fall through
    }
  }

  const ref = blob.ref as
    | { $link?: string; ["$link"]?: string; toString?: () => string }
    | undefined;
  const jsonLink = ref?.["$link"] ?? ref?.$link;
  if (jsonLink) return jsonLink;

  if (ref && typeof ref.toString === "function") {
    const cid = ref.toString();
    if (cid.startsWith("baf")) return cid;
  }

  return undefined;
}

export function buildPdsBlobUrl({
  did,
  cid,
  pdsUrl,
}: {
  did: string;
  cid: string;
  pdsUrl: string;
}): string {
  const pds = pdsUrl.replace(/\/$/, "");
  return `${pds}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(cid)}`;
}

/** Resolve a blob ref to a com.atproto.sync.getBlob URL. */
export function resolveAtprotoBlobUrl({
  did,
  blob,
  pdsUrl,
}: {
  did: string | undefined;
  blob: CreatonAtprotoBlobRef | undefined;
  pdsUrl: string | undefined;
}): string | null {
  const cid = getAtprotoBlobCid(blob);
  if (!did || !cid || !pdsUrl) return null;
  return buildPdsBlobUrl({ did, cid, pdsUrl });
}

/**
 * Rewrite relative URIs inside HLS playlists to absolute PDS blob URLs.
 */
export function rewriteM3u8Playlist(
  content: string,
  resolveUri: (relativeUri: string) => string,
): string {
  return content
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      if (trimmed.startsWith("#")) {
        const uriMatch = trimmed.match(/URI="([^"]+)"/);
      if (!uriMatch?.[1]) return line;
      if (uriMatch[1].startsWith("creaton://")) return line;
      const resolved = resolveUri(uriMatch[1]);
        return line.replace(uriMatch[1], resolved);
      }

      return resolveUri(trimmed);
    })
    .join("\n");
}

export function isHlsPlaylistPath(path: string): boolean {
  return path.endsWith(".m3u8");
}

export function isHlsSegmentPath(path: string): boolean {
  return (
    path.endsWith(".ts") ||
    path.endsWith(".m4s") ||
    path.endsWith(".mp4") ||
    path.endsWith(".aac")
  );
}
