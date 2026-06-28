import type { Agent } from "@atproto/api";
import { TID } from "@atproto/common-web";

import {
  currentForumKeyEpoch,
  type EncryptedForumContent,
  encryptForumContent,
  generateForumEpochKey,
} from "./crypto/forumContentCrypto";
import { encryptForumAttachment } from "./crypto/forumAttachmentCrypto";
import type { LogosStorageClient } from "./storage/logosStorageClient";
import type { PackagedHlsBundle, VideoUploadProgress } from "./video/pdsVideoUpload";
import { uploadEncryptedForumVideoToPds } from "./video/encryptedVideoUpload";
import type { ForumKeyCapsule } from "./crypto/forumKeyCapsule";
import { createForumKeyCapsule } from "./crypto/forumKeyCapsule";
import {
  base64UrlToBytes,
  bytesToBase64Url,
} from "./crypto/sarmaV2";
import type { ForumModLogReversal } from "./forumModLogReversal";
import {
  CREATON_FORUM_BOARD_COLLECTION,
  CREATON_FORUM_BOARD_REPORT_ACTION_COLLECTION,
  CREATON_FORUM_BOARD_REPORT_COLLECTION,
  CREATON_FORUM_BOOKMARK_COLLECTION,
  CREATON_FORUM_COMMENT_COLLECTION,
  CREATON_FORUM_DIRECTORY_URI,
  CREATON_FORUM_KEY_CAPSULE_COLLECTION,
  CREATON_FORUM_KEY_GRANT_COLLECTION,
  CREATON_FORUM_MEMBER_COLLECTION,
  CREATON_FORUM_MOD_ACTION_COLLECTION,
  CREATON_FORUM_MOD_LOG_COLLECTION,
  CREATON_FORUM_REVIEW_ACTION_COLLECTION,
  CREATON_FORUM_ROLE_GRANT_COLLECTION,
  CREATON_FORUM_SANCTION_COLLECTION,
  CREATON_FORUM_SUBSCRIPTION_COLLECTION,
  CREATON_FORUM_TOPIC_COLLECTION,
  CREATON_FORUM_VOTE_COLLECTION,
  type CreatonForumBoardRecord,
  type CreatonForumBoardReportActionRecord,
  type CreatonForumBoardReportRecord,
  type CreatonForumBookmarkRecord,
  type CreatonForumCommentRecord,
  type CreatonForumKeyCapsuleRecord,
  type CreatonForumKeyGrantRecord,
  type CreatonForumMemberRecord,
  type CreatonForumModActionRecord,
  type CreatonForumModLogRecord,
  type CreatonForumReviewActionRecord,
  type CreatonForumRoleGrantRecord,
  type CreatonForumSanctionRecord,
  type CreatonForumSubscriptionRecord,
  type CreatonForumTopicRecord,
  type CreatonForumVideoAsset,
  type CreatonForumVoteRecord,
  type CreatonForumEncryptedContentV3,
  type StrongRef,
} from "./forumTypes";

export type ForumRecord<T> = {
  uri: string;
  cid: string;
  value: T;
};

export type ForumTopicStatePatch = Pick<
  Partial<CreatonForumTopicRecord>,
  "movedTo" | "pinned" | "status"
>;

export type ForumModerationStatePatch = Pick<
  Partial<CreatonForumTopicRecord>,
  "movedTo" | "pinned" | "status"
> & { note?: string };

export type ForumBoardReportReason = CreatonForumBoardReportRecord["reasonType"];
export type ForumSanctionKind = CreatonForumSanctionRecord["kind"];
export type ForumReviewAction = CreatonForumReviewActionRecord["action"];
export type ForumSubjectVisibility = "visible" | "pending" | "hidden";

type CreateRecordResponse = {
  uri: string;
  cid: string;
};

type RepoAgent = Agent & {
  did?: string;
  com: {
    atproto: {
      repo: {
        createRecord: (input: {
          repo: string;
          collection: string;
          record: unknown;
          rkey?: string;
        }) => Promise<{ data?: CreateRecordResponse } & CreateRecordResponse>;
        putRecord?: (input: {
          repo: string;
          collection: string;
          rkey: string;
          swapRecord?: string;
          record: unknown;
        }) => Promise<{ data?: CreateRecordResponse } & CreateRecordResponse>;
        listRecords?: (input: {
          repo: string;
          collection: string;
          limit?: number;
          cursor?: string;
        }) => Promise<{ data: { records: { uri: string; value: unknown }[]; cursor?: string } }>;
        deleteRecord?: (input: {
          repo: string;
          collection: string;
          rkey: string;
        }) => Promise<unknown>;
      };
    };
  };
};

type ListRecordsResponse<T> = {
  records: { uri: string; cid: string; value: T }[];
  cursor?: string;
};

export async function listAgentForumBoards(
  agent: Agent,
): Promise<ForumRecord<CreatonForumBoardRecord>[]> {
  const repoAgent = requireRepoAgent(agent);
  if (!repoAgent.com.atproto.repo.listRecords) return [];
  const records = await listAgentRecords<CreatonForumBoardRecord>(
    repoAgent,
    CREATON_FORUM_BOARD_COLLECTION,
  );
  return records
    .filter((record) => record.cid)
    .map((record) => ({
      uri: record.uri,
      cid: record.cid!,
      value: record.value,
    }));
}

export async function discoverForumBoards({
  agent,
  constellation,
  slingshoturl,
}: {
  agent?: Agent | null;
  constellation?: string;
  slingshoturl?: string;
}) {
  let remote: ForumRecord<CreatonForumBoardRecord>[] = [];
  if (constellation) {
    try {
      remote = await listRemoteRecordsForSubject<CreatonForumBoardRecord>({
        target: CREATON_FORUM_DIRECTORY_URI,
        collection: CREATON_FORUM_BOARD_COLLECTION,
        path: ".directoryUri",
        constellation: requireConstellation(constellation),
        slingshoturl,
      });
    } catch {
      remote = [];
    }
  }

  const local = agent ? await listAgentForumBoards(agent) : [];
  return dedupeRecords([...remote, ...local]).sort((a, b) =>
    (b.value.updatedAt ?? b.value.createdAt).localeCompare(
      a.value.updatedAt ?? a.value.createdAt,
    ),
  );
}

export async function getForumBoard({
  did,
  rkey,
  slingshoturl,
}: {
  did: string;
  rkey: string;
  slingshoturl?: string;
}): Promise<ForumRecord<CreatonForumBoardRecord> | null> {
  return getRecord<CreatonForumBoardRecord>({
    repo: did,
    collection: CREATON_FORUM_BOARD_COLLECTION,
    rkey,
    slingshoturl,
  });
}

export async function listForumTopics({
  board,
  constellation,
  slingshoturl,
}: {
  board: StrongRef;
  constellation?: string;
  slingshoturl?: string;
}) {
  const records = await listRemoteRecordsForSubject<CreatonForumTopicRecord>({
    target: board.uri,
    collection: CREATON_FORUM_TOPIC_COLLECTION,
    path: ".board.uri",
    constellation: requireConstellation(constellation),
    slingshoturl,
  });
  return dedupeRecords(records)
    .filter((topic) => topic.value.board?.uri === board.uri)
    .sort((a, b) =>
      (b.value.updatedAt ?? b.value.createdAt).localeCompare(
        a.value.updatedAt ?? a.value.createdAt,
      ),
    );
}

export async function getForumTopic({
  did,
  rkey,
  slingshoturl,
}: {
  did: string;
  rkey: string;
  slingshoturl?: string;
}): Promise<ForumRecord<CreatonForumTopicRecord> | null> {
  return getRecord<CreatonForumTopicRecord>({
    repo: did,
    collection: CREATON_FORUM_TOPIC_COLLECTION,
    rkey,
    slingshoturl,
  });
}

export async function getForumKeyCapsule({
  uri,
  slingshoturl,
}: {
  uri: string;
  slingshoturl?: string;
}): Promise<ForumRecord<CreatonForumKeyCapsuleRecord> | null> {
  const parsed = parseAtUri(uri);
  if (!parsed || parsed.collection !== CREATON_FORUM_KEY_CAPSULE_COLLECTION) {
    throw new Error("Invalid forum key capsule URI.");
  }
  return getRecord<CreatonForumKeyCapsuleRecord>({
    repo: parsed.did,
    collection: parsed.collection,
    rkey: parsed.rkey,
    slingshoturl,
  });
}

export function forumKeyCapsuleFromRecord(
  uri: string,
  record: CreatonForumKeyCapsuleRecord,
): ForumKeyCapsule {
  const parsed = parseAtUri(uri);
  if (!parsed || parsed.collection !== CREATON_FORUM_KEY_CAPSULE_COLLECTION) {
    throw new Error("Invalid forum key capsule record.");
  }
  return {
    version: record.version,
    suite: record.suite,
    boardUri: record.board.uri,
    recordUri: record.recordUri,
    committeeEpoch: record.committeeEpoch,
    policyHash: bytesToHex(base64UrlToBytes(record.policyHash.$bytes)),
    encapsulation: record.encapsulation.$bytes,
    nonce: record.nonce.$bytes,
    ciphertext: record.ciphertext.$bytes,
    keyCommitment: record.keyCommitment.$bytes,
    createdAt: record.createdAt,
  };
}

