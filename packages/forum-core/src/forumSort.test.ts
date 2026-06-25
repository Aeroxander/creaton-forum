import { describe, expect, it } from "vitest";

import type { ForumVoteSummary } from "./forumRepository";
import type { ForumTopicMetadata, TopicState } from "./forumSort";
import {
  CREATON_FORUM_MOD_ACTION_COLLECTION,
  type CreatonForumModActionRecord,
} from "./forumTypes";
import type { ForumRecord } from "./forumRepository";
import { resolveTopicState, sortForumTopics } from "./forumSort";

describe("forumSort", () => {
  it("orders top sort by score", () => {
    const topics = [
      { uri: "a", value: { createdAt: "2026-01-01T00:00:00.000Z" } },
      { uri: "b", value: { createdAt: "2026-01-02T00:00:00.000Z" } },
    ];
    const metadata = new Map<string, ForumTopicMetadata>([
      ["a", { vote: vote("a", 1) }],
      ["b", { vote: vote("b", 5) }],
    ]);
    const sorted = sortForumTopics(topics, metadata, "top");
    expect(sorted[0]?.uri).toBe("b");
  });

  it("orders active sort by latest activity", () => {
    const topics = [
      { uri: "older", value: { createdAt: "2026-01-01T00:00:00.000Z" } },
      { uri: "active", value: { createdAt: "2026-01-01T00:00:00.000Z" } },
    ];
    const metadata = new Map<string, ForumTopicMetadata>([
      ["older", { latestActivityAt: "2026-01-01T02:00:00.000Z", replyCount: 1 }],
      ["active", { latestActivityAt: "2026-01-01T04:00:00.000Z", replyCount: 1 }],
    ]);
    const sorted = sortForumTopics(topics, metadata, "active");
    expect(sorted[0]?.uri).toBe("active");
  });

  it("keeps new sort based on the topic timestamp instead of reply activity", () => {
    const topics = [
      { uri: "old-active", value: { createdAt: "2026-01-01T00:00:00.000Z" } },
      { uri: "new-topic", value: { createdAt: "2026-01-02T00:00:00.000Z" } },
    ];
    const metadata = new Map<string, ForumTopicMetadata>([
      ["old-active", { latestActivityAt: "2026-01-03T00:00:00.000Z", replyCount: 20 }],
      ["new-topic", { latestActivityAt: "2026-01-02T00:00:00.000Z", replyCount: 0 }],
    ]);
    const sorted = sortForumTopics(topics, metadata, "new");
    expect(sorted[0]?.uri).toBe("new-topic");
  });

  it("lets volume lift a larger discussion over a small recent bump", () => {
    const topics = [
      { uri: "large", value: { createdAt: "2026-01-01T00:00:00.000Z" } },
      { uri: "small", value: { createdAt: "2026-01-01T00:00:00.000Z" } },
    ];
    const metadata = new Map<string, ForumTopicMetadata>([
      ["large", { latestActivityAt: "2026-01-01T10:00:00.000Z", replyCount: 100 }],
      ["small", { latestActivityAt: "2026-01-01T12:00:00.000Z", replyCount: 0 }],
    ]);
    const sorted = sortForumTopics(topics, metadata, "active");
    expect(sorted[0]?.uri).toBe("large");
  });

  it("uses votes only as an active sort tie breaker", () => {
    const topics = [
      { uri: "low", value: { createdAt: "2026-01-01T00:00:00.000Z" } },
      { uri: "high", value: { createdAt: "2026-01-01T00:00:00.000Z" } },
    ];
    const metadata = new Map<string, ForumTopicMetadata>([
      [
        "low",
        {
          latestActivityAt: "2026-01-01T10:00:00.000Z",
          replyCount: 4,
          vote: vote("low", 1),
        },
      ],
      [
        "high",
        {
          latestActivityAt: "2026-01-01T10:00:00.000Z",
          replyCount: 4,
          vote: vote("high", 9),
        },
      ],
    ]);
    const sorted = sortForumTopics(topics, metadata, "active");
    expect(sorted[0]?.uri).toBe("high");
  });

  it("keeps pinned topics above regular topics", () => {
    const topics = [
      { uri: "recent", value: { createdAt: "2026-01-03T00:00:00.000Z" } },
      { uri: "pinned-old", value: { createdAt: "2026-01-01T00:00:00.000Z", pinned: true } },
      { uri: "pinned-new", value: { createdAt: "2026-01-02T00:00:00.000Z", pinned: true } },
    ];

    const sorted = sortForumTopics(topics, undefined, "new");
    expect(sorted.map((topic) => topic.uri)).toEqual(["pinned-new", "pinned-old", "recent"]);
  });

  it("lets moderator pin state override author state", () => {
    const topic: TopicState = { pinned: false, status: "open" };
    const resolved = resolveTopicState(topic, [
      modAction("pin", "2026-01-01T00:00:00.000Z"),
    ]);

    expect(resolved.pinned).toBe(true);
  });

  it("uses the latest moderator action per family", () => {
    const topic: TopicState = { pinned: true, status: "open" };
    const resolved = resolveTopicState(topic, [
      modAction("pin", "2026-01-01T00:00:00.000Z"),
      modAction("unpin", "2026-01-02T00:00:00.000Z"),
      modAction("lock", "2026-01-03T00:00:00.000Z"),
      modAction("unlock", "2026-01-04T00:00:00.000Z"),
    ]);

    expect(resolved.pinned).toBe(false);
    expect(resolved.status).toBe("open");
  });

  it("applies moderator moves without discarding lock state", () => {
    const movedTo = { uri: "at://did:new/app.creaton.forum.topic/new", cid: "new-cid" };
    const topic: TopicState = { status: "open" };
    const resolved = resolveTopicState(topic, [
      modAction("lock", "2026-01-01T00:00:00.000Z"),
      modAction("move", "2026-01-02T00:00:00.000Z", movedTo),
    ]);

    expect(resolved.status).toBe("locked");
    expect(resolved.movedTo).toEqual(movedTo);
  });
});

function vote(subjectUri: string, score: number): ForumVoteSummary {
  return { subjectUri, up: Math.max(score, 0), down: 0, score };
}

function modAction(
  action: CreatonForumModActionRecord["action"],
  createdAt: string,
  movedTo?: { uri: string; cid: string },
): ForumRecord<CreatonForumModActionRecord> {
  return {
    uri: `at://did:owner/app.creaton.forum.modAction/${action}`,
    cid: `${action}-cid`,
    value: {
      $type: CREATON_FORUM_MOD_ACTION_COLLECTION,
      board: { uri: "at://did:owner/app.creaton.forum.board/self", cid: "board-cid" },
      subject: { uri: "at://did:topic/app.creaton.forum.topic/self", cid: "topic-cid" },
      action,
      movedTo,
      createdAt,
    },
  };
}
