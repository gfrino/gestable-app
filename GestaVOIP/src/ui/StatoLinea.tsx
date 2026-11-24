import { StyleSheet, Text, View } from 'react-native'
import { useTelefono } from '../voip/Contesto'
import { raggio, spazio, useColori } from './tema'

/** Una riga che dice se il telefono squilla davvero, e se no perche'. */
export function StatoLinea() {
  const c = useColori()
  const { registrazione, motivo, disponibile } = useTelefono()

  let testo = 'Pronto: ricevi e fai chiamate'
  let colore = c.verde
  let sfondo = c.verdeTenue
  if (!disponibile) {
    testo = 'Non disponibile: le chiamate non squillano qui'
    colore = c.ambra
    sfondo = c.ambraTenue
  } else if (registrazione === 'collegamento' || registrazione === 'spento') {
    testo = 'Collegamento al centralino...'
    colore = c.testo2
    sfondo = c.superficie2
  } else if (registrazione === 'senza-push') {
    testo = 'Solo chiamate in uscita: push non configurate sul server'
    colore = c.ambra
    sfondo = c.ambraTenue
  } else if (registrazione === 'guasto') {
    testo = motivo ? `Non collegato: ${motivo}` : 'Non collegato: riprovo da solo'
    colore = c.rosso
    sfondo = c.rossoTenue
  }

  return (
    <View style={[s.riga, { backgroundColor: sfondo }]} accessibilityRole="text">
      <View style={[s.punto, { backgroundColor: colore }]} />
      <Text style={[s.testo, { color: colore }]} numberOfLines={2}>
        {testo}
      </Text>
    </View>
  )
}

const s = StyleSheet.create({
  riga: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spazio.s,
    paddingHorizontal: spazio.m,
    paddingVertical: spazio.s,
    borderRadius: raggio.tondo,
    alignSelf: 'center',
    maxWidth: '100%',
  },
  punto: { width: 8, height: 8, borderRadius: 4 },
  testo: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
})