export function encryptedForumContentFromRecord(
  value: CreatonForumTopicRecord["protectedBody"],
): EncryptedForumContent {
  if (!value || value.version !== 3) {
    throw new Error("Unsupported protected forum content record.");
  }
  return {
    ...value,
    salt: value.salt.$bytes,
    nonce: value.nonce.$bytes,
    ciphertext: value.ciphertext.$bytes,
  };
}

export async function listForumComments({
  topic,
  constellation,
  slingshoturl,
}: {
  topic: StrongRef;
  constellation?: string;
  slingshoturl?: string;
}) {
  const records = await listRemoteRecordsForSubject<CreatonForumCommentRecord>({
    target: topic.uri,
    collection: CREATON_FORUM_COMMENT_COLLECTION,
    path: ".topic.uri",
    constellation: requireConstellation(constellation),
    slingshoturl,
  });

  return dedupeRecords(records)
    .filter((comment) => comment.value.topic?.uri === topic.uri)
    .sort((a, b) => a.value.createdAt.localeCompare(b.value.createdAt));
}

export type ForumVoteSummary = {
  subjectUri: string;
  up: number;
  down: number;
  score: number;
  viewerVote?: "up" | "down";
};

export async function listForumVotes({
  agent,
  subjects,
  constellation,
  slingshoturl,
}: {
  agent?: Agent | null;
  subjects: StrongRef[];
  constellation?: string;
  slingshoturl?: string;
}) {
  const subjectUris = new Set(subjects.map((subject) => subject.uri));
  const summaries = new Map<string, ForumVoteSummary>();
  for (const uri of subjectUris) {
    summaries.set(uri, { subjectUri: uri, up: 0, down: 0, score: 0 });
  }

  const remoteVotes = await Promise.all(
    subjects.map((subject) =>
      listRemoteRecordsForSubject<CreatonForumVoteRecord>({
        target: subject.uri,
        collection: CREATON_FORUM_VOTE_COLLECTION,
        path: ".subject.uri",
        constellation: requireConstellation(constellation),
        slingshoturl,
      }),
    ),
  );
  const votes = remoteVotes.flat();

  for (const vote of dedupeRecords(votes)) {
    const subjectUri = vote.value.subject?.uri;
    if (!subjectUri || !subjectUris.has(subjectUri)) continue;
    const summary = summaries.get(subjectUri);
    if (!summary) continue;
    if (vote.value.direction === "up") summary.up += 1;
    else if (vote.value.direction === "down") summary.down += 1;
    if (agent?.did && parseAtUri(vote.uri)?.did === agent.did) {
      summary.viewerVote = vote.value.direction;
    }
  }

  for (const summary of summaries.values()) {
    summary.score = summary.up - summary.down;
  }
  return summaries;
}

export async function voteOnForumSubject(
  agent: Agent,
  input: { subject: StrongRef; direction: "up" | "down" },
) {
  const repoAgent = requireRepoAgent(agent);
  if (!repoAgent.com.atproto.repo.putRecord) {
    throw new Error("This session cannot write forum votes.");
  }
  const record: CreatonForumVoteRecord = {
    $type: CREATON_FORUM_VOTE_COLLECTION,
    subject: input.subject,
    direction: input.direction,
    createdAt: new Date().toISOString(),
  };
  const response = await repoAgent.com.atproto.repo.putRecord({
    repo: repoAgent.did!,
    collection: CREATON_FORUM_VOTE_COLLECTION,
    rkey: voteRkey(input.subject.uri),
    record,
  });
  const ref = unwrapCreateResponse(response);
  return { ...ref, value: record };
}

export async function createForumBoard(
  agent: Agent,
  input: {
    title: string;
    description?: string;
    scope?: "standalone" | "creator";
    creatorBoard?: CreatonForumBoardRecord["creatorBoard"];
    postingMode?: "public" | "mixed" | "encrypted";
    access?: CreatonForumBoardRecord["access"];
  },
) {
  const repoAgent = requireRepoAgent(agent);
  const now = new Date().toISOString();
  const record: CreatonForumBoardRecord = {
    $type: CREATON_FORUM_BOARD_COLLECTION,
    title: input.title.trim(),
    description: input.description?.trim(),
    slug: slugFor(input.title),
    directoryUri: CREATON_FORUM_DIRECTORY_URI,
    scope: input.scope ?? "standalone",
    creatorBoard: input.creatorBoard,
    postingMode: input.postingMode ?? "public",
    access: input.access,
    createdAt: now,
  };
  const board = await createRecord<CreatonForumBoardRecord>(repoAgent, {
    collection: CREATON_FORUM_BOARD_COLLECTION,
    record,
  });
  try {
    await joinForumBoard(agent, { uri: board.uri, cid: board.cid });
  } catch {
    // Board still exists even if auto-join fails (e.g. OAuth without putRecord).
  }
  return board;
}

export async function createForumTopic(
  agent: Agent,
  input: { board: StrongRef; title: string; body?: string; video?: CreatonForumVideoAsset },
) {
  const repoAgent = requireRepoAgent(agent);
  const record: CreatonForumTopicRecord = {
    $type: CREATON_FORUM_TOPIC_COLLECTION,
    board: input.board,
    title: input.title.trim(),
    body: input.body?.trim(),
    video: input.video,
    createdAt: new Date().toISOString(),
  };
  return createRecord<CreatonForumTopicRecord>(repoAgent, {
    collection: CREATON_FORUM_TOPIC_COLLECTION,
    record,
  });
}

export type ForumEncryptionParameters = {
  committeeEpoch: number;
  policyHash: string;
  committeePublicKey?: string;
};

export type EncryptedForumVideoBundleInput = {
  bundle: PackagedHlsBundle;
  pdsUrl: string;
  onProgress?: (progress: VideoUploadProgress) => void;
};

export async function createEncryptedForumTopic(
  agent: Agent,
  input: {
    board: StrongRef;
    title: string;
    body: string;
    encryption: ForumEncryptionParameters;
    attachments?: File[];
    logosClient?: LogosStorageClient;
    encryptedVideo?: EncryptedForumVideoBundleInput;
  },
) {
  const repoAgent = requireRepoAgent(agent);
  const topicRkey = TID.next().toString();
  const capsuleRkey = TID.next().toString();
  const topicUri = `at://${repoAgent.did}/${CREATON_FORUM_TOPIC_COLLECTION}/${topicRkey}`;
  const capsuleUri = `at://${repoAgent.did}/${CREATON_FORUM_KEY_CAPSULE_COLLECTION}/${capsuleRkey}`;
  const createdAt = new Date().toISOString();
  const contentKey = generateForumEpochKey();
  const capsule = await createForumKeyCapsule({
    contentKey,
    boardUri: input.board.uri,
    recordUri: topicUri,
    capsuleUri,
    committeeEpoch: input.encryption.committeeEpoch,
    policyHash: input.encryption.policyHash,
    committeePublicKey: input.encryption.committeePublicKey,
    createdAt,
  });
  const protectedBody = await encryptForumContent({
    plaintext: input.body.trim(),
    epochKey: contentKey,
    context: {
      boardUri: input.board.uri,
      recordUri: topicUri,
      recordType: "topic",
      epoch: currentForumKeyEpoch(new Date(createdAt)),
      committeeEpoch: input.encryption.committeeEpoch,
      keyCapsuleUri: capsuleUri,
    },
  });
  const protectedAttachments =
    input.attachments?.length && input.logosClient
      ? await Promise.all(
          input.attachments.map((file) =>
            encryptForumAttachment({
              file,
              boardEpochKey: contentKey,
              keyEpochUri: capsuleUri,
              logosClient: input.logosClient!,
              epoch: currentForumKeyEpoch(new Date(createdAt)),
            }),
          ),
        )
      : undefined;
  const epoch = currentForumKeyEpoch(new Date(createdAt));
  let video: CreatonForumVideoAsset | undefined;
  if (input.encryptedVideo) {
    video = await uploadEncryptedForumVideoToPds(agent, {
      bundle: input.encryptedVideo.bundle,
      pdsUrl: input.encryptedVideo.pdsUrl,
      boardEpochKey: contentKey,
      keyEpochUri: capsuleUri,
      epoch,
      onProgress: input.encryptedVideo.onProgress,
    });
  }
  await createRecord(repoAgent, {
    collection: CREATON_FORUM_KEY_CAPSULE_COLLECTION,
    rkey: capsuleRkey,
    record: capsuleToRecord(capsule, input.board),
  });
  try {
    return await createRecord<CreatonForumTopicRecord>(repoAgent, {
      collection: CREATON_FORUM_TOPIC_COLLECTION,
      rkey: topicRkey,
      record: {
        $type: CREATON_FORUM_TOPIC_COLLECTION,
        board: input.board,
        title: input.title.trim(),
        protectedBody: encryptedContentToRecord(protectedBody),
        protectedAttachments,
        video,
        createdAt,
      },
    });
  } catch (error) {
    await repoAgent.com.atproto.repo.deleteRecord?.({
      repo: repoAgent.did!, collection: CREATON_FORUM_KEY_CAPSULE_COLLECTION, rkey: capsuleRkey,
    }).catch(() => undefined);
    throw error;
  }
}

export async function createForumComment(
  agent: Agent,
  input: { topic: StrongRef; parent?: StrongRef; body: string; video?: CreatonForumVideoAsset },
) {
  const repoAgent = requireRepoAgent(agent);
  const record: CreatonForumCommentRecord = {
    $type: CREATON_FORUM_COMMENT_COLLECTION,
    topic: input.topic,
    parent: input.parent,
    body: input.body.trim(),
    video: input.video,
    createdAt: new Date().toISOString(),
  };
  return createRecord<CreatonForumCommentRecord>(repoAgent, {
    collection: CREATON_FORUM_COMMENT_COLLECTION,
    record,
  });
}

