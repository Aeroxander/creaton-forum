import type { Agent, AppBskyActorProfile } from '@atproto/api'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Label, SizableText, YStack } from 'tamagui'

import {
  fetchLocalAtUriRecord,
  getProfileAvatarUrl,
  markProfileKnownState,
  profileUriFromDid,
  resolveProfilePdsUrl,
} from '~/features/profile/profileUtils'
import { useQueryIdentity, useQueryProfile } from '~/features/profile/profileQueries'
import { Avatar } from '~/interface/avatars/Avatar'
import { Button } from '~/interface/buttons/Button'
import { Input } from '~/interface/forms/Input'

const MAX_DISPLAY_NAME = 64
const MAX_DESCRIPTION = 256
const MAX_AVATAR_BYTES = 1_000_000
const AVATAR_TYPES = new Set(['image/png', 'image/jpeg'])

export function EditProfileForm({ agent }: { agent: Agent }) {
  const queryClient = useQueryClient()
  const did = agent.did!
  const profileQuery = useQueryProfile(did, agent, 'edit')
  const identityQuery = useQueryIdentity(did, agent)
  const profile = profileQuery.data?.value

  const [displayName, setDisplayName] = useState('')
  const [description, setDescription] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | undefined>()
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [removeAvatar, setRemoveAvatar] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!profile) return
    setDisplayName(profile.displayName ?? '')
    setDescription(profile.description ?? '')
    setAvatarFile(undefined)
    setAvatarPreview(null)
    setRemoveAvatar(false)
    setError('')
  }, [profile?.displayName, profile?.description, profileQuery.data?.cid])

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    }
  }, [avatarPreview])

  const pdsUrl = resolveProfilePdsUrl({
    identityPds: identityQuery.data?.pds,
    agent,
    did,
  })
  const savedAvatarUrl = getProfileAvatarUrl({
    did,
    blob: removeAvatar ? undefined : profile?.avatar,
    pdsUrl,
  })
  const avatarUrl = avatarPreview ?? savedAvatarUrl

  const handleAvatarChange = (file?: File) => {
    setError('')
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)

    if (!file) {
      setAvatarFile(undefined)
      setAvatarPreview(null)
      setRemoveAvatar(true)
      return
    }

    if (!AVATAR_TYPES.has(file.type)) {
      setError('Use a PNG or JPEG image.')
      return
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError('Profile images must be 1 MB or smaller.')
      return
    }

    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
    setRemoveAvatar(false)
  }

  const save = async () => {
    if (busy) return
    if (!displayName.trim()) {
      setError('Display name is required.')
      return
    }
    if (displayName.length > MAX_DISPLAY_NAME) {
      setError(`Display name must be ${MAX_DISPLAY_NAME} characters or fewer.`)
      return
    }
    if (description.length > MAX_DESCRIPTION) {
      setError(`Bio must be ${MAX_DESCRIPTION} characters or fewer.`)
      return
    }

    setBusy(true)
    setError('')
    try {
      const avatarUpload = avatarFile
        ? agent.uploadBlob(avatarFile, { encoding: avatarFile.type })
        : undefined

      await agent.upsertProfile(async (existing) => {
        const next = { ...(existing ?? {}) } as AppBskyActorProfile.Record
        const nextDisplayName = displayName.trim()
        const nextDescription = description.trim()
        next.displayName = nextDisplayName || undefined
        next.description = nextDescription || undefined

        if (avatarUpload) {
          const res = await avatarUpload
          next.avatar = res.data.blob
        } else if (removeAvatar) {
          next.avatar = undefined
        }

        return next
      })

      markProfileKnownState(did, 'exists')
      const uri = profileUriFromDid(did)
      const saved = await fetchLocalAtUriRecord<AppBskyActorProfile.Record>(uri, agent)
      if (saved) {
        queryClient.setQueryData(['profile', did, import.meta.env.DEV ? agent.did : undefined, 'edit'], saved)
        queryClient.setQueryData(['profile', did, import.meta.env.DEV ? agent.did : undefined, 'display'], saved)
      } else {
        await queryClient.invalidateQueries({ queryKey: ['profile', did] })
      }
      setAvatarFile(undefined)
      setAvatarPreview(null)
      setRemoveAvatar(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to update profile.')
    } finally {
      setBusy(false)
    }
  }

  const hasProfile = !!profileQuery.data?.value
  const isFetchingProfile = profileQuery.isFetching && !profileQuery.data

  return (
    <YStack gap="$4" width="100%">
      {isFetchingProfile ? (
        <SizableText size="$3" color="$color10">
          Checking for an existing profile…
        </SizableText>
      ) : null}

      {!hasProfile ? (
        <SizableText size="$4" color="$color11" text="center">
          You have not set up a profile yet. Add a display name and save to create one.
        </SizableText>
      ) : null}
      <YStack gap="$3" items="center">
        <Avatar image={avatarUrl} name={displayName || did} size="xl" />
        <YStack gap="$2" width="100%" maxW={320}>
          <Button
            size="$3"
            variant="outlined"
            onPress={() => {
              if (typeof document === 'undefined') return
              const input = document.createElement('input')
              input.type = 'file'
              input.accept = 'image/png,image/jpeg'
              input.onchange = () => handleAvatarChange(input.files?.[0])
              input.click()
            }}
          >
            Change avatar
          </Button>
          {(profile?.avatar || avatarPreview) && !removeAvatar ? (
            <Button size="$3" variant="outlined" onPress={() => handleAvatarChange(undefined)}>
              Remove avatar
            </Button>
          ) : null}
        </YStack>
      </YStack>

      <YStack gap="$2">
        <Label htmlFor="displayName">Display name</Label>
        <Input
          id="displayName"
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Display name"
          maxLength={MAX_DISPLAY_NAME}
        />
      </YStack>

      <YStack gap="$2">
        <Label htmlFor="description">Bio</Label>
        <Input
          id="description"
          value={description}
          onChangeText={setDescription}
          placeholder="Tell people about yourself"
          multiline
          height={120}
          maxLength={MAX_DESCRIPTION}
        />
      </YStack>

      {error ? (
        <SizableText color="$red10" size="$3">
          {error}
        </SizableText>
      ) : null}

      <Button
        theme="blue"
        disabled={busy || !displayName.trim()}
        onPress={save}
      >
        {busy ? 'Saving…' : 'Save profile'}
      </Button>

      <SizableText size="$2" color="$color9" text="center">
        {profileUriFromDid(did)}
      </SizableText>
    </YStack>
  )
}
