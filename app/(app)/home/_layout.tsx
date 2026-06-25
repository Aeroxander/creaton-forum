import { Slot, Stack } from 'one'
import { isWeb } from 'tamagui'

export function AppLayout() {
  return (
    <>
      {isWeb ? (
        <Slot />
      ) : (
        // We need Stack here for transition animation to work on native
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="settings" />
        </Stack>
      )}
    </>
  )
}
