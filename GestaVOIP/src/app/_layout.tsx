import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { ActivityIndicator, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { conTelefono } from '../odoo/sessione'
import { ProviderApp, useApp } from '../voip/Contesto'
import { ProviderMenu } from '../ui/MenuLaterale'
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
      {/* Schede e schermate di Odoo: per tutti, con o senza telefono. */}
      <Stack.Protected guard={fase === 'dentro'}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="messaggi/index" />
        <Stack.Screen name="messaggi/[id]" />
        <Stack.Screen name="attivita" />
        <Stack.Screen name="calendario/[id]" />
        <Stack.Screen name="calendario/nuovo" options={{ presentation: 'modal' }} />
        <Stack.Screen name="calendario/modifica" options={{ presentation: 'modal' }} />
        <Stack.Screen name="contatti/[id]" />
        <Stack.Screen name="contatti/nuovo" options={{ presentation: 'modal' }} />
      </Stack.Protected>
      {/* Il telefono: solo con VOIP AI. */}
      <Stack.Protected guard={fase === 'dentro' && telefono}>
        <Stack.Screen
          name="chiamata"
          options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', gestureEnabled: false }}
        />
        <Stack.Screen name="impostazioni" />
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
        <ProviderMenu>
          <Navigazione />
        </ProviderMenu>
      </ProviderApp>
    </SafeAreaProvider>
  )
}
