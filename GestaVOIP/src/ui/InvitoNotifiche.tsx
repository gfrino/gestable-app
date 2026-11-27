/**
 * Notifiche dei messaggi: dopo l'accesso registra il telefono sul server e,
 * la prima volta, spiega a cosa servono prima della domanda di iOS (chi capisce
 * perche' le chiediamo dice di si'). Toccando una notifica si apre la chat.
 *
 * Non fa nulla se il server non ha il modulo GestABLE o su Android (vedi notifiche/push.ts).
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { Modal, StyleSheet, Text, View } from 'react-native'
import { t } from '../i18n'
import { chiediPermesso, giaChiesto, permesso, segnaChiesto, pushDisponibile, registraTelefono, serverConNotifiche, suTocco } from '../notifiche/push'
import { useApp } from '../voip/Contesto'
import { apriRecord } from './apriRecord'
import { segnalaErrore } from './crash'
import { Pulsante } from './Pulsante'
import { raggio, spazio, useColori } from './tema'

export function InvitoNotifiche() {
  const c = useColori()
  const router = useRouter()
  const { sessione } = useApp()
  const server = sessione?.server || ''
  const uid = sessione?.utente.uid || 0
  const [aperto, setAperto] = useState(false)
  const [occupato, setOccupato] = useState(false)

  // Dopo l'accesso: telefono gia' autorizzato -> si registra in silenzio; mai chiesto -> si spiega.
  useEffect(() => {
    if (!pushDisponibile() || !server || !uid) {
      return
    }
    let vivo = true
    void (async () => {
      try {
        if (!(await serverConNotifiche(server))) {
          return
        }
        const p = await permesso()
        if (p === 'concesso') {
          await registraTelefono(server)
        } else if (p === 'da-chiedere' && !(await giaChiesto()) && vivo) {
          setAperto(true)
        }
      } catch (e) {
        segnalaErrore(e, 'notifiche: registrazione')
      }
    })()
    return () => {
      vivo = false
    }
  }, [server, uid])

  // Tocco su una notifica (anche quella che ha aperto l'app): la chat giusta,
  // o il documento (schermata nativa se c'e', altrimenti Odoo Web).
  useEffect(() => {
    if (!uid) {
      return
    }
    return suTocco((d) => {
      if (d.model === 'discuss.channel' && d.res_id) {
        router.push({ pathname: '/messaggi/[id]', params: { id: String(d.res_id), tipo: d.channel_type || 'chat', nome: d.name || '' } })
      } else if (d.model && d.res_id) {
        apriRecord(router, d.model, d.res_id, { nome: d.name })
      }
    })
  }, [uid, router])

  async function attiva() {
    setOccupato(true)
    let concesso = false
    try {
      concesso = await chiediPermesso()
    } catch (e) {
      segnalaErrore(e, 'notifiche: permesso')
    }
    // Si chiude appena iOS ha risposto; la registrazione sul server va avanti da sola.
    setOccupato(false)
    setAperto(false)
    if (concesso) {
      registraTelefono(server).catch((e) => segnalaErrore(e, 'notifiche: attivazione'))
    }
  }

  async function nonOra() {
    // Ricordato: l'invito non torna. Si attiva da Impostazioni quando si vuole.
    await segnaChiesto()
    setAperto(false)
  }

  return (
    <Modal visible={aperto} transparent animationType="fade" onRequestClose={() => void nonOra()}>
      <View style={s.velo}>
        <View style={[s.scheda, { backgroundColor: c.superficie }]}>
          <View style={[s.icona, { backgroundColor: c.primarioTenue }]}>
            <Ionicons name="notifications" size={34} color={c.primario} />
          </View>
          <Text style={[s.titolo, { color: c.testo }]}>{t('notifiche.invitoTitolo')}</Text>
          <Text style={[s.testo, { color: c.testo2 }]}>{t('notifiche.invitoTesto')}</Text>
          <View style={s.tasti}>
            <Pulsante testo={t('notifiche.attiva')} occupato={occupato} onPress={() => void attiva()} />
            <Pulsante testo={t('notifiche.nonOra')} variante="tenue" onPress={() => void nonOra()} />
          </View>
        </View>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  velo: { flex: 1, backgroundColor: 'rgba(10,12,24,0.45)', justifyContent: 'center', padding: spazio.xl },
  scheda: { borderRadius: raggio.l + 6, padding: spazio.xl, alignItems: 'center', gap: spazio.m },
  icona: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: spazio.xs },
  titolo: { fontSize: 21, fontWeight: '800', textAlign: 'center' },
  testo: { fontSize: 16, lineHeight: 22, textAlign: 'center' },
  tasti: { alignSelf: 'stretch', gap: spazio.s, marginTop: spazio.s },
})
