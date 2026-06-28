import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Agent } from '@atproto/api'
import { createForumBoard, parseAtUri } from '@creaton/forum-core'
import { Dialog, Sheet, SizableText, useMedia, XStack, YStack } from 'tamagui'

import { boardIdFromUri, provisionDevBoardDkgKey } from '~/features/forums/crypto/devBoardDkg'
import { isProductionForumCrypto } from '~/features/forums/crypto/forumCryptoMode'
import { Button } from '~/interface/buttons/Button'
import { Input } from '~/interface/forms/Input'

import { ClientSheet } from './ClientSheet'

type PostingMode = 'public' | 'encrypted'
type BoardType = 'community' | 'creator'
type HistoryPolicy = 'full' | 'window' | 'forward'

const POSTING_MODES: Array<{ value: PostingMode; label: string }> = [
  { value: 'public', label: 'Public board' },
  { value: 'encrypted', label: 'Member-only (encrypted)' },
]

function protectedAccessPolicy(input: {
  payTo: string
  price: string
  durationDays: string
  historyPolicy: HistoryPolicy
}) {
  const required = (name: string) => {
    const value = import.meta.env[name]
    if (!value) throw new Error(`Paid forum deployment is missing ${name}.`)
    return value
  }
  const amount = usdcUnits(input.price)
  const days = Number(input.durationDays)
  if (!Number.isInteger(days) || days < 1 || days > 3650) {
    throw new Error('Access duration must be 1–3650 days.')
  }
  return {
    kind: 'protected' as const,
    issuerDid: required('VITE_FORUM_ISSUER_DID'),
    issuerEndpoint: required('VITE_CREATON_FORUM_APPVIEW_URL'),
    paymentProtocol: 'tempo' as const,
    chainId: Number(required('VITE_TEMPO_CHAIN_ID')) as 4217 | 42429,
    asset: required('VITE_TEMPO_PATHUSD_ADDRESS'),
    amount,
    durationSeconds: days * 86_400,
    payTo: input.payTo,
    revenueRouter: required('VITE_FORUM_REVENUE_ROUTER'),
    committeeRegistry: required('VITE_FORUM_COMMITTEE_REGISTRY'),
    entitlementRegistry: required('VITE_FORUM_ENTITLEMENT_REGISTRY'),
    committeeSize: 15 as const,
    committeeThreshold: 10 as const,
    historyPolicy: input.historyPolicy,
    epochSeconds: 86_400 as const,
  }
}

function requiredDeployment(name: string): string {
  const value = import.meta.env[name]
  if (!value) throw new Error(`Paid forum deployment is missing ${name}.`)
  return value
}

function requiredAddressInput(value: string, label: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error(`${label} must be a 0x EVM address.`)
  return value
}

function usdcUnits(value: string): string {
  if (!/^\d+(?:\.\d{1,6})?$/.test(value)) throw new Error('Price must be a positive USDC amount.')
  const [whole, fraction = ''] = value.split('.')
  const amount = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'))
  if (amount <= 0n) throw new Error('Price must be positive.')
  return amount.toString()
}

