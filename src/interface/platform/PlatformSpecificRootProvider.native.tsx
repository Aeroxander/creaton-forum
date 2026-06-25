import * as SplashScreen from 'expo-splash-screen'
import { useEffect, type ReactNode } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { KeyboardProvider } from 'react-native-keyboard-controller'

export function PlatformSpecificRootProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    setTimeout(() => {
      void SplashScreen.hide()
    }, 500)
  }, [])

  return (
    <KeyboardProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>{children}</GestureHandlerRootView>
    </KeyboardProvider>
  )
}
