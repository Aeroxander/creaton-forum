import { execSync, spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createForumKeyCapsule,
  decryptForumContent,
  encryptForumContent,
  generateForumEpochKey,
} from "./forumContentCrypto";
import type { CreatonForumKeyCapsuleRecord } from "../forumTypes";

const BOARD_ID = "test-board-crypto";
const BOARD_URI = `at://did:creator/app.creaton.forum.board/${BOARD_ID}`;
const ADMIN_TOKEN = "test-admin-token";
const PORT = 3031;

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

describe("forumContentCrypto", () => {
  let service: ReturnType<typeof spawn> | null = null;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "dkg-"));
    const setupPath = join(tmpDir, "golden.setup");
    const dataDir = join(tmpDir, "data");
    const stateKey = randomBytes(32).toString("hex");
    const binary = binaryPath();

    execSync(
      `${binary} --generate-golden-setup ${setupPath} --max-players 8 --state-key ${stateKey} --admin-token ${ADMIN_TOKEN}`,
      { stdio: "inherit" },
    );

    process.env.VITE_DKG_SERVICE_URL = `http://127.0.0.1:${PORT}`;
    service = spawn(binary, [
      "--golden-setup", setupPath,
      "--port", PORT.toString(),
      "--data-dir", dataDir,
      "--state-key", stateKey,
      "--admin-token", ADMIN_TOKEN,
      "--max-players", "8",
    ], { stdio: "pipe" });

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
            { id: "mod-b", publicKey: "mod-b-pk" },
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

  it("encrypts and decrypts forum content through the DKG service", async () => {
    const epochKey = generateForumEpochKey();
    const recordUri = "at://did:creator/app.creaton.forum.topic/test-record";
    const keyCapsuleUri = "at://did:creator/app.creaton.forum.keyCapsule/test-capsule";

    const keyCapsule = await createForumKeyCapsule({
      contentKey: epochKey,
      boardUri: BOARD_URI,
      recordUri,
      capsuleUri: keyCapsuleUri,
      committeeEpoch: 1,
      policyHash: randomBytes(32).toString("base64url"),
      createdAt: new Date().toISOString(),
    });

    const plaintext = "hello encrypted creator board";
    const protectedBody = await encryptForumContent({
      plaintext,
      epochKey,
      context: {
        boardUri: BOARD_URI,
        recordUri,
        epoch: "1",
        committeeEpoch: 1,
        keyCapsuleUri,
      },
    });

    const keyCapsuleRecord: CreatonForumKeyCapsuleRecord = {
      $type: "app.creaton.forum.keyCapsule",
      board: { uri: BOARD_URI, cid: "board-cid" },
      recordUri,
      committeeEpoch: 1,
      policyHash: { $bytes: randomBytes(32).toString("base64url") },
      version: 1,
      suite: "BLS12-381-THRESHOLD-DH/HKDF-SHA256/AES-256-GCM",
      encapsulation: { $bytes: keyCapsule.encapsulation },
      nonce: { $bytes: keyCapsule.nonce },
      ciphertext: { $bytes: keyCapsule.ciphertext },
      keyCommitment: { $bytes: keyCapsule.keyCommitment },
      createdAt: keyCapsule.createdAt,
    };

    const decrypted = await decryptForumContent({
      protectedBody,
      keyCapsule: keyCapsuleRecord,
      participantIds: ["creator", "mod-a"],
    });

    expect(decrypted).toBe(plaintext);
  });
});
