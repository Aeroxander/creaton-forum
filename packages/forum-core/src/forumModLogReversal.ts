import { resolveTopicState } from "./forumSort";
import {
  parseAtUri,
  resolveForumSubjectVisibility,
  type ForumRecord,
  type ForumReviewAction,
} from "./forumRepository";
import type {
  CreatonForumBoardReportRecord,
  CreatonForumModActionRecord,
  CreatonForumModLogRecord,
  CreatonForumReviewActionRecord,
  CreatonForumTopicRecord,
} from "./forumTypes";
import type { StrongRef } from "./forumTypes";

export type ForumModLogReversal =
  | { type: "review"; subject: StrongRef; action: ForumReviewAction; reopenReport?: StrongRef }
  | {
      type: "moderation";
      subject: StrongRef;
      patch: { pinned?: boolean; status?: CreatonForumTopicRecord["status"] };
    }
  | { type: "report"; report: StrongRef; switchToReports?: boolean };

export function getForumModLogReversal(
  entry: ForumRecord<CreatonForumModLogRecord>,
  context: {
    reviewActionsBySubject: Map<string, ForumRecord<CreatonForumReviewActionRecord>[]>;
    modActionsBySubject: Map<string, ForumRecord<CreatonForumModActionRecord>[]>;
    resolvedReportUris: Set<string>;
    resolvedReportsBySubjectUri: Map<string, StrongRef>;
    reportedSubjectByReportUri: Map<string, string>;
    topicDefaultsByUri: Map<string, Pick<CreatonForumTopicRecord, "pinned" | "status">>;
  },
): { label: string; reversal: ForumModLogReversal } | null {
  const { action, subject } = entry.value;

  const reviewMatch = action.match(/^review:(approve|reject|hide|restore)$/);
  if (reviewMatch && subject?.uri) {
    const reviewAction = reviewMatch[1] as ForumReviewAction;
    const reviewActions = context.reviewActionsBySubject.get(subject.uri);
    const visibility = resolveForumSubjectVisibility({
      authorDid: parseAtUri(subject.uri)?.did,
      reviewActions,
    });
    const latestReview = latestReviewAction(reviewActions);
    const reopenReport = context.resolvedReportsBySubjectUri.get(subject.uri);

    if (reviewAction === "hide" && visibility === "hidden" && latestReview === "hide") {
      return {
        label: reopenReport ? "Undo removal" : "Restore",
        reversal: {
          type: "review",
          subject,
          action: "restore",
          reopenReport,
        },
      };
    }
    if (reviewAction === "reject" && visibility === "hidden" && latestReview === "reject") {
      return { label: "Approve", reversal: { type: "review", subject, action: "approve" } };
    }
    if (reviewAction === "approve" && visibility === "visible" && latestReview === "approve") {
      return { label: "Reject", reversal: { type: "review", subject, action: "reject" } };
    }
    if (reviewAction === "restore" && visibility === "visible" && latestReview === "restore") {
      return { label: "Hide", reversal: { type: "review", subject, action: "hide" } };
    }
    return null;
  }

  if (
    (action === "pin" || action === "unpin" || action === "lock" || action === "unlock") &&
    subject?.uri
  ) {
    const topicDefault = context.topicDefaultsByUri.get(subject.uri) ?? {
      pinned: false,
      status: "open" as const,
    };
    const state = resolveTopicState(topicDefault, context.modActionsBySubject.get(subject.uri));

    if (action === "pin" && state.pinned) {
      return {
        label: "Unpin",
        reversal: { type: "moderation", subject, patch: { pinned: false } },
      };
    }
    if (action === "unpin" && !state.pinned) {
      return { label: "Pin", reversal: { type: "moderation", subject, patch: { pinned: true } } };
    }
    if (action === "lock" && state.status === "locked") {
      return {
        label: "Unlock",
        reversal: { type: "moderation", subject, patch: { status: "open" } },
      };
    }
    if (action === "unlock" && state.status !== "locked") {
      return {
        label: "Lock",
        reversal: { type: "moderation", subject, patch: { status: "locked" } },
      };
    }
    return null;
  }

  if (action === "report:resolve" && subject?.uri) {
    if (!context.resolvedReportUris.has(subject.uri)) return null;
    const reportedSubjectUri = context.reportedSubjectByReportUri.get(subject.uri);
    if (reportedSubjectUri) {
      const visibility = resolveForumSubjectVisibility({
        authorDid: parseAtUri(reportedSubjectUri)?.did,
        reviewActions: context.reviewActionsBySubject.get(reportedSubjectUri),
      });
      if (visibility === "hidden") return null;
    }
    return {
      label: "Reopen report",
      reversal: { type: "report", report: subject, switchToReports: true },
    };
  }

  return null;
}

export function buildForumReportReversalContext({
  boardReportActions,
  allBoardReports,
}: {
  boardReportActions: ForumRecord<import("./forumTypes").CreatonForumBoardReportActionRecord>[];
  allBoardReports: ForumRecord<CreatonForumBoardReportRecord>[];
}) {
  const reportsByUri = new Map(allBoardReports.map((report) => [report.uri, report]));
  const resolvedReportUris = new Set<string>();
  const resolvedReportsBySubjectUri = new Map<string, StrongRef>();
  const reportedSubjectByReportUri = new Map<string, string>();
  const latest = new Map<string, (typeof boardReportActions)[number]>();

  for (const action of boardReportActions) {
    const reportUri = action.value.report?.uri;
    if (!reportUri) continue;
    const existing = latest.get(reportUri);
    if (!existing || action.value.createdAt.localeCompare(existing.value.createdAt) >= 0) {
      latest.set(reportUri, action);
    }
  }

  for (const report of allBoardReports) {
    const subjectUri = report.value.subject?.uri;
    if (subjectUri) {
      reportedSubjectByReportUri.set(report.uri, subjectUri);
    }
  }

  for (const [reportUri, action] of latest) {
    if (action.value.action !== "resolve") continue;
    resolvedReportUris.add(reportUri);
    const report = reportsByUri.get(reportUri);
    const subjectUri = report?.value.subject?.uri;
    if (report && subjectUri) {
      resolvedReportsBySubjectUri.set(subjectUri, { uri: report.uri, cid: report.cid });
    }
  }

  return { resolvedReportUris, resolvedReportsBySubjectUri, reportedSubjectByReportUri };
}

function latestReviewAction(
  reviewActions: ForumRecord<CreatonForumReviewActionRecord>[] | undefined,
): ForumReviewAction | undefined {
  return [...(reviewActions ?? [])].sort((a, b) =>
    b.value.createdAt.localeCompare(a.value.createdAt),
  )[0]?.value.action;
}
