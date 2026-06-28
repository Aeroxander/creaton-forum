import { execSync, spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Agent } from "@atproto/api";
import { TID } from "@atproto/common-web";

import {
  createEncryptedForumComment,
  createEncryptedForumTopic,
  getForumKeyCapsule,
} from "./forumRepository";
import { decryptForumContent } from "./crypto/forumContentCrypto";
import {
  CREATON_FORUM_COMMENT_COLLECTION,
  CREATON_FORUM_KEY_CAPSULE_COLLECTION,
  CREATON_FORUM_TOPIC_COLLECTION,
  type CreatonForumKeyCapsuleRecord,
} from "./forumTypes";

const BOARD_ID = "test-board-repo";
const BOARD_URI = `at://did:creator/app.creaton.forum.board/${BOARD_ID}`;
const BOARD_CID = "board-cid";
const ADMIN_TOKEN = "test-admin-token";
const PORT = 3032;

function binaryPath() {
  return join(process.cwd(), "packages/dkg-service/target/debug/dkg-service");
}

async function waitForHealth(baseUrl: string) {
  for (let i = 0; i < 120; i++) {
    try {
      const resp = await fetch(`${baseUrl}/health`);
      if (resp.ok) {
        const body = (await resp.json()) as { goldenSetupReady?: boolean };
        if (body.goldenSetupReady) return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("DKG service did not become healthy");
}

function makeMockAgent() {
  const records = new Map<string, { uri: string; cid: string; value: unknown }>();
  const agent = {
    did: "did:creator",
    com: {
      atproto: {
        repo: {
          createRecord: async (input: {
            repo: string;
            collection: string;
            record: unknown;
            rkey?: string;
          }) => {
            const rkey = input.rkey ?? TID.next().toString();
            const uri = `at://${input.repo}/${input.collection}/${rkey}`;
            const cid = `cid-${rkey}`;
            records.set(uri, { uri, cid, value: input.record });
            return { data: { uri, cid } };
          },
          deleteRecord: async (input: {
            repo: string;
            collection: string;
            rkey: string;
          }) => {
            records.delete(`at://${input.repo}/${input.collection}/${input.rkey}`);
            return {};
          },
          listRecords: async (input: {
            repo: string;
            collection: string;
            limit?: number;
            cursor?: string;
          }) => {
            const items = Array.from(records.values()).filter((record) =>
              record.uri.includes(`/${input.collection}/`),
            );
            return { data: { records: items.slice(0, input.limit ?? 100) } };
          },
        },
      },
    },
  } as unknown as Agent;

  return { agent, records };
}

describe("forumRepository encrypted writes", () => {
  let service: ReturnType<typeof spawn> | null = null;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "dkg-repo-"));
    const setupPath = join(tmpDir, "golden.setup");
    const dataDir = join(tmpDir, "data");
    const stateKey = randomBytes(32).toString("hex");
    const binary = binaryPath();

    execSync(
      `${binary} --generate-golden-setup ${setupPath} --max-players 8 --state-key ${stateKey} --admin-token ${ADMIN_TOKEN}`,
      { stdio: "inherit" },
    );

    process.env.VITE_DKG_SERVICE_URL = `http://127.0.0.1:${PORT}`;
    service = spawn(
      binary,
      [
        "--golden-setup",
        setupPath,
        "--port",
        PORT.toString(),
        "--data-dir",
        dataDir,
        "--state-key",
        stateKey,
        "--admin-token",
        ADMIN_TOKEN,
        "--max-players",
        "8",
      ],
      { stdio: "pipe" },
    );

    await waitForHealth(process.env.VITE_DKG_SERVICE_URL);

    const resp = await fetch(
      `${process.env.VITE_DKG_SERVICE_URL}/v1/boards/${BOARD_ID}/key`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${ADMIN_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          participants: [
            { id: "creator", publicKey: "creator-pk" },
            { id: "mod-a", publicKey: "mod-a-pk" },
          ],
          threshold: 2,
        }),
      },
    );
    expect(resp.ok).toBe(true);
  }, 300_000);

  afterAll(() => {
    service?.kill();
  });

  function policyHash() {
    return `0x${randomBytes(32).toString("hex")}`;
  }

  it("creates and decrypts an encrypted topic", async () => {
    const { agent, records } = makeMockAgent();
    const body = "secret encrypted topic body";

    const topic = await createEncryptedForumTopic(agent, {
      board: { uri: BOARD_URI, cid: BOARD_CID },
      title: "Encrypted Topic",
      body,
      encryption: { committeeEpoch: 1, policyHash: policyHash() },
    });

    expect(topic.value.protectedBody).toBeDefined();
    expect(topic.value.body).toBeUndefined();
    expect(topic.value.title).toBe("Encrypted Topic");
    expect(topic.value.board.uri).toBe(BOARD_URI);
    expect(topic.uri).toContain(CREATON_FORUM_TOPIC_COLLECTION);

    const capsuleEntry = Array.from(records.values()).find(
      (record) =>
        record.uri.includes(`/${CREATON_FORUM_KEY_CAPSULE_COLLECTION}/`) &&
        (record.value as CreatonForumKeyCapsuleRecord).board.uri === BOARD_URI,
    );
    expect(capsuleEntry).toBeDefined();

    const decrypted = await decryptForumContent({
      protectedBody: topic.value.protectedBody!,
      keyCapsule: capsuleEntry!.value as CreatonForumKeyCapsuleRecord,
      participantIds: ["creator", "mod-a"],
    });

    expect(decrypted).toBe(body);
  });

  it("creates and decrypts an encrypted comment", async () => {
    const { agent, records } = makeMockAgent();
    const body = "secret encrypted comment body";
    const topicRef = { uri: "at://did:creator/app.creaton.forum.topic/topic1", cid: "topic-cid" };

    const comment = await createEncryptedForumComment(agent, {
      board: { uri: BOARD_URI, cid: BOARD_CID },
      topic: topicRef,
      body,
      encryption: { committeeEpoch: 1, policyHash: policyHash() },
    });

    expect(comment.value.protectedBody).toBeDefined();
    expect(comment.value.body).toBeUndefined();
    expect(comment.value.topic.uri).toBe(topicRef.uri);
    expect(comment.uri).toContain(CREATON_FORUM_COMMENT_COLLECTION);

    const capsuleEntry = Array.from(records.values()).find(
      (record) =>
        record.uri.includes(`/${CREATON_FORUM_KEY_CAPSULE_COLLECTION}/`) &&
        (record.value as CreatonForumKeyCapsuleRecord).recordUri === comment.uri,
    );
    expect(capsuleEntry).toBeDefined();

    const decrypted = await decryptForumContent({
      protectedBody: comment.value.protectedBody!,
      keyCapsule: capsuleEntry!.value as CreatonForumKeyCapsuleRecord,
      participantIds: ["creator", "mod-a"],
    });

    expect(decrypted).toBe(body);
  });

  it("fetches a key capsule by URI", async () => {
    const { agent, records } = makeMockAgent();

    const topic = await createEncryptedForumTopic(agent, {
      board: { uri: BOARD_URI, cid: BOARD_CID },
      title: "Capsule fetch test",
      body: "body",
      encryption: { committeeEpoch: 1, policyHash: policyHash() },
    });

    const capsuleEntry = Array.from(records.values()).find(
      (record) => record.uri.includes(`/${CREATON_FORUM_KEY_CAPSULE_COLLECTION}/`),
    );
    expect(capsuleEntry).toBeDefined();

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input);
      if (url.includes("getUriRecord")) {
        return new Response(
          JSON.stringify({
            uri: capsuleEntry!.uri,
            cid: capsuleEntry!.cid,
            value: capsuleEntry!.value,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return originalFetch(input);
    }) as typeof fetch;

    try {
      const fetched = await getForumKeyCapsule({ uri: capsuleEntry!.uri });
      expect(fetched.uri).toBe(capsuleEntry!.uri);
      expect(fetched.value.committeeEpoch).toBe(1);
      expect(fetched.value.recordUri).toBe(topic.uri);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
