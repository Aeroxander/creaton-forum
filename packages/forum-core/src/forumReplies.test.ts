import { describe, expect, it } from "vitest";

import {
  CREATON_FORUM_COMMENT_COLLECTION,
  type CreatonForumCommentRecord,
} from "./forumTypes";
import {
  buildCommentTree,
  buildFocusedCommentBranch,
  countDescendants,
  forumRecordAuthorDid,
} from "./forumReplies";
import type { ForumRecord, ForumVoteSummary } from "./forumRepository";

describe("forumReplies", () => {
  it("filters OP replies", () => {
    const comments = [
      comment("at://did:op/app.creaton.forum.comment/a", "2026-01-01T00:00:00.000Z"),
      comment("at://did:other/app.creaton.forum.comment/b", "2026-01-01T00:01:00.000Z"),
    ];
    const tree = buildCommentTree(comments, undefined, "op", {
      topicAuthorDid: "did:op",
    });

    expect(tree.map((node) => forumRecordAuthorDid(node.comment.uri))).toEqual(["did:op"]);
  });

  it("filters replies from followed authors", () => {
    const comments = [
      comment("at://did:followed/app.creaton.forum.comment/a", "2026-01-01T00:00:00.000Z"),
      comment("at://did:other/app.creaton.forum.comment/b", "2026-01-01T00:01:00.000Z"),
    ];
    const tree = buildCommentTree(comments, undefined, "following", {
      followedDids: new Set(["did:followed"]),
    });

    expect(tree.map((node) => forumRecordAuthorDid(node.comment.uri))).toEqual([
      "did:followed",
    ]);
  });

  it("sorts top voted replies by score", () => {
    const comments = [
      comment("at://did:a/app.creaton.forum.comment/a", "2026-01-01T00:00:00.000Z"),
      comment("at://did:b/app.creaton.forum.comment/b", "2026-01-01T00:01:00.000Z"),
    ];
    const votes = new Map<string, ForumVoteSummary>([
      [comments[0]!.uri, vote(comments[0]!.uri, 1)],
      [comments[1]!.uri, vote(comments[1]!.uri, 5)],
    ]);

    const tree = buildCommentTree(comments, votes, "top-voted");
    expect(tree[0]?.comment.uri).toBe(comments[1]!.uri);
  });

  it("focuses a branch with ancestors and descendants", () => {
    const root = comment("at://did:a/app.creaton.forum.comment/root", "2026-01-01T00:00:00.000Z");
    const selected = comment(
      "at://did:b/app.creaton.forum.comment/selected",
      "2026-01-01T00:01:00.000Z",
      root,
    );
    const descendant = comment(
      "at://did:c/app.creaton.forum.comment/descendant",
      "2026-01-01T00:02:00.000Z",
      selected,
    );
    const sibling = comment(
      "at://did:d/app.creaton.forum.comment/sibling",
      "2026-01-01T00:03:00.000Z",
      root,
    );

    const branch = buildFocusedCommentBranch(
      [root, selected, descendant, sibling],
      undefined,
      selected.uri,
      "chronological",
    );

    expect(branch[0]?.comment.uri).toBe(root.uri);
    expect(branch[0]?.children[0]?.comment.uri).toBe(selected.uri);
    expect(branch[0]?.children[0]?.children[0]?.comment.uri).toBe(descendant.uri);
    expect(countDescendants(branch[0]!)).toBe(2);
  });

  it("keeps comments with missing parents as roots", () => {
    const orphan = comment(
      "at://did:a/app.creaton.forum.comment/orphan",
      "2026-01-01T00:00:00.000Z",
      {
        uri: "at://did:missing/app.creaton.forum.comment/missing",
        cid: "missing",
      },
    );

    const tree = buildCommentTree([orphan], undefined, "chronological");
    expect(tree[0]?.comment.uri).toBe(orphan.uri);
  });
});

function comment(
  uri: string,
  createdAt: string,
  parent?: { uri: string; cid: string },
): ForumRecord<CreatonForumCommentRecord> {
  return {
    uri,
    cid: `${uri}-cid`,
    value: {
      $type: CREATON_FORUM_COMMENT_COLLECTION,
      topic: { uri: "at://did:topic/app.creaton.forum.topic/self", cid: "topic-cid" },
      parent,
      body: uri,
      createdAt,
    },
  };
}

function vote(subjectUri: string, score: number): ForumVoteSummary {
  return { subjectUri, up: Math.max(score, 0), down: 0, score };
}
