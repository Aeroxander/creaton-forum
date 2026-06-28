export const CREATON_FORUM_BOARD_COLLECTION = "app.creaton.forum.board";
export const CREATON_FORUM_TOPIC_COLLECTION = "app.creaton.forum.topic";
export const CREATON_FORUM_COMMENT_COLLECTION = "app.creaton.forum.comment";
export const CREATON_FORUM_KEY_GRANT_COLLECTION = "app.creaton.forum.keyGrant";
export const CREATON_FORUM_KEY_CAPSULE_COLLECTION = "app.creaton.forum.keyCapsule";
export const CREATON_FORUM_MEMBER_COLLECTION = "app.creaton.forum.member";
export const CREATON_FORUM_VOTE_COLLECTION = "app.creaton.forum.vote";
export const CREATON_FORUM_ROLE_GRANT_COLLECTION = "app.creaton.forum.roleGrant";
export const CREATON_FORUM_MOD_ACTION_COLLECTION = "app.creaton.forum.modAction";
export const CREATON_FORUM_MOD_LOG_COLLECTION = "app.creaton.forum.modLog";
export const CREATON_FORUM_SANCTION_COLLECTION = "app.creaton.forum.sanction";
export const CREATON_FORUM_REVIEW_ACTION_COLLECTION = "app.creaton.forum.reviewAction";
export const CREATON_FORUM_BOARD_REPORT_COLLECTION = "app.creaton.forum.boardReport";
export const CREATON_FORUM_BOARD_REPORT_ACTION_COLLECTION =
  "app.creaton.forum.boardReportAction";
export const CREATON_FORUM_BOOKMARK_COLLECTION = "app.creaton.forum.bookmark";
export const CREATON_FORUM_SUBSCRIPTION_COLLECTION = "app.creaton.forum.subscription";
export const CREATON_FORUM_DIRECTORY_URI =
  "at://did:web:creaton.social/app.creaton.forum.directory/global";

export type StrongRef = {
  uri: string;
  cid: string;
};

export type CreatonForumBoardRecord = {
  $type: typeof CREATON_FORUM_BOARD_COLLECTION;
  title: string;
  category?: string;
  description?: string;
  slug?: string;
  directoryUri?: string;
  scope: "studio" | "standalone" | "creator" | string;
  studioUri?: string;
  creatorBoard?: {
    kind: "creator";
    supportLabel?: string;
    treasury?: string;
  };
  rules?: string;
  access?: CreatonForumAccessPolicy;
  postingMode?: "public" | "mixed" | "encrypted";
  createdAt: string;
  updatedAt?: string;
};

export type CreatonForumAccessPolicy = {
  kind: "protected";
  issuerDid: string;
  issuerEndpoint: string;
  paymentProtocol: "mpp" | "tempo";
  chainId: 2741 | 11124 | 4217 | 42429;
  asset: string;
  amount: string;
  durationSeconds: number;
  payTo: string;
  revenueRouter: string;
  committeeRegistry: string;
  entitlementRegistry: string;
  committeeSize: 15;
  committeeThreshold: 10;
  historyPolicy: "full" | "window" | "forward";
  epochSeconds: 86400;
};

export type CreatonForumEncryptedContentV1 = {
  version: 1;
  suite: "BLS12-381-THRESHOLD-DH/HKDF-SHA256/AES-256-GCM";
  epoch: string;
  salt: { $bytes: string };
  nonce: { $bytes: string };
  ciphertext: { $bytes: string };
};

export type CreatonForumEncryptedContentV2 = Omit<
  CreatonForumEncryptedContentV1,
  "version"
> & {
  version: 2;
  committeeEpoch: number;
  keyEpochUri: string;
};

export type CreatonForumEncryptedContentV3 = Omit<
  CreatonForumEncryptedContentV1,
  "version"
> & {
  version: 3;
  committeeEpoch: number;
  keyCapsuleUri: string;
};

export type CreatonForumEncryptedContent =
  | CreatonForumEncryptedContentV1
  | CreatonForumEncryptedContentV2
  | CreatonForumEncryptedContentV3;

export type CreatonForumKeyCapsuleRecord = {
  $type: typeof CREATON_FORUM_KEY_CAPSULE_COLLECTION;
  board: StrongRef;
  recordUri: string;
  committeeEpoch: number;
  policyHash: { $bytes: string };
  version: 1;
  suite: "BLS12-381-THRESHOLD-DH/HKDF-SHA256/AES-256-GCM";
  encapsulation: { $bytes: string };
  nonce: { $bytes: string };
  ciphertext: { $bytes: string };
  keyCommitment: { $bytes: string };
  createdAt: string;
};

export type CreatonForumEncryptedAttachment = {
  version: 1;
  suite: "AES-256-GCM+HKDF-SHA256/AES-256-GCM";
  epoch: string;
  keyEpochUri: string;
  manifestUri: string;
  ciphertextHash: { $bytes: string };
  size: number;
  mediaType?: string;
  name?: string;
  fileNonce: { $bytes: string };
  keyNonce: { $bytes: string };
  wrappedFileKey: { $bytes: string };
};

/** Blob reference as stored on ATProto records after uploadBlob. */
export type CreatonAtprotoBlobRef = {
  $type?: "blob";
  ref: { $link: string } | { toString(): string };
  mimeType: string;
  size: number;
};

