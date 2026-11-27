/**
 * Una opportunità: nome e priorità, fase (si cambia toccandola), ricavo
 * atteso, cliente con chiama ed email, venditore, team, etichette, chiusura
 * prevista, attività (fatte con un tocco, nuove in pochi tocchi), note e
 * conversazione. In fondo «Vinta» e «Persa» (con il motivo), come in Odoo.
 * Con l'app Vendite: i preventivi dell'opportunità e «Nuovo preventivo» (sale_crm).
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useState, type ReactNode } from 'react'
import { Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { t } from '../../i18n'
import {
  aggiorna,
  attivita as caricaAttivita,
  dettaglio,
  elenco,
  fasi as caricaFasi,
  fasiDelTeam,
  fatta,
  MODELLO,
  persa,
  pianifica,
  ripristina,
  tipiAttivita,
  vinta,
  type Attivita,
  type Dettaglio,
  type Fase,
  type Modifica,
  type Scelta,
  type TipoAttivita,
} from '../../odoo/crm'
import { APP, menuSalvato } from '../../odoo/capacita'
import { percorsoRecord, urlAvatar } from '../../odoo/lavoro'
import { segui } from '../../odoo/registro'
import { diOpportunita, type Ordine } from '../../odoo/vendite'
import { Avatar } from '../../ui/Avatar'
import { Caricamento } from '../../ui/Caricamento'
import { CercaPersone } from '../../ui/calendario/CercaPersone'
import { SceltaGiorno } from '../../ui/calendario/Selettori'
import { chiamaNumero } from '../../ui/chiama'
import { inviaOdoo, rottaOdoo } from '../../ui/comandiOdoo'
import { Foglio } from '../../ui/Foglio'
import { coloreStato, importo as importoVendita, testoStato } from '../../ui/formatoVendite'
import { coloreAttivita, colorePriorita, data, giornoIso, iconaAttivita, importo, leggiImporto, quando } from '../../ui/formatoCrm'
import { Pulsante } from '../../ui/Pulsante'
import { Registro } from '../../ui/Registro'
import { SceltaElenco } from '../../ui/SceltaElenco'
import { Testata } from '../../ui/Testata'
import { raggio, spazio, useColori } from '../../ui/tema'
import { useApp } from '../../voip/Contesto'

type Elenco = 'team' | 'etichette'
type Persone = 'cliente' | 'venditore'

/** Scorciatoie per la scadenza di un'attività, in giorni da oggi. */
const QUANDO = [
  { giorni: 0, testo: 'crm.oggi' },
  { giorni: 1, testo: 'crm.domani' },
  { giorni: 3, testo: 'crm.tra3' },
  { giorni: 7, testo: 'crm.traSettimana' },
  { giorni: 14, testo: 'crm.tra2Settimane' },
]

function traGiorni(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return giornoIso(d)
}

function errore(titolo: string, e: unknown) {
  Alert.alert(titolo, e instanceof Error ? e.message : String(e))
}