export async function createEncryptedForumComment(
  agent: Agent,
  input: {
    board: StrongRef;
    topic: StrongRef;
    parent?: StrongRef;
    body: string;
    encryption: ForumEncryptionParameters;
    attachments?: File[];
    logosClient?: LogosStorageClient;
    encryptedVideo?: EncryptedForumVideoBundleInput;
  },
) {
  const repoAgent = requireRepoAgent(agent);
  const commentRkey = TID.next().toString();
  const capsuleRkey = TID.next().toString();
  const commentUri = `at://${repoAgent.did}/${CREATON_FORUM_COMMENT_COLLECTION}/${commentRkey}`;
  const capsuleUri = `at://${repoAgent.did}/${CREATON_FORUM_KEY_CAPSULE_COLLECTION}/${capsuleRkey}`;
  const createdAt = new Date().toISOString();
  const contentKey = generateForumEpochKey();
  const capsule = await createForumKeyCapsule({
    contentKey,
    boardUri: input.board.uri,
    recordUri: commentUri,
    capsuleUri,
    committeeEpoch: input.encryption.committeeEpoch,
    policyHash: input.encryption.policyHash,
    committeePublicKey: input.encryption.committeePublicKey,
    createdAt,
  });
  const protectedBody = await encryptForumContent({
    plaintext: input.body.trim(), epochKey: contentKey,
    context: {
      boardUri: input.board.uri, recordUri: commentUri, recordType: "comment",
      epoch: currentForumKeyEpoch(new Date(createdAt)),
      committeeEpoch: input.encryption.committeeEpoch, keyCapsuleUri: capsuleUri,
    },
  });
  const protectedAttachments =
    input.attachments?.length && input.logosClient
      ? await Promise.all(
          input.attachments.map((file) =>
            encryptForumAttachment({
              file,
              boardEpochKey: contentKey,
              keyEpochUri: capsuleUri,
              logosClient: input.logosClient!,
              epoch: currentForumKeyEpoch(new Date(createdAt)),
            }),
          ),
        )
      : undefined;
  const epoch = currentForumKeyEpoch(new Date(createdAt));
  let video: CreatonForumVideoAsset | undefined;
  if (input.encryptedVideo) {
    video = await uploadEncryptedForumVideoToPds(agent, {
      bundle: input.encryptedVideo.bundle,
      pdsUrl: input.encryptedVideo.pdsUrl,
      boardEpochKey: contentKey,
      keyEpochUri: capsuleUri,
      epoch,
      onProgress: input.encryptedVideo.onProgress,
    });
  }
  await createRecord(repoAgent, {
    collection: CREATON_FORUM_KEY_CAPSULE_COLLECTION,
    rkey: capsuleRkey,
    record: capsuleToRecord(capsule, input.board),
  });
  try {
    return await createRecord<CreatonForumCommentRecord>(repoAgent, {
      collection: CREATON_FORUM_COMMENT_COLLECTION,
      rkey: commentRkey,
      record: {
        $type: CREATON_FORUM_COMMENT_COLLECTION,
        topic: input.topic,
        parent: input.parent,
        protectedBody: encryptedContentToRecord(protectedBody),
        protectedAttachments,
        video,
        createdAt,
      },
    });
  } catch (error) {
    await repoAgent.com.atproto.repo.deleteRecord?.({
      repo: repoAgent.did!, collection: CREATON_FORUM_KEY_CAPSULE_COLLECTION, rkey: capsuleRkey,
    }).catch(() => undefined);
    throw error;
  }
}