export type CreatonForumVideoSegment = {
  name: string;
  blob: CreatonAtprotoBlobRef;
};

export type CreatonForumVideoEncryption = {
  version: 1;
  suite: "AES-128-CBC-HLS+HKDF-SHA256/AES-GCM";
  epoch: string;
  keyEpochUri: string;
  keyNonce: { $bytes: string };
  wrappedKey: { $bytes: string };
  iv: { $bytes: string };
};

export type CreatonForumVideoAsset = {
  version: 1;
  playlist: CreatonAtprotoBlobRef;
  segments: CreatonForumVideoSegment[];
  duration?: number;
  width?: number;
  height?: number;
  encryption?: CreatonForumVideoEncryption;
};

export type CreatonForumTopicRecord = {
  $type: typeof CREATON_FORUM_TOPIC_COLLECTION;
  board: StrongRef;
  title: string;
  body?: string;
  protectedBody?: CreatonForumEncryptedContent;
  protectedAttachments?: CreatonForumEncryptedAttachment[];
  video?: CreatonForumVideoAsset;
  status?: "open" | "locked" | "resolved";
  pinned?: boolean;
  movedTo?: StrongRef;
  linkUrl?: string;
  tags?: string[];
  productionStage?: string;
  artifactUri?: string;
  studioUri?: string;
  createdAt: string;
  updatedAt?: string;
};

export type CreatonForumCommentRecord = {
  $type: typeof CREATON_FORUM_COMMENT_COLLECTION;
  topic: StrongRef;
  parent?: StrongRef;
  body?: string;
  protectedBody?: CreatonForumEncryptedContent;
  protectedAttachments?: CreatonForumEncryptedAttachment[];
  video?: CreatonForumVideoAsset;
  createdAt: string;
  updatedAt?: string;
};

export type CreatonForumKeyGrantRecord = {
  $type: typeof CREATON_FORUM_KEY_GRANT_COLLECTION;
  board: StrongRef;
  grantId: string;
  sessionKeyHash: { $bytes: string };
  certificateHash: { $bytes: string };
  epochFrom: string;
  epochTo: string;
  expiresAt: string;
  version: 2;
  suite: "DHKEM-P256-HKDF-SHA256/HKDF-SHA256/AES-256-GCM";
  enc: { $bytes: string };
  ciphertext: { $bytes: string };
  keyCommitment: { $bytes: string };
  createdAt: string;
};

export type CreatonForumMemberRecord = {
  $type: typeof CREATON_FORUM_MEMBER_COLLECTION;
  board: StrongRef;
  role?: "member" | "moderator" | "owner";
  createdAt: string;
};

export type CreatonForumVoteRecord = {
  $type: typeof CREATON_FORUM_VOTE_COLLECTION;
  subject: StrongRef;
  direction: "up" | "down";
  createdAt: string;
};

export type CreatonForumRoleGrantRecord = {
  $type: typeof CREATON_FORUM_ROLE_GRANT_COLLECTION;
  board: StrongRef;
  subject: string;
  role: "moderator" | "owner";
  createdAt: string;
  revokedAt?: string;
};

export type CreatonForumModActionRecord = {
  $type: typeof CREATON_FORUM_MOD_ACTION_COLLECTION;
  board: StrongRef;
  subject: StrongRef;
  action: "pin" | "unpin" | "lock" | "unlock" | "move" | "merge";
  movedTo?: StrongRef;
  note?: string;
  createdAt: string;
};

export type CreatonForumModLogRecord = {
  $type: typeof CREATON_FORUM_MOD_LOG_COLLECTION;
  board: StrongRef;
  subject?: StrongRef;
  action: string;
  related?: StrongRef;
  note?: string;
  createdAt: string;
};

export type CreatonForumSanctionRecord = {
  $type: typeof CREATON_FORUM_SANCTION_COLLECTION;
  board: StrongRef;
  subject: string;
  kind: "mute" | "ban" | "postApproval";
  reason?: string;
  expiresAt?: string;
  createdAt: string;
  revokedAt?: string;
};

export type CreatonForumReviewActionRecord = {
  $type: typeof CREATON_FORUM_REVIEW_ACTION_COLLECTION;
  board: StrongRef;
  subject: StrongRef;
  action: "approve" | "reject" | "hide" | "restore";
  reason?: string;
  createdAt: string;
};

export type CreatonForumBoardReportRecord = {
  $type: typeof CREATON_FORUM_BOARD_REPORT_COLLECTION;
  board: StrongRef;
  subject: StrongRef;
  reasonType: "spam" | "rules" | "harassment" | "other";
  reason?: string;
  createdAt: string;
  resolvedAt?: string;
};

export type CreatonForumBoardReportActionRecord = {
  $type: typeof CREATON_FORUM_BOARD_REPORT_ACTION_COLLECTION;
  board: StrongRef;
  report: StrongRef;
  action: "resolve" | "reopen";
  note?: string;
  createdAt: string;
};

export type CreatonForumBookmarkRecord = {
  $type: typeof CREATON_FORUM_BOOKMARK_COLLECTION;
  subject: StrongRef;
  board?: StrongRef;
  createdAt: string;
};

export type CreatonForumSubscriptionRecord = {
  $type: typeof CREATON_FORUM_SUBSCRIPTION_COLLECTION;
  subject: StrongRef;
  kind: "board" | "topic";
  createdAt: string;
};
