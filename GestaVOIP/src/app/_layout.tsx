import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ProviderLingua, useLingua } from '../i18n/Lingua'
import { conTelefono } from '../odoo/sessione'
import { ProviderApp, useApp } from '../voip/Contesto'
import { Apertura, segnalaPronta } from '../ui/Apertura'
import { ProviderAspetto } from '../ui/Aspetto'
import { ProviderMenu } from '../ui/MenuLaterale'
import { useColori } from '../ui/tema'
import { Caricamento } from '../ui/Caricamento'

// La schermata di avvio resta finche' l'apertura non e' pronta (ui/Apertura.tsx).
SplashScreen.preventAutoHideAsync().catch(() => undefined)

function Navigazione() {
  const { fase, sessione } = useApp()
  const telefono = conTelefono(sessione)
  const c = useColori()

  useEffect(() => {
    if (fase !== 'caricamento') {
      segnalaPronta()
    }
  }, [fase])

  if (fase === 'caricamento') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.sfondo }}>
        <Caricamento />
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
        <Stack.Screen name="spese/index" />
        <Stack.Screen name="spese/[id]" />
        <Stack.Screen name="helpdesk/index" />
        <Stack.Screen name="helpdesk/[id]" />
        <Stack.Screen name="helpdesk/nuovo" options={{ presentation: 'modal' }} />
        <Stack.Screen name="calendario/[id]" />
        <Stack.Screen name="calendario/nuovo" options={{ presentation: 'modal' }} />
        <Stack.Screen name="calendario/modifica" options={{ presentation: 'modal' }} />
        <Stack.Screen name="contatti/[id]" />
        <Stack.Screen name="contatti/nuovo" options={{ presentation: 'modal' }} />
        {/* Per tutti: la lingua si sceglie anche senza telefono. */}
        <Stack.Screen name="impostazioni" />
      </Stack.Protected>
      {/* Il telefono: solo con VOIP AI. */}
      <Stack.Protected guard={fase === 'dentro' && telefono}>
        <Stack.Screen
          name="chiamata"
          options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', gestureEnabled: false }}
        />
      </Stack.Protected>
      <Stack.Protected guard={fase !== 'dentro'}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  )
}

/** Cambiando lingua si ridisegnano menu e schermate; sessione e telefono restano. */
function ConLingua() {
  const { lingua } = useLingua()
  return (
    <ProviderMenu key={lingua}>
      <Navigazione />
    </ProviderMenu>
  )
}

export default function Radice() {
  return (
    <SafeAreaProvider>
      <ProviderLingua>
        <ProviderAspetto>
          <ProviderApp>
            <StatusBar style="auto" />
            <ConLingua />
          </ProviderApp>
        </ProviderAspetto>
      </ProviderLingua>
      <Apertura />
    </SafeAreaProvider>
  )
}