export async function createForumKeyGrant(
  agent: Agent,
  input: {
    board: StrongRef;
    grantId: string;
    sessionKeyHash: string;
    certificateHash: string;
    epochFrom: string;
    epochTo: string;
    expiresAt: string;
    enc: string;
    ciphertext: string;
    keyCommitment: string;
    createdAt?: string;
  },
) {
  const repoAgent = requireRepoAgent(agent);
  const record: CreatonForumKeyGrantRecord = {
    $type: CREATON_FORUM_KEY_GRANT_COLLECTION,
    board: input.board,
    grantId: input.grantId,
    sessionKeyHash: { $bytes: input.sessionKeyHash },
    certificateHash: { $bytes: input.certificateHash },
    epochFrom: input.epochFrom,
    epochTo: input.epochTo,
    expiresAt: input.expiresAt,
    version: 2,
    suite: "DHKEM-P256-HKDF-SHA256/HKDF-SHA256/AES-256-GCM",
    enc: { $bytes: input.enc },
    ciphertext: { $bytes: input.ciphertext },
    keyCommitment: { $bytes: input.keyCommitment },
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  return createRecord<CreatonForumKeyGrantRecord>(repoAgent, {
    collection: CREATON_FORUM_KEY_GRANT_COLLECTION,
    record,
  });
}

export async function listForumKeyGrants(
  agent: Agent,
  input: { board: StrongRef },
): Promise<ForumRecord<CreatonForumKeyGrantRecord>[]> {
  if (!agent.did) throw new Error("ATProto authentication is required.");
  const repoAgent = requireRepoAgent(agent);
  if (!repoAgent.com.atproto.repo.listRecords) {
    throw new Error("This session cannot list forum records.");
  }
  const response = await repoAgent.com.atproto.repo.listRecords({
    repo: repoAgent.did!,
    collection: CREATON_FORUM_KEY_GRANT_COLLECTION,
    limit: 100,
  });
  return (response.data.records as { uri: string; cid: string; value: CreatonForumKeyGrantRecord }[])
    .filter((record) => record.value.board?.uri === input.board.uri)
    .map((record) => ({ uri: record.uri, cid: record.cid, value: record.value }));
}

export async function requestForumKeyRelease(input: {
  issuerEndpoint: string;
  boardUri: string;
  epochFrom: string;
  epochTo: string;
  committeeEpoch: number;
  eligibilityBlock: string;
  certificate: unknown;
  authToken: string;
}) {
  const endpoint = new URL("/xrpc/app.creaton.forum.requestKeyRelease", input.issuerEndpoint);
  const response = await fetch(endpoint.toString(), {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.authToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      boardUri: input.boardUri,
      epochFrom: input.epochFrom,
      epochTo: input.epochTo,
      committeeEpoch: input.committeeEpoch,
      eligibilityBlock: input.eligibilityBlock,
      certificate: input.certificate,
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => `HTTP ${response.status}`);
    throw new Error(`Forum key release request failed: ${body}`);
  }
  return response.json() as Promise<{
    receipt: {
      requestId: string;
      requestHash: string;
      boardUri: string;
      subjectHash: string;
      committeeEpoch: number;
      eligibilityBlock: string;
      policyHash: string;
      expiresAt: string;
    };
    shares: unknown[];
  }>;
}

export async function updateForumTopicState(
  agent: Agent,
  input: { topic: ForumRecord<CreatonForumTopicRecord>; patch: ForumTopicStatePatch },
) {
  const repoAgent = requireRepoAgent(agent);
  if (!repoAgent.com.atproto.repo.putRecord) {
    throw new Error("This session cannot update forum topics.");
  }
  const parsed = parseAtUri(input.topic.uri);
  if (!parsed || parsed.collection !== CREATON_FORUM_TOPIC_COLLECTION) {
    throw new Error("Forum topic URI is invalid.");
  }
  if (parsed.did !== repoAgent.did) {
    throw new Error("Only the topic author can update this topic right now.");
  }
  const record: CreatonForumTopicRecord = {
    ...input.topic.value,
    ...input.patch,
    updatedAt: new Date().toISOString(),
  };
  const response = await repoAgent.com.atproto.repo.putRecord({
    repo: repoAgent.did!,
    collection: CREATON_FORUM_TOPIC_COLLECTION,
    rkey: parsed.rkey,
    swapRecord: input.topic.cid,
    record,
  });
  const ref = unwrapCreateResponse(response);
  return { ...ref, value: record };
}

export async function listForumModActions({
  board,
  subjects,
  grants,
  constellation,
  slingshoturl,
}: {
  board: StrongRef;
  subjects: StrongRef[];
  grants?: ForumRecord<CreatonForumRoleGrantRecord>[] | null;
  constellation?: string;
  slingshoturl?: string;
}): Promise<ForumRecord<CreatonForumModActionRecord>[]> {
  if (!constellation || subjects.length === 0) return [];
  const subjectUris = new Set(subjects.map((subject) => subject.uri));
  const boardOwnerDid = parseAtUri(board.uri)?.did;
  const records = await Promise.all(
    subjects.map((subject) =>
      listRemoteRecordsForSubject<CreatonForumModActionRecord>({
        target: subject.uri,
        collection: CREATON_FORUM_MOD_ACTION_COLLECTION,
        path: ".subject.uri",
        constellation,
        slingshoturl,
      }).catch(() => []),
    ),
  );

  return dedupeRecords(records.flat()).filter((action) => {
    const authorDid = parseAtUri(action.uri)?.did;
    return (
      !!authorDid &&
      action.value.board?.uri === board.uri &&
      subjectUris.has(action.value.subject?.uri) &&
      canAuthorModerateBoard(authorDid, boardOwnerDid, board.uri, grants)
    );
  });
}

export async function setForumModerationState(
  agent: Agent,
  input: {
    board: StrongRef;
    subject: StrongRef;
    grants?: ForumRecord<CreatonForumRoleGrantRecord>[] | null;
    patch: ForumModerationStatePatch;
  },
) {
  const repoAgent = requireRepoAgent(agent);
  if (!repoAgent.com.atproto.repo.putRecord) {
    throw new Error("This session cannot write forum moderation actions.");
  }
  const boardOwnerDid = parseAtUri(input.board.uri)?.did;
  if (!canAuthorModerateBoard(repoAgent.did!, boardOwnerDid, input.board.uri, input.grants)) {
    throw new Error("Only board moderators can update this topic.");
  }

  const now = new Date().toISOString();
  const actions: CreatonForumModActionRecord[] = [];
  if (typeof input.patch.pinned === "boolean") {
    actions.push({
      $type: CREATON_FORUM_MOD_ACTION_COLLECTION,
      board: input.board,
      subject: input.subject,
      action: input.patch.pinned ? "pin" : "unpin",
      note: input.patch.note?.trim() || undefined,
      createdAt: now,
    });
  }
  if (input.patch.status === "locked" || input.patch.status === "open") {
    actions.push({
      $type: CREATON_FORUM_MOD_ACTION_COLLECTION,
      board: input.board,
      subject: input.subject,
      action: input.patch.status === "locked" ? "lock" : "unlock",
      note: input.patch.note?.trim() || undefined,
      createdAt: now,
    });
  }
  if (input.patch.movedTo) {
    actions.push({
      $type: CREATON_FORUM_MOD_ACTION_COLLECTION,
      board: input.board,
      subject: input.subject,
      action: "move",
      movedTo: input.patch.movedTo,
      note: input.patch.note?.trim() || undefined,
      createdAt: now,
    });
  }
  if (actions.length === 0) {
    throw new Error("Choose a moderation action to apply.");
  }

  const written = await Promise.all(
    actions.map(async (record) => {
      const response = await repoAgent.com.atproto.repo.putRecord!({
        repo: repoAgent.did!,
        collection: CREATON_FORUM_MOD_ACTION_COLLECTION,
        rkey: modActionRkey(input.board.uri, input.subject.uri, modActionFamily(record.action)),
        record,
      });
      const ref = unwrapCreateResponse(response);
      await createForumModLog(repoAgent, {
        board: input.board,
        subject: input.subject,
        action: record.action,
        related: record.movedTo,
        note: record.note,
      });
      return { ...ref, value: record };
    }),
  );
  return written;
}

export async function setForumTopicMerge(
  agent: Agent,
  input: {
    board: StrongRef;
    subject: StrongRef;
    mergedTo: StrongRef;
    grants?: ForumRecord<CreatonForumRoleGrantRecord>[] | null;
    note?: string;
  },
) {
  const repoAgent = requireRepoAgent(agent);
  if (!repoAgent.com.atproto.repo.putRecord) {
    throw new Error("This session cannot write forum moderation actions.");
  }
  const boardOwnerDid = parseAtUri(input.board.uri)?.did;
  if (!canAuthorModerateBoard(repoAgent.did!, boardOwnerDid, input.board.uri, input.grants)) {
    throw new Error("Only board moderators can merge topics.");
  }
  const record: CreatonForumModActionRecord = {
    $type: CREATON_FORUM_MOD_ACTION_COLLECTION,
    board: input.board,
    subject: input.subject,
    action: "merge",
    movedTo: input.mergedTo,
    note: input.note?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };
  const response = await repoAgent.com.atproto.repo.putRecord({
    repo: repoAgent.did!,
    collection: CREATON_FORUM_MOD_ACTION_COLLECTION,
    rkey: modActionRkey(input.board.uri, input.subject.uri, "merge"),
    record,
  });
  const ref = unwrapCreateResponse(response);
  await createForumModLog(repoAgent, {
    board: input.board,
    subject: input.subject,
    action: "merge",
    related: input.mergedTo,
    note: input.note,
  });
  return { ...ref, value: record };
}

export function listForumModerationLog(
  actions: ForumRecord<CreatonForumModActionRecord>[],
) {
  return [...actions].sort((a, b) => b.value.createdAt.localeCompare(a.value.createdAt));
}

export async function listForumModLog({
  board,
  grants,
  constellation,
  slingshoturl,
}: {
  board: StrongRef;
  grants?: ForumRecord<CreatonForumRoleGrantRecord>[] | null;
  constellation?: string;
  slingshoturl?: string;
}): Promise<ForumRecord<CreatonForumModLogRecord>[]> {
  if (!constellation) return [];
  const boardOwnerDid = parseAtUri(board.uri)?.did;
  const records = await listRemoteRecordsForSubject<CreatonForumModLogRecord>({
    target: board.uri,
    collection: CREATON_FORUM_MOD_LOG_COLLECTION,
    path: ".board.uri",
    constellation,
    slingshoturl,
  });
  return dedupeRecords(records)
    .filter((entry) => {
      const authorDid = parseAtUri(entry.uri)?.did;
      return (
        !!authorDid &&
        entry.value.board?.uri === board.uri &&
        canAuthorModerateBoard(authorDid, boardOwnerDid, board.uri, grants)
      );
    })
    .sort((a, b) => b.value.createdAt.localeCompare(a.value.createdAt));
}

export async function writeForumModLog(
  agent: Agent,
  input: {
    board: StrongRef;
    subject?: StrongRef;
    action: string;
    related?: StrongRef;
    note?: string;
    grants?: ForumRecord<CreatonForumRoleGrantRecord>[] | null;
  },
) {
  const repoAgent = requireRepoAgent(agent);
  const boardOwnerDid = parseAtUri(input.board.uri)?.did;
  if (!canAuthorModerateBoard(repoAgent.did!, boardOwnerDid, input.board.uri, input.grants)) {
    throw new Error("Only board moderators can write moderation log entries.");
  }
  return createForumModLog(repoAgent, input);
}

export async function listForumSanctions({
  board,
  grants,
  constellation,
  slingshoturl,
  includeRevoked = false,
}: {
  board: StrongRef;
  grants?: ForumRecord<CreatonForumRoleGrantRecord>[] | null;
  constellation?: string;
  slingshoturl?: string;
  includeRevoked?: boolean;
}): Promise<ForumRecord<CreatonForumSanctionRecord>[]> {
  if (!constellation) return [];
  const boardOwnerDid = parseAtUri(board.uri)?.did;
  const records = await listRemoteRecordsForSubject<CreatonForumSanctionRecord>({
    target: board.uri,
    collection: CREATON_FORUM_SANCTION_COLLECTION,
    path: ".board.uri",
    constellation,
    slingshoturl,
  });
  return dedupeRecords(records)
    .filter((sanction) => {
      const authorDid = parseAtUri(sanction.uri)?.did;
      return (
        !!authorDid &&
        sanction.value.board?.uri === board.uri &&
        (includeRevoked || !sanction.value.revokedAt) &&
        canAuthorModerateBoard(authorDid, boardOwnerDid, board.uri, grants)
      );
    })
    .sort((a, b) => b.value.createdAt.localeCompare(a.value.createdAt));
}

export async function setForumSanction(
  agent: Agent,
  input: {
    board: StrongRef;
    subject: string;
    kind: ForumSanctionKind;
    reason?: string;
    expiresAt?: string;
    grants?: ForumRecord<CreatonForumRoleGrantRecord>[] | null;
  },
) {
  const repoAgent = requireRepoAgent(agent);
  if (!repoAgent.com.atproto.repo.putRecord) {
    throw new Error("This session cannot write forum sanctions.");
  }
  const boardOwnerDid = parseAtUri(input.board.uri)?.did;
  if (!canAuthorModerateBoard(repoAgent.did!, boardOwnerDid, input.board.uri, input.grants)) {
    throw new Error("Only board moderators can sanction users.");
  }
  const record: CreatonForumSanctionRecord = {
    $type: CREATON_FORUM_SANCTION_COLLECTION,
    board: input.board,
    subject: input.subject,
    kind: input.kind,
    reason: input.reason?.trim() || undefined,
    expiresAt: input.expiresAt,
    createdAt: new Date().toISOString(),
  };
  const response = await repoAgent.com.atproto.repo.putRecord({
    repo: repoAgent.did!,
    collection: CREATON_FORUM_SANCTION_COLLECTION,
    rkey: sanctionRkey(input.board.uri, input.subject, input.kind),
    record,
  });
  const ref = unwrapCreateResponse(response);
  await createForumModLog(repoAgent, {
    board: input.board,
    action: `sanction:${input.kind}`,
    note: input.reason,
  });
  return { ...ref, value: record };
}

export async function revokeForumSanction(
  agent: Agent,
  input: {
    board: StrongRef;
    subject: string;
    kind: ForumSanctionKind;
    reason?: string;
    grants?: ForumRecord<CreatonForumRoleGrantRecord>[] | null;
  },
) {
  const repoAgent = requireRepoAgent(agent);
  if (!repoAgent.com.atproto.repo.putRecord) {
    throw new Error("This session cannot revoke forum sanctions.");
  }
  const boardOwnerDid = parseAtUri(input.board.uri)?.did;
  if (!canAuthorModerateBoard(repoAgent.did!, boardOwnerDid, input.board.uri, input.grants)) {
    throw new Error("Only board moderators can revoke sanctions.");
  }
  const now = new Date().toISOString();
  const record: CreatonForumSanctionRecord = {
    $type: CREATON_FORUM_SANCTION_COLLECTION,
    board: input.board,
    subject: input.subject,
    kind: input.kind,
    reason: input.reason?.trim() || undefined,
    createdAt: now,
    revokedAt: now,
  };
  const response = await repoAgent.com.atproto.repo.putRecord({
    repo: repoAgent.did!,
    collection: CREATON_FORUM_SANCTION_COLLECTION,
    rkey: sanctionRkey(input.board.uri, input.subject, input.kind),
    record,
  });
  const ref = unwrapCreateResponse(response);
  await createForumModLog(repoAgent, {
    board: input.board,
    action: `sanction:revoke:${input.kind}`,
    note: input.reason,
  });
  return { ...ref, value: record };
}

export async function listForumReviewActions({
  board,
  subjects,
  grants,
  constellation,
  slingshoturl,
}: {
  board: StrongRef;
  subjects: StrongRef[];
  grants?: ForumRecord<CreatonForumRoleGrantRecord>[] | null;
  constellation?: string;
  slingshoturl?: string;
}): Promise<ForumRecord<CreatonForumReviewActionRecord>[]> {
  if (!constellation || subjects.length === 0) return [];
  const subjectUris = new Set(subjects.map((subject) => subject.uri));
  const boardOwnerDid = parseAtUri(board.uri)?.did;
  const records = await Promise.all(
    subjects.map((subject) =>
      listRemoteRecordsForSubject<CreatonForumReviewActionRecord>({
        target: subject.uri,
        collection: CREATON_FORUM_REVIEW_ACTION_COLLECTION,
        path: ".subject.uri",
        constellation,
        slingshoturl,
      }).catch(() => []),
    ),
  );
  return dedupeRecords(records.flat()).filter((action) => {
    const authorDid = parseAtUri(action.uri)?.did;
    return (
      !!authorDid &&
      action.value.board?.uri === board.uri &&
      subjectUris.has(action.value.subject?.uri) &&
      canAuthorModerateBoard(authorDid, boardOwnerDid, board.uri, grants)
    );
  });
}

export async function setForumReviewAction(
  agent: Agent,
  input: {
    board: StrongRef;
    subject: StrongRef;
    action: ForumReviewAction;
    reason?: string;
    grants?: ForumRecord<CreatonForumRoleGrantRecord>[] | null;
  },
) {
  const repoAgent = requireRepoAgent(agent);
  if (!repoAgent.com.atproto.repo.putRecord) {
    throw new Error("This session cannot write forum review actions.");
  }
  const boardOwnerDid = parseAtUri(input.board.uri)?.did;
  if (!canAuthorModerateBoard(repoAgent.did!, boardOwnerDid, input.board.uri, input.grants)) {
    throw new Error("Only board moderators can review forum content.");
  }
  const record: CreatonForumReviewActionRecord = {
    $type: CREATON_FORUM_REVIEW_ACTION_COLLECTION,
    board: input.board,
    subject: input.subject,
    action: input.action,
    reason: input.reason?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };
  const response = await repoAgent.com.atproto.repo.putRecord({
    repo: repoAgent.did!,
    collection: CREATON_FORUM_REVIEW_ACTION_COLLECTION,
    rkey: reviewActionRkey(input.board.uri, input.subject.uri),
    record,
  });
  const ref = unwrapCreateResponse(response);
  await createForumModLog(repoAgent, {
    board: input.board,
    subject: input.subject,
    action: `review:${input.action}`,
    note: input.reason,
  });
  return { ...ref, value: record };
}

export function resolveForumSubjectVisibility({
  authorDid,
  reviewActions,
  sanctions,
}: {
  authorDid?: string | null;
  reviewActions?: ForumRecord<CreatonForumReviewActionRecord>[] | null;
  sanctions?: ForumRecord<CreatonForumSanctionRecord>[] | null;
}): ForumSubjectVisibility {
  const latestReview = [...(reviewActions ?? [])].sort((a, b) =>
    b.value.createdAt.localeCompare(a.value.createdAt),
  )[0]?.value.action;
  if (latestReview === "approve" || latestReview === "restore") return "visible";
  if (latestReview === "reject" || latestReview === "hide") return "hidden";
  if (authorDid && hasActiveSanction(sanctions, authorDid, "postApproval")) return "pending";
  return "visible";
}

export function resolveForumSubjectModerationLabel(input: {
  authorDid?: string | null;
  reviewActions?: ForumRecord<CreatonForumReviewActionRecord>[] | null;
  sanctions?: ForumRecord<CreatonForumSanctionRecord>[] | null;
}): string | undefined {
  const visibility = resolveForumSubjectVisibility(input);
  if (visibility === "visible") return undefined;
  if (visibility === "pending") return "Pending approval";
  const latestReview = [...(input.reviewActions ?? [])].sort((a, b) =>
    b.value.createdAt.localeCompare(a.value.createdAt),
  )[0]?.value.action;
  if (latestReview === "reject") return "Rejected";
  if (latestReview === "hide") return "Removed";
  return "Hidden";
}

export function canPostToForumBoard({
  sanctions,
  viewerDid,
}: {
  sanctions?: ForumRecord<CreatonForumSanctionRecord>[] | null;
  viewerDid?: string | null;
}) {
  if (!viewerDid) return { allowed: false, mode: "signedOut" as const };
  if (hasActiveSanction(sanctions, viewerDid, "ban")) {
    return { allowed: false, mode: "banned" as const };
  }
  if (hasActiveSanction(sanctions, viewerDid, "mute")) {
    return { allowed: false, mode: "muted" as const };
  }
  if (hasActiveSanction(sanctions, viewerDid, "postApproval")) {
    return { allowed: true, mode: "postApproval" as const };
  }
  return { allowed: true, mode: "open" as const };
}

export async function listForumBoardReports({
  board,
  grants,
  constellation,
  slingshoturl,
  includeResolved = false,
}: {
  board: StrongRef;
  grants?: ForumRecord<CreatonForumRoleGrantRecord>[] | null;
  constellation?: string;
  slingshoturl?: string;
  includeResolved?: boolean;
}): Promise<ForumRecord<CreatonForumBoardReportRecord>[]> {
  if (!constellation) return [];
  const [records, actions] = await Promise.all([
    listRemoteRecordsForSubject<CreatonForumBoardReportRecord>({
      target: board.uri,
      collection: CREATON_FORUM_BOARD_REPORT_COLLECTION,
      path: ".board.uri",
      constellation,
      slingshoturl,
    }),
    listForumBoardReportActions({ board, grants, constellation, slingshoturl }),
  ]);
  const resolvedReports = new Set(
    [...latestForumBoardReportActions(actions).entries()]
      .filter(([, action]) => action.value.action === "resolve")
      .map(([reportUri]) => reportUri),
  );
  return dedupeRecords(records)
    .filter((report) => report.value.board?.uri === board.uri)
    .filter((report) => includeResolved || (!report.value.resolvedAt && !resolvedReports.has(report.uri)))
    .sort((a, b) => b.value.createdAt.localeCompare(a.value.createdAt));
}

export function latestForumBoardReportActions(
  actions: ForumRecord<CreatonForumBoardReportActionRecord>[],
) {
  const latest = new Map<string, ForumRecord<CreatonForumBoardReportActionRecord>>();
  for (const action of actions) {
    const reportUri = action.value.report?.uri;
    if (!reportUri) continue;
    const existing = latest.get(reportUri);
    if (!existing || action.value.createdAt.localeCompare(existing.value.createdAt) >= 0) {
      latest.set(reportUri, action);
    }
  }
  return latest;
}

export async function listForumBoardReportActions({
  board,
  grants,
  constellation,
  slingshoturl,
}: {
  board: StrongRef;
  grants?: ForumRecord<CreatonForumRoleGrantRecord>[] | null;
  constellation?: string;
  slingshoturl?: string;
}): Promise<ForumRecord<CreatonForumBoardReportActionRecord>[]> {
  if (!constellation) return [];
  const boardOwnerDid = parseAtUri(board.uri)?.did;
  const records = await listRemoteRecordsForSubject<CreatonForumBoardReportActionRecord>({
    target: board.uri,
    collection: CREATON_FORUM_BOARD_REPORT_ACTION_COLLECTION,
    path: ".board.uri",
    constellation,
    slingshoturl,
  });
  return dedupeRecords(records).filter((action) => {
    const authorDid = parseAtUri(action.uri)?.did;
    return (
      !!authorDid &&
      action.value.board?.uri === board.uri &&
      canAuthorModerateBoard(authorDid, boardOwnerDid, board.uri, grants)
    );
  });
}

export async function createForumBoardReport(
  agent: Agent,
  input: {
    board: StrongRef;
    subject: StrongRef;
    reasonType: ForumBoardReportReason;
    reason?: string;
  },
) {
  const repoAgent = requireRepoAgent(agent);
  const record: CreatonForumBoardReportRecord = {
    $type: CREATON_FORUM_BOARD_REPORT_COLLECTION,
    board: input.board,
    subject: input.subject,
    reasonType: input.reasonType,
    reason: input.reason?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };
  return createRecord(repoAgent, {
    collection: CREATON_FORUM_BOARD_REPORT_COLLECTION,
    record,
  });
}

export async function actOnForumBoardReport(
  agent: Agent,
  input: {
    report: ForumRecord<CreatonForumBoardReportRecord>;
    grants?: ForumRecord<CreatonForumRoleGrantRecord>[] | null;
    resolution: "dismiss" | "remove";
    note?: string;
  },
) {
  if (input.resolution === "remove") {
    await setForumReviewAction(agent, {
      board: input.report.value.board,
      subject: input.report.value.subject,
      action: "hide",
      reason: input.note,
      grants: input.grants,
    });
  }
  return resolveForumBoardReport(agent, {
    report: input.report,
    grants: input.grants,
    note: input.note,
  });
}

export async function resolveForumBoardReport(
  agent: Agent,
  input: {
    report: ForumRecord<CreatonForumBoardReportRecord>;
    grants?: ForumRecord<CreatonForumRoleGrantRecord>[] | null;
    note?: string;
  },
) {
  const repoAgent = requireRepoAgent(agent);
  if (!repoAgent.com.atproto.repo.putRecord) {
    throw new Error("This session cannot resolve forum reports.");
  }
  const boardOwnerDid = parseAtUri(input.report.value.board.uri)?.did;
  if (
    !canAuthorModerateBoard(
      repoAgent.did!,
      boardOwnerDid,
      input.report.value.board.uri,
      input.grants,
    )
  ) {
    throw new Error("Only board moderators can resolve board reports.");
  }
  const reportRef = { uri: input.report.uri, cid: input.report.cid };
  const record: CreatonForumBoardReportActionRecord = {
    $type: CREATON_FORUM_BOARD_REPORT_ACTION_COLLECTION,
    board: input.report.value.board,
    report: reportRef,
    action: "resolve",
    note: input.note?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };
  const response = await repoAgent.com.atproto.repo.putRecord({
    repo: repoAgent.did!,
    collection: CREATON_FORUM_BOARD_REPORT_ACTION_COLLECTION,
    rkey: hashRkey("report-action", `${reportRef.uri}:resolve`),
    record,
  });
  const ref = unwrapCreateResponse(response);
  await createForumModLog(repoAgent, {
    board: input.report.value.board,
    subject: reportRef,
    action: "report:resolve",
    note: input.note,
  });
  return { ...ref, value: record };
}

export async function unresolveForumBoardReport(
  agent: Agent,
  input: {
    board: StrongRef;
    report: StrongRef;
    grants?: ForumRecord<CreatonForumRoleGrantRecord>[] | null;
    skipModLog?: boolean;
  },
) {
  const repoAgent = requireRepoAgent(agent);
  if (!repoAgent.com.atproto.repo.putRecord) {
    throw new Error("This session cannot reopen forum reports.");
  }
  const boardOwnerDid = parseAtUri(input.board.uri)?.did;
  if (!canAuthorModerateBoard(repoAgent.did!, boardOwnerDid, input.board.uri, input.grants)) {
    throw new Error("Only board moderators can reopen forum reports.");
  }
  const record: CreatonForumBoardReportActionRecord = {
    $type: CREATON_FORUM_BOARD_REPORT_ACTION_COLLECTION,
    board: input.board,
    report: input.report,
    action: "reopen",
    createdAt: new Date().toISOString(),
  };
  const response = await repoAgent.com.atproto.repo.putRecord({
    repo: repoAgent.did!,
    collection: CREATON_FORUM_BOARD_REPORT_ACTION_COLLECTION,
    rkey: hashRkey("report-action", `${input.report.uri}:reopen`),
    record,
  });
  const ref = unwrapCreateResponse(response);
  if (!input.skipModLog) {
    await createForumModLog(repoAgent, {
      board: input.board,
      subject: input.report,
      action: "report:reopen",
    });
  }
  return { ...ref, value: record };
}

export async function reverseForumModLogAction(
  agent: Agent,
  input: {
    board: StrongRef;
    reversal: ForumModLogReversal;
    grants?: ForumRecord<CreatonForumRoleGrantRecord>[] | null;
  },
) {
  switch (input.reversal.type) {
    case "review": {
      const result = await setForumReviewAction(agent, {
        board: input.board,
        subject: input.reversal.subject,
        action: input.reversal.action,
        grants: input.grants,
      });
      if (input.reversal.reopenReport) {
        await unresolveForumBoardReport(agent, {
          board: input.board,
          report: input.reversal.reopenReport,
          grants: input.grants,
          skipModLog: true,
        });
      }
      return result;
    }
    case "moderation":
      return setForumModerationState(agent, {
        board: input.board,
        subject: input.reversal.subject,
        patch: input.reversal.patch,
        grants: input.grants,
      });
    case "report":
      return unresolveForumBoardReport(agent, {
        board: input.board,
        report: input.reversal.report,
        grants: input.grants,
      });
  }
}

export async function listForumBookmarks(agent: Agent) {
  const repoAgent = requireRepoAgent(agent);
  if (!repoAgent.com.atproto.repo.listRecords) return [];
  const records = await listAgentRecords<CreatonForumBookmarkRecord>(
    repoAgent,
    CREATON_FORUM_BOOKMARK_COLLECTION,
  );
  return records
    .filter((record) => record.cid)
    .map((record) => ({ uri: record.uri, cid: record.cid!, value: record.value }));
}

export async function bookmarkForumSubject(
  agent: Agent,
  input: { subject: StrongRef; board?: StrongRef },
) {
  const repoAgent = requireRepoAgent(agent);
  if (!repoAgent.com.atproto.repo.putRecord) {
    throw new Error("This session cannot write forum bookmarks.");
  }
  const record: CreatonForumBookmarkRecord = {
    $type: CREATON_FORUM_BOOKMARK_COLLECTION,
    subject: input.subject,
    board: input.board,
    createdAt: new Date().toISOString(),
  };
  const response = await repoAgent.com.atproto.repo.putRecord({
    repo: repoAgent.did!,
    collection: CREATON_FORUM_BOOKMARK_COLLECTION,
    rkey: bookmarkRkey(input.subject.uri),
    record,
  });
  const ref = unwrapCreateResponse(response);
  return { ...ref, value: record };
}

export async function removeForumBookmark(agent: Agent, subject: StrongRef) {
  const repoAgent = requireRepoAgent(agent);
  if (!repoAgent.com.atproto.repo.deleteRecord) {
    throw new Error("This session cannot remove forum bookmarks.");
  }
  await repoAgent.com.atproto.repo.deleteRecord({
    repo: repoAgent.did!,
    collection: CREATON_FORUM_BOOKMARK_COLLECTION,
    rkey: bookmarkRkey(subject.uri),
  });
}

export async function listForumSubscriptions(agent: Agent) {
  const repoAgent = requireRepoAgent(agent);
  if (!repoAgent.com.atproto.repo.listRecords) return [];
  const records = await listAgentRecords<CreatonForumSubscriptionRecord>(
    repoAgent,
    CREATON_FORUM_SUBSCRIPTION_COLLECTION,
  );
  return records
    .filter((record) => record.cid)
    .map((record) => ({ uri: record.uri, cid: record.cid!, value: record.value }));
}

export async function subscribeForumSubject(
  agent: Agent,
  input: { subject: StrongRef; kind: "board" | "topic" },
) {
  const repoAgent = requireRepoAgent(agent);
  if (!repoAgent.com.atproto.repo.putRecord) {
    throw new Error("This session cannot write forum subscriptions.");
  }
  const record: CreatonForumSubscriptionRecord = {
    $type: CREATON_FORUM_SUBSCRIPTION_COLLECTION,
    subject: input.subject,
    kind: input.kind,
    createdAt: new Date().toISOString(),
  };
  const response = await repoAgent.com.atproto.repo.putRecord({
    repo: repoAgent.did!,
    collection: CREATON_FORUM_SUBSCRIPTION_COLLECTION,
    rkey: subscriptionRkey(input.kind, input.subject.uri),
    record,
  });
  const ref = unwrapCreateResponse(response);
  return { ...ref, value: record };
}

export async function unsubscribeForumSubject(
  agent: Agent,
  input: { subject: StrongRef; kind: "board" | "topic" },
) {
  const repoAgent = requireRepoAgent(agent);
  if (!repoAgent.com.atproto.repo.deleteRecord) {
    throw new Error("This session cannot remove forum subscriptions.");
  }
  await repoAgent.com.atproto.repo.deleteRecord({
    repo: repoAgent.did!,
    collection: CREATON_FORUM_SUBSCRIPTION_COLLECTION,
    rkey: subscriptionRkey(input.kind, input.subject.uri),
  });
}

export async function listForumMemberRecords(
  agent: Agent,
): Promise<ForumRecord<CreatonForumMemberRecord>[]> {
  const repoAgent = requireRepoAgent(agent);
  if (!repoAgent.com.atproto.repo.listRecords) {
    return [];
  }
  const records = await listAgentRecords<CreatonForumMemberRecord>(
    repoAgent,
    CREATON_FORUM_MEMBER_COLLECTION,
  );
  return records
    .filter((record) => record.cid)
    .map((record) => ({
      uri: record.uri,
      cid: record.cid!,
      value: record.value,
    }));
}

export async function getForumBoardMembership(agent: Agent, board: StrongRef) {
  const members = await listForumMemberRecords(agent);
  return members.find((member) => member.value.board?.uri === board.uri) ?? null;
}

export async function isForumBoardMember(agent: Agent, board: StrongRef) {
  return !!(await getForumBoardMembership(agent, board));
}

export async function joinForumBoard(agent: Agent, board: StrongRef) {
  const repoAgent = requireRepoAgent(agent);
  if (!repoAgent.com.atproto.repo.putRecord) {
    throw new Error("This session cannot join forum boards.");
  }
  const record: CreatonForumMemberRecord = {
    $type: CREATON_FORUM_MEMBER_COLLECTION,
    board,
    createdAt: new Date().toISOString(),
  };
  const response = await repoAgent.com.atproto.repo.putRecord({
    repo: repoAgent.did!,
    collection: CREATON_FORUM_MEMBER_COLLECTION,
    rkey: memberRkey(board.uri),
    record,
  });
  const ref = unwrapCreateResponse(response);
  return { ...ref, value: record };
}

export async function leaveForumBoard(agent: Agent, board: StrongRef) {
  const repoAgent = requireRepoAgent(agent);
  if (!repoAgent.com.atproto.repo.deleteRecord) {
    throw new Error("This session cannot leave forum boards.");
  }
  await repoAgent.com.atproto.repo.deleteRecord({
    repo: repoAgent.did!,
    collection: CREATON_FORUM_MEMBER_COLLECTION,
    rkey: memberRkey(board.uri),
  });
}

export async function listForumRoleGrants({
  board,
  boardOwnerDid,
  constellation,
  slingshoturl,
}: {
  board: StrongRef;
  boardOwnerDid: string;
  constellation?: string;
  slingshoturl?: string;
}): Promise<ForumRecord<CreatonForumRoleGrantRecord>[]> {
  if (!constellation) return [];

  const records = await listRemoteRecordsForSubject<CreatonForumRoleGrantRecord>({
    target: board.uri,
    collection: CREATON_FORUM_ROLE_GRANT_COLLECTION,
    path: ".board.uri",
    constellation,
    slingshoturl,
  });

  return dedupeRecords(records).filter((grant) => {
    const grantDid = parseAtUri(grant.uri)?.did;
    return (
      grantDid === boardOwnerDid &&
      grant.value.board?.uri === board.uri &&
      !grant.value.revokedAt
    );
  });
}

export async function grantForumRole(
  agent: Agent,
  input: { board: StrongRef; subject: string; role: "moderator" | "owner" },
) {
  const repoAgent = requireRepoAgent(agent);
  if (!repoAgent.com.atproto.repo.putRecord) {
    throw new Error("This session cannot grant forum roles.");
  }
  if (parseAtUri(input.board.uri)?.did !== repoAgent.did) {
    throw new Error("Only the board owner can grant forum roles.");
  }
  const record: CreatonForumRoleGrantRecord = {
    $type: CREATON_FORUM_ROLE_GRANT_COLLECTION,
    board: input.board,
    subject: input.subject,
    role: input.role,
    createdAt: new Date().toISOString(),
  };
  const response = await repoAgent.com.atproto.repo.putRecord({
    repo: repoAgent.did!,
    collection: CREATON_FORUM_ROLE_GRANT_COLLECTION,
    rkey: roleGrantRkey(input.subject, input.board.uri),
    record,
  });
  const ref = unwrapCreateResponse(response);
  await createForumModLog(repoAgent, {
    board: input.board,
    action: `role:grant:${input.role}`,
    note: input.subject,
  });
  return { ...ref, value: record };
}

export async function revokeForumRole(
  agent: Agent,
  input: { board: StrongRef; subject: string },
) {
  const repoAgent = requireRepoAgent(agent);
  if (!repoAgent.com.atproto.repo.putRecord) {
    throw new Error("This session cannot revoke forum roles.");
  }
  if (parseAtUri(input.board.uri)?.did !== repoAgent.did) {
    throw new Error("Only the board owner can revoke forum roles.");
  }
  const now = new Date().toISOString();
  const record: CreatonForumRoleGrantRecord = {
    $type: CREATON_FORUM_ROLE_GRANT_COLLECTION,
    board: input.board,
    subject: input.subject,
    role: "moderator",
    createdAt: now,
    revokedAt: now,
  };
  const response = await repoAgent.com.atproto.repo.putRecord({
    repo: repoAgent.did!,
    collection: CREATON_FORUM_ROLE_GRANT_COLLECTION,
    rkey: roleGrantRkey(input.subject, input.board.uri),
    record,
  });
  const ref = unwrapCreateResponse(response);
  await createForumModLog(repoAgent, {
    board: input.board,
    action: "role:revoke",
    note: input.subject,
  });
  return { ...ref, value: record };
}

export async function listSubscribedForumBoards({
  agent,
  slingshoturl,
}: {
  agent: Agent;
  slingshoturl?: string;
}) {
  const members = await listForumMemberRecords(agent);
  const boards = await Promise.all(
    members.map(async (member) => {
      const parsed = parseAtUri(member.value.board?.uri ?? "");
      if (!parsed) return null;
      return getForumBoard({
        did: parsed.did,
        rkey: parsed.rkey,
        slingshoturl,
      });
    }),
  );
  return boards.filter((board): board is ForumRecord<CreatonForumBoardRecord> => !!board);
}

export async function listYourForumBoards({
  agent,
  slingshoturl,
}: {
  agent: Agent;
  slingshoturl?: string;
}) {
  const [subscribed, created] = await Promise.all([
    listSubscribedForumBoards({ agent, slingshoturl }),
    listAgentForumBoards(agent),
  ]);
  return dedupeRecords([...subscribed, ...created]).sort((a, b) =>
    (b.value.updatedAt ?? b.value.createdAt).localeCompare(
      a.value.updatedAt ?? a.value.createdAt,
    ),
  );
}

export async function listUserFollowDids(agent: Agent): Promise<Set<string>> {
  const repoAgent = requireRepoAgent(agent);
  if (!repoAgent.com.atproto.repo.listRecords) return new Set<string>();
  const records = await listAgentRecords<{ subject: string }>(
    repoAgent,
    "app.bsky.graph.follow",
  );
  return new Set(
    records
      .map((record: { value: { subject: string } }) => record.value.subject)
      .filter((subject: string): subject is string => typeof subject === "string"),
  );
}

export async function listRecentTopicsFromBoards({
  boards,
  constellation,
  slingshoturl,
  limit = 25,
}: {
  boards: StrongRef[];
  constellation?: string;
  slingshoturl?: string;
  limit?: number;
}) {
  const allTopics = await Promise.all(
    boards.map((board) =>
      listForumTopics({ board, constellation, slingshoturl }).catch(() => []),
    ),
  );
  return allTopics
    .flat()
    .sort((a, b) =>
      (b.value.updatedAt ?? b.value.createdAt).localeCompare(
        a.value.updatedAt ?? a.value.createdAt,
      ),
    )
    .slice(0, limit);
}

export function parseAtUri(uri: string) {
  const match = uri.match(/^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/);
  if (!match) return null;
  return { did: match[1]!, collection: match[2]!, rkey: match[3]! };
}

async function createRecord<T>(
  agent: RepoAgent,
  input: { collection: string; record: T; rkey?: string },
) {
  const response = await agent.com.atproto.repo.createRecord({
    repo: agent.did!,
    collection: input.collection,
    record: input.record,
    rkey: input.rkey,
  });
  const ref = unwrapCreateResponse(response);
  return { ...ref, value: input.record };
}

function capsuleToRecord(
  capsule: Awaited<ReturnType<typeof createForumKeyCapsule>>,
  board: StrongRef,
): CreatonForumKeyCapsuleRecord {
  return {
    $type: CREATON_FORUM_KEY_CAPSULE_COLLECTION,
    board,
    recordUri: capsule.recordUri,
    committeeEpoch: capsule.committeeEpoch,
    policyHash: { $bytes: bytesToBase64Url(hexToBytes(capsule.policyHash)) },
    version: capsule.version,
    suite: capsule.suite as CreatonForumKeyCapsuleRecord['suite'],
    encapsulation: { $bytes: capsule.encapsulation },
    nonce: { $bytes: capsule.nonce },
    ciphertext: { $bytes: capsule.ciphertext },
    keyCommitment: { $bytes: capsule.keyCommitment },
    createdAt: capsule.createdAt,
  };
}

function hexToBytes(value: string): Uint8Array {
  const hex = value.replace(/^0x/, "");
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error("Forum policy hash must be 32 bytes.");
  return Uint8Array.from(hex.match(/.{2}/g)!, byte => Number.parseInt(byte, 16));
}

function bytesToHex(value: Uint8Array): string {
  return `0x${Array.from(value, byte => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function policyHashForBoardAccess(
  access?: CreatonForumBoardRecord["access"],
): Promise<string> {
  if (!access) {
    return `0x${"00".repeat(32)}`;
  }
  const encoder = new TextEncoder();
  const canonical = JSON.stringify({
    issuerDid: access.issuerDid,
    committeeRegistry: access.committeeRegistry,
    entitlementRegistry: access.entitlementRegistry,
    paymentProtocol: access.paymentProtocol,
    amount: access.amount,
    durationSeconds: access.durationSeconds,
  });
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(canonical));
  return `0x${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`;
}

function toBytesField(value: string | Uint8Array) {
  return { $bytes: typeof value === 'string' ? value : bytesToBase64Url(value) };
}

function encryptedContentToRecord(
  value: Awaited<ReturnType<typeof encryptForumContent>>,
): CreatonForumTopicRecord["protectedBody"] {
  if (value.version !== 3) throw new Error("Threshold encryption context is required.");
  return {
    ...value,
    suite: value.suite as CreatonForumEncryptedContentV3['suite'],
    salt: toBytesField(value.salt),
    nonce: toBytesField(value.nonce),
    ciphertext: toBytesField(value.ciphertext),
  };
}

async function getRecord<T>({
  repo,
  collection,
  rkey,
  slingshoturl,
}: {
  repo: string;
  collection: string;
  rkey: string;
  slingshoturl?: string;
}): Promise<ForumRecord<T> | null> {
  const atUri = `at://${repo}/${collection}/${rkey}`;
  const uriParams = new URLSearchParams({ at_uri: atUri });
  const host = slingshoturl || "slingshot.microcosm.blue";
  const response = await fetch(
    serviceUrl(host, `/xrpc/com.bad-example.repo.getUriRecord?${uriParams.toString()}`),
  );
  if (response.ok) return response.json() as Promise<ForumRecord<T>>;

  if (response.status === 400 || response.status === 404 || response.status === 500) {
    return null;
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return null;
  }

  if (
    data &&
    typeof data === "object" &&
    "error" in data &&
    (data as { error?: string }).error === "InvalidRequest" &&
    String((data as { message?: string }).message ?? "").includes("Could not find repo")
  ) {
    return null;
  }

  return null;
}

async function listRemoteRecordsForSubject<T>({
  target,
  collection,
  path,
  constellation,
  slingshoturl = "slingshot.microcosm.blue",
}: {
  target: string;
  collection: string;
  path: string;
  constellation: string;
  slingshoturl?: string;
}) {
  const links = await listBacklinkRefs({
    target,
    collection,
    path,
    constellation,
  });
  const fetched = await Promise.all(
    links.map((record) =>
      getRecord<T>({
        repo: record.did,
        collection: record.collection,
        rkey: record.rkey,
        slingshoturl,
      }),
    ),
  );
  return fetched.filter((record): record is ForumRecord<T> => !!record);
}

function formatLinkSource(collection: string, path: string) {
  const normalizedPath = path.startsWith(".") ? path.slice(1) : path;
  return `${collection}:${normalizedPath}`;
}

async function listBacklinkRefs({
  target,
  collection,
  path,
  constellation,
}: {
  target: string;
  collection: string;
  path: string;
  constellation: string;
}) {
  const xrpcParams = new URLSearchParams({
    subject: target,
    source: formatLinkSource(collection, path),
  });
  const xrpc = await fetch(
    serviceUrl(constellation, `/xrpc/blue.microcosm.links.getBacklinks?${xrpcParams.toString()}`),
  );
  if (xrpc.ok) {
    const data = await xrpc.json().catch(() => null);
    const refs = normalizeBacklinkRefs(data);
    if (refs.length > 0) return refs;
  }

  const params = new URLSearchParams({
    target,
    collection,
    path,
  });
  const response = await fetch(serviceUrl(constellation, `/links?${params.toString()}`));
  if (!response.ok) return [];
  const data = await response.json().catch(() => null);
  return normalizeBacklinkRefs(data);
}

function normalizeBacklinkRefs(data: unknown) {
  if (!data || typeof data !== "object") return [];
  const source = data as {
    linking_records?: unknown[];
    backlinks?: unknown[];
    records?: unknown[];
  };
  const records = source.linking_records ?? source.backlinks ?? source.records ?? [];
  return records
    .map((record) => {
      if (!record || typeof record !== "object") return null;
      const value = record as {
        did?: unknown;
        repo?: unknown;
        collection?: unknown;
        rkey?: unknown;
        uri?: unknown;
      };
      if (
        typeof value.did === "string" &&
        typeof value.collection === "string" &&
        typeof value.rkey === "string"
      ) {
        return { did: value.did, collection: value.collection, rkey: value.rkey };
      }
      if (
        typeof value.repo === "string" &&
        typeof value.collection === "string" &&
        typeof value.rkey === "string"
      ) {
        return { did: value.repo, collection: value.collection, rkey: value.rkey };
      }
      if (typeof value.uri === "string") {
        const parsed = parseAtUri(value.uri);
        if (parsed) return parsed;
      }
      return null;
    })
    .filter((record): record is { did: string; collection: string; rkey: string } => !!record);
}

function serviceUrl(host: string, path: string) {
  const base = host.startsWith("http://") || host.startsWith("https://")
    ? host.replace(/\/+$/g, "")
    : `https://${host}`;
  return `${base}${path}`;
}

function requireConstellation(constellation?: string) {
  if (!constellation) {
    throw new Error("Constellation is required for Creaton forum discovery.");
  }
  return constellation;
}

function requireRepoAgent(agent: Agent) {
  const repoAgent = agent as RepoAgent;
  if (!repoAgent.did) throw new Error("Sign in before writing forum records.");
  return repoAgent;
}

function unwrapCreateResponse(
  response: { data?: CreateRecordResponse } & Partial<CreateRecordResponse>,
) {
  const data = response.data ?? response;
  if (!data.uri || !data.cid) {
    throw new Error("ATProto write did not return a record ref.");
  }
  return { uri: data.uri, cid: data.cid };
}

function slugFor(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 64) || "forum"
  );
}

