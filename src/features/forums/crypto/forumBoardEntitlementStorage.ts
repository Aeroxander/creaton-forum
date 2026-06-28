import { del, get, set } from 'idb-keyval'

const STORAGE_PREFIX = 'creaton-forum-board-entitlement:v1:'

export type ForumBoardEntitlement = {
  validFrom: string
  validUntil: string
  paymentRef: string | null
}

export async function saveForumBoardEntitlement(input: {
  did: string
  boardUri: string
  entitlement: ForumBoardEntitlement
}): Promise<void> {
  await set(storageKey(input.did, input.boardUri), input.entitlement)
}

export async function loadForumBoardEntitlement(input: {
  did: string
  boardUri: string
}): Promise<ForumBoardEntitlement | null> {
  return (await get<ForumBoardEntitlement>(storageKey(input.did, input.boardUri))) ?? null
}

export async function deleteForumBoardEntitlement(did: string, boardUri: string): Promise<void> {
  await del(storageKey(did, boardUri))
}

function storageKey(did: string, boardUri: string): string {
  return `${STORAGE_PREFIX}${did}:${boardUri}`
}