function CreateBoardForm({
  title,
  setTitle,
  description,
  setDescription,
  boardType,
  setBoardType,
  postingMode,
  setPostingMode,
  price,
  setPrice,
  durationDays,
  setDurationDays,
  historyPolicy,
  setHistoryPolicy,
  supportLabel,
  setSupportLabel,
  treasury,
  setTreasury,
  error,
  agent,
  busy,
  onCreate,
}: {
  title: string
  setTitle: (value: string) => void
  description: string
  setDescription: (value: string) => void
  boardType: BoardType
  setBoardType: (value: BoardType) => void
  postingMode: PostingMode
  setPostingMode: (value: PostingMode) => void
  price: string
  setPrice: (value: string) => void
  durationDays: string
  setDurationDays: (value: string) => void
  historyPolicy: HistoryPolicy
  setHistoryPolicy: (value: HistoryPolicy) => void
  supportLabel: string
  setSupportLabel: (value: string) => void
  treasury: string
  setTreasury: (value: string) => void
  error: string
  agent: Agent | null
  busy: boolean
  onCreate: () => void
}) {
  const protectedBoard = postingMode !== 'public'

  return (
    <YStack gap="$3">
      <SizableText size="$6" fontWeight="700">
        Create a new board
      </SizableText>

      <Input placeholder="Board title" value={title} onChangeText={setTitle} />

      <YStack gap="$1">
        <SizableText size="$3" fontWeight="600" opacity={0.7}>
          Board type
        </SizableText>
        <XStack gap="$2" flexWrap="wrap">
          {(['community', 'creator'] as const).map((type) => (
            <Button
              key={type}
              size="$3"
              theme={boardType === type ? 'blue' : undefined}
              variant={boardType === type ? undefined : 'outlined'}
              onPress={() => setBoardType(type)}
            >
              {type === 'community' ? 'Community board' : 'Creator board'}
            </Button>
          ))}
        </XStack>
      </YStack>

      {boardType === 'creator' ? (
        <YStack gap="$2">
          <Input
            placeholder="Membership label, e.g. Supporter"
            value={supportLabel}
            onChangeText={setSupportLabel}
          />
          <Input
            placeholder="Creator treasury 0x…"
            value={treasury}
            onChangeText={setTreasury}
          />
        </YStack>
      ) : null}

      <YStack gap="$1">
        <SizableText size="$3" fontWeight="600" opacity={0.7}>
          Posting mode
        </SizableText>
        <XStack gap="$2" flexWrap="wrap">
          {POSTING_MODES.map((mode) => (
            <Button
              key={mode.value}
              size="$3"
              theme={postingMode === mode.value ? 'blue' : undefined}
              variant={postingMode === mode.value ? undefined : 'outlined'}
              onPress={() => setPostingMode(mode.value)}
            >
              {mode.label}
            </Button>
          ))}
        </XStack>
      </YStack>

      {protectedBoard && !isProductionForumCrypto() ? (
        <SizableText size="$2" opacity={0.6}>
          Dev crypto mode uses local DKG only — no on-chain payment setup required.
        </SizableText>
      ) : null}

      {protectedBoard && isProductionForumCrypto() ? (
        <YStack gap="$2" p="$3" borderWidth={1} borderColor="$color5" rounded="$4">
          <Input placeholder="Price in USDC" value={price} onChangeText={setPrice} />
          <Input
            placeholder="Access duration in days"
            value={durationDays}
            onChangeText={setDurationDays}
          />
          <SizableText size="$3" fontWeight="600" opacity={0.7}>
            Archive access
          </SizableText>
          <XStack gap="$2" flexWrap="wrap">
            {(
              [
                ['full', 'Full archive'],
                ['window', 'Recent window'],
                ['forward', 'From purchase'],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                size="$2"
                theme={historyPolicy === value ? 'blue' : undefined}
                variant={historyPolicy === value ? undefined : 'outlined'}
                onPress={() => setHistoryPolicy(value)}
              >
                {label}
              </Button>
            ))}
          </XStack>
          <SizableText size="$2" opacity={0.6}>
            Pricing becomes immutable after the first member-only post.
          </SizableText>
        </YStack>
      ) : null}

      <Input
        placeholder="Short description (optional)"
        value={description}
        onChangeText={setDescription}
        multiline
        height={80}
      />

      {error ? (
        <SizableText size="$3" color="$red10">
          {error}
        </SizableText>
      ) : null}

      <Button theme="blue" disabled={!agent || busy || !title.trim()} onPress={onCreate}>
        {busy ? 'Creating...' : 'Create board'}
      </Button>
    </YStack>
  )
}

