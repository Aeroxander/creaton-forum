import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { SizableText, XStack, YStack } from 'tamagui'
import {
  actOnForumBoardReport,
  buildForumReportReversalContext,
  canModerateForumBoard,
  getForumBoardMembership,
  getForumModLogReversal,
  grantForumRole,
  listForumBoardReportActions,
  listForumBoardReports,
  listForumModActions,
  listForumModLog,
  listForumReviewActions,
  listForumRoleGrants,
  listForumSanctions,
  listForumTopics,
  parseAtUri,
  revokeForumRole,
  revokeForumSanction,
  resolveForumSubjectVisibility,
  reverseForumModLogAction,
  setForumReviewAction,
  setForumSanction,
  type CreatonForumBoardRecord,
  type ForumModLogReversal,
  type ForumRecord,
} from '@creaton/forum-core'

import { ForumActorLabel, ForumSubjectPreview } from '~/features/forums/ui/ForumSubjectPreview'
import { ForumEmpty } from '~/features/forums/ui/ForumChrome'
import { formatForumDate } from '~/features/forums/ui/forumUtils'
import { useForumConfig } from '~/features/forums/useForumQueries'
import { Button } from '~/interface/buttons/Button'
import { Input } from '~/interface/forms/Input'
import { useQueryIdentity } from '~/features/profile/profileQueries'
import { useAuth } from '~/providers/UnifiedAuthProvider'

type ModTab = 'reports' | 'queue' | 'sanctions' | 'log' | 'team'

const SANCTION_LABELS: Record<'mute' | 'ban' | 'postApproval', string> = {
  postApproval: 'Require approval',
  mute: 'Mute posting',
  ban: 'Ban from board',
}

function ModBadge({ children }: { children: string }) {
  return (
    <SizableText
      size="$2"
      px="$2"
      py="$1"
      rounded="$2"
      bg="$color4"
      fontWeight="600"
      self="flex-start"
    >
      {children}
    </SizableText>
  )
}

function ModTabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ id: ModTab; label: string }>
  active: ModTab
  onChange: (tab: ModTab) => void
}) {
  return (
    <XStack gap="$2" flexWrap="wrap">
      {tabs.map((tab) => (
        <Button
          key={tab.id}
          size="$3"
          theme={active === tab.id ? 'blue' : undefined}
          variant={active === tab.id ? undefined : 'outlined'}
          onPress={() => onChange(tab.id)}
        >
          {tab.label}
        </Button>
      ))}
    </XStack>
  )
}

