import { StyleSheet, Text, View } from 'react-native'
import { t } from '../i18n'
import { useTelefono } from '../voip/Contesto'
import { raggio, spazio, useColori } from './tema'

/** Una riga che dice se il telefono squilla davvero, e se no perche'. */
export function StatoLinea() {
  const c = useColori()
  const { registrazione, motivo, tentativo, disponibile } = useTelefono()

  let testo = t('telefono.linea.pronto')
  let colore = c.verde
  let sfondo = c.verdeTenue
  if (!disponibile) {
    testo = t('telefono.linea.nonDisponibile')
    colore = c.ambra
    sfondo = c.ambraTenue
  } else if (registrazione === 'collegamento' || registrazione === 'spento') {
    testo = t('telefono.linea.collegamento')
    colore = c.testo2
    sfondo = c.superficie2
  } else if (registrazione === 'senza-push') {
    testo = t('telefono.linea.senzaPush')
    colore = c.ambra
    sfondo = c.ambraTenue
  } else if (registrazione === 'guasto') {
    // Il motivo viene dal server o dall'SDK Twilio cosi' com'e'; il numero del
    // tentativo si scrive qui, nella lingua scelta ora.
    const dettaglio = tentativo ? t('telefono.linea.tentativo', { motivo, n: tentativo }) : motivo
    testo = motivo || tentativo ? t('telefono.linea.guasto', { motivo: dettaglio }) : t('telefono.linea.guastoRiprovo')
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