function dedupeRecords<T>(records: ForumRecord<T>[]) {
  return Array.from(new Map(records.map((record) => [record.uri, record])).values());
}

/** Keep locally-created records visible until remote indexes catch up. */
export function mergeForumRecords<T extends { createdAt: string }>(
  fetched: ForumRecord<T>[],
  cached?: ForumRecord<T>[] | null,
) {
  return dedupeRecords([...fetched, ...(cached ?? [])]).sort((a, b) =>
    a.value.createdAt.localeCompare(b.value.createdAt),
  );
}

function voteRkey(subjectUri: string) {
  return hashRkey("vote", subjectUri);
}

function memberRkey(boardUri: string) {
  return hashRkey("member", boardUri);
}

function roleGrantRkey(subjectDid: string, boardUri: string) {
  return hashRkey("role", subjectDid + boardUri);
}

function modActionRkey(boardUri: string, subjectUri: string, family: string) {
  return hashRkey("mod", `${boardUri}:${subjectUri}:${family}`);
}

function sanctionRkey(boardUri: string, subjectDid: string, kind: ForumSanctionKind) {
  return hashRkey("sanction", `${boardUri}:${subjectDid}:${kind}`);
}

function reviewActionRkey(boardUri: string, subjectUri: string) {
  return hashRkey("review", `${boardUri}:${subjectUri}`);
}

