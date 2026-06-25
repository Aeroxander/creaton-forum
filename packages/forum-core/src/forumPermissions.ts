import type {
  CreatonForumBoardRecord,
  CreatonForumMemberRecord,
  CreatonForumRoleGrantRecord,
} from "./forumTypes";

import type { ForumRecord } from "./forumRepository";
import { parseAtUri } from "./forumRepository";

export type ForumRole = "member" | "moderator" | "owner";
export type ForumRank =
  | "New member"
  | "Member"
  | "Regular"
  | "Trusted"
  | "Moderator"
  | "Owner";

/**
 * Resolve the viewer's display role within a forum board.
 *
 * Precedence:
 *  1. Board owner (the DID that authored the board record)
 *  2. Authoritative roleGrant from the board owner's repo (verified: grant lives
 *     in the same repo as the board, so only the owner could have written it)
 *  3. Self-asserted member.role (advisory — anyone can set this on their own
 *     member record, so it must not be trusted for enforcement on its own)
 *  4. member (default)
 */
export function getForumRole({
  board,
  membership,
  grants,
  viewerDid,
}: {
  board?: ForumRecord<CreatonForumBoardRecord> | null;
  membership?: ForumRecord<CreatonForumMemberRecord> | null;
  grants?: ForumRecord<CreatonForumRoleGrantRecord>[] | null;
  viewerDid?: string;
}): ForumRole {
  // 1. Board record creator is always owner.
  const boardOwnerDid = board ? parseAtUri(board.uri)?.did : undefined;
  if (viewerDid && boardOwnerDid === viewerDid) return "owner";

  // 2. Authoritative grant (written by the board owner into their own repo).
  if (viewerDid && grants?.length) {
    const grant = grants.find(
      (g) =>
        parseAtUri(g.uri)?.did === boardOwnerDid &&
        !g.value.revokedAt &&
        g.value.subject === viewerDid &&
        g.value.board?.uri === board?.uri,
    );
    if (grant?.value.role === "owner") return "owner";
    if (grant?.value.role === "moderator") return "moderator";
  }

  // 3. Self-asserted member role (advisory only — for display, not enforcement).
  if (membership?.value.role === "owner") return "owner";
  if (membership?.value.role === "moderator") return "moderator";

  return "member";
}

export function getForumAuthorityRole({
  board,
  grants,
  viewerDid,
}: {
  board?: ForumRecord<CreatonForumBoardRecord> | null;
  grants?: ForumRecord<CreatonForumRoleGrantRecord>[] | null;
  viewerDid?: string;
}): ForumRole {
  const boardOwnerDid = board ? parseAtUri(board.uri)?.did : undefined;
  if (viewerDid && boardOwnerDid === viewerDid) return "owner";

  if (viewerDid && grants?.length) {
    const grant = grants.find(
      (g) =>
        parseAtUri(g.uri)?.did === boardOwnerDid &&
        !g.value.revokedAt &&
        g.value.subject === viewerDid &&
        g.value.board?.uri === board?.uri,
    );
    if (grant?.value.role === "owner") return "owner";
    if (grant?.value.role === "moderator") return "moderator";
  }

  return "member";
}

export function canModerateForumBoard(input: {
  board?: ForumRecord<CreatonForumBoardRecord> | null;
  membership?: ForumRecord<CreatonForumMemberRecord> | null;
  grants?: ForumRecord<CreatonForumRoleGrantRecord>[] | null;
  viewerDid?: string;
}) {
  const role = getForumAuthorityRole(input);
  return role === "owner" || role === "moderator";
}

export function forumRankLabel({
  karma = 0,
  role = "member",
}: {
  karma?: number | null;
  role?: ForumRole;
}): ForumRank {
  const totalKarma = karma ?? 0;
  if (role === "owner") return "Owner";
  if (role === "moderator") return "Moderator";
  if (totalKarma >= 500) return "Trusted";
  if (totalKarma >= 100) return "Regular";
  if (totalKarma > 0) return "Member";
  return "New member";
}
