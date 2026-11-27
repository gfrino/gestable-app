/**
 * Scheda di un contatto con tutto quello che c'e' in Odoo: azioni rapide
 * (chiama, messaggio, email, mappa), i numeri delle app collegate
 * (opportunita', vendite, appuntamenti, fatturato), recapiti e indirizzo,
 * etichette, dati fiscali, vendite e acquisti, conti bancari, contatti e
 * indirizzi dell'azienda (anche nuovi), note interne, attivita' e
 * conversazione (il chatter). La matita apre la modifica di tutti i campi;
 * la campanella segue il contatto. Mostra solo i campi che il server ha.
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useState, type ReactNode } from 'react'
import { Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { t } from '../../i18n'
import { APP, menuSalvato } from '../../odoo/capacita'
import { creaFiglio, nomeScelta, schedaCompleta, type Completa } from '../../odoo/contatti'
import { percorsoRecord, urlAvatar } from '../../odoo/lavoro'
import { segui } from '../../odoo/registro'
import { AttivitaRecord } from '../../ui/AttivitaRecord'
import { Avatar } from '../../ui/Avatar'
import { Caricamento } from '../../ui/Caricamento'
import { chiamaNumero } from '../../ui/chiama'
import { inviaOdoo, rottaOdoo } from '../../ui/comandiOdoo'
import { Collegamenti, soloLink, trovaCollegamenti } from '../../ui/contatti/Collegamenti'
import { ModuloContatto } from '../../ui/contatti/ModuloContatto'
import { Foglio } from '../../ui/Foglio'
import { importo } from '../../ui/formatoVendite'
import { Pulsante } from '../../ui/Pulsante'
import { Registro } from '../../ui/Registro'
import { Testata } from '../../ui/Testata'
import { raggio, spazio, useColori } from '../../ui/tema'
import { useApp } from '../../voip/Contesto'

const MODELLO = 'res.partner'

export default function SchedaContattoSchermata() {
  const c = useColori()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { sessione } = useApp()
  const server = sessione?.server || ''
  const uid = sessione?.utente.uid || 0
  const [k, setK] = useState<Completa | null>(null)
  const [errore, setErrore] = useState('')
  const [versione, setVersione] = useState(0)
  const [modifica, setModifica] = useState(false)
  const [figlio, setFiglio] = useState(false)
  const [tipoFiglio, setTipoFiglio] = useState('contact')
  const [nomeFiglio, setNomeFiglio] = useState('')
  const [occupato, setOccupato] = useState(false)
  const menu = menuSalvato(server, uid)

  const carica = useCallback(async () => {
    try {
      const r = await schedaCompleta(server, Number(id))
      if (r) {
        setK(r)
        setVersione((v) => v + 1)
      } else {
        setErrore(t('schede.contattoNonTrovato'))
      }
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e))
    }
  }, [server, id])

  useFocusEffect(
    useCallback(() => {
      void carica()
    }, [carica]),
  )

  function apri(url: string) {
    Linking.openURL(url).catch(() => Alert.alert(t('schede.link'), t('schede.nessunaAppLink')))
  }

  function apriInOdoo() {
    if (!k) {
      return
    }
    inviaOdoo({ tipo: 'apri', percorso: percorsoRecord(MODELLO, k.id) })
    router.dismissTo(rottaOdoo())
  }

  async function seguiContatto() {
    if (!k) {
      return
    }
    const nuovo = !k.segue
    setK({ ...k, segue: nuovo })
    try {
      await segui(server, uid, MODELLO, k.id, nuovo)
    } catch (e) {
      setK({ ...k })
      Alert.alert(t('schede.contattoNonSalvato'), e instanceof Error ? e.message : String(e))
    }
  }

  async function aggiungiFiglio() {
    if (!k) {
      return
    }
    if (tipoFiglio === 'contact' && !nomeFiglio.trim()) {
      Alert.alert(t('schede.contattoNonSalvato'), t('schede.scriviNome'))
      return
    }
    setOccupato(true)
    try {
      const nuovo = await creaFiglio(server, k.id, tipoFiglio, nomeFiglio)
      setFiglio(false)
      setOccupato(false)
      router.push({ pathname: '/contatti/[id]', params: { id: String(nuovo) } })
    } catch (e) {
      setOccupato(false)
      Alert.alert(t('schede.contattoNonSalvato'), e instanceof Error ? e.message : String(e))
    }
  }

  if (!k) {
    return (
      <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]} edges={['top', 'bottom', 'left', 'right']}>
        <Testata titolo={t('schede.contatto')} />
        {errore ? <Text style={[s.vuoto, { color: c.rosso }]}>{errore}</Text> : <Caricamento style={{ marginTop: spazio.xxl }} />}
      </SafeAreaView>
    )
  }

  const v = k.valori
  const ha = (x: string) => x in k.campi
  const nome = (x: string) => k.campi[x]?.string || x
  const azienda = v.is_company || k.figli.length > 0
  const numero = v.mobile || v.phone
  const indirizzo = [v.street, v.street2, [v.zip, v.city].filter(Boolean).join(' '), v.state_id?.nome, v.country_id?.nome].filter(Boolean).join('\n')
  const indirizzoUnaRiga = indirizzo.replace(/\n/g, ', ')
  // Sito e social sotto il nome; un link scritto in «posizione lavorativa» non si ripete come testo.
  const collegamenti = trovaCollegamenti(v.website, [v.function, v.ref, v.comment, ...k.social])
  const funzione = soloLink(v.function) ? '' : v.function
  const mappa = () => apri(`http://maps.apple.com/?q=${encodeURIComponent(indirizzoUnaRiga)}`)

  const azioni = [
    { icona: 'call' as const, testo: t('schede.chiama'), attiva: !!numero, fai: () => chiamaNumero(sessione, numero, v.name) },
    { icona: 'chatbubble' as const, testo: t('schede.messaggio'), attiva: !!numero, fai: () => apri(`sms:${numero.replace(/\s+/g, '')}`) },
    { icona: 'mail' as const, testo: t('schede.email'), attiva: !!v.email, fai: () => apri(`mailto:${v.email}`) },
    { icona: 'navigate' as const, testo: t('schede.mappa'), attiva: !!indirizzoUnaRiga, fai: mappa },
  ]

  // I numeri delle app collegate, come i pulsanti in alto nel modulo di Odoo.
  const contatori = [
    k.contatori.opportunita !== null && menu?.has(APP.crm) !== false
      ? { chiave: 'crm', icona: 'trending-up' as const, testo: t('schede.opportunita'), valore: String(k.contatori.opportunita), apri: () => router.push({ pathname: '/crm', params: { cliente: String(k.id), clienteNome: v.name } }) }
      : null,
    k.contatori.vendite !== null && menu?.has(APP.vendite) !== false
      ? { chiave: 'vendite', icona: 'document-text' as const, testo: t('vendite.app'), valore: String(k.contatori.vendite), apri: () => router.push({ pathname: '/vendite', params: { cliente: String(k.id), clienteNome: v.name } }) }
      : null,
    k.contatori.appuntamenti !== null ? { chiave: 'cal', icona: 'calendar' as const, testo: t('schede.appuntamenti'), valore: String(k.contatori.appuntamenti), apri: undefined } : null,
    k.contatori.fatturato ? { chiave: 'fatt', icona: 'cash' as const, testo: t('schede.fatturato'), valore: importo(k.contatori.fatturato.importo, k.contatori.fatturato.valuta), apri: undefined } : null,
  ].filter((x): x is NonNullable<typeof x> => !!x)

  const voce = (icona: keyof typeof Ionicons.glyphMap, etichetta: string, valore: string, onPress?: () => void) =>
    valore ? (
      <Pressable
        key={etichetta}
        onPress={onPress}
        disabled={!onPress}
        style={({ pressed }) => [s.voce, { backgroundColor: pressed ? c.superficie2 : 'transparent' }]}
      >
        <Ionicons name={icona} size={20} color={c.primario} />
        <View style={{ flex: 1 }}>
          <Text style={[s.voceEtichetta, { color: c.testo3 }]}>{etichetta}</Text>
          <Text style={[s.voceValore, { color: onPress ? c.primario : c.testo }]} selectable>
            {valore}
          </Text>
        </View>
      </Pressable>
    ) : null

  const fiscali = [
    voce('document-text-outline', nome('vat'), v.vat),
    ha('company_registry') ? voce('business-outline', nome('company_registry'), v.company_registry) : null,
    voce('pricetag-outline', nome('ref'), v.ref),
    ha('barcode') ? voce('barcode-outline', nome('barcode'), v.barcode) : null,
  ].filter(Boolean)
  const commerciali = (['user_id', 'team_id', 'property_payment_term_id', 'property_product_pricelist', 'property_supplier_payment_term_id', 'industry_id'] as const)
    .filter((x) => ha(x) && v[x])
    .map((x) => voce(x === 'user_id' ? 'person-outline' : x === 'team_id' ? 'people-outline' : x === 'industry_id' ? 'construct-outline' : x === 'property_product_pricelist' ? 'list-outline' : 'time-outline', nome(x), v[x]?.nome || ''))

  return (
    <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]} edges={['top', 'bottom', 'left', 'right']}>
      <Testata
        titolo={azienda ? t('schede.azienda') : t('schede.contatto')}
        destra={
          <View style={s.tasti}>
            <Pressable onPress={() => void seguiContatto()} hitSlop={8} style={s.tasto} accessibilityRole="button" accessibilityLabel={t('schede.segui')} accessibilityState={{ selected: k.segue }}>
              <Ionicons name={k.segue ? 'notifications' : 'notifications-outline'} size={23} color={k.segue ? c.primario : c.testo2} />
            </Pressable>
            <Pressable onPress={() => setModifica(true)} hitSlop={8} style={s.tasto} accessibilityRole="button" accessibilityLabel={t('schede.modifica')}>
              <Ionicons name="create-outline" size={24} color={c.primario} />
            </Pressable>
          </View>
        }
      />
      <ScrollView contentContainerStyle={s.contenuto} keyboardShouldPersistTaps="handled">
        <View style={s.eroe}>
          <Avatar url={k.foto ? urlAvatar(server, MODELLO, k.id) : undefined} nome={v.name || '?'} icona={v.is_company ? 'business' : undefined} logo={azienda} lato={72} />
          <View style={s.eroeTesto}>
            <Text style={[s.nome, { color: c.testo }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
              {v.name || nomeScelta(k.campi.type, v.type)}
            </Text>
            <Collegamenti {...collegamenti} />
            {[v.title?.nome, funzione].filter(Boolean).length ? (
              <Text style={[s.funzione, { color: c.testo2 }]} numberOfLines={2}>
                {[v.title?.nome, funzione].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
            {v.parent_id ? (
              <Pressable
                onPress={() => router.push({ pathname: '/contatti/[id]', params: { id: String(v.parent_id?.id) } })}
                style={[s.azienda, { backgroundColor: c.primarioTenue }]}
                accessibilityRole="link"
              >
                <Ionicons name="business" size={14} color={c.primario} />
                <Text style={[s.aziendaTesto, { color: c.primario }]} numberOfLines={1}>
                  {v.parent_id.nome}
                </Text>
              </Pressable>
            ) : null}
            {v.parent_id && v.type && v.type !== 'contact' ? (
              <Text style={[s.funzione, { color: c.testo3 }]}>{nomeScelta(k.campi.type, v.type)}</Text>
            ) : null}
          </View>
        </View>

        <View style={s.azioni}>
          {azioni.map((a) => (
            <Pressable
              key={a.testo}
              onPress={a.fai}
              disabled={!a.attiva}
              style={({ pressed }) => [s.azione, { backgroundColor: pressed ? c.superficie2 : c.superficie, borderColor: c.bordo, opacity: a.attiva ? 1 : 0.4 }]}
              accessibilityRole="button"
              accessibilityLabel={a.testo}
            >
              <Ionicons name={a.icona} size={22} color={a.icona === 'call' ? c.verde : c.primario} />
              <Text style={[s.azioneTesto, { color: c.testo }]} numberOfLines={1}>
                {a.testo}
              </Text>
            </Pressable>
          ))}
        </View>

        {contatori.length ? (
          <View style={s.contatori}>
            {contatori.map((x) => (
              <Pressable
                key={x.chiave}
                onPress={x.apri}
                disabled={!x.apri}
                style={({ pressed }) => [s.contatore, { backgroundColor: pressed ? c.superficie2 : c.superficie, borderColor: c.bordo }]}
                accessibilityRole={x.apri ? 'button' : 'text'}
              >
                <Ionicons name={x.icona} size={18} color={c.primario} />
                <Text style={[s.contatoreValore, { color: c.testo }]} numberOfLines={1} adjustsFontSizeToFit>
                  {x.valore}
                </Text>
                <Text style={[s.contatoreTesto, { color: c.testo2 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                  {x.testo}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <Scheda>
          {voce('phone-portrait-outline', nome('mobile'), v.mobile, () => chiamaNumero(sessione, v.mobile, v.name))}
          {v.phone && v.phone.replace(/\D/g, '') !== v.mobile.replace(/\D/g, '') ? voce('call-outline', nome('phone'), v.phone, () => chiamaNumero(sessione, v.phone, v.name)) : null}
          {voce('mail-outline', nome('email'), v.email, () => apri(`mailto:${v.email}`))}
          {voce('location-outline', t('schede.indirizzo'), indirizzo, mappa)}
          {voce('language-outline', nome('lang'), v.lang ? nomeScelta(k.campi.lang, v.lang) : '')}
          {!numero && !v.email && !indirizzo ? <Text style={[s.vuotoScheda, { color: c.testo3 }]}>{t('schede.nessunRecapito')}</Text> : null}
        </Scheda>

        {v.category_id.length ? (
          <View style={s.etichette}>
            {v.category_id.map((e) => (
              <View key={e.id} style={[s.etichetta, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
                <Text style={[s.etichettaTesto, { color: c.testo2 }]}>{e.nome}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {commerciali.length ? <Scheda titolo={t('schede.venditeAcquisti')}>{commerciali}</Scheda> : null}
        {fiscali.length ? <Scheda titolo={t('schede.fiscale')}>{fiscali}</Scheda> : null}
        {k.banche.length ? <Scheda titolo={nome('bank_ids')}>{k.banche.map((b) => voce('card-outline', t('schede.conto'), b))}</Scheda> : null}

        {azienda && !v.parent_id ? (
          <Scheda titolo={nome('child_ids')}>
            {k.figli.map((p) => {
              const n = p.cellulare || p.telefono
              return (
                <Pressable
                  key={p.id}
                  onPress={() => router.push({ pathname: '/contatti/[id]', params: { id: String(p.id) } })}
                  style={({ pressed }) => [s.persona, { backgroundColor: pressed ? c.superficie2 : 'transparent' }]}
                >
                  <Avatar
                    url={p.foto ? urlAvatar(server, MODELLO, p.id) : undefined}
                    nome={p.nome || p.tipoNome}
                    icona={p.tipo === 'contact' ? undefined : p.tipo === 'invoice' ? 'receipt-outline' : p.tipo === 'delivery' ? 'cube-outline' : 'location-outline'}
                    lato={38}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.personaNome, { color: c.testo }]} numberOfLines={1}>
                      {p.nome || p.tipoNome}
                    </Text>
                    <Text style={[s.personaSotto, { color: c.testo2 }]} numberOfLines={2}>
                      {[p.tipo !== 'contact' ? p.tipoNome : '', p.funzione, p.tipo === 'contact' ? p.email : p.indirizzo.replace(/\n/g, ', ')].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  {n ? (
                    <Pressable
                      onPress={() => chiamaNumero(sessione, n, p.nome)}
                      hitSlop={8}
                      style={[s.chiama, { backgroundColor: c.verdeTenue }]}
                      accessibilityLabel={t('schede.chiamaNome', { nome: p.nome })}
                    >
                      <Ionicons name="call" size={16} color={c.verde} />
                    </Pressable>
                  ) : null}
                </Pressable>
              )
            })}
            <View style={{ padding: spazio.s }}>
              <Pulsante
                testo={t('schede.aggiungiContatto')}
                variante="tenue"
                onPress={() => {
                  setTipoFiglio('contact')
                  setNomeFiglio('')
                  setFiglio(true)
                }}
              />
            </View>
          </Scheda>
        ) : null}

        {v.comment ? (
          <Scheda titolo={nome('comment')}>
            <Pressable onPress={() => setModifica(true)} style={{ paddingHorizontal: spazio.m, paddingBottom: spazio.s }} accessibilityRole="button">
              <Text style={[s.note, { color: c.testo }]} selectable>
                {v.comment}
              </Text>
            </Pressable>
          </Scheda>
        ) : null}

        <Scheda titolo={t('crm.attivita')} interno>
          <AttivitaRecord server={server} uid={uid} modello={MODELLO} id={k.id} versione={versione} />
        </Scheda>

        <Scheda titolo={t('crm.conversazione')} interno>
          <Registro server={server} modello={MODELLO} id={k.id} versione={versione} />
        </Scheda>

        <Pulsante testo={t('schede.apriInOdoo')} variante="tenue" icona="arrow-forward-circle" onPress={apriInOdoo} />
      </ScrollView>

      <ModuloContatto
        key={modifica ? 'aperto' : 'chiuso'}
        aperto={modifica}
        server={server}
        k={k}
        chiudi={() => setModifica(false)}
        salvato={() => {
          setModifica(false)
          void carica()
        }}
      />

      <Foglio aperto={figlio} titolo={t('schede.aggiungiContatto')} chiudi={() => setFiglio(false)} fatto={t('comune.chiudi')}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={s.foglio} keyboardShouldPersistTaps="handled">
            {k.campi.type?.selection ? (
              <View style={s.pillole}>
                {k.campi.type.selection.map(([valore, etichetta]) => {
                  const scelto = tipoFiglio === valore
                  return (
                    <Pressable
                      key={valore}
                      onPress={() => setTipoFiglio(valore)}
                      style={[s.pillola, { backgroundColor: scelto ? c.primario : c.superficie, borderColor: scelto ? c.primario : c.bordo }]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: scelto }}
                    >
                      <Text style={[s.pillolaTesto, { color: scelto ? '#FFFFFF' : c.testo }]} numberOfLines={1}>
                        {etichetta}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            ) : null}
            <Text style={[s.voceEtichetta, { color: c.testo2, marginTop: spazio.s }]}>{nome('name')}</Text>
            <TextInput
              value={nomeFiglio}
              onChangeText={setNomeFiglio}
              autoCapitalize="words"
              placeholder={tipoFiglio === 'contact' ? t('schede.nomeEsempio') : t('schede.facoltativo')}
              placeholderTextColor={c.testo3}
              style={[s.input, { color: c.testo, backgroundColor: c.superficie, borderColor: c.bordo }]}
            />
            <Text style={[s.personaSotto, { color: c.testo3 }]}>{t('schede.aggiungiContattoAiuto')}</Text>
            <Pulsante testo={t('schede.creaContinua')} occupato={occupato} onPress={() => void aggiungiFiglio()} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Foglio>
    </SafeAreaView>
  )
}

function Scheda({ titolo, interno, children }: { titolo?: string; interno?: boolean; children: ReactNode }) {
  const c = useColori()
  return (
    <View style={[s.scheda, interno && s.schedaInterna, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
      {titolo ? <Text style={[s.titoloScheda, { color: c.testo2 }, interno && { paddingHorizontal: 0 }]}>{titolo}</Text> : null}
      {children}
    </View>
  )
}

const s = StyleSheet.create({
  pagina: { flex: 1 },
  tasti: { flexDirection: 'row', alignItems: 'center' },
  tasto: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  contenuto: { padding: spazio.l, gap: spazio.m, paddingBottom: spazio.xxl },
  vuoto: { fontSize: 15, textAlign: 'center', marginTop: spazio.xl, paddingHorizontal: spazio.xl },
  eroe: { flexDirection: 'row', alignItems: 'center', gap: spazio.m, paddingTop: spazio.xs },
  eroeTesto: { flex: 1, alignItems: 'flex-start', gap: 4 },
  nome: { fontSize: 26, fontWeight: '800', letterSpacing: -0.3, alignSelf: 'stretch', textAlign: 'left' },
  funzione: { fontSize: 15 },
  azienda: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, maxWidth: '100%' },
  aziendaTesto: { fontSize: 14, fontWeight: '700' },
  azioni: { flexDirection: 'row', gap: spazio.s },
  azione: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 12, borderRadius: raggio.l, borderWidth: 1 },
  azioneTesto: { fontSize: 12, fontWeight: '600' },
  contatori: { flexDirection: 'row', gap: spazio.s },
  contatore: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 10, paddingHorizontal: 4, borderRadius: raggio.l, borderWidth: 1 },
  contatoreValore: { fontSize: 17, fontWeight: '800' },
  contatoreTesto: { fontSize: 11, fontWeight: '600' },
  scheda: { borderWidth: 1, borderRadius: raggio.l, paddingVertical: spazio.xs, overflow: 'hidden' },
  schedaInterna: { padding: spazio.m, gap: spazio.s },
  titoloScheda: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, paddingHorizontal: spazio.m, paddingTop: spazio.s, paddingBottom: 4 },
  voce: { flexDirection: 'row', alignItems: 'center', gap: spazio.m, paddingHorizontal: spazio.m, paddingVertical: 10 },
  voceEtichetta: { fontSize: 12, fontWeight: '600' },
  voceValore: { fontSize: 16, marginTop: 1 },
  vuotoScheda: { fontSize: 14, padding: spazio.m },
  etichette: { flexDirection: 'row', flexWrap: 'wrap', gap: spazio.s },
  etichetta: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  etichettaTesto: { fontSize: 13, fontWeight: '600' },
  persona: { flexDirection: 'row', alignItems: 'center', gap: spazio.m, paddingHorizontal: spazio.m, paddingVertical: 8 },
  personaNome: { fontSize: 15, fontWeight: '600' },
  personaSotto: { fontSize: 13 },
  chiama: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  note: { fontSize: 15, lineHeight: 21 },
  foglio: { padding: spazio.l, gap: spazio.s },
  pillole: { flexDirection: 'row', flexWrap: 'wrap', gap: spazio.s },
  pillola: { paddingHorizontal: 14, height: 38, borderRadius: 19, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center' },
  pillolaTesto: { fontSize: 15, fontWeight: '600' },
  input: { fontSize: 16, padding: spazio.m, borderRadius: raggio.m, borderWidth: StyleSheet.hairlineWidth },
})
