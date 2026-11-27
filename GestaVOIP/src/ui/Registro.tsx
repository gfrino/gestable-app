/**
 * La conversazione sotto un record di Odoo: si sceglie tra messaggio (al
 * cliente, per email) e nota interna, si scrive, si aggiungono foto; sotto i
 * messaggi, le note e i cambi registrati da Odoo, con gli allegati.
 * Si ricarica quando cambia `versione` (es. dopo un cambio di fase).
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useCallback, useEffect, useState } from 'react'
import { ActionSheetIOS, Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { scansionaScontrino, scegliFotoScontrino } from '../../modules/gestable-nativo'
import { t } from '../i18n'
import { urlAvatar } from '../odoo/lavoro'
import { conversazione, scrivi, type Messaggio } from '../odoo/registro'
import { quandoBreve } from '../odoo/testo'
import { Avatar } from './Avatar'
import { Caricamento } from './Caricamento'
import { Foglio } from './Foglio'
import { raggio, spazio, useColori } from './tema'

const GIALLO = '#F4B400'

type Props = { server: string; modello: string; id: number; versione?: number }

export function Registro({ server, modello, id, versione = 0 }: Props) {
  const c = useColori()
  const [messaggi, setMessaggi] = useState<Messaggio[] | null>(null)
  const [nota, setNota] = useState(true)
  const [testo, setTesto] = useState('')
  const [foto, setFoto] = useState<string[]>([])
  const [invio, setInvio] = useState(false)
  const [allegato, setAllegato] = useState<{ id: number; nome: string } | null>(null)

  const carica = useCallback(async () => {
    setMessaggi(await conversazione(server, modello, id).catch(() => []))
  }, [server, modello, id])

  useEffect(() => {
    let vivo = true
    conversazione(server, modello, id)
      .catch(() => [] as Messaggio[])
      .then((m) => vivo && setMessaggi(m))
    return () => {
      vivo = false
    }
  }, [server, modello, id, versione])

  function aggiungiFoto() {
    const prendi = async (fonte: 'scanner' | 'galleria') => {
      try {
        const nuove = fonte === 'scanner' ? await scansionaScontrino() : await scegliFotoScontrino()
        setFoto((f) => [...f, ...nuove])
      } catch (e) {
        Alert.alert(t('registro.aggiungiFoto'), e instanceof Error ? e.message : String(e))
      }
    }
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [t('registro.fotoScanner'), t('registro.fotoGalleria'), t('comune.annulla')], cancelButtonIndex: 2 },
        (i) => {
          if (i === 0) {
            void prendi('scanner')
          } else if (i === 1) {
            void prendi('galleria')
          }
        },
      )
    } else {
      void prendi('galleria')
    }
  }

  async function invia() {
    if (!testo.trim() && !foto.length) {
      return
    }
    setInvio(true)
    try {
      await scrivi(server, modello, id, testo, nota, foto)
      setTesto('')
      setFoto([])
      await carica()
    } catch (e) {
      Alert.alert(t('registro.nonInviato'), e instanceof Error ? e.message : String(e))
    }
    setInvio(false)
  }

  const vuoto = !testo.trim() && !foto.length
  const colore = nota ? GIALLO : c.primario

  return (
    <View style={{ gap: spazio.s }}>
      <View style={[s.segmenti, { backgroundColor: c.superficie2 }]}>
        {[true, false].map((n) => (
          <Pressable
            key={String(n)}
            onPress={() => setNota(n)}
            style={[s.segmento, nota === n && { backgroundColor: n ? GIALLO : c.primario }]}
            accessibilityRole="tab"
            accessibilityState={{ selected: nota === n }}
          >
            <Ionicons name={n ? 'lock-closed' : 'mail'} size={14} color={nota === n ? '#FFFFFF' : c.testo2} />
            <Text style={[s.segmentoTesto, { color: nota === n ? '#FFFFFF' : c.testo2 }]} numberOfLines={1}>
              {n ? t('registro.nota') : t('registro.messaggio')}
            </Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        value={testo}
        onChangeText={setTesto}
        placeholder={nota ? t('registro.scriviNota') : t('registro.scriviMessaggio')}
        placeholderTextColor={c.testo3}
        multiline
        style={[s.composer, { color: c.testo, backgroundColor: nota ? 'rgba(244,180,0,0.10)' : c.sfondo, borderColor: c.bordo }]}
      />
      {foto.length ? (
        <ScrollView horizontal contentContainerStyle={{ gap: spazio.s, paddingVertical: spazio.s }}>
          {foto.map((f, i) => (
            <Pressable key={f} onPress={() => setFoto(foto.filter((_, j) => j !== i))} accessibilityLabel={t('comune.elimina')}>
              <Image source={{ uri: f }} style={s.miniFoto} />
              <View style={[s.togli, { backgroundColor: c.rosso }]}>
                <Ionicons name="close" size={12} color="#FFFFFF" />
              </View>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <View style={s.invioRiga}>
        <Pressable
          onPress={aggiungiFoto}
          hitSlop={8}
          style={[s.tondo, { backgroundColor: c.superficie2 }]}
          accessibilityRole="button"
          accessibilityLabel={t('registro.aggiungiFoto')}
        >
          <Ionicons name="camera" size={20} color={c.testo} />
        </Pressable>
        <Text style={[s.piccolo, { flex: 1, color: c.testo3 }]} numberOfLines={2}>
          {nota ? t('registro.notaAvviso') : t('registro.messaggioAvviso')}
        </Text>
        <Pressable
          onPress={() => void invia()}
          disabled={invio || vuoto}
          style={[s.invia, { backgroundColor: colore, opacity: vuoto ? 0.4 : 1 }]}
          accessibilityRole="button"
        >
          {invio ? <Caricamento dimensione={18} /> : <Ionicons name="send" size={16} color="#FFFFFF" />}
          <Text style={s.inviaTesto} numberOfLines={1}>
            {t('registro.invia')}
          </Text>
        </Pressable>
      </View>

      {messaggi === null ? (
        <Caricamento style={{ marginTop: spazio.l }} />
      ) : messaggi.length === 0 ? (
        <Text style={[s.sotto, { color: c.testo3, marginTop: spazio.m }]}>{t('registro.nessunMessaggio')}</Text>
      ) : (
        messaggi.map((m) => (
          <View key={m.id} style={[s.messaggio, { borderColor: c.bordo }]}>
            <Avatar nome={m.autore || '?'} lato={32} url={m.autoreId ? urlAvatar(server, 'res.partner', m.autoreId) : undefined} />
            <View style={{ flex: 1, gap: 4 }}>
              <View style={s.messaggioTesta}>
                <Text style={[s.autore, { color: c.testo }]} numberOfLines={1}>
                  {m.autore}
                </Text>
                {m.nota ? (
                  <View style={[s.bollino, { backgroundColor: 'rgba(244,180,0,0.18)' }]}>
                    <Text style={[s.bollinoTesto, { color: '#B07F00' }]}>{t('registro.notaInterna')}</Text>
                  </View>
                ) : m.email ? (
                  <View style={[s.bollino, { backgroundColor: c.primarioTenue }]}>
                    <Text style={[s.bollinoTesto, { color: c.primario }]}>{t('registro.viaEmail')}</Text>
                  </View>
                ) : null}
                <Text style={[s.piccolo, { color: c.testo3, marginLeft: 'auto' }]}>{quandoBreve(m.data)}</Text>
              </View>
              {m.testo ? (
                <Text style={[s.messaggioTesto, { color: c.testo }]} selectable>
                  {m.testo}
                </Text>
              ) : null}
              {m.tracciamento ? <Text style={[s.piccolo, { color: c.testo2 }]}>{m.tracciamento}</Text> : null}
              {m.allegati.length ? (
                <View style={s.allegati}>
                  {m.allegati.map((a) =>
                    a.tipo.startsWith('image/') ? (
                      <Pressable key={a.id} onPress={() => setAllegato(a)} accessibilityLabel={a.nome}>
                        <Image source={{ uri: `${server}/web/image/${a.id}?width=240` }} style={[s.miniFoto, { backgroundColor: c.superficie2 }]} />
                      </Pressable>
                    ) : (
                      <Pressable key={a.id} onPress={() => setAllegato(a)} style={[s.file, { backgroundColor: c.superficie2 }]} accessibilityRole="button">
                        <Ionicons name="document-attach" size={16} color={c.primario} />
                        <Text style={[s.piccolo, { color: c.testo, maxWidth: 180 }]} numberOfLines={1}>
                          {a.nome}
                        </Text>
                      </Pressable>
                    ),
                  )}
                </View>
              ) : null}
            </View>
          </View>
        ))
      )}

      <Foglio aperto={allegato !== null} titolo={allegato?.nome || ''} chiudi={() => setAllegato(null)} fatto={t('comune.chiudi')}>
        {allegato ? (
          <WebView
            source={{ uri: `${server}/web/content/${allegato.id}` }}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            startInLoadingState
            renderLoading={() => <Caricamento style={StyleSheet.absoluteFill} />}
            style={{ flex: 1, backgroundColor: c.sfondo }}
          />
        ) : null}
      </Foglio>
    </View>
  )
}

const s = StyleSheet.create({
  segmenti: { flexDirection: 'row', borderRadius: 12, padding: 3 },
  segmento: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 36, borderRadius: 10 },
  segmentoTesto: { fontSize: 14, fontWeight: '700' },
  composer: { minHeight: 90, maxHeight: 220, fontSize: 16, padding: spazio.m, borderRadius: raggio.m, borderWidth: StyleSheet.hairlineWidth, textAlignVertical: 'top' },
  miniFoto: { width: 72, height: 72, borderRadius: raggio.m },
  togli: { position: 'absolute', top: -4, right: -4, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  invioRiga: { flexDirection: 'row', alignItems: 'center', gap: spazio.s },
  tondo: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  invia: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, height: 40, borderRadius: 20 },
  inviaTesto: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  sotto: { fontSize: 14 },
  piccolo: { fontSize: 12 },
  messaggio: { flexDirection: 'row', gap: spazio.s, paddingTop: spazio.m, marginTop: spazio.s, borderTopWidth: StyleSheet.hairlineWidth },
  messaggioTesta: { flexDirection: 'row', alignItems: 'center', gap: spazio.s },
  autore: { fontSize: 14, fontWeight: '700', flexShrink: 1 },
  bollino: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  bollinoTesto: { fontSize: 11, fontWeight: '700' },
  messaggioTesto: { fontSize: 15, lineHeight: 21 },
  allegati: { flexDirection: 'row', flexWrap: 'wrap', gap: spazio.s },
  file: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 32, borderRadius: 16 },
})
