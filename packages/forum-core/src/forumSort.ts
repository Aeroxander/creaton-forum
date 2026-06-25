import type {
  CreatonForumModActionRecord,
  CreatonForumTopicRecord,
  StrongRef,
} from "./forumTypes";

import type { ForumRecord, ForumVoteSummary } from "./forumRepository";

export type ForumTopicSort = "active" | "new" | "top";

export type ForumTopicMetadata = {
  latestActivityAt?: string;
  replyCount?: number;
  vote?: ForumVoteSummary;
};

export type TopicState = {
  pinned?: boolean;
  status?: CreatonForumTopicRecord["status"];
  movedTo?: StrongRef;
};

type SortableTopic = {
  uri: string;
  value: {
    createdAt: string;
    pinned?: boolean;
    updatedAt?: string;
  };
};

const REPLY_VOLUME_ACTIVITY_BOOST_MS = 60 * 60 * 1000;

function timestamp(value: string | undefined) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function latestKnownActivity<
  T extends { value: { createdAt: string; updatedAt?: string } },
>(topic: T, metadata: ForumTopicMetadata | undefined) {
  return metadata?.latestActivityAt ?? topic.value.updatedAt ?? topic.value.createdAt;
}

export function buildForumTopicMetadata<
  T extends { value: { createdAt: string; updatedAt?: string } },
  C extends { value: { createdAt: string; updatedAt?: string } },
>(topic: T, comments: C[], vote?: ForumVoteSummary): ForumTopicMetadata {
  const topicActivityAt = topic.value.updatedAt ?? topic.value.createdAt;
  const latestActivityAt = comments.reduce((latest, comment) => {
    const commentActivityAt = comment.value.updatedAt ?? comment.value.createdAt;
    return commentActivityAt.localeCompare(latest) > 0 ? commentActivityAt : latest;
  }, topicActivityAt);

  return {
    latestActivityAt,
    replyCount: comments.length,
    vote,
  };
}

function activeScore<T extends { value: { createdAt: string; updatedAt?: string } }>(
  topic: T,
  metadata: ForumTopicMetadata | undefined,
) {
  const latestActivity = timestamp(latestKnownActivity(topic, metadata));
  const volumeBoost = Math.log1p(metadata?.replyCount ?? 0) * REPLY_VOLUME_ACTIVITY_BOOST_MS;
  return latestActivity + volumeBoost;
}

export function sortForumTopics<
  T extends SortableTopic,
>(
  topics: T[],
  metadata: Map<string, ForumTopicMetadata> | undefined,
  sort: ForumTopicSort,
): T[] {
  const sorted = [...topics];
  const byPinned = (a: T, b: T) => Number(b.value.pinned === true) - Number(a.value.pinned === true);
  switch (sort) {
    case "new":
      sorted.sort((a, b) => {
        const pinnedDiff = byPinned(a, b);
        if (pinnedDiff !== 0) return pinnedDiff;
        return (b.value.updatedAt ?? b.value.createdAt).localeCompare(
          a.value.updatedAt ?? a.value.createdAt,
        );
      });
      break;
    case "top":
      sorted.sort((a, b) => {
        const pinnedDiff = byPinned(a, b);
        if (pinnedDiff !== 0) return pinnedDiff;
        const scoreDiff =
          (metadata?.get(b.uri)?.vote?.score ?? 0) -
          (metadata?.get(a.uri)?.vote?.score ?? 0);
        if (scoreDiff !== 0) return scoreDiff;
        return latestKnownActivity(b, metadata?.get(b.uri)).localeCompare(
          latestKnownActivity(a, metadata?.get(a.uri)),
        );
      });
      break;
    case "active":
    default:
      sorted.sort((a, b) => {
        const pinnedDiff = byPinned(a, b);
        if (pinnedDiff !== 0) return pinnedDiff;
        const metadataA = metadata?.get(a.uri);
        const metadataB = metadata?.get(b.uri);
        const scoreDiff = activeScore(b, metadataB) - activeScore(a, metadataA);
        if (scoreDiff !== 0) return scoreDiff;
        const voteDiff = (metadataB?.vote?.score ?? 0) - (metadataA?.vote?.score ?? 0);
        if (voteDiff !== 0) return voteDiff;
        return b.value.createdAt.localeCompare(a.value.createdAt);
      });
      break;
  }
  return sorted;
}

export function resolveTopicState<T extends TopicState>(
  authorState: T,
  modActions: ForumRecord<CreatonForumModActionRecord>[] | undefined,
): T {
  if (!modActions?.length) return authorState;
  const latestByFamily = new Map<
    "pin" | "lock" | "move" | "merge",
    ForumRecord<CreatonForumModActionRecord>
  >();
  for (const action of modActions) {
    const family = modActionFamily(action.value.action);
    const existing = latestByFamily.get(family);
    if (!existing || action.value.createdAt.localeCompare(existing.value.createdAt) >= 0) {
      latestByFamily.set(family, action);
    }
  }

  const resolved: TopicState = { ...authorState };
  const pin = latestByFamily.get("pin")?.value.action;
  if (pin === "pin") resolved.pinned = true;
  if (pin === "unpin") resolved.pinned = false;

  const lock = latestByFamily.get("lock")?.value.action;
  if (lock === "lock") resolved.status = "locked";
  if (lock === "unlock") resolved.status = "open";

  const move = latestByFamily.get("move")?.value ?? latestByFamily.get("merge")?.value;
  if ((move?.action === "move" || move?.action === "merge") && move.movedTo) {
    resolved.movedTo = move.movedTo;
  }

  return resolved as T;
}

function modActionFamily(action: CreatonForumModActionRecord["action"]) {
  if (action === "pin" || action === "unpin") return "pin";
  if (action === "lock" || action === "unlock") return "lock";
  if (action === "merge") return "merge";
  return "move";
}
