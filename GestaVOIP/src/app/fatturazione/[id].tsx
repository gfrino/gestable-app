/**
 * Una fattura: cliente o fornitore (chiama, email, scheda), stato e totale,
 * numero, date, condizioni di pagamento, le righe, i totali con quanto resta
 * da pagare, note e conversazione.
 *
 * In fondo i pulsanti di Odoo per lo stato del documento: Conferma (bozza),
 * Invia (fatture dei clienti registrate), Registra pagamento (in Odoo Web),
 * PDF da condividere (iPhone). Le azioni che cambiano qualcosa chiedono conferma.
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { File, Paths } from 'expo-file-system'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useState, type ReactNode } from 'react'
import { Alert, Linking, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { t } from '../../i18n'
import { conferma, dettaglio, inviaFattura, MODELLO, urlPdf, type Dettaglio } from '../../odoo/fatturazione'
import { urlAvatar } from '../../odoo/lavoro'
import { segui } from '../../odoo/registro'
import { immagineProdotto } from '../../odoo/vendite'
import { apriInOdooWeb } from '../../ui/apriRecord'
import { Avatar } from '../../ui/Avatar'
import { Caricamento } from '../../ui/Caricamento'
import { chiamaNumero } from '../../ui/chiama'
import { data } from '../../ui/formatoCrm'
import { coloreStato, diCliente, importo, quantita, testoStato, testoTipo } from '../../ui/formatoFatturazione'
import { Pulsante } from '../../ui/Pulsante'
import { Registro } from '../../ui/Registro'
import { Testata } from '../../ui/Testata'
import { raggio, spazio, useColori } from '../../ui/tema'
import { useApp } from '../../voip/Contesto'

function errore(titolo: string, e: unknown) {
  Alert.alert(titolo, e instanceof Error ? e.message : String(e))
}

/** Chiede conferma con un pulsante che dice cosa fa; risolve true se l'utente conferma. */
function chiedi(titolo: string, testo: string, pulsante: string): Promise<boolean> {
  return new Promise((ok) =>
    Alert.alert(titolo, testo, [
      { text: t('comune.indietro'), style: 'cancel', onPress: () => ok(false) },
      { text: pulsante, onPress: () => ok(true) },
    ]),
  )
}