export default function SchedaOpportunita() {
  const c = useColori()
  const router = useRouter()
  const { id: idTesto } = useLocalSearchParams<{ id: string }>()
  const id = Number(idTesto)
  const { sessione } = useApp()
  const server = sessione?.server || ''
  const uid = sessione?.utente.uid || 0

  const [op, setOp] = useState<Dettaglio | null>(null)
  const [tutteFasi, setTutteFasi] = useState<Fase[]>([])
  const [lavori, setLavori] = useState<Attivita[]>([])
  const [problema, setProblema] = useState('')
  const [versione, setVersione] = useState(0)
  const [foglioElenco, setFoglioElenco] = useState<Elenco | null>(null)
  const [voci, setVoci] = useState<Scelta[]>([])
  const [foglioPersone, setFoglioPersone] = useState<Persone | null>(null)
  const [sceltaChiusura, setSceltaChiusura] = useState(false)
  const [modifica, setModifica] = useState(false)
  const [nome, setNome] = useState('')
  const [note, setNote] = useState('')
  const [foglioRicavo, setFoglioRicavo] = useState(false)
  const [ricavo, setRicavo] = useState('')
  const [foglioPersa, setFoglioPersa] = useState(false)
  const [motivi, setMotivi] = useState<Scelta[]>([])
  const [motivo, setMotivo] = useState<number | null>(null)
  const [notaPersa, setNotaPersa] = useState('')
  const [foglioAttivita, setFoglioAttivita] = useState(false)
  const [tipi, setTipi] = useState<TipoAttivita[]>([])
  const [tipo, setTipo] = useState<TipoAttivita | null>(null)
  const [scadenza, setScadenza] = useState(() => traGiorni(0))
  const [riassunto, setRiassunto] = useState('')
  const [occupato, setOccupato] = useState('')
  // Vendite: solo se l'utente ha l'app in Odoo (menu letto dalla scheda GestABLE).
  const conVendite = !!menuSalvato(server, uid)?.has(APP.vendite)
  const [preventivi, setPreventivi] = useState<Ordine[]>([])

  const ricarica = useCallback(async () => {
    if (!server || !id) {
      return
    }
    try {
      const [r, f, a, v] = await Promise.all([
        dettaglio(server, id),
        caricaFasi(server).catch(() => [] as Fase[]),
        caricaAttivita(server, id).catch(() => [] as Attivita[]),
        conVendite ? diOpportunita(server, id).catch(() => [] as Ordine[]) : Promise.resolve([] as Ordine[]),
      ])
      setOp(r)
      setTutteFasi(f)
      setLavori(a)
      setPreventivi(v)
      setProblema('')
      setVersione((v) => v + 1)
    } catch (e) {
      setProblema(e instanceof Error ? e.message : String(e))
    }
  }, [server, id, conVendite])

  useFocusEffect(
    useCallback(() => {
      void ricarica()
    }, [ricarica]),
  )

  async function cambia(m: Modifica, ottimista?: Partial<Dettaglio>) {
    if (!op) {
      return
    }
    const prima = op
    if (ottimista) {
      setOp({ ...op, ...ottimista })
    }
    try {
      await aggiorna(server, op.id, m)
      await ricarica()
    } catch (e) {
      setOp(prima)
      errore(t('crm.nonSalvato'), e)
    }
  }

  async function apriElenco(cosa: Elenco) {
    setVoci([])
    setFoglioElenco(cosa)
    setVoci(await elenco(server, cosa).catch(() => []))
  }

  function scegliElenco(ids: number[]) {
    if (!op || !foglioElenco) {
      return
    }
    const nomeDi = (i: number) => voci.find((v) => v.id === i)?.nome || ''
    if (foglioElenco === 'team') {
      void cambia({ teamId: ids[0] || false }, { teamId: ids[0] || null, team: ids[0] ? nomeDi(ids[0]) : '' })
    } else {
      void cambia({ etichette: ids }, { etichette: ids.map((i) => ({ id: i, nome: nomeDi(i) })) })
    }
  }

  async function seguiOp() {
    if (!op) {
      return
    }
    const nuovo = !op.segue
    setOp({ ...op, segue: nuovo })
    try {
      await segui(server, uid, MODELLO, op.id, nuovo)
    } catch (e) {
      setOp({ ...op })
      errore(t('crm.nonSalvato'), e)
    }
  }

  async function azione(chiave: string, fai: () => Promise<void>, titoloErrore = t('crm.nonSalvato')) {
    setOccupato(chiave)
    try {
      await fai()
      await ricarica()
    } catch (e) {
      errore(titoloErrore, e)
    }
    setOccupato('')
  }

  async function apriPersa() {
    setMotivo(null)
    setNotaPersa('')
    setFoglioPersa(true)
    setMotivi(await elenco(server, 'motivi').catch(() => []))
  }

  async function apriAttivita() {
    setRiassunto('')
    setFoglioAttivita(true)
    const l = tipi.length ? tipi : await tipiAttivita(server).catch(() => [] as TipoAttivita[])
    setTipi(l)
    const primo = tipo && l.some((x) => x.id === tipo.id) ? tipo : l[0] || null
    setTipo(primo)
    setScadenza(traGiorni(primo?.giorni || 0))
  }

  function salvaTesti() {
    if (!nome.trim()) {
      Alert.alert(t('crm.nonSalvato'), t('crm.scriviNome'))
      return
    }
    setModifica(false)
    void cambia({ nome, descrizione: note }, { nome: nome.trim(), descrizione: note })
  }

  function salvaRicavo() {
    const n = leggiImporto(ricavo || '0')
    if (Number.isNaN(n) || n < 0) {
      return
    }
    setFoglioRicavo(false)
    void cambia({ importo: n }, { importo: n })
  }

  function apriInOdoo() {
    inviaOdoo({ tipo: 'apri', percorso: percorsoRecord(MODELLO, id) })
    router.dismissTo(rottaOdoo())
  }

  if (!op) {
    return (
      <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]} edges={['top']}>
        <Testata titolo={t('crm.opportunita')} />
        {problema ? <Text style={[s.problema, { color: c.rosso }]}>{problema}</Text> : <Caricamento style={{ marginTop: spazio.xxl }} />}
      </SafeAreaView>
    )
  }

  const fasiOp = fasiDelTeam(tutteFasi, op.teamId)
  const faseOp = tutteFasi.find((f) => f.id === op.faseId)
  const eVinta = !!faseOp?.vinta && op.attiva
  const ePersa = !op.attiva

  return (
    <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]} edges={['top']}>
      <Testata
        titolo={t('crm.opportunita')}
        destra={
          <Pressable onPress={() => void seguiOp()} hitSlop={10} style={s.tasto} accessibilityRole="button" accessibilityState={{ selected: op.segue }}>
            <Ionicons name={op.segue ? 'notifications' : 'notifications-outline'} size={24} color={op.segue ? c.primario : c.testo2} />
          </Pressable>
        }
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.contenuto} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
          <Pressable
            onPress={() => {
              setNome(op.nome)
              setNote(op.descrizione)
              setModifica(true)
            }}
            accessibilityRole="button"
            accessibilityHint={t('crm.modifica')}
          >
            <Text style={[s.titolo, { color: c.testo }]}>{op.nome}</Text>
          </Pressable>
          <View style={s.sottoTitolo}>
            <View style={s.stelle} accessibilityLabel={t('crm.priorita')}>
              {[1, 2, 3].map((n) => (
                <Pressable
                  key={n}
                  onPress={() => void cambia({ priorita: op.priorita === n ? n - 1 : n }, { priorita: op.priorita === n ? n - 1 : n })}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('crm.priorita')} ${n}`}
                >
                  <Ionicons name={op.priorita >= n ? 'star' : 'star-outline'} size={22} color={op.priorita >= n ? colorePriorita(op.priorita, c) : c.testo3} />
                </Pressable>
              ))}
            </View>
            <Text style={[s.quando, { color: c.testo3 }]}>{t('crm.probabilita', { n: op.probabilita })}</Text>
          </View>

          {eVinta ? (
            <View style={[s.avviso, { backgroundColor: c.verdeTenue }]}>
              <Ionicons name="trophy" size={18} color={c.verde} />
              <Text style={[s.avvisoTesto, { color: c.verde }]}>{t('crm.vintaNota')}</Text>
            </View>
          ) : null}
          {ePersa ? (
            <View style={[s.avvisoBlocco, { backgroundColor: c.rossoTenue }]}>
              <View style={s.riga}>
                <Ionicons name="close-circle" size={18} color={c.rosso} />
                <Text style={[s.avvisoTesto, { color: c.rosso, flex: 1 }]}>{t('crm.persaNota')}</Text>
              </View>
              {op.motivoPerdita ? <Text style={[s.sotto, { color: c.testo }]}>{t('crm.motivo', { motivo: op.motivoPerdita })}</Text> : null}
              <Pulsante testo={t('crm.ripristina')} variante="tenue" occupato={occupato === 'ripristina'} onPress={() => void azione('ripristina', () => ripristina(server, op.id))} />
            </View>
          ) : null}

          {/* Fasi: si cambia toccando, come trascinare la scheda nel kanban */}
          {!ePersa ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.fasi} style={s.fasiRiga}>
              {fasiOp.map((f) => {
                const attiva = f.id === op.faseId
                const sfondo = attiva ? (f.vinta ? c.verde : c.primario) : c.superficie
                return (
                  <Pressable
                    key={f.id}
                    onPress={() => (attiva ? undefined : void cambia({ faseId: f.id }, { faseId: f.id, fase: f.nome }))}
                    style={[s.fase, { backgroundColor: sfondo, borderColor: attiva ? sfondo : c.bordo }]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: attiva }}
                  >
                    {f.vinta ? <Ionicons name="trophy" size={13} color={attiva ? '#FFFFFF' : c.verde} /> : null}
                    <Text style={[s.faseTesto, { color: attiva ? '#FFFFFF' : c.testo }]} numberOfLines={1}>
                      {f.nome}
                    </Text>
                  </Pressable>
                )
              })}
            </ScrollView>
          ) : null}

          {/* Ricavo atteso */}
          <Pressable
            onPress={() => {
              setRicavo(op.importo ? String(op.importo) : '')
              setFoglioRicavo(true)
            }}
            style={[s.sezione, s.ricavo, { backgroundColor: c.superficie, borderColor: c.bordo }]}
            accessibilityRole="button"
          >
            <View style={{ flex: 1 }}>
              <Text style={[s.sezioneTitolo, { color: c.testo2 }]}>{t('crm.ricavo')}</Text>
              <Text style={[s.grande, { color: c.testo }]} numberOfLines={1}>
                {importo(op.importo, op.valuta)}
              </Text>
            </View>
            <Ionicons name="create-outline" size={20} color={c.testo3} />
          </Pressable>

          {/* Cliente */}
          <Sezione titolo={t('crm.cliente')}>
            <Pressable onPress={() => setFoglioPersone('cliente')} style={s.riga} accessibilityRole="button">
              {op.clienteId ? <Avatar nome={op.cliente} lato={40} url={urlAvatar(server, 'res.partner', op.clienteId)} logo={op.clienteAzienda} /> : <Avatar nome="?" lato={40} icona="person-outline" />}
              <View style={{ flex: 1 }}>
                <Text style={[s.valore, { color: op.cliente ? c.testo : c.testo3 }]} numberOfLines={1}>
                  {op.cliente || t('crm.scegliCliente')}
                </Text>
                {op.email || op.telefono ? (
                  <Text style={[s.sotto, { color: c.testo2 }]} numberOfLines={1}>
                    {[op.telefono, op.email].filter(Boolean).join(' · ')}
                  </Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color={c.testo3} />
            </Pressable>
            {op.telefono || op.email ? (
              <View style={s.azioni}>
                {op.telefono ? <Azione icona="call" testo={t('crm.chiama')} onPress={() => chiamaNumero(sessione, op.telefono, op.cliente)} /> : null}
                {op.email ? <Azione icona="mail" testo={t('crm.email')} onPress={() => void Linking.openURL(`mailto:${op.email}`)} /> : null}
              </View>
            ) : null}
          </Sezione>

          {/* Campi */}
          <Sezione>
            <Campo etichetta={t('crm.venditore')} onPress={() => setFoglioPersone('venditore')}>
              {op.venditore ? (
                <View style={s.persona}>
                  <Avatar nome={op.venditore[1]} lato={26} url={urlAvatar(server, 'res.users', op.venditore[0])} />
                  <Text style={[s.valore, { color: c.testo, flexShrink: 1 }]} numberOfLines={1}>
                    {op.venditore[1]}
                  </Text>
                </View>
              ) : (
                <Text style={[s.valore, { color: c.testo3 }]}>{t('crm.nessuno')}</Text>
              )}
            </Campo>
            <Campo etichetta={t('crm.team')} valore={op.team} onPress={() => void apriElenco('team')} />
            <Campo etichetta={t('crm.etichette')} onPress={() => void apriElenco('etichette')}>
              {op.etichette.length ? (
                <View style={s.etichette}>
                  {op.etichette.map((e) => (
                    <View key={e.id} style={[s.etichetta, { backgroundColor: c.superficie2 }]}>
                      <Text style={[s.etichettaTesto, { color: c.testo }]} numberOfLines={1}>
                        {e.nome}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={[s.valore, { color: c.testo3 }]}>{t('crm.nessuna')}</Text>
              )}
            </Campo>
            <Campo etichetta={t('crm.chiusura')} valore={op.chiusura ? data(op.chiusura) : ''} onPress={() => setSceltaChiusura(true)} />
          </Sezione>

          {/* Attività */}
          <Sezione titolo={t('crm.attivita')}>
            {lavori.length ? (
              lavori.map((a) => (
                <View key={a.id} style={[s.attivita, { borderColor: c.bordo }]}>
                  <View style={[s.iconaAttivita, { backgroundColor: c.superficie2 }]}>
                    <Ionicons name={iconaAttivita(a.categoria, a.icona)} size={18} color={coloreAttivita(a.stato, c)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.sotto, { color: c.testo, fontWeight: '600' }]} numberOfLines={2}>
                      {a.riassunto || a.tipo}
                    </Text>
                    <Text style={[s.piccolo, { color: coloreAttivita(a.stato, c) }]} numberOfLines={1}>
                      {[quando(a.scadenza), a.riassunto ? a.tipo : '', a.persona && a.persona[0] !== uid ? a.persona[1] : ''].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => void azione(`fatta-${a.id}`, () => fatta(server, a.id), t('crm.attivitaNonSalvata'))}
                    disabled={!!occupato}
                    hitSlop={8}
                    style={[s.fatta, { borderColor: c.verde }]}
                    accessibilityRole="button"
                    accessibilityLabel={`${t('crm.fatta')}: ${a.riassunto || a.tipo}`}
                  >
                    {occupato === `fatta-${a.id}` ? <Caricamento dimensione={16} /> : <Ionicons name="checkmark" size={18} color={c.verde} />}
                  </Pressable>
                </View>
              ))
            ) : (
              <Text style={[s.sotto, { color: c.testo3 }]}>{t('crm.nessunaAttivita')}</Text>
            )}
            <Pulsante testo={t('crm.pianifica')} variante="tenue" onPress={() => void apriAttivita()} />
          </Sezione>

          {conVendite ? (
            <Sezione titolo={t('vendite.filtro.preventivi')}>
              {preventivi.map((v) => {
                const colore = coloreStato(v.stato, c)
                return (
                  <Pressable
                    key={v.id}
                    onPress={() => router.push({ pathname: '/vendite/[id]', params: { id: String(v.id) } })}
                    style={[s.attivita, { borderColor: c.bordo }]}
                    accessibilityRole="button"
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[s.sotto, { color: c.testo, fontWeight: '600' }]} numberOfLines={1}>
                        {v.nome}
                      </Text>
                      <Text style={[s.piccolo, { color: colore.testo }]} numberOfLines={1}>
                        {testoStato(v.stato)}
                      </Text>
                    </View>
                    <Text style={[s.valore, { color: c.testo }]} numberOfLines={1}>
                      {importoVendita(v.totale, v.valuta)}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={c.testo3} />
                  </Pressable>
                )
              })}
              <Pulsante
                testo={t('vendite.nuovo')}
                variante="tenue"
                onPress={() =>
                  router.push({
                    pathname: '/vendite/nuovo',
                    params: { opportunita: String(op.id), ...(op.clienteId ? { cliente: String(op.clienteId), clienteNome: op.cliente } : {}) },
                  })
                }
              />
            </Sezione>
          ) : null}

          {op.descrizione ? (
            <Sezione titolo={t('crm.note')}>
              <Pressable
                onPress={() => {
                  setNome(op.nome)
                  setNote(op.descrizione)
                  setModifica(true)
                }}
                accessibilityRole="button"
              >
                <Text style={[s.descrizione, { color: c.testo }]} selectable>
                  {op.descrizione}
                </Text>
              </Pressable>
            </Sezione>
          ) : null}

          {/* Vinta / Persa */}
          {!ePersa && !eVinta ? (
            <View style={s.esito}>
              <Pressable
                onPress={() => void azione('vinta', () => vinta(server, op.id))}
                disabled={!!occupato}
                style={({ pressed }) => [s.esitoTasto, { backgroundColor: c.verde, opacity: pressed || occupato === 'vinta' ? 0.75 : 1 }]}
                accessibilityRole="button"
              >
                {occupato === 'vinta' ? <Caricamento dimensione={20} /> : <Ionicons name="trophy" size={18} color="#FFFFFF" />}
                <Text style={s.esitoTesto} numberOfLines={1}>
                  {t('crm.segnaVinta')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => void apriPersa()}
                disabled={!!occupato}
                style={({ pressed }) => [s.esitoTasto, { backgroundColor: c.rossoTenue, opacity: pressed ? 0.75 : 1 }]}
                accessibilityRole="button"
              >
                <Ionicons name="close-circle" size={18} color={c.rosso} />
                <Text style={[s.esitoTesto, { color: c.rosso }]} numberOfLines={1}>
                  {t('crm.segnaPersa')}
                </Text>
              </Pressable>
            </View>
          ) : null}

          <Sezione titolo={t('crm.conversazione')}>
            <Registro server={server} modello={MODELLO} id={op.id} versione={versione} />
          </Sezione>

          <Pulsante testo={t('crm.apriInOdoo')} variante="tenue" onPress={apriInOdoo} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Fogli */}
      <SceltaElenco
        aperto={foglioElenco !== null}
        titolo={foglioElenco === 'team' ? t('crm.team') : t('crm.etichette')}
        voci={voci}
        scelte={foglioElenco === 'team' ? (op.teamId ? [op.teamId] : []) : op.etichette.map((e) => e.id)}
        multipla={foglioElenco === 'etichette'}
        vuota={foglioElenco === 'team' ? t('crm.nessuno') : undefined}
        chiudi={() => setFoglioElenco(null)}
        scegli={scegliElenco}
      />

      <CercaPersone
        aperto={foglioPersone !== null}
        server={server}
        tipo={foglioPersone === 'cliente' ? 'invitati' : 'organizzatore'}
        titolo={foglioPersone === 'cliente' ? t('crm.cliente') : t('crm.venditore')}
        singolo
        scelti={[]}
        chiudi={() => setFoglioPersone(null)}
        tocca={(p) => {
          if (foglioPersone === 'cliente') {
            void cambia({ clienteId: p.id }, { clienteId: p.id, cliente: p.nome, email: p.email || '', clienteAzienda: !!p.eAzienda })
          } else {
            void cambia({ venditore: p.id }, { venditore: [p.id, p.nome] })
          }
          setFoglioPersone(null)
        }}
      />

      <SceltaGiorno
        aperto={sceltaChiusura}
        titolo={t('crm.chiusura')}
        valore={op.chiusura ? new Date(`${op.chiusura}T12:00:00`) : new Date()}
        chiudi={() => setSceltaChiusura(false)}
        scegli={(d) => {
          setSceltaChiusura(false)
          void cambia({ chiusura: giornoIso(d) }, { chiusura: giornoIso(d) })
        }}
      />

      <Foglio aperto={modifica} titolo={t('crm.modifica')} chiudi={() => setModifica(false)} fatto={t('comune.chiudi')}>
        <ScrollView contentContainerStyle={s.foglio} keyboardShouldPersistTaps="handled">
          <Text style={[s.etichettaCampo, { color: c.testo2 }]}>{t('crm.nomeOpportunita')}</Text>
          <TextInput value={nome} onChangeText={setNome} style={[s.input, { color: c.testo, backgroundColor: c.superficie, borderColor: c.bordo }]} />
          <Text style={[s.etichettaCampo, { color: c.testo2 }]}>{t('crm.note')}</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            multiline
            placeholder={t('crm.noteEsempio')}
            placeholderTextColor={c.testo3}
            style={[s.input, s.area, { color: c.testo, backgroundColor: c.superficie, borderColor: c.bordo }]}
          />
          <Pulsante testo={t('comune.salva')} onPress={salvaTesti} />
        </ScrollView>
      </Foglio>

      <Foglio aperto={foglioRicavo} titolo={t('crm.ricavo')} chiudi={() => setFoglioRicavo(false)} fatto={t('comune.chiudi')}>
        <ScrollView contentContainerStyle={s.foglio} keyboardShouldPersistTaps="handled">
          <View style={[s.importoRiga, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
            <Text style={[s.valuta, { color: c.testo2 }]}>{op.valuta}</Text>
            <TextInput
              value={ricavo}
              onChangeText={setRicavo}
              placeholder={t('crm.ricavoEsempio')}
              placeholderTextColor={c.testo3}
              keyboardType="decimal-pad"
              autoFocus
              style={[s.importoCampo, { color: c.testo }]}
            />
          </View>
          <Pulsante testo={t('comune.salva')} onPress={salvaRicavo} />
        </ScrollView>
      </Foglio>

      <Foglio aperto={foglioPersa} titolo={t('crm.perchePersa')} chiudi={() => setFoglioPersa(false)} fatto={t('comune.chiudi')}>
        <ScrollView contentContainerStyle={s.foglio} keyboardShouldPersistTaps="handled">
          <View style={[s.gruppo, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
            {[{ id: 0, nome: t('crm.nessunMotivo') }, ...motivi].map((m, i) => {
              const scelto = (motivo || 0) === m.id
              return (
                <Pressable
                  key={m.id}
                  onPress={() => setMotivo(m.id || null)}
                  style={[s.voce, i > 0 && { borderTopColor: c.bordo, borderTopWidth: StyleSheet.hairlineWidth }]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: scelto }}
                >
                  <Ionicons name={scelto ? 'radio-button-on' : 'radio-button-off'} size={22} color={scelto ? c.primario : c.testo3} />
                  <Text style={[s.valore, { color: c.testo, fontWeight: scelto ? '700' : '500', flex: 1 }]} numberOfLines={2}>
                    {m.nome}
                  </Text>
                </Pressable>
              )
            })}
          </View>
          <Text style={[s.etichettaCampo, { color: c.testo2 }]}>{t('crm.notaPersa')}</Text>
          <TextInput
            value={notaPersa}
            onChangeText={setNotaPersa}
            multiline
            placeholder={t('crm.notaPersaEsempio')}
            placeholderTextColor={c.testo3}
            style={[s.input, s.areaBassa, { color: c.testo, backgroundColor: c.superficie, borderColor: c.bordo }]}
          />
          <Pulsante
            testo={t('crm.confermaPersa')}
            variante="pericolo"
            occupato={occupato === 'persa'}
            onPress={() =>
              void azione('persa', async () => {
                await persa(server, op.id, motivo, notaPersa)
                setFoglioPersa(false)
              })
            }
          />
        </ScrollView>
      </Foglio>

      <Foglio aperto={foglioAttivita} titolo={t('crm.pianifica')} chiudi={() => setFoglioAttivita(false)} fatto={t('comune.chiudi')}>
        <ScrollView contentContainerStyle={s.foglio} keyboardShouldPersistTaps="handled">
          <Text style={[s.etichettaCampo, { color: c.testo2 }]}>{t('crm.tipoAttivita')}</Text>
          <View style={s.pillole}>
            {tipi.map((x) => {
              const scelto = tipo?.id === x.id
              return (
                <Pressable
                  key={x.id}
                  onPress={() => {
                    setTipo(x)
                    setScadenza(traGiorni(x.giorni))
                  }}
                  style={[s.pillola, { backgroundColor: scelto ? c.primario : c.superficie, borderColor: scelto ? c.primario : c.bordo }]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: scelto }}
                >
                  <Ionicons name={iconaAttivita(x.categoria, x.icona)} size={15} color={scelto ? '#FFFFFF' : c.primario} />
                  <Text style={[s.pillolaTesto, { color: scelto ? '#FFFFFF' : c.testo }]} numberOfLines={1}>
                    {x.nome}
                  </Text>
                </Pressable>
              )
            })}
          </View>
          <Text style={[s.etichettaCampo, { color: c.testo2 }]}>{t('crm.quandoAttivita')}</Text>
          <View style={s.pillole}>
            {QUANDO.map((q) => {
              const scelto = scadenza === traGiorni(q.giorni)
              return (
                <Pressable
                  key={q.giorni}
                  onPress={() => setScadenza(traGiorni(q.giorni))}
                  style={[s.pillola, { backgroundColor: scelto ? c.primario : c.superficie, borderColor: scelto ? c.primario : c.bordo }]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: scelto }}
                >
                  <Text style={[s.pillolaTesto, { color: scelto ? '#FFFFFF' : c.testo }]} numberOfLines={1}>
                    {t(q.testo)}
                  </Text>
                </Pressable>
              )
            })}
          </View>
          <Text style={[s.sotto, { color: c.testo2 }]}>{data(scadenza)}</Text>
          <Text style={[s.etichettaCampo, { color: c.testo2 }]}>{t('crm.riassunto')}</Text>
          <TextInput
            value={riassunto}
            onChangeText={setRiassunto}
            placeholder={t('crm.riassuntoEsempio')}
            placeholderTextColor={c.testo3}
            style={[s.input, { color: c.testo, backgroundColor: c.superficie, borderColor: c.bordo }]}
          />
          <Pulsante
            testo={t('crm.pianifica')}
            occupato={occupato === 'pianifica'}
            onPress={() => {
              if (!tipo) {
                return
              }
              void azione(
                'pianifica',
                async () => {
                  await pianifica(server, op.id, { tipoId: tipo.id, data: scadenza, riassunto, persona: uid })
                  setFoglioAttivita(false)
                },
                t('crm.attivitaNonSalvata'),
              )
            }}
          />
        </ScrollView>
      </Foglio>
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

function Campo({ etichetta, valore, onPress, children }: { etichetta: string; valore?: string; onPress?: () => void; children?: ReactNode }) {
  const c = useColori()
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={s.campo} accessibilityRole={onPress ? 'button' : 'text'}>
      <Text style={[s.etichettaRiga, { color: c.testo2 }]} numberOfLines={1}>
        {etichetta}
      </Text>
      <View style={s.campoValore}>
        {children ?? (
          <Text style={[s.valore, { color: valore ? c.testo : c.testo3, textAlign: 'right' }]} numberOfLines={2}>
            {valore || t('crm.nessuna')}
          </Text>
        )}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={16} color={c.testo3} /> : null}
    </Pressable>
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
  titolo: { fontSize: 22, fontWeight: '800', lineHeight: 28 },
  sottoTitolo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: -spazio.xs },
  stelle: { flexDirection: 'row', gap: spazio.xs },
  quando: { fontSize: 13, fontWeight: '600' },
  avviso: { flexDirection: 'row', alignItems: 'center', gap: spazio.s, padding: spazio.m, borderRadius: raggio.m },
  avvisoBlocco: { gap: spazio.s, padding: spazio.m, borderRadius: raggio.m },
  avvisoTesto: { fontSize: 15, fontWeight: '700' },
  fasiRiga: { marginHorizontal: -spazio.l },
  fasi: { gap: spazio.s, paddingHorizontal: spazio.l },
  fase: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, height: 36, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth },
  faseTesto: { fontSize: 14, fontWeight: '600' },
  sezione: { padding: spazio.m, borderRadius: raggio.l, borderWidth: StyleSheet.hairlineWidth, gap: spazio.s },
  sezioneTitolo: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  ricavo: { flexDirection: 'row', alignItems: 'center' },
  grande: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5, marginTop: 2 },
  riga: { flexDirection: 'row', alignItems: 'center', gap: spazio.m },
  valore: { fontSize: 16, fontWeight: '600' },
  sotto: { fontSize: 14 },
  piccolo: { fontSize: 12, fontWeight: '600', marginTop: 1 },
  azioni: { flexDirection: 'row', gap: spazio.s, marginTop: spazio.xs },
  azione: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: spazio.s, borderRadius: raggio.m },
  azioneTesto: { fontSize: 12, fontWeight: '700' },
  campo: { flexDirection: 'row', alignItems: 'center', gap: spazio.s, minHeight: 44 },
  etichettaRiga: { fontSize: 15, flexShrink: 0, maxWidth: '55%' },
  campoValore: { flex: 1, alignItems: 'flex-end' },
  persona: { flexDirection: 'row', alignItems: 'center', gap: spazio.s, maxWidth: '100%' },
  etichette: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 4 },
  etichetta: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, maxWidth: 160 },
  etichettaTesto: { fontSize: 12, fontWeight: '600' },
  attivita: { flexDirection: 'row', alignItems: 'center', gap: spazio.m, paddingVertical: spazio.s, borderBottomWidth: StyleSheet.hairlineWidth },
  iconaAttivita: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  fatta: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  descrizione: { fontSize: 15, lineHeight: 22 },
  esito: { flexDirection: 'row', gap: spazio.s },
  esitoTasto: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spazio.s, minHeight: 52, borderRadius: raggio.m, paddingHorizontal: spazio.m },
  esitoTesto: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  foglio: { padding: spazio.l, gap: spazio.s },
  etichettaCampo: { fontSize: 14, fontWeight: '600', marginTop: spazio.s },
  input: { fontSize: 16, padding: spazio.m, borderRadius: raggio.m, borderWidth: StyleSheet.hairlineWidth },
  area: { minHeight: 160, textAlignVertical: 'top' },
  areaBassa: { minHeight: 90, textAlignVertical: 'top' },
  importoRiga: { flexDirection: 'row', alignItems: 'center', gap: spazio.s, borderWidth: 1, borderRadius: raggio.m, paddingHorizontal: spazio.l },
  valuta: { fontSize: 18, fontWeight: '700' },
  importoCampo: { flex: 1, fontSize: 28, fontWeight: '700', paddingVertical: 10 },
  gruppo: { borderRadius: raggio.l, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: spazio.m },
  voce: { flexDirection: 'row', alignItems: 'center', gap: spazio.m, minHeight: 50, paddingVertical: spazio.s },
  pillole: { flexDirection: 'row', flexWrap: 'wrap', gap: spazio.s },
  pillola: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 38, borderRadius: 19, borderWidth: StyleSheet.hairlineWidth },
  pillolaTesto: { fontSize: 15, fontWeight: '600' },
})
