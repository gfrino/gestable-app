import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { ActivityIndicator, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { conTelefono } from '../odoo/sessione'
import { ProviderApp, useApp } from '../voip/Contesto'
import { useColori } from '../ui/tema'

function Navigazione() {
  const { fase, sessione } = useApp()
  const telefono = conTelefono(sessione)
  const c = useColori()

  if (fase === 'caricamento') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.sfondo }}>
        <ActivityIndicator color={c.primario} />
      </View>
    )
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.sfondo } }}>
      <Stack.Protected guard={fase === 'dentro' && telefono}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="chiamata"
          options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', gestureEnabled: false }}
        />
      </Stack.Protected>
      {/* Odoo senza VOIP AI: niente telefono, solo Odoo. */}
      <Stack.Protected guard={fase === 'dentro' && !telefono}>
        <Stack.Screen name="odoo" />
      </Stack.Protected>
      <Stack.Protected guard={fase !== 'dentro'}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  )
}

export default function Radice() {
  return (
    <SafeAreaProvider>
      <ProviderApp>
        <StatusBar style="auto" />
        <Navigazione />
      </ProviderApp>
    </SafeAreaProvider>
  )
}
