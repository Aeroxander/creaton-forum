import { describe, expect, it } from "vitest";

import {
  CREATON_FORUM_BOARD_COLLECTION,
  CREATON_FORUM_MEMBER_COLLECTION,
  CREATON_FORUM_ROLE_GRANT_COLLECTION,
  type CreatonForumBoardRecord,
  type CreatonForumMemberRecord,
  type CreatonForumRoleGrantRecord,
} from "./forumTypes";
import {
  canModerateForumBoard,
  forumRankLabel,
  getForumAuthorityRole,
  getForumRole,
} from "./forumPermissions";
import type { ForumRecord } from "./forumRepository";

const boardUri = "at://did:owner/app.creaton.forum.board/self";

const makeBoard = (): ForumRecord<CreatonForumBoardRecord> => ({
  uri: boardUri,
  cid: "board-cid",
  value: {
    $type: CREATON_FORUM_BOARD_COLLECTION,
    title: "Board",
    scope: "standalone",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
});

describe("forumPermissions", () => {
  it("treats the board record creator as owner", () => {
    const board = makeBoard();

    expect(getForumRole({ board, viewerDid: "did:owner" })).toBe("owner");
    expect(canModerateForumBoard({ board, viewerDid: "did:owner" })).toBe(true);
  });

  it("shows advisory moderator membership without granting moderation authority", () => {
    const membership: ForumRecord<CreatonForumMemberRecord> = {
      uri: "at://did:mod/app.creaton.forum.member/self",
      cid: "cid",
      value: {
        $type: CREATON_FORUM_MEMBER_COLLECTION,
        board: { uri: boardUri, cid: "board-cid" },
        role: "moderator" as const,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    };

    expect(getForumRole({ membership, viewerDid: "did:mod" })).toBe("moderator");
    expect(getForumAuthorityRole({ viewerDid: "did:mod" })).toBe("member");
    expect(canModerateForumBoard({ membership, viewerDid: "did:mod" })).toBe(false);
  });

  it("derives classic forum ranks from role and karma", () => {
    expect(forumRankLabel({ role: "owner", karma: 0 })).toBe("Owner");
    expect(forumRankLabel({ role: "moderator", karma: 0 })).toBe("Moderator");
    expect(forumRankLabel({ karma: 500 })).toBe("Trusted");
    expect(forumRankLabel({ karma: 100 })).toBe("Regular");
    expect(forumRankLabel({ karma: 1 })).toBe("Member");
    expect(forumRankLabel({ karma: 0 })).toBe("New member");
  });

  describe("roleGrant-based authority", () => {
    it("elevates a user to moderator via authoritative grant", () => {
      const board = makeBoard();
      const grant: ForumRecord<CreatonForumRoleGrantRecord> = {
        uri: "at://did:owner/app.creaton.forum.roleGrant/grant-mod",
        cid: "grant-cid",
        value: {
          $type: CREATON_FORUM_ROLE_GRANT_COLLECTION,
          board: { uri: boardUri, cid: "board-cid" },
          subject: "did:someone",
          role: "moderator",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      };

      expect(getForumRole({ board, grants: [grant], viewerDid: "did:someone" })).toBe("moderator");
      expect(canModerateForumBoard({ board, grants: [grant], viewerDid: "did:someone" })).toBe(true);
    });

    it("board owner grant always takes precedence over membership", () => {
      const board = makeBoard();
      const grant: ForumRecord<CreatonForumRoleGrantRecord> = {
        uri: "at://did:owner/app.creaton.forum.roleGrant/grant-owner",
        cid: "grant-cid",
        value: {
          $type: CREATON_FORUM_ROLE_GRANT_COLLECTION,
          board: { uri: boardUri, cid: "board-cid" },
          subject: "did:coadmin",
          role: "owner",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      };

      expect(getForumRole({ board, grants: [grant], viewerDid: "did:coadmin" })).toBe("owner");
    });

    it("ignores a revoked grant", () => {
      const board = makeBoard();
      const grant: ForumRecord<CreatonForumRoleGrantRecord> = {
        uri: "at://did:owner/app.creaton.forum.roleGrant/grant-revoked",
        cid: "grant-cid",
        value: {
          $type: CREATON_FORUM_ROLE_GRANT_COLLECTION,
          board: { uri: boardUri, cid: "board-cid" },
          subject: "did:exmod",
          role: "moderator",
          createdAt: "2026-01-01T00:00:00.000Z",
          revokedAt: "2026-06-01T00:00:00.000Z",
        },
      };

      expect(getForumRole({ board, grants: [grant], viewerDid: "did:exmod" })).toBe("member");
      expect(canModerateForumBoard({ board, grants: [grant], viewerDid: "did:exmod" })).toBe(false);
    });

    it("ignores a grant that points to a different board", () => {
      const board = makeBoard();
      const grant: ForumRecord<CreatonForumRoleGrantRecord> = {
        uri: "at://did:owner/app.creaton.forum.roleGrant/grant-other",
        cid: "grant-cid",
        value: {
          $type: CREATON_FORUM_ROLE_GRANT_COLLECTION,
          board: { uri: "at://did:owner/app.creaton.forum.board/other", cid: "other-cid" },
          subject: "did:someone",
          role: "moderator",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      };

      expect(getForumRole({ board, grants: [grant], viewerDid: "did:someone" })).toBe("member");
    });

    it("ignores a grant from a repo that did not author the board", () => {
      const board = makeBoard();
      const grant: ForumRecord<CreatonForumRoleGrantRecord> = {
        uri: "at://did:attacker/app.creaton.forum.roleGrant/grant-mod",
        cid: "grant-cid",
        value: {
          $type: CREATON_FORUM_ROLE_GRANT_COLLECTION,
          board: { uri: boardUri, cid: "board-cid" },
          subject: "did:someone",
          role: "moderator",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      };

      expect(getForumRole({ board, grants: [grant], viewerDid: "did:someone" })).toBe("member");
      expect(canModerateForumBoard({ board, grants: [grant], viewerDid: "did:someone" })).toBe(false);
    });

    it("authoritative grant overrides advisory membership role", () => {
      const board = makeBoard();
      const membership: ForumRecord<CreatonForumMemberRecord> = {
        uri: "at://did:mod/app.creaton.forum.member/self",
        cid: "cid",
        value: {
          $type: CREATON_FORUM_MEMBER_COLLECTION,
          board: { uri: boardUri, cid: "board-cid" },
          role: "member",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      };
      const grant: ForumRecord<CreatonForumRoleGrantRecord> = {
        uri: "at://did:owner/app.creaton.forum.roleGrant/grant-promote",
        cid: "grant-cid",
        value: {
          $type: CREATON_FORUM_ROLE_GRANT_COLLECTION,
          board: { uri: boardUri, cid: "board-cid" },
          subject: "did:mod",
          role: "moderator",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      };

      // Grant says moderator even though membership says "member" — grant wins.
      expect(
        getForumRole({ board, membership, grants: [grant], viewerDid: "did:mod" }),
      ).toBe("moderator");
    });
  });
});