export default function SchedaFattura() {
  const c = useColori()
  const router = useRouter()
  const { id: idTesto } = useLocalSearchParams<{ id: string }>()
  const id = Number(idTesto)
  const { sessione } = useApp()
  const server = sessione?.server || ''
  const uid = sessione?.utente.uid || 0

  const [f, setF] = useState<Dettaglio | null>(null)
  const [problema, setProblema] = useState('')
  const [versione, setVersione] = useState(0)
  const [occupato, setOccupato] = useState('')

  const ricarica = useCallback(async () => {
    if (!server || !id) {
      return
    }
    try {
      const d = await dettaglio(server, id)
      if (!d) {
        setProblema(t('fatturazione.nonTrovata'))
        return
      }
      // Una registrazione contabile che non e' una fattura (aperta da una notifica): in Odoo Web.
      if (d.tipo === 'entry') {
        apriInOdooWeb(router, MODELLO, d.id)
        return
      }
      setF(d)
      setProblema('')
      setVersione((v) => v + 1)
    } catch (e) {
      setProblema(e instanceof Error ? e.message : String(e))
    }
  }, [server, id, router])

  useFocusEffect(
    useCallback(() => {
      void ricarica()
    }, [ricarica]),
  )

  async function seguiFattura() {
    if (!f) {
      return
    }
    const nuovo = !f.segue
    setF({ ...f, segue: nuovo })
    try {
      await segui(server, uid, MODELLO, f.id, nuovo)
    } catch (e) {
      setF({ ...f })
      errore(t('fatturazione.nonSalvato'), e)
    }
  }

  async function confermaFattura() {
    if (!f || !(await chiedi(t('fatturazione.confermaDomanda'), t('fatturazione.confermaTesto'), t('fatturazione.conferma')))) {
      return
    }
    setOccupato('conferma')
    try {
      const esito = await conferma(server, f.id)
      if (esito === 'web') {
        setOccupato('')
        apriInOdooWeb(router, MODELLO, f.id)
        return
      }
      await ricarica()
    } catch (e) {
      errore(t('fatturazione.nonConfermata'), e)
    }
    setOccupato('')
  }

  async function invia() {
    if (!f) {
      return
    }
    if (!f.email) {
      Alert.alert(t('fatturazione.senzaEmail'), t('fatturazione.senzaEmailTesto', { cliente: f.cliente }))
      return
    }
    const nome = f.nome || t('fatturazione.bozza')
    if (!(await chiedi(t('fatturazione.inviaDomanda', { nome }), t('fatturazione.inviaTesto', { email: f.email }), t('fatturazione.invia')))) {
      return
    }
    setOccupato('invia')
    try {
      const esito = await inviaFattura(server, f.id)
      if (esito === 'web') {
        setOccupato('')
        Alert.alert(t('fatturazione.inviaInOdoo'), t('fatturazione.inviaInOdooTesto'), [
          { text: t('comune.chiudi'), style: 'cancel' },
          { text: t('fatturazione.apriInOdoo'), onPress: () => apriInOdooWeb(router, MODELLO, f.id) },
        ])
        return
      }
      await ricarica()
    } catch (e) {
      errore(t('fatturazione.nonInviata'), e)
    }
    setOccupato('')
  }

  async function condividiPdf() {
    if (!f) {
      return
    }
    setOccupato('pdf')
    try {
      const r = await fetch(urlPdf(server, f.id), { credentials: 'include' })
      if (!r.ok || !(r.headers.get('content-type') || '').includes('pdf')) {
        throw new Error(t('fatturazione.pdfNonPronto'))
      }
      const dati = new Uint8Array(await r.arrayBuffer())
      const file = new File(Paths.cache, `${(f.nome || 'fattura').replace(/[^\w.-]+/g, '_')}.pdf`)
      if (file.exists) {
        file.delete()
      }
      file.create()
      file.write(dati)
      setOccupato('')
      await Share.share({ url: file.uri, title: f.nome || t('fatturazione.bozza') })
    } catch (e) {
      setOccupato('')
      errore(t('fatturazione.pdfNonPronto'), e)
    }
  }

  if (!f) {
    return (
      <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]} edges={['top', 'left', 'right']}>
        <Testata titolo={t('fatturazione.documento')} />
        {problema ? <Text style={[s.problema, { color: c.rosso }]}>{problema}</Text> : <Caricamento style={{ marginTop: spazio.xxl }} />}
      </SafeAreaView>
    )
  }

  const cliente = diCliente(f.tipo)
  const registrata = f.stato !== 'bozza' && f.stato !== 'annullata'
  const daPagare = f.stato === 'daPagare' || f.stato === 'parziale'
  const pagato = registrata ? Math.max(0, f.totale - f.residuo) : 0
  const colore = coloreStato(f.stato, c)
  const righeProdotto = f.righe.filter((r) => r.tipo === 'prodotto')

  return (
    <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]} edges={['top', 'left', 'right']}>
      <Testata
        titolo={f.nome || t('fatturazione.bozza')}
        sottotitolo={testoTipo(f.tipo)}
        destra={
          <Pressable onPress={() => void seguiFattura()} hitSlop={10} style={s.tasto} accessibilityRole="button" accessibilityLabel={t('fatturazione.segui')} accessibilityState={{ selected: f.segue }}>
            <Ionicons name={f.segue ? 'notifications' : 'notifications-outline'} size={24} color={f.segue ? c.primario : c.testo2} />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={s.contenuto}>
        {/* Stato e totale */}
        <View style={[s.sezione, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
          <View style={s.pillole}>
            <View style={[s.pillola, { backgroundColor: colore.sfondo }]}>
              <Text style={[s.pillolaTesto, { color: colore.testo }]} numberOfLines={1}>
                {testoStato(f.stato)}
              </Text>
            </View>
            {f.scaduta ? (
              <View style={[s.pillola, { backgroundColor: c.rossoTenue }]}>
                <Text style={[s.pillolaTesto, { color: c.rosso }]} numberOfLines={1}>
                  {t('fatturazione.scaduta')}
                </Text>
              </View>
            ) : null}
            {f.inviata && cliente ? <Ionicons name="paper-plane-outline" size={16} color={c.testo3} accessibilityLabel={t('fatturazione.inviata')} /> : null}
            <View style={{ flex: 1 }} />
            <Text style={[s.piccolo, { color: c.testo3 }]}>{data(f.data)}</Text>
          </View>
          <Text style={[s.grande, { color: c.testo }]} numberOfLines={1} adjustsFontSizeToFit>
            {importo(f.totale, f.valuta)}
          </Text>
          {daPagare && f.residuo > 0 ? (
            <Text style={[s.sotto, { color: f.scaduta ? c.rosso : c.testo2 }]} numberOfLines={1}>
              {t('fatturazione.restano', { importo: importo(f.residuo, f.valuta) })}
            </Text>
          ) : null}
        </View>

        {/* Cliente o fornitore */}
        <Sezione titolo={cliente ? t('fatturazione.cliente') : t('fatturazione.fornitore')}>
          <Pressable
            onPress={f.clienteId ? () => router.push({ pathname: '/contatti/[id]', params: { id: String(f.clienteId) } }) : undefined}
            disabled={!f.clienteId}
            style={s.riga}
            accessibilityRole={f.clienteId ? 'button' : 'text'}
          >
            {f.clienteId ? <Avatar nome={f.cliente} lato={40} url={urlAvatar(server, 'res.partner', f.clienteId)} logo={f.clienteAzienda} /> : <Avatar nome="?" lato={40} icona="person-outline" />}
            <View style={{ flex: 1 }}>
              <Text style={[s.valore, { color: c.testo }]} numberOfLines={2}>
                {f.cliente || '—'}
              </Text>
              {f.email || f.telefono ? (
                <Text style={[s.sotto, { color: c.testo2 }]} numberOfLines={1}>
                  {[f.telefono, f.email].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
            </View>
            {f.clienteId ? <Ionicons name="chevron-forward" size={18} color={c.testo3} /> : null}
          </Pressable>
          {f.telefono || f.email ? (
            <View style={s.azioni}>
              {f.telefono ? <Azione icona="call" testo={t('fatturazione.chiama')} onPress={() => chiamaNumero(sessione, f.telefono, f.cliente)} /> : null}
              {f.email ? <Azione icona="mail" testo={t('fatturazione.email')} onPress={() => void Linking.openURL(`mailto:${f.email}`)} /> : null}
            </View>
          ) : null}
        </Sezione>

        {/* Dati della fattura */}
        <Sezione>
          <Campo etichetta={t('fatturazione.numero')} valore={f.nome || t('fatturazione.bozza')} />
          <Campo etichetta={t('fatturazione.dataFattura')} valore={data(f.data)} />
          {f.scadenza ? <Campo etichetta={t('fatturazione.scadenza')} valore={data(f.scadenza)} rosso={f.scaduta} /> : null}
          {f.pagamento ? <Campo etichetta={t('fatturazione.pagamento')} valore={f.pagamento} /> : null}
          {f.riferimento ? <Campo etichetta={cliente ? t('fatturazione.riferimento') : t('fatturazione.riferimentoFornitore')} valore={f.riferimento} /> : null}
          {f.origine ? <Campo etichetta={t('fatturazione.origine')} valore={f.origine} /> : null}
          {f.venditore ? <Campo etichetta={t('fatturazione.venditore')} valore={f.venditore[1]} /> : null}
        </Sezione>

        {/* Righe */}
        <Sezione titolo={t('fatturazione.righe')}>
          {f.righe.length ? (
            f.righe.map((r, i) =>
              r.tipo === 'sezione' ? (
                <Text key={r.id} style={[s.rigaSezione, { color: c.testo }, i > 0 && { marginTop: spazio.s }]} numberOfLines={2}>
                  {r.descrizione}
                </Text>
              ) : r.tipo === 'nota' ? (
                <Text key={r.id} style={[s.rigaNota, { color: c.testo2 }]}>
                  {r.descrizione}
                </Text>
              ) : (
                <View key={r.id} style={[s.rigaProdotto, { borderColor: c.bordo }]}>
                  {r.prodottoId ? <Avatar url={immagineProdotto(server, r.prodottoId)} nome={r.prodotto} lato={40} logo icona="cube-outline" /> : null}
                  <View style={{ flex: 1 }}>
                    <Text style={[s.valoreRiga, { color: c.testo }]} numberOfLines={2}>
                      {r.prodotto || r.descrizione.split('\n')[0]}
                    </Text>
                    <Text style={[s.piccolo, { color: c.testo2 }]} numberOfLines={1}>
                      {`${quantita(r.quantita)}${r.unita ? ` ${r.unita}` : ''} × ${importo(r.prezzo, '')}${r.sconto ? ` · −${quantita(r.sconto)}%` : ''}`}
                    </Text>
                  </View>
                  <Text style={[s.valoreRiga, { color: c.testo }]} numberOfLines={1}>
                    {importo(r.subtotale, '')}
                  </Text>
                </View>
              ),
            )
          ) : (
            <Text style={[s.sotto, { color: c.testo3 }]}>{t('fatturazione.nessunaRiga')}</Text>
          )}
        </Sezione>

        {/* Totali */}
        <Sezione titolo={t('fatturazione.totali')}>
          <Campo etichetta={t('fatturazione.imponibile')} valore={importo(f.imponibile, f.valuta)} />
          <Campo etichetta={t('fatturazione.imposte')} valore={importo(f.imposte, f.valuta)} />
          <Campo etichetta={t('fatturazione.totale')} valore={importo(f.totale, f.valuta)} forte />
          {registrata && pagato > 0 ? <Campo etichetta={t('fatturazione.giaPagato')} valore={importo(pagato, f.valuta)} /> : null}
          {daPagare ? <Campo etichetta={t('fatturazione.daPagare')} valore={importo(f.residuo, f.valuta)} forte rosso={f.scaduta} /> : null}
        </Sezione>

        {f.note ? (
          <Sezione titolo={t('fatturazione.note')}>
            <Text style={[s.descrizione, { color: c.testo }]} selectable>
              {f.note}
            </Text>
          </Sezione>
        ) : null}

        {/* Azioni per lo stato del documento */}
        <View style={s.pulsanti}>
          {f.stato === 'bozza' ? <Pulsante testo={t('fatturazione.conferma')} occupato={occupato === 'conferma'} onPress={() => void confermaFattura()} /> : null}
          {registrata && cliente && f.stato !== 'stornata' ? (
            <Pulsante testo={f.inviata ? t('fatturazione.inviaDiNuovo') : t('fatturazione.inviaEmail')} variante={f.inviata ? 'tenue' : 'primario'} occupato={occupato === 'invia'} onPress={() => void invia()} />
          ) : null}
          {daPagare ? <Pulsante testo={t('fatturazione.registraPagamento')} variante="tenue" icona="arrow-forward-circle" onPress={() => apriInOdooWeb(router, MODELLO, f.id)} /> : null}
          {Platform.OS === 'ios' && righeProdotto.length ? (
            <Pulsante testo={t('fatturazione.condividiPdf')} variante="tenue" occupato={occupato === 'pdf'} onPress={() => void condividiPdf()} />
          ) : null}
        </View>

        <Sezione titolo={t('fatturazione.conversazione')}>
          <Registro server={server} modello={MODELLO} id={f.id} versione={versione} />
        </Sezione>

        <Pulsante testo={t('fatturazione.apriInOdoo')} variante="tenue" icona="arrow-forward-circle" onPress={() => apriInOdooWeb(router, MODELLO, f.id)} />
      </ScrollView>
    </SafeAreaView>
  )
}

function Sezione({ titolo, children }: { titolo?: string; children: ReactNode }) {
  const c = useColori()
  return (
    <View style={[s.sezione, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
      {titolo ? <Text style={[s.sezioneTitolo, { color: c.testo2 }]}>{titolo}</Text> : null}
      {children}
    </View>
  )
}

function Campo({ etichetta, valore, forte, rosso }: { etichetta: string; valore: string; forte?: boolean; rosso?: boolean }) {
  const c = useColori()
  return (
    <View style={s.campo}>
      <Text style={[s.etichettaRiga, { color: c.testo2 }]} numberOfLines={1}>
        {etichetta}
      </Text>
      <View style={s.campoValore}>
        <Text style={[forte ? s.valoreForte : s.valore, { color: rosso ? c.rosso : valore ? c.testo : c.testo3, textAlign: 'right' }]} numberOfLines={2}>
          {valore || '—'}
        </Text>
      </View>
    </View>
  )
}

function Azione({ icona, testo, onPress }: { icona: keyof typeof Ionicons.glyphMap; testo: string; onPress: () => void }) {
  const c = useColori()
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.azione, { backgroundColor: pressed ? c.superficie2 : c.primarioTenue }]} accessibilityRole="button">
      <Ionicons name={icona} size={20} color={c.primario} />
      <Text style={[s.azioneTesto, { color: c.primario }]} numberOfLines={1}>
        {testo}
      </Text>
    </Pressable>
  )
}

const s = StyleSheet.create({
  pagina: { flex: 1 },
  tasto: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  problema: { fontSize: 15, textAlign: 'center', marginTop: spazio.xl, paddingHorizontal: spazio.xl },
  contenuto: { padding: spazio.l, paddingBottom: spazio.xxl * 2, gap: spazio.m },
  pillole: { flexDirection: 'row', alignItems: 'center', gap: spazio.s },
  pillola: { paddingHorizontal: 10, height: 26, borderRadius: 13, justifyContent: 'center' },
  pillolaTesto: { fontSize: 13, fontWeight: '700' },
  grande: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5, marginTop: spazio.xs },
  sezione: { padding: spazio.m, borderRadius: raggio.l, borderWidth: StyleSheet.hairlineWidth, gap: spazio.s },
  sezioneTitolo: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  riga: { flexDirection: 'row', alignItems: 'center', gap: spazio.m, minHeight: 44 },
  valore: { fontSize: 16, fontWeight: '600' },
  valoreForte: { fontSize: 17, fontWeight: '800' },
  valoreRiga: { fontSize: 15, fontWeight: '600' },
  sotto: { fontSize: 14 },
  piccolo: { fontSize: 13, marginTop: 1 },
  azioni: { flexDirection: 'row', gap: spazio.s, marginTop: spazio.xs },
  azione: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: spazio.s, borderRadius: raggio.m },
  azioneTesto: { fontSize: 12, fontWeight: '700' },
  rigaSezione: { fontSize: 15, fontWeight: '800' },
  rigaNota: { fontSize: 14, fontStyle: 'italic', lineHeight: 20 },
  rigaProdotto: { flexDirection: 'row', alignItems: 'center', gap: spazio.m, paddingVertical: spazio.s, borderBottomWidth: StyleSheet.hairlineWidth },
  campo: { flexDirection: 'row', alignItems: 'center', gap: spazio.s, minHeight: 40 },
  etichettaRiga: { fontSize: 15, flexShrink: 0, maxWidth: '55%' },
  campoValore: { flex: 1, alignItems: 'flex-end' },
  descrizione: { fontSize: 15, lineHeight: 22 },
  pulsanti: { gap: spazio.s },
})
