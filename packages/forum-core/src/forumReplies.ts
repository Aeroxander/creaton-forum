import type {
  ForumRecord,
  ForumVoteSummary,
} from "./forumRepository";
import type { CreatonForumCommentRecord } from "./forumTypes";

export type ForumReplyMode = "chronological" | "top-voted" | "op" | "following";

export type CommentTreeNode = {
  comment: ForumRecord<CreatonForumCommentRecord>;
  score: ForumVoteSummary;
  children: CommentTreeNode[];
};

export type CommentTreeOptions = {
  followedDids?: Set<string>;
  topicAuthorDid?: string;
};

export function forumRecordAuthorDid(uri: string) {
  return uri.match(/^at:\/\/([^/]+)/)?.[1] ?? uri;
}

export function emptyVoteSummary(subjectUri: string): ForumVoteSummary {
  return { subjectUri, up: 0, down: 0, score: 0 };
}

export function buildCommentTree(
  comments: ForumRecord<CreatonForumCommentRecord>[],
  votes: Map<string, ForumVoteSummary> | undefined,
  mode: ForumReplyMode,
  options: CommentTreeOptions = {},
) {
  const filtered = filterComments(comments, mode, options);
  const roots = buildTree(filtered, votes);
  sortTree(roots, mode === "top-voted" ? "top-voted" : "chronological");
  return roots;
}

export function buildFocusedCommentBranch(
  comments: ForumRecord<CreatonForumCommentRecord>[],
  votes: Map<string, ForumVoteSummary> | undefined,
  focusedCommentUri: string | null,
  mode: ForumReplyMode,
) {
  if (!focusedCommentUri) return [];

  const roots = buildTree(comments, votes);
  sortTree(roots, mode === "top-voted" ? "top-voted" : "chronological");

  const byUri = new Map<string, CommentTreeNode>();
  const index = (nodes: CommentTreeNode[]) => {
    for (const node of nodes) {
      byUri.set(node.comment.uri, node);
      index(node.children);
    }
  };
  index(roots);

  const focused = byUri.get(focusedCommentUri);
  if (!focused) return [];

  let branch = cloneNode(focused);
  let parentUri = focused.comment.value.parent?.uri;
  while (parentUri) {
    const parent = byUri.get(parentUri);
    if (!parent) break;
    branch = cloneNode(parent, [branch]);
    parentUri = parent.comment.value.parent?.uri;
  }
  return [branch];
}

export function countDescendants(node: CommentTreeNode): number {
  return node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
}

function filterComments(
  comments: ForumRecord<CreatonForumCommentRecord>[],
  mode: ForumReplyMode,
  options: CommentTreeOptions,
) {
  if (mode === "op") {
    return comments.filter(
      (comment) => forumRecordAuthorDid(comment.uri) === options.topicAuthorDid,
    );
  }
  if (mode === "following") {
    return comments.filter((comment) =>
      options.followedDids?.has(forumRecordAuthorDid(comment.uri)),
    );
  }
  return comments;
}

function buildTree(
  comments: ForumRecord<CreatonForumCommentRecord>[],
  votes: Map<string, ForumVoteSummary> | undefined,
) {
  const nodes = new Map<string, CommentTreeNode>();
  for (const comment of comments) {
    nodes.set(comment.uri, {
      comment,
      score: votes?.get(comment.uri) ?? emptyVoteSummary(comment.uri),
      children: [],
    });
  }

  const roots: CommentTreeNode[] = [];
  for (const node of nodes.values()) {
    const parentUri = node.comment.value.parent?.uri;
    const parent = parentUri ? nodes.get(parentUri) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

function sortTree(nodes: CommentTreeNode[], mode: "chronological" | "top-voted") {
  nodes.sort((a, b) => {
    if (mode === "top-voted") {
      const score = b.score.score - a.score.score;
      if (score !== 0) return score;
    }
    return a.comment.value.createdAt.localeCompare(b.comment.value.createdAt);
  });
  for (const node of nodes) sortTree(node.children, mode);
}

function cloneNode(
  node: CommentTreeNode,
  children: CommentTreeNode[] = node.children.map((child) => cloneNode(child)),
): CommentTreeNode {
  return {
    comment: node.comment,
    score: node.score,
    children,
  };
}
