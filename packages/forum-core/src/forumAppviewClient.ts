import type { ForumVoteSummary } from "./forumRepository";

export type ForumUserKarma = {
  did: string;
  postKarma: number;
  commentKarma: number;
  totalKarma: number;
};

export type ForumNetworkBoard = {
  boardUri: string;
  title: string;
  description?: string;
  networkActivity: number;
};

export type ForumSearchResult = {
  uri: string;
  kind: "topic" | "comment";
  title?: string;
  body: string;
  boardUri?: string;
  topicUri?: string;
  authorDid: string;
  createdAt: string;
  score: number;
};

export type ForumRelatedTopic = {
  uri: string;
  title: string;
  boardUri: string;
  similarity: number;
};

export type ForumEncryptionParameters = {
  committeeEpoch: number;
  committeePublicKey: string;
  verificationShares: string[];
  policyHash: string;
};

const defaultForumAppviewUrl = import.meta.env.DEV
  ? "http://localhost:3010"
  : "https://forum.creaton.social";
const APPVIEW_INTROSPECT_URL = import.meta.env.VITE_CREATON_INTROSPECT_URL || "http://localhost:2581";
const APPVIEW_INTROSPECT_TIMEOUT_MS = 1500;

let cachedForumAppviewUrl: string | null = null;
let pendingForumAppviewUrl: Promise<string> | null = null;

export function getForumAppviewUrl(override?: string) {
  return override || defaultForumAppviewUrl;
}

export async function resolveForumAppviewUrl(override?: string) {
  if (override) return override;
  if (import.meta.env.VITE_CREATON_FORUM_APPVIEW_URL) {
    return import.meta.env.VITE_CREATON_FORUM_APPVIEW_URL;
  }
  if (!import.meta.env.DEV) return defaultForumAppviewUrl;
  if (cachedForumAppviewUrl) return cachedForumAppviewUrl;
  if (pendingForumAppviewUrl) return pendingForumAppviewUrl;

  pendingForumAppviewUrl = (async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), APPVIEW_INTROSPECT_TIMEOUT_MS);
    try {
      const response = await fetch(APPVIEW_INTROSPECT_URL, { signal: controller.signal });
      const data = await response.json().catch(() => null) as { creatonAppview?: { url?: string } } | null;
      if (data?.creatonAppview?.url) {
        cachedForumAppviewUrl = data.creatonAppview.url;
        return cachedForumAppviewUrl;
      }
    } catch {
      // Local appview discovery is optional; core forums still work through Microcosm.
    } finally {
      window.clearTimeout(timeout);
      pendingForumAppviewUrl = null;
    }
    return defaultForumAppviewUrl;
  })();

  return pendingForumAppviewUrl;
}

function serviceUrl(host: string, path: string) {
  const base =
    host.startsWith("http://") || host.startsWith("https://")
      ? host.replace(/\/+$/g, "")
      : `https://${host}`;
  return `${base}${path}`;
}

async function forumAppviewFetch<T>(appviewUrl: string, path: string, params?: URLSearchParams) {
  const query = params?.toString();
  const url = serviceUrl(appviewUrl, `${path}${query ? `?${query}` : ""}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Forum appview request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function fetchForumEncryptionParameters(
  appviewUrl: string,
  boardUri: string,
): Promise<ForumEncryptionParameters> {
  const resolved = await resolveForumAppviewUrl(appviewUrl);
  return forumAppviewFetch<ForumEncryptionParameters>(
    resolved,
    "/xrpc/app.creaton.forum.getEncryptionParameters",
    new URLSearchParams({ boardUri }),
  );
}

export async function fetchVoteSummaryFromAppview(
  appviewUrl: string,
  subjectUri: string,
): Promise<ForumVoteSummary | null> {
  try {
    const params = new URLSearchParams({ subjectUri });
    const data = await forumAppviewFetch<{
      subjectUri: string;
      up: number;
      down: number;
      score: number;
    }>(appviewUrl, "/xrpc/app.creaton.forum.getVoteSummary", params);
    return {
      subjectUri: data.subjectUri,
      up: data.up,
      down: data.down,
      score: data.score,
    };
  } catch {
    return null;
  }
}

export async function fetchUserKarmaFromAppview(
  appviewUrl: string,
  did: string,
): Promise<ForumUserKarma | null> {
  try {
    const resolvedAppviewUrl = await resolveForumAppviewUrl(appviewUrl);
    const params = new URLSearchParams({ did });
    return forumAppviewFetch<ForumUserKarma>(
      resolvedAppviewUrl,
      "/xrpc/app.creaton.forum.getUserKarma",
      params,
    );
  } catch {
    return null;
  }
}

export async function fetchNetworkBoardsFromAppview(
  appviewUrl: string,
  viewerDid: string,
  limit = 5,
): Promise<ForumNetworkBoard[]> {
  try {
    const resolvedAppviewUrl = await resolveForumAppviewUrl(appviewUrl);
    const params = new URLSearchParams({ viewerDid, limit: String(limit) });
    const data = await forumAppviewFetch<{ boards: ForumNetworkBoard[] }>(
      resolvedAppviewUrl,
      "/xrpc/app.creaton.forum.getNetworkBoards",
      params,
    );
    return data.boards;
  } catch {
    return [];
  }
}

export async function searchForumFromAppview(
  appviewUrl: string,
  query: string,
  limit = 20,
): Promise<ForumSearchResult[]> {
  try {
    const resolvedAppviewUrl = await resolveForumAppviewUrl(appviewUrl);
    const params = new URLSearchParams({ query, limit: String(limit) });
    const data = await forumAppviewFetch<{ results: ForumSearchResult[] }>(
      resolvedAppviewUrl,
      "/xrpc/app.creaton.forum.searchForum",
      params,
    );
    return data.results;
  } catch {
    return [];
  }
}

export async function fetchRelatedTopicsFromAppview(
  appviewUrl: string,
  topicUri: string,
  limit = 5,
): Promise<ForumRelatedTopic[]> {
  try {
    const resolvedAppviewUrl = await resolveForumAppviewUrl(appviewUrl);
    const params = new URLSearchParams({ topicUri, limit: String(limit) });
    const data = await forumAppviewFetch<{ topics: ForumRelatedTopic[] }>(
      resolvedAppviewUrl,
      "/xrpc/app.creaton.forum.getRelatedTopics",
      params,
    );
    return data.topics;
  } catch {
    return [];
  }
}
