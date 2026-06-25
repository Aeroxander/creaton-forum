import { describe, expect, it } from "vitest";

import {
  CREATON_FORUM_BOARD_REPORT_ACTION_COLLECTION,
  CREATON_FORUM_BOARD_REPORT_COLLECTION,
  CREATON_FORUM_MOD_LOG_COLLECTION,
  CREATON_FORUM_REVIEW_ACTION_COLLECTION,
  type CreatonForumBoardReportActionRecord,
  type CreatonForumBoardReportRecord,
  type CreatonForumModLogRecord,
  type CreatonForumReviewActionRecord,
} from "./forumTypes";
import type { ForumRecord } from "./forumRepository";
import {
  buildForumReportReversalContext,
  getForumModLogReversal,
} from "./forumModLogReversal";

const board = { uri: "at://did:owner/app.creaton.forum.board/self", cid: "board-cid" };
const subject = { uri: "at://did:author/app.creaton.forum.comment/self", cid: "comment-cid" };
const report = {
  uri: "at://did:reporter/app.creaton.forum.boardReport/report-1",
  cid: "report-cid",
};

function logEntry(
  action: string,
  logSubject: { uri: string; cid: string } = subject,
): ForumRecord<CreatonForumModLogRecord> {
  return {
    uri: "at://did:mod/app.creaton.forum.modLog/log-1",
    cid: "log-cid",
    value: {
      $type: CREATON_FORUM_MOD_LOG_COLLECTION,
      board,
      subject: logSubject,
      action,
      createdAt: "2026-01-02T00:00:00.000Z",
    },
  };
}

function reviewAction(
  review: CreatonForumReviewActionRecord["action"],
  createdAt = "2026-01-02T00:00:00.000Z",
): ForumRecord<CreatonForumReviewActionRecord> {
  return {
    uri: "at://did:mod/app.creaton.forum.reviewAction/review-1",
    cid: "review-cid",
    value: {
      $type: CREATON_FORUM_REVIEW_ACTION_COLLECTION,
      board,
      subject,
      action: review,
      createdAt,
    },
  };
}

function boardReportRecord(): ForumRecord<CreatonForumBoardReportRecord> {
  return {
    uri: report.uri,
    cid: report.cid,
    value: {
      $type: CREATON_FORUM_BOARD_REPORT_COLLECTION,
      board,
      subject,
      reasonType: "rules",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  };
}

function reportAction(
  action: CreatonForumBoardReportActionRecord["action"],
  createdAt: string,
): ForumRecord<CreatonForumBoardReportActionRecord> {
  return {
    uri: "at://did:mod/app.creaton.forum.boardReportAction/action-1",
    cid: "action-cid",
    value: {
      $type: CREATON_FORUM_BOARD_REPORT_ACTION_COLLECTION,
      board,
      report,
      action,
      createdAt,
    },
  };
}

function reversalContext(
  overrides: Partial<ReturnType<typeof buildForumReportReversalContext>> & {
    reviewActionsBySubject?: Map<string, ForumRecord<CreatonForumReviewActionRecord>[]>;
  } = {},
) {
  const reportContext = buildForumReportReversalContext({
    boardReportActions: [reportAction("resolve", "2026-01-02T00:00:00.000Z")],
    allBoardReports: [boardReportRecord()],
  });
  return {
    reviewActionsBySubject: new Map([[subject.uri, [reviewAction("hide")]]]),
    modActionsBySubject: new Map(),
    topicDefaultsByUri: new Map(),
    ...reportContext,
    ...overrides,
  };
}

describe("getForumModLogReversal", () => {
  it("undoes a report removal by restoring content and reopening the report", () => {
    const reversal = getForumModLogReversal(logEntry("review:hide"), reversalContext());

    expect(reversal).toEqual({
      label: "Undo removal",
      reversal: {
        type: "review",
        subject,
        action: "restore",
        reopenReport: report,
      },
    });
  });

  it("does not offer restore after content was restored", () => {
    const reversal = getForumModLogReversal(
      logEntry("review:hide"),
      reversalContext({
        reviewActionsBySubject: new Map([
          [
            subject.uri,
            [
              reviewAction("hide", "2026-01-02T00:00:00.000Z"),
              reviewAction("restore", "2026-01-03T00:00:00.000Z"),
            ],
          ],
        ]),
      }),
    );

    expect(reversal).toBeNull();
  });

  it("reopens a dismissed report without a separate restore action", () => {
    const reversal = getForumModLogReversal(
      logEntry("report:resolve", report),
      reversalContext({
        reviewActionsBySubject: new Map(),
        resolvedReportsBySubjectUri: new Map(),
      }),
    );

    expect(reversal).toEqual({
      label: "Reopen report",
      reversal: { type: "report", report, switchToReports: true },
    });
  });

  it("hides reopen when the reported content is still hidden", () => {
    const reversal = getForumModLogReversal(
      logEntry("report:resolve", report),
      reversalContext(),
    );

    expect(reversal).toBeNull();
  });
});

describe("buildForumReportReversalContext", () => {
  it("treats a later reopen action as open", () => {
    const context = buildForumReportReversalContext({
      boardReportActions: [
        reportAction("resolve", "2026-01-02T00:00:00.000Z"),
        reportAction("reopen", "2026-01-03T00:00:00.000Z"),
      ],
      allBoardReports: [boardReportRecord()],
    });

    expect(context.resolvedReportUris.has(report.uri)).toBe(false);
    expect(context.resolvedReportsBySubjectUri.has(subject.uri)).toBe(false);
  });
});