function modActionFamily(action: CreatonForumModActionRecord["action"]) {
  if (action === "pin" || action === "unpin") return "pin";
  if (action === "lock" || action === "unlock") return "lock";
  if (action === "merge") return "merge";
  return "move";
}

function bookmarkRkey(subjectUri: string) {
  return hashRkey("bookmark", subjectUri);
}

function subscriptionRkey(kind: "board" | "topic", subjectUri: string) {
  return hashRkey("watch", `${kind}:${subjectUri}`);
}

async function createForumModLog(
  agent: RepoAgent,
  input: {
    board: StrongRef;
    subject?: StrongRef;
    action: string;
    related?: StrongRef;
    note?: string;
  },
) {
  const record: CreatonForumModLogRecord = {
    $type: CREATON_FORUM_MOD_LOG_COLLECTION,
    board: input.board,
    subject: input.subject,
    action: input.action,
    related: input.related,
    note: input.note?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };
  return createRecord(agent, {
    collection: CREATON_FORUM_MOD_LOG_COLLECTION,
    record,
  });
}

function hasActiveSanction(
  sanctions: ForumRecord<CreatonForumSanctionRecord>[] | null | undefined,
  subjectDid: string,
  kind: ForumSanctionKind,
) {
  const now = Date.now();
  return !!sanctions?.some((sanction) => {
    if (sanction.value.subject !== subjectDid || sanction.value.kind !== kind) return false;
    if (sanction.value.revokedAt) return false;
    if (sanction.value.expiresAt) {
      const expiresAt = Date.parse(sanction.value.expiresAt);
      if (Number.isFinite(expiresAt) && expiresAt <= now) return false;
    }
    return true;
  });
}

