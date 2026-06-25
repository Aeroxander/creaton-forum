import { SizableText, YStack } from 'tamagui'

export function ForumMarkdown({ body }: { body: string }) {
  return (
    <YStack gap="$2">
      {body.split('\n').map((line, index) => (
        <SizableText key={`${index}-${line.slice(0, 8)}`} size="$4">
          {line || ' '}
        </SizableText>
      ))}
    </YStack>
  )
}