export function ModerationDashboard({
  board,
}: {
  board: ForumRecord<CreatonForumBoardRecord>
}) {
  const { agent, status } = useAuth()
  const { constellation, slingshoturl } = useForumConfig()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<ModTab>('reports')
  const [moderatorDid, setModeratorDid] = useState('')
  const [sanctionDid, setSanctionDid] = useState('')
  const [sanctionKind, setSanctionKind] = useState<'mute' | 'ban' | 'postApproval'>('postApproval')
  const [sanctionReason, setSanctionReason] = useState('')
  const moderatorIdentity = useQueryIdentity(moderatorDid.trim() || undefined, agent)
  const sanctionIdentity = useQueryIdentity(sanctionDid.trim() || undefined, agent)

  const boardOwnerDid = board ? parseAtUri(board.uri)?.did : undefined

  const membership = useQuery({
    queryKey: ['forum-board-member', board?.uri, agent?.did],
    queryFn: () =>
      agent && board
        ? getForumBoardMembership(agent, { uri: board.uri, cid: board.cid })
        : Promise.resolve(null),
    enabled: status === 'signedIn' && !!agent && !!board,
    staleTime: 30 * 1000,
  })

  const roleGrants = useQuery({
    queryKey: ['forum-role-grants', board?.uri, boardOwnerDid, constellation, slingshoturl],
    queryFn: () =>
      board && boardOwnerDid
        ? listForumRoleGrants({
            board: { uri: board.uri, cid: board.cid },
            boardOwnerDid,
            constellation,
            slingshoturl,
          })
        : Promise.resolve([]),
    enabled: !!board && !!boardOwnerDid && status !== 'loading',
    staleTime: 30 * 1000,
  })

  const boardReports = useQuery({
    queryKey: [
      'forum-board-reports',
      board?.uri,
      roleGrants.data?.map((grant) => grant.uri).join('|'),
      constellation,
      slingshoturl,
    ],
    queryFn: () =>
      board
        ? listForumBoardReports({
            board: { uri: board.uri, cid: board.cid },
            grants: roleGrants.data,
            constellation,
            slingshoturl,
          })
        : Promise.resolve([]),
    enabled: !!board && status !== 'loading',
    staleTime: 30 * 1000,
  })

  const allBoardReports = useQuery({
    queryKey: [
      'forum-board-reports-all',
      board?.uri,
      roleGrants.data?.map((grant) => grant.uri).join('|'),
      constellation,
      slingshoturl,
    ],
    queryFn: () =>
      board
        ? listForumBoardReports({
            board: { uri: board.uri, cid: board.cid },
            grants: roleGrants.data,
            constellation,
            slingshoturl,
            includeResolved: true,
          })
        : Promise.resolve([]),
    enabled: !!board && status !== 'loading',
    staleTime: 30 * 1000,
  })

  const topics = useQuery({
    queryKey: ['forum-topics', board?.uri, agent?.did ?? 'signed-out', constellation, slingshoturl],
    queryFn: () =>
      board
        ? listForumTopics({
            board: { uri: board.uri, cid: board.cid },
            constellation,
            slingshoturl,
          })
        : Promise.resolve([]),
    enabled: !!board && status !== 'loading',
    staleTime: 60 * 1000,
  })

  const topicSubjects = (topics.data ?? []).map((topic) => ({ uri: topic.uri, cid: topic.cid }))

  const modLog = useQuery({
    queryKey: [
      'forum-mod-log',
      board?.uri,
      roleGrants.data?.map((grant) => grant.uri).join('|'),
      constellation,
      slingshoturl,
    ],
    queryFn: () =>
      board
        ? listForumModLog({
            board: { uri: board.uri, cid: board.cid },
            grants: roleGrants.data,
            constellation,
            slingshoturl,
          })
        : Promise.resolve([]),
    enabled: !!board && status !== 'loading',
    staleTime: 30 * 1000,
  })

  const logSubjects = (() => {
    const subjects = new Map<string, { uri: string; cid: string }>()
    for (const topic of topicSubjects) {
      subjects.set(topic.uri, topic)
    }
    for (const entry of modLog.data ?? []) {
      const subject = entry.value.subject
      if (!subject?.uri || !subject.cid) continue
      const action = entry.value.action
      if (
        action.startsWith('review:') ||
        action === 'pin' ||
        action === 'unpin' ||
        action === 'lock' ||
        action === 'unlock'
      ) {
        subjects.set(subject.uri, subject)
      }
    }
    return [...subjects.values()]
  })()

  const reviewActions = useQuery({
    queryKey: [
      'forum-review-actions',
      board?.uri,
      logSubjects.map((subject) => subject.uri).join('|'),
      roleGrants.data?.map((grant) => grant.uri).join('|'),
      constellation,
      slingshoturl,
    ],
    queryFn: () =>
      board
        ? listForumReviewActions({
            board: { uri: board.uri, cid: board.cid },
            subjects: logSubjects,
            grants: roleGrants.data,
            constellation,
            slingshoturl,
          })
        : Promise.resolve([]),
    enabled: !!board && logSubjects.length > 0 && status !== 'loading',
    staleTime: 30 * 1000,
  })

  const modActions = useQuery({
    queryKey: [
      'forum-mod-actions',
      board?.uri,
      logSubjects.map((subject) => subject.uri).join('|'),
      roleGrants.data?.map((grant) => grant.uri).join('|'),
      constellation,
      slingshoturl,
    ],
    queryFn: () =>
      board
        ? listForumModActions({
            board: { uri: board.uri, cid: board.cid },
            subjects: logSubjects,
            grants: roleGrants.data,
            constellation,
            slingshoturl,
          })
        : Promise.resolve([]),
    enabled: !!board && logSubjects.length > 0 && status !== 'loading',
    staleTime: 30 * 1000,
  })

  const boardReportActions = useQuery({
    queryKey: [
      'forum-board-report-actions',
      board?.uri,
      roleGrants.data?.map((grant) => grant.uri).join('|'),
      constellation,
      slingshoturl,
    ],
    queryFn: () =>
      board
        ? listForumBoardReportActions({
            board: { uri: board.uri, cid: board.cid },
            grants: roleGrants.data,
            constellation,
            slingshoturl,
          })
        : Promise.resolve([]),
    enabled: !!board && status !== 'loading',
    staleTime: 30 * 1000,
  })

  const sanctions = useQuery({
    queryKey: [
      'forum-sanctions',
      board?.uri,
      roleGrants.data?.map((grant) => grant.uri).join('|'),
      constellation,
      slingshoturl,
    ],
    queryFn: () =>
      board
        ? listForumSanctions({
            board: { uri: board.uri, cid: board.cid },
            grants: roleGrants.data,
            constellation,
            slingshoturl,
          })
        : Promise.resolve([]),
    enabled: !!board && status !== 'loading',
    staleTime: 30 * 1000,
  })

  const moderationLog = (modLog.data ?? []).slice(0, 50)

  const reviewActionsBySubject = (() => {
    const map = new Map<string, NonNullable<typeof reviewActions.data>>()
    for (const action of reviewActions.data ?? []) {
      const subjectUri = action.value.subject?.uri
      if (!subjectUri) continue
      map.set(subjectUri, [...(map.get(subjectUri) ?? []), action])
    }
    return map
  })()

  const modActionsBySubject = (() => {
    const map = new Map<string, NonNullable<typeof modActions.data>>()
    for (const action of modActions.data ?? []) {
      const subjectUri = action.value.subject?.uri
      if (!subjectUri) continue
      map.set(subjectUri, [...(map.get(subjectUri) ?? []), action])
    }
    return map
  })()

  const topicDefaultsByUri = (() => {
    const map = new Map<string, { pinned?: boolean; status?: 'open' | 'locked' | 'resolved' }>()
    for (const topic of topics.data ?? []) {
      map.set(topic.uri, {
        pinned: topic.value.pinned,
        status: topic.value.status,
      })
    }
    return map
  })()

  const reportReversalContext = buildForumReportReversalContext({
    boardReportActions: boardReportActions.data ?? [],
    allBoardReports: allBoardReports.data ?? [],
  })

  const logReversalContext = {
    reviewActionsBySubject,
    modActionsBySubject,
    topicDefaultsByUri,
    ...reportReversalContext,
  }

  const pendingTopics = (topics.data ?? []).filter((topic) => {
    const authorDid = parseAtUri(topic.uri)?.did
    const visibility = resolveForumSubjectVisibility({
      authorDid,
      reviewActions: reviewActionsBySubject.get(topic.uri),
      sanctions: sanctions.data,
    })
    return visibility === 'pending'
  })

  const hiddenTopics = (topics.data ?? []).filter((topic) => {
    const authorDid = parseAtUri(topic.uri)?.did
    const visibility = resolveForumSubjectVisibility({
      authorDid,
      reviewActions: reviewActionsBySubject.get(topic.uri),
      sanctions: sanctions.data,
    })
    return visibility === 'hidden'
  })

  const viewerCanModerate = canModerateForumBoard({
    board,
    membership: membership.data,
    grants: roleGrants.data,
    viewerDid: agent?.did,
  })

  const viewerIsBoardOwner = boardOwnerDid === agent?.did
  const openReportCount = boardReports.data?.length ?? 0
  const queueCount = pendingTopics.length + hiddenTopics.length

  const tabs: Array<{ id: ModTab; label: string }> = [
    {
      id: 'reports',
      label: openReportCount > 0 ? `Reports (${openReportCount})` : 'Reports',
    },
    {
      id: 'queue',
      label: queueCount > 0 ? `Queue (${queueCount})` : 'Queue',
    },
    { id: 'sanctions', label: 'Sanctions' },
    { id: 'log', label: 'Log' },
  ]
  if (viewerIsBoardOwner) {
    tabs.push({ id: 'team', label: 'Team' })
  }

  const grantRoleMutation = useMutation({
    mutationFn: () => {
      if (!agent || !board) throw new Error('Sign in as the board owner first.')
      const subject = moderatorIdentity.data?.did ?? moderatorDid.trim()
      if (!subject) throw new Error('Enter a handle or DID to promote.')
      return grantForumRole(agent, {
        board: { uri: board.uri, cid: board.cid },
        subject,
        role: 'moderator',
      })
    },
    onSuccess: () => {
      setModeratorDid('')
      setError('')
      void queryClient.invalidateQueries({ queryKey: ['forum-role-grants'] })
      void queryClient.invalidateQueries({ queryKey: ['forum-mod-log'] })
    },
    onError: (cause) => {
      setError(cause instanceof Error ? cause.message : 'Failed to grant moderator role.')
    },
  })

  const revokeRoleMutation = useMutation({
    mutationFn: (subject: string) => {
      if (!agent || !board) throw new Error('Sign in as the board owner first.')
      return revokeForumRole(agent, {
        board: { uri: board.uri, cid: board.cid },
        subject,
      })
    },
    onSuccess: () => {
      setError('')
      void queryClient.invalidateQueries({ queryKey: ['forum-role-grants'] })
      void queryClient.invalidateQueries({ queryKey: ['forum-mod-log'] })
    },
    onError: (cause) => {
      setError(cause instanceof Error ? cause.message : 'Failed to revoke moderator role.')
    },
  })

  const reportActionMutation = useMutation({
    mutationFn: (input: {
      report: NonNullable<typeof boardReports.data>[number]
      resolution: 'dismiss' | 'remove'
    }) => {
      if (!agent) throw new Error('Sign in before resolving reports.')
      return actOnForumBoardReport(agent, {
        report: input.report,
        resolution: input.resolution,
        grants: roleGrants.data,
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['forum-board-reports'] })
      void queryClient.invalidateQueries({ queryKey: ['forum-board-reports-all'] })
      void queryClient.invalidateQueries({ queryKey: ['forum-board-report-actions'] })
      void queryClient.invalidateQueries({ queryKey: ['forum-review-actions'] })
      void queryClient.invalidateQueries({ queryKey: ['forum-mod-log'] })
      setError('')
    },
    onError: (cause) => {
      setError(cause instanceof Error ? cause.message : 'Failed to act on report.')
    },
  })

  const undoLogMutation = useMutation({
    mutationFn: (reversal: ForumModLogReversal) => {
      if (!agent || !board) throw new Error('Sign in before reversing moderation actions.')
      return reverseForumModLogAction(agent, {
        board: { uri: board.uri, cid: board.cid },
        reversal,
        grants: roleGrants.data,
      })
    },
    onSuccess: (_result, reversal) => {
      void queryClient.invalidateQueries({ queryKey: ['forum-mod-log'] })
      void queryClient.invalidateQueries({ queryKey: ['forum-review-actions'] })
      void queryClient.invalidateQueries({ queryKey: ['forum-mod-actions'] })
      void queryClient.invalidateQueries({ queryKey: ['forum-board-reports'] })
      void queryClient.invalidateQueries({ queryKey: ['forum-board-reports-all'] })
      void queryClient.invalidateQueries({ queryKey: ['forum-board-report-actions'] })
      void queryClient.invalidateQueries({ queryKey: ['forum-topics'] })
      if (
        (reversal.type === 'report' && reversal.switchToReports) ||
        (reversal.type === 'review' && reversal.reopenReport)
      ) {
        setActiveTab('reports')
      }
      setError('')
    },
    onError: (cause) => {
      setError(cause instanceof Error ? cause.message : 'Failed to reverse action.')
    },
  })

  const reviewMutation = useMutation({
    mutationFn: (input: {
      subject: { uri: string; cid: string }
      action: 'approve' | 'reject' | 'hide' | 'restore'
    }) => {
      if (!agent || !board) throw new Error('Sign in before reviewing forum content.')
      return setForumReviewAction(agent, {
        board: { uri: board.uri, cid: board.cid },
        subject: input.subject,
        action: input.action,
        grants: roleGrants.data,
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['forum-review-actions'] })
      void queryClient.invalidateQueries({ queryKey: ['forum-mod-log'] })
      setError('')
    },
    onError: (cause) => {
      setError(cause instanceof Error ? cause.message : 'Failed to review content.')
    },
  })

  const sanctionMutation = useMutation({
    mutationFn: () => {
      if (!agent || !board) throw new Error('Sign in before sanctioning users.')
      const subject = sanctionIdentity.data?.did ?? sanctionDid.trim()
      if (!subject) throw new Error('Enter a handle or DID to sanction.')
      return setForumSanction(agent, {
        board: { uri: board.uri, cid: board.cid },
        subject,
        kind: sanctionKind,
        reason: sanctionReason,
        grants: roleGrants.data,
      })
    },
    onSuccess: () => {
      setSanctionDid('')
      setSanctionReason('')
      void queryClient.invalidateQueries({ queryKey: ['forum-sanctions'] })
      void queryClient.invalidateQueries({ queryKey: ['forum-mod-log'] })
      setError('')
    },
    onError: (cause) => {
      setError(cause instanceof Error ? cause.message : 'Failed to apply sanction.')
    },
  })

  const revokeSanctionMutation = useMutation({
    mutationFn: (input: { subject: string; kind: 'mute' | 'ban' | 'postApproval' }) => {
      if (!agent || !board) throw new Error('Sign in before revoking sanctions.')
      return revokeForumSanction(agent, {
        board: { uri: board.uri, cid: board.cid },
        subject: input.subject,
        kind: input.kind,
        grants: roleGrants.data,
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['forum-sanctions'] })
      void queryClient.invalidateQueries({ queryKey: ['forum-mod-log'] })
      setError('')
    },
    onError: (cause) => {
      setError(cause instanceof Error ? cause.message : 'Failed to revoke sanction.')
    },
  })

  if (!viewerCanModerate) {
    return (
      <ForumEmpty message="You do not have permission to moderate this board." />
    )
  }

  return (
    <YStack gap="$4">
      {error ? (
        <YStack p="$3" rounded="$3" bg="$red3">
          <SizableText color="$red11">{error}</SizableText>
        </YStack>
      ) : null}

      <ModTabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'reports' ? (
        <YStack gap="$3">
          <SizableText size="$3" opacity={0.7}>
            Member reports waiting for review. Resolve to dismiss without action, or remove
            the reported content from the board.
          </SizableText>
          {(boardReports.data ?? []).length > 0 ? (
            (boardReports.data ?? []).map((report) => (
              <ModItem
                key={report.uri}
                actions={
                  <>
                    <Button
                      size="$2"
                      variant="outlined"
                      disabled={reportActionMutation.isPending}
                      onPress={() =>
                        reportActionMutation.mutate({ report, resolution: 'dismiss' })
                      }
                    >
                      Resolve
                    </Button>
                    <Button
                      size="$2"
                      variant="outlined"
                      disabled={reportActionMutation.isPending}
                      onPress={() =>
                        reportActionMutation.mutate({ report, resolution: 'remove' })
                      }
                    >
                      Remove
                    </Button>
                  </>
                }
              >
                <XStack gap="$2" flexWrap="wrap" items="center">
                  <ModBadge>{report.value.reasonType}</ModBadge>
                  <SizableText size="$3" opacity={0.7}>
                    {formatForumDate(report.value.createdAt)}
                  </SizableText>
                </XStack>
                <ForumSubjectPreview
                  board={report.value.board}
                  subject={report.value.subject}
                />
                {report.value.reason ? (
                  <SizableText size="$3" opacity={0.7}>
                    {report.value.reason}
                  </SizableText>
                ) : null}
              </ModItem>
            ))
          ) : (
            <ForumEmpty message="No open board reports." />
          )}
        </YStack>
      ) : null}

      {activeTab === 'queue' ? (
        <YStack gap="$3">
          <SizableText size="$3" opacity={0.7}>
            Posts awaiting approval or hidden by moderators.
          </SizableText>
          {pendingTopics.length > 0 ? (
            pendingTopics.map((topic) => (
              <ModItem
                key={topic.uri}
                actions={
                  <>
                    <Button
                      size="$2"
                      variant="outlined"
                      disabled={reviewMutation.isPending}
                      onPress={() =>
                        reviewMutation.mutate({
                          subject: { uri: topic.uri, cid: topic.cid },
                          action: 'approve',
                        })
                      }
                    >
                      Approve
                    </Button>
                    <Button
                      size="$2"
                      variant="outlined"
                      disabled={reviewMutation.isPending}
                      onPress={() =>
                        reviewMutation.mutate({
                          subject: { uri: topic.uri, cid: topic.cid },
                          action: 'reject',
                        })
                      }
                    >
                      Reject
                    </Button>
                  </>
                }
              >
                <ModBadge>pending</ModBadge>
                <ForumSubjectPreview
                  board={topic.value.board}
                  subject={{ uri: topic.uri, cid: topic.cid }}
                />
              </ModItem>
            ))
          ) : (
            <ForumEmpty message="No posts awaiting review." />
          )}
          {hiddenTopics.map((topic) => (
            <ModItem
              key={`hidden-${topic.uri}`}
              actions={
                <Button
                  size="$2"
                  variant="outlined"
                  disabled={reviewMutation.isPending}
                  onPress={() =>
                    reviewMutation.mutate({
                      subject: { uri: topic.uri, cid: topic.cid },
                      action: 'restore',
                    })
                  }
                >
                  Restore
                </Button>
              }
            >
              <ModBadge>hidden</ModBadge>
              <ForumSubjectPreview
                board={topic.value.board}
                subject={{ uri: topic.uri, cid: topic.cid }}
              />
            </ModItem>
          ))}
        </YStack>
      ) : null}

      {activeTab === 'sanctions' ? (
        <YStack gap="$4">
          <YStack gap="$3" p="$3" rounded="$4" borderWidth={1} borderColor="$color5" bg="$color2">
            <SizableText size="$4" fontWeight="700">
              Apply sanction
            </SizableText>
            <YStack gap="$2">
              <SizableText size="$3" opacity={0.7}>
                Member
              </SizableText>
              <Input
                value={sanctionDid}
                onChangeText={setSanctionDid}
                placeholder="handle or DID"
              />
            </YStack>
            <YStack gap="$2">
              <SizableText size="$3" opacity={0.7}>
                Sanction type
              </SizableText>
              <select
                value={sanctionKind}
                onChange={(event) =>
                  setSanctionKind(event.target.value as 'mute' | 'ban' | 'postApproval')
                }
                style={{ padding: 8, borderRadius: 8 }}
              >
                <option value="postApproval">{SANCTION_LABELS.postApproval}</option>
                <option value="mute">{SANCTION_LABELS.mute}</option>
                <option value="ban">{SANCTION_LABELS.ban}</option>
              </select>
            </YStack>
            <YStack gap="$2">
              <SizableText size="$3" opacity={0.7}>
                Reason (optional)
              </SizableText>
              <Input
                value={sanctionReason}
                onChangeText={setSanctionReason}
                placeholder="Why is this sanction being applied?"
                multiline
                numberOfLines={3}
              />
            </YStack>
            <XStack justify="flex-end">
              <Button
                theme="blue"
                disabled={sanctionMutation.isPending}
                onPress={() => sanctionMutation.mutate()}
              >
                Apply sanction
              </Button>
            </XStack>
          </YStack>

          <YStack gap="$3">
            <SizableText size="$4" fontWeight="700">
              Active sanctions
            </SizableText>
            {(sanctions.data ?? []).length > 0 ? (
              (sanctions.data ?? []).slice(0, 12).map((sanction) => (
                <ModItem
                  key={sanction.uri}
                  actions={
                    <Button
                      size="$2"
                      variant="outlined"
                      disabled={revokeSanctionMutation.isPending}
                      onPress={() =>
                        revokeSanctionMutation.mutate({
                          subject: sanction.value.subject,
                          kind: sanction.value.kind,
                        })
                      }
                    >
                      Revoke
                    </Button>
                  }
                >
                  <XStack gap="$2" flexWrap="wrap" items="center">
                    <ModBadge>{SANCTION_LABELS[sanction.value.kind]}</ModBadge>
                    <ForumActorLabel did={sanction.value.subject} fallback="Forum member" />
                  </XStack>
                  {sanction.value.reason ? (
                    <SizableText size="$3" opacity={0.7}>
                      {sanction.value.reason}
                    </SizableText>
                  ) : null}
                </ModItem>
              ))
            ) : (
              <ForumEmpty message="No active sanctions." />
            )}
          </YStack>
        </YStack>
      ) : null}

      {activeTab === 'log' ? (
        <YStack gap="$3">
          <SizableText size="$3" opacity={0.7}>
            Recent moderator actions on this board. Undo is available when the action is still
            in effect.
          </SizableText>
          {moderationLog.length > 0 ? (
            moderationLog.map((action) => {
              const reversal = getForumModLogReversal(action, logReversalContext)
              return (
                <ModItem
                  key={action.uri}
                  actions={
                    reversal ? (
                      <Button
                        size="$2"
                        variant="outlined"
                        disabled={undoLogMutation.isPending}
                        onPress={() => undoLogMutation.mutate(reversal.reversal)}
                      >
                        {reversal.label}
                      </Button>
                    ) : undefined
                  }
                >
                  <XStack gap="$2" flexWrap="wrap" items="center">
                    <ModBadge>{action.value.action}</ModBadge>
                    <SizableText size="$3" opacity={0.7}>
                      <ForumActorLabel
                        did={parseAtUri(action.uri)?.did}
                        fallback="Moderator"
                      />{' '}
                      · {formatForumDate(action.value.createdAt)}
                    </SizableText>
                  </XStack>
                  <ForumSubjectPreview
                    board={action.value.board}
                    subject={action.value.subject ?? action.value.board}
                  />
                  {action.value.note ? (
                    <SizableText size="$3" opacity={0.7}>
                      {action.value.note}
                    </SizableText>
                  ) : null}
                </ModItem>
              )
            })
          ) : (
            <ForumEmpty message="No moderator actions yet." />
          )}
        </YStack>
      ) : null}

      {activeTab === 'team' && viewerIsBoardOwner ? (
        <YStack gap="$4">
          <YStack gap="$3" p="$3" rounded="$4" borderWidth={1} borderColor="$color5" bg="$color2">
            <SizableText size="$4" fontWeight="700">
              Add moderator
            </SizableText>
            <SizableText size="$3" opacity={0.7}>
              Delegated moderators can review reports, manage the post queue, and apply sanctions.
            </SizableText>
            <YStack gap="$2">
              <SizableText size="$3" opacity={0.7}>
                Member
              </SizableText>
              <Input
                value={moderatorDid}
                onChangeText={setModeratorDid}
                placeholder="handle or DID"
              />
            </YStack>
            <XStack justify="flex-end">
              <Button
                theme="blue"
                disabled={grantRoleMutation.isPending}
                onPress={() => grantRoleMutation.mutate()}
              >
                Promote to moderator
              </Button>
            </XStack>
          </YStack>

          <YStack gap="$3">
            <SizableText size="$4" fontWeight="700">
              Current moderators
            </SizableText>
            {roleGrants.data && roleGrants.data.length > 0 ? (
              roleGrants.data.map((grant) => (
                <ModItem
                  key={grant.uri}
                  actions={
                    <Button
                      size="$2"
                      variant="outlined"
                      disabled={revokeRoleMutation.isPending}
                      onPress={() => revokeRoleMutation.mutate(grant.value.subject)}
                    >
                      Revoke
                    </Button>
                  }
                >
                  <ForumActorLabel did={grant.value.subject} fallback="Forum moderator" />
                </ModItem>
              ))
            ) : (
              <ForumEmpty message="No delegated moderators yet." />
            )}
          </YStack>
        </YStack>
      ) : null}
    </YStack>
  )
}

function ModItem({
  children,
  actions,
}: {
  children: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <YStack
      gap="$2"
      p="$3"
      rounded="$4"
      borderWidth={1}
      borderColor="$color5"
      bg="$color2"
    >
      <YStack gap="$2">{children}</YStack>
      {actions ? (
        <XStack gap="$2" flexWrap="wrap" justify="flex-end">
          {actions}
        </XStack>
      ) : null}
    </YStack>
  )
}