export function CreateBoardSheet({
  open,
  onOpenChange,
  agent,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  agent: Agent | null
  onCreated?: () => void
}) {
  const queryClient = useQueryClient()
  const media = useMedia()
  const isDesktop = media.md
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [boardType, setBoardType] = useState<BoardType>('creator')
  const [postingMode, setPostingMode] = useState<PostingMode>('public')
  const [price, setPrice] = useState('1')
  const [durationDays, setDurationDays] = useState('30')
  const [historyPolicy, setHistoryPolicy] = useState<HistoryPolicy>('full')
  const [supportLabel, setSupportLabel] = useState('Supporter')
  const [treasury, setTreasury] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const reset = () => {
    setTitle('')
    setDescription('')
    setBoardType('creator')
    setPostingMode('public')
    setPrice('1')
    setDurationDays('30')
    setHistoryPolicy('full')
    setSupportLabel('Supporter')
    setTreasury('')
    setError('')
  }

  const handleCreate = async () => {
    if (!agent || !title.trim()) return
    setBusy(true)
    setError('')
    try {
      const protectedBoard = postingMode !== 'public'
      const creatorTreasury = treasury.trim()
      const created = await createForumBoard(agent, {
        title: title.trim(),
        description: description.trim() || undefined,
        postingMode,
        scope: boardType === 'creator' ? 'creator' : 'standalone',
        creatorBoard:
          boardType === 'creator'
            ? {
                kind: 'creator',
                supportLabel: supportLabel.trim() || 'Supporter',
                treasury: creatorTreasury || undefined,
              }
            : undefined,
        access:
          protectedBoard && isProductionForumCrypto()
            ? protectedAccessPolicy({
                payTo:
                  boardType === 'creator'
                    ? requiredAddressInput(creatorTreasury, 'Creator treasury')
                    : requiredDeployment('VITE_TEMPO_BOARD_PAY_TO'),
                price,
                durationDays,
                historyPolicy,
              })
            : undefined,
      })

      if (postingMode === 'encrypted' && !isProductionForumCrypto()) {
        const parsed = parseAtUri(created.uri)
        if (parsed && agent.did) {
          await provisionDevBoardDkgKey(boardIdFromUri(created.uri), agent.did)
        }
      }

      reset()
      onOpenChange(false)
      onCreated?.()
      void queryClient.invalidateQueries({ queryKey: ['forum-your-boards'] })
      void queryClient.invalidateQueries({ queryKey: ['forum-discover-boards'] })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to create board.')
    } finally {
      setBusy(false)
    }
  }

  const formProps = {
    title,
    setTitle,
    description,
    setDescription,
    boardType,
    setBoardType,
    postingMode,
    setPostingMode,
    price,
    setPrice,
    durationDays,
    setDurationDays,
    historyPolicy,
    setHistoryPolicy,
    supportLabel,
    setSupportLabel,
    treasury,
    setTreasury,
    error,
    agent,
    busy,
    onCreate: handleCreate,
  }

  return (
    <ClientSheet>
      {isDesktop ? (
        <Dialog open={open} onOpenChange={onOpenChange} modal>
          <Dialog.Portal justify="flex-start" pt="$6" px="$4">
            <Dialog.Overlay
              key="overlay"
              opacity={0.5}
              enterStyle={{ opacity: 0 }}
              exitStyle={{ opacity: 0 }}
            />
            <Dialog.Content
              bordered
              elevate
              key="content"
              enterStyle={{ y: -12, opacity: 0 }}
              exitStyle={{ y: -12, opacity: 0 }}
              maxW={420}
              width="100%"
              p="$4"
            >
              <CreateBoardForm {...formProps} />
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog>
      ) : (
        <Sheet
          open={open}
          onOpenChange={onOpenChange}
          modal
          snapPoints={[70]}
          dismissOnSnapToBottom
        >
          <Sheet.Overlay />
          <Sheet.Frame p="$4">
            <CreateBoardForm {...formProps} />
          </Sheet.Frame>
        </Sheet>
      )}
    </ClientSheet>
  )
}