function canAuthorModerateBoard(
  authorDid: string,
  boardOwnerDid: string | undefined,
  boardUri: string,
  grants?: ForumRecord<CreatonForumRoleGrantRecord>[] | null,
) {
  if (authorDid === boardOwnerDid) return true;
  return !!grants?.some(
    (grant) =>
      parseAtUri(grant.uri)?.did === boardOwnerDid &&
      !grant.value.revokedAt &&
      grant.value.subject === authorDid &&
      grant.value.board?.uri === boardUri &&
      (grant.value.role === "moderator" || grant.value.role === "owner"),
  );
}

function hashRkey(prefix: string, value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${prefix}-${(hash >>> 0).toString(36)}`;
}

async function listAgentRecords<T>(
  agent: RepoAgent,
  collection: string,
  cursor?: string,
): Promise<{ uri: string; cid?: string; value: T }[]> {
  if (!agent.com.atproto.repo.listRecords) return [];
  const response = await agent.com.atproto.repo.listRecords({
    repo: agent.did!,
    collection,
    limit: 100,
    cursor,
  });
  const data = response.data as ListRecordsResponse<T>;
  const next: { uri: string; cid?: string; value: T }[] = data.cursor
    ? await listAgentRecords<T>(agent, collection, data.cursor)
    : [];
  return [...data.records, ...next];
}
