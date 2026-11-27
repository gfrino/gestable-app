/**
 * Un preventivo o ordine: cliente (chiama, email), stato, totale, le righe
 * (quantità, prezzo, sconto modificabili finché è un preventivo, prodotti
 * nuovi in pochi tocchi), venditore, scadenza, riferimento, condizioni di
 * pagamento, opportunità, fatture, note e conversazione.
 *
 * In fondo i pulsanti di Odoo per lo stato del documento: Invia per email,
 * Conferma, Crea fattura, PDF da condividere (iPhone), Annulla, Rimetti in
 * preventivo. Le azioni che cambiano qualcosa per il cliente chiedono conferma.
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { File, Paths } from 'expo-file-system'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useState, type ReactNode } from 'react'
import { Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { t } from '../../i18n'
import { urlAvatar } from '../../odoo/lavoro'
import { segui } from '../../odoo/registro'
import {
  aggiorna,
  aggiungiRiga,
  annulla,
  conferma,
  creaFattura,
  dettaglio,
  eliminaRiga,
  immagineProdotto,
  inviaEmail,
  MODELLO,
  modificaRiga,
  rimettiInPreventivo,
  urlPdf,
  type Dettaglio,
  type Modifica,
  type Prodotto,
  type RigaOrdine,
} from '../../odoo/vendite'
import { apriInOdooWeb } from '../../ui/apriRecord'
import { Avatar } from '../../ui/Avatar'
import { Caricamento } from '../../ui/Caricamento'
import { CercaPersone } from '../../ui/calendario/CercaPersone'
import { SceltaGiorno } from '../../ui/calendario/Selettori'
import { chiamaNumero } from '../../ui/chiama'
import { data, giornoIso, leggiImporto } from '../../ui/formatoCrm'
import { coloreStato, importo, quantita, testoFatturazione, testoStato } from '../../ui/formatoVendite'
import { Foglio } from '../../ui/Foglio'
import { Pulsante } from '../../ui/Pulsante'
import { Registro } from '../../ui/Registro'
import { Testata } from '../../ui/Testata'
import { raggio, spazio, useColori } from '../../ui/tema'
import { CercaProdotti } from '../../ui/vendite/CercaProdotti'
import { useApp } from '../../voip/Contesto'

function errore(titolo: string, e: unknown) {
  Alert.alert(titolo, e instanceof Error ? e.message : String(e))
}

/** Chiede conferma con un pulsante che dice cosa fa; risolve true se l'utente conferma. */
function chiedi(titolo: string, testo: string, pulsante: string, pericolo = false): Promise<boolean> {
  return new Promise((ok) =>
    Alert.alert(titolo, testo, [
      { text: t('vendite.indietro'), style: 'cancel', onPress: () => ok(false) },
      { text: pulsante, style: pericolo ? 'destructive' : 'default', onPress: () => ok(true) },
    ]),
  )
}

export default function SchedaOrdine() {
  const c = useColori()
  const router = useRouter()
  const { id: idTesto } = useLocalSearchParams<{ id: string }>()
  const id = Number(idTesto)
  const { sessione } = useApp()
  const server = sessione?.server || ''
  const uid = sessione?.utente.uid || 0

  const [op, setOp] = useState<Dettaglio | null>(null)
  const [problema, setProblema] = useState('')
  const [versione, setVersione] = useState(0)
  const [occupato, setOccupato] = useState('')
  const [persone, setPersone] = useState<'cliente' | 'venditore' | null>(null)
  const [sceltaScadenza, setSceltaScadenza] = useState(false)
  const [prodotti, setProdotti] = useState(false)
  const [riga, setRiga] = useState<RigaOrdine | null>(null)
  const [qta, setQta] = useState('')
  const [prezzo, setPrezzo] = useState('')
  const [sconto, setSconto] = useState('')
  const [descrizione, setDescrizione] = useState('')
  const [testi, setTesti] = useState(false)
  const [riferimento, setRiferimento] = useState('')
  const [note, setNote] = useState('')

  const ricarica = useCallback(async () => {
    if (!server || !id) {
      return
    }
    try {
      setOp(await dettaglio(server, id))
      setProblema('')
      setVersione((v) => v + 1)
    } catch (e) {
      setProblema(e instanceof Error ? e.message : String(e))
    }
  }, [server, id])

  useFocusEffect(
    useCallback(() => {
      void ricarica()
    }, [ricarica]),
  )

  async function azione(chiave: string, fai: () => Promise<void>, titoloErrore = t('vendite.nonSalvato')) {
    setOccupato(chiave)
    try {
      await fai()
      await ricarica()
    } catch (e) {
      errore(titoloErrore, e)
    }
    setOccupato('')
  }

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
      errore(t('vendite.nonSalvato'), e)
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
      errore(t('vendite.nonSalvato'), e)
    }
  }

  function apriRiga(r: RigaOrdine) {
    setQta(quantita(r.quantita).replace(/[’'\s]/g, ''))
    setPrezzo(String(r.prezzo))
    setSconto(r.sconto ? String(r.sconto) : '')
    setDescrizione(r.descrizione)
    setRiga(r)
  }

  function salvaRiga() {
    if (!riga) {
      return
    }
    const q = leggiImporto(qta)
    const p = leggiImporto(prezzo)
    const sc = sconto.trim() ? leggiImporto(sconto) : 0
    if ([q, p, sc].some((x) => Number.isNaN(x)) || q <= 0 || sc < 0 || sc > 100) {
      Alert.alert(t('vendite.nonSalvato'), t('vendite.numeriNonValidi'))
      return
    }
    const m: Parameters<typeof modificaRiga>[2] = {}
    if (q !== riga.quantita) m.quantita = q
    if (p !== riga.prezzo) m.prezzo = p
    if (sc !== riga.sconto) m.sconto = sc
    if (descrizione.trim() && descrizione.trim() !== riga.descrizione) m.descrizione = descrizione
    const id = riga.id
    setRiga(null)
    if (Object.keys(m).length) {
      void azione('riga', () => modificaRiga(server, id, m))
    }
  }

  async function togliRiga() {
    if (!riga) {
      return
    }
    const r = riga
    if (!(await chiedi(t('vendite.eliminaRiga'), r.prodotto || r.descrizione, t('vendite.elimina'), true))) {
      return
    }
    setRiga(null)
    void azione('riga', () => eliminaRiga(server, r.id))
  }

  function aggiungi(p: Prodotto) {
    setProdotti(false)
    if (op) {
      void azione('aggiungi', () => aggiungiRiga(server, op.id, p.id, 1))
    }
  }

  async function invia() {
    if (!op) {
      return
    }
    if (!op.email) {
      Alert.alert(t('vendite.senzaEmail'), t('vendite.senzaEmailTesto', { cliente: op.cliente }))
      return
    }
    if (await chiedi(t('vendite.inviaDomanda', { nome: op.nome }), t('vendite.inviaTesto', { email: op.email }), t('vendite.invia'))) {
      void azione('invia', () => inviaEmail(server, op.id), t('vendite.nonInviato'))
    }
  }

  async function confermaOrdine() {
    if (op && (await chiedi(t('vendite.confermaDomanda', { nome: op.nome }), t('vendite.confermaTesto'), t('vendite.conferma')))) {
      void azione('conferma', () => conferma(server, op.id))
    }
  }

  async function annullaOrdine() {
    if (op && (await chiedi(t('vendite.annullaDomanda', { nome: op.nome }), op.stato === 'sale' ? t('vendite.annullaOrdineTesto') : t('vendite.annullaTesto'), op.stato === 'sale' ? t('vendite.annullaOrdine') : t('vendite.annullaPreventivo'), true))) {
      void azione('annulla', () => annulla(server, op.id))
    }
  }

  async function fattura() {
    if (!op || !(await chiedi(t('vendite.fatturaDomanda'), t('vendite.fatturaTesto'), t('vendite.creaFattura')))) {
      return
    }
    setOccupato('fattura')
    try {
      const nuova = await creaFattura(server, op.id)
      await ricarica()
      if (nuova) {
        Alert.alert(t('vendite.fatturaCreata'), t('vendite.fatturaCreataTesto'), [
          { text: t('comune.chiudi'), style: 'cancel' },
          { text: t('vendite.apriFattura'), onPress: () => apriInOdooWeb(router, 'account.move', nuova) },
        ])
      }
    } catch (e) {
      errore(t('vendite.fatturaNonCreata'), e)
    }
    setOccupato('')
  }

  async function condividiPdf() {
    if (!op) {
      return
    }
    setOccupato('pdf')
    try {
      const r = await fetch(urlPdf(server, op.id), { credentials: 'include' })
      if (!r.ok || !(r.headers.get('content-type') || '').includes('pdf')) {
        throw new Error(t('vendite.pdfNonPronto'))
      }
      const dati = new Uint8Array(await r.arrayBuffer())
      const f = new File(Paths.cache, `${op.nome.replace(/[^\w.-]+/g, '_') || 'documento'}.pdf`)
      if (f.exists) {
        f.delete()
      }
      f.create()
      f.write(dati)
      setOccupato('')
      await Share.share({ url: f.uri, title: op.nome })
    } catch (e) {
      setOccupato('')
      errore(t('vendite.pdfNonPronto'), e)
    }
  }

  if (!op) {
    return (
      <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]} edges={['top']}>
        <Testata titolo={t('vendite.documento')} />
        {problema ? <Text style={[s.problema, { color: c.rosso }]}>{problema}</Text> : <Caricamento style={{ marginTop: spazio.xxl }} />}
      </SafeAreaView>
    )
  }

  const preventivo = op.stato === 'draft' || op.stato === 'sent'
  const modificabile = preventivo && !op.bloccato
  const colore = coloreStato(op.stato, c)
  const fatt = op.stato === 'sale' ? testoFatturazione(op.fatturazione) : ''
  const righeProdotto = op.righe.filter((r) => r.tipo === 'prodotto')

  return (
    <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]} edges={['top']}>
      <Testata
        titolo={op.nome}
        sottotitolo={preventivo ? t('vendite.preventivo') : t('vendite.ordine')}
        destra={
          <Pressable onPress={() => void seguiOp()} hitSlop={10} style={s.tasto} accessibilityRole="button" accessibilityLabel={t('vendite.segui')} accessibilityState={{ selected: op.segue }}>
            <Ionicons name={op.segue ? 'notifications' : 'notifications-outline'} size={24} color={op.segue ? c.primario : c.testo2} />
          </Pressable>
        }
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.contenuto} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
          {/* Stato e totale */}
          <View style={[s.sezione, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
            <View style={s.pillole}>
              <View style={[s.pillola, { backgroundColor: colore.sfondo }]}>
                <Text style={[s.pillolaTesto, { color: colore.testo }]} numberOfLines={1}>
                  {testoStato(op.stato)}
                </Text>
              </View>
              {fatt ? (
                <View style={[s.pillola, { backgroundColor: op.fatturazione === 'to invoice' ? c.ambraTenue : c.superficie2 }]}>
                  <Text style={[s.pillolaTesto, { color: op.fatturazione === 'to invoice' ? c.ambra : c.testo2 }]} numberOfLines={1}>
                    {fatt}
                  </Text>
                </View>
              ) : null}
              {op.bloccato ? <Ionicons name="lock-closed" size={16} color={c.testo3} accessibilityLabel={t('vendite.bloccato')} /> : null}
              <View style={{ flex: 1 }} />
              <Text style={[s.piccolo, { color: c.testo3 }]}>{data(op.data)}</Text>
            </View>
            <Text style={[s.grande, { color: c.testo }]} numberOfLines={1} adjustsFontSizeToFit>
              {importo(op.totale, op.valuta)}
            </Text>
            <Text style={[s.sotto, { color: c.testo2 }]} numberOfLines={1}>
              {t('vendite.imponibileImposte', { imponibile: importo(op.imponibile, op.valuta), imposte: importo(op.imposte, op.valuta) })}
            </Text>
          </View>

          {/* Cliente */}
          <Sezione titolo={t('vendite.cliente')}>
            <Pressable onPress={modificabile ? () => setPersone('cliente') : undefined} disabled={!modificabile} style={s.riga} accessibilityRole={modificabile ? 'button' : 'text'}>
              {op.clienteId ? <Avatar nome={op.cliente} lato={40} url={urlAvatar(server, 'res.partner', op.clienteId)} logo={op.clienteAzienda} /> : <Avatar nome="?" lato={40} icona="person-outline" />}
              <View style={{ flex: 1 }}>
                <Text style={[s.valore, { color: c.testo }]} numberOfLines={2}>
                  {op.cliente}
                </Text>
                {op.email || op.telefono ? (
                  <Text style={[s.sotto, { color: c.testo2 }]} numberOfLines={1}>
                    {[op.telefono, op.email].filter(Boolean).join(' · ')}
                  </Text>
                ) : null}
              </View>
              {modificabile ? <Ionicons name="chevron-forward" size={18} color={c.testo3} /> : null}
            </Pressable>
            {op.telefono || op.email || op.clienteId ? (
              <View style={s.azioni}>
                {op.telefono ? <Azione icona="call" testo={t('vendite.chiama')} onPress={() => chiamaNumero(sessione, op.telefono, op.cliente)} /> : null}
                {op.email ? <Azione icona="mail" testo={t('vendite.email')} onPress={() => void Linking.openURL(`mailto:${op.email}`)} /> : null}
                {op.clienteId ? <Azione icona="person-circle" testo={t('vendite.scheda')} onPress={() => router.push({ pathname: '/contatti/[id]', params: { id: String(op.clienteId) } })} /> : null}
              </View>
            ) : null}
          </Sezione>

          {/* Righe */}
          <Sezione titolo={t('vendite.righe')}>
            {op.righe.length ? (
              op.righe.map((r, i) =>
                r.tipo === 'sezione' ? (
                  <Text key={r.id} style={[s.rigaSezione, { color: c.testo }, i > 0 && { marginTop: spazio.s }]} numberOfLines={2}>
                    {r.descrizione}
                  </Text>
                ) : r.tipo === 'nota' ? (
                  <Text key={r.id} style={[s.rigaNota, { color: c.testo2 }]}>
                    {r.descrizione}
                  </Text>
                ) : (
                  <Pressable
                    key={r.id}
                    onPress={modificabile ? () => apriRiga(r) : undefined}
                    disabled={!modificabile || !!occupato}
                    style={({ pressed }) => [s.rigaProdotto, { borderColor: c.bordo, backgroundColor: pressed ? c.superficie2 : 'transparent' }]}
                    accessibilityRole={modificabile ? 'button' : 'text'}
                  >
                    {r.prodottoId ? <Avatar url={immagineProdotto(server, r.prodottoId)} nome={r.prodotto} lato={40} logo icona="cube-outline" /> : null}
                    <View style={{ flex: 1 }}>
                      <Text style={[s.valoreRiga, { color: c.testo }]} numberOfLines={2}>
                        {r.prodotto || r.descrizione.split('\n')[0]}
                      </Text>
                      <Text style={[s.piccolo, { color: c.testo2 }]} numberOfLines={1}>
                        {`${quantita(r.quantita)}${r.unita ? ` ${r.unita}` : ''} × ${importo(r.prezzo, '')}${r.sconto ? ` · −${quantita(r.sconto)}%` : ''}`}
                      </Text>
                      {op.stato === 'sale' ? (
                        <Text style={[s.piccolo, { color: c.testo3 }]} numberOfLines={1}>
                          {t('vendite.consegnatiFatturati', { consegnati: quantita(r.consegnata), fatturati: quantita(r.fatturata) })}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={[s.valoreRiga, { color: c.testo }]} numberOfLines={1}>
                      {importo(r.subtotale, '')}
                    </Text>
                  </Pressable>
                ),
              )
            ) : (
              <Text style={[s.sotto, { color: c.testo3 }]}>{t('vendite.nessunaRiga')}</Text>
            )}
            {modificabile ? (
              <Pulsante testo={t('vendite.aggiungiProdotto')} variante="tenue" occupato={occupato === 'aggiungi'} onPress={() => setProdotti(true)} />
            ) : null}
          </Sezione>

          {/* Campi */}
          <Sezione>
            <Campo etichetta={t('vendite.venditore')} onPress={preventivo ? () => setPersone('venditore') : undefined}>
              {op.venditore ? (
                <View style={s.persona}>
                  <Avatar nome={op.venditore[1]} lato={26} url={urlAvatar(server, 'res.users', op.venditore[0])} />
                  <Text style={[s.valore, { color: c.testo, flexShrink: 1 }]} numberOfLines={1}>
                    {op.venditore[1]}
                  </Text>
                </View>
              ) : (
                <Text style={[s.valore, { color: c.testo3 }]}>{t('vendite.nessuno')}</Text>
              )}
            </Campo>
            {preventivo ? <Campo etichetta={t('vendite.scadenza')} valore={op.scadenza ? data(op.scadenza) : ''} onPress={() => setSceltaScadenza(true)} /> : null}
            <Campo
              etichetta={t('vendite.riferimento')}
              valore={op.riferimento}
              onPress={() => {
                setRiferimento(op.riferimento)
                setNote(op.note)
                setTesti(true)
              }}
            />
            {op.pagamento ? <Campo etichetta={t('vendite.pagamento')} valore={op.pagamento} /> : null}
            {op.opportunita ? (
              <Campo
                etichetta={t('vendite.opportunita')}
                valore={op.opportunita[1]}
                onPress={() => router.push({ pathname: '/crm/[id]', params: { id: String(op.opportunita?.[0]) } })}
              />
            ) : null}
          </Sezione>

          {/* Fatture */}
          {op.fatture.length ? (
            <Sezione titolo={t('vendite.fatture')}>
              {op.fatture.map((f) => (
                <Pressable key={f.id} onPress={() => apriInOdooWeb(router, 'account.move', f.id)} style={s.riga} accessibilityRole="button">
                  <Ionicons name={f.nota ? 'return-down-back' : 'receipt-outline'} size={22} color={f.pagata ? c.verde : f.bozza ? c.testo3 : c.primario} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.valoreRiga, { color: c.testo }]} numberOfLines={1}>
                      {f.nome || t('vendite.fatturaBozza')}
                    </Text>
                    <Text style={[s.piccolo, { color: f.pagata ? c.verde : c.testo2 }]} numberOfLines={1}>
                      {[f.nota ? t('vendite.notaCredito') : '', f.bozza ? (f.nome ? t('vendite.bozza') : t('vendite.daConfermare')) : f.pagata ? t('vendite.pagata') : t('vendite.daPagare')].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Text style={[s.valoreRiga, { color: c.testo }]}>{importo(f.totale, op.valuta)}</Text>
                  <Ionicons name="open-outline" size={16} color={c.testo3} />
                </Pressable>
              ))}
            </Sezione>
          ) : null}

          {op.note ? (
            <Sezione titolo={t('vendite.note')}>
              <Pressable
                onPress={() => {
                  setRiferimento(op.riferimento)
                  setNote(op.note)
                  setTesti(true)
                }}
                accessibilityRole="button"
              >
                <Text style={[s.descrizione, { color: c.testo }]} selectable>
                  {op.note}
                </Text>
              </Pressable>
            </Sezione>
          ) : null}

          {/* Azioni per lo stato del documento */}
          <View style={s.pulsanti}>
            {op.stato === 'draft' ? (
              <>
                <Pulsante testo={t('vendite.inviaEmail')} occupato={occupato === 'invia'} onPress={() => void invia()} />
                <Pulsante testo={t('vendite.conferma')} variante="tenue" occupato={occupato === 'conferma'} onPress={() => void confermaOrdine()} />
              </>
            ) : op.stato === 'sent' ? (
              <>
                <Pulsante testo={t('vendite.conferma')} occupato={occupato === 'conferma'} onPress={() => void confermaOrdine()} />
                <Pulsante testo={t('vendite.inviaDiNuovo')} variante="tenue" occupato={occupato === 'invia'} onPress={() => void invia()} />
              </>
            ) : op.stato === 'sale' ? (
              <>
                {op.fatturazione === 'to invoice' ? <Pulsante testo={t('vendite.creaFattura')} occupato={occupato === 'fattura'} onPress={() => void fattura()} /> : null}
                <Pulsante testo={t('vendite.inviaOrdine')} variante="tenue" occupato={occupato === 'invia'} onPress={() => void invia()} />
              </>
            ) : (
              <Pulsante testo={t('vendite.rimettiPreventivo')} variante="tenue" occupato={occupato === 'bozza'} onPress={() => void azione('bozza', () => rimettiInPreventivo(server, op.id))} />
            )}
            {Platform.OS === 'ios' && righeProdotto.length ? (
              <Pulsante testo={t('vendite.condividiPdf')} variante="tenue" occupato={occupato === 'pdf'} onPress={() => void condividiPdf()} />
            ) : null}
            {op.stato !== 'cancel' && !op.bloccato ? (
              <Pulsante testo={op.stato === 'sale' ? t('vendite.annullaOrdine') : t('vendite.annullaPreventivo')} variante="pericolo" occupato={occupato === 'annulla'} onPress={() => void annullaOrdine()} />
            ) : null}
          </View>

          <Sezione titolo={t('vendite.conversazione')}>
            <Registro server={server} modello={MODELLO} id={op.id} versione={versione} />
          </Sezione>

          <Pulsante testo={t('vendite.apriInOdoo')} variante="tenue" onPress={() => apriInOdooWeb(router, MODELLO, op.id)} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Fogli */}
      <CercaPersone
        aperto={persone !== null}
        server={server}
        tipo={persone === 'cliente' ? 'invitati' : 'organizzatore'}
        titolo={persone === 'cliente' ? t('vendite.cliente') : t('vendite.venditore')}
        singolo
        scelti={[]}
        chiudi={() => setPersone(null)}
        tocca={(p) => {
          if (persone === 'cliente') {
            void cambia({ clienteId: p.id }, { clienteId: p.id, cliente: p.nome, email: p.email || '', clienteAzienda: !!p.eAzienda })
          } else {
            void cambia({ venditore: p.id }, { venditore: [p.id, p.nome] })
          }
          setPersone(null)
        }}
      />

      <SceltaGiorno
        aperto={sceltaScadenza}
        titolo={t('vendite.scadenza')}
        valore={op.scadenza ? new Date(`${op.scadenza}T12:00:00`) : new Date()}
        chiudi={() => setSceltaScadenza(false)}
        scegli={(d) => {
          setSceltaScadenza(false)
          void cambia({ scadenza: giornoIso(d) }, { scadenza: giornoIso(d) })
        }}
      />

      <CercaProdotti aperto={prodotti} server={server} valuta={op.valuta} chiudi={() => setProdotti(false)} scegli={aggiungi} />

      <Foglio aperto={riga !== null} titolo={riga?.prodotto || t('vendite.riga')} chiudi={() => setRiga(null)} fatto={t('comune.chiudi')}>
        <ScrollView contentContainerStyle={s.foglio} keyboardShouldPersistTaps="handled">
          <View style={s.tre}>
            <View style={{ flex: 1 }}>
              <Text style={[s.etichettaCampo, { color: c.testo2 }]}>{t('vendite.quantita')}</Text>
              <TextInput value={qta} onChangeText={setQta} keyboardType="decimal-pad" selectTextOnFocus style={[s.input, { color: c.testo, backgroundColor: c.superficie, borderColor: c.bordo }]} />
            </View>
            <View style={{ flex: 1.3 }}>
              <Text style={[s.etichettaCampo, { color: c.testo2 }]}>{t('vendite.prezzo')}</Text>
              <TextInput value={prezzo} onChangeText={setPrezzo} keyboardType="decimal-pad" selectTextOnFocus style={[s.input, { color: c.testo, backgroundColor: c.superficie, borderColor: c.bordo }]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.etichettaCampo, { color: c.testo2 }]}>{t('vendite.sconto')}</Text>
              <TextInput value={sconto} onChangeText={setSconto} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={c.testo3} selectTextOnFocus style={[s.input, { color: c.testo, backgroundColor: c.superficie, borderColor: c.bordo }]} />
            </View>
          </View>
          <Text style={[s.etichettaCampo, { color: c.testo2 }]}>{t('vendite.descrizione')}</Text>
          <TextInput value={descrizione} onChangeText={setDescrizione} multiline style={[s.input, s.areaBassa, { color: c.testo, backgroundColor: c.superficie, borderColor: c.bordo }]} />
          <Pulsante testo={t('comune.salva')} onPress={salvaRiga} />
          <Pulsante testo={t('vendite.eliminaRiga')} variante="pericolo" onPress={() => void togliRiga()} />
        </ScrollView>
      </Foglio>

      <Foglio aperto={testi} titolo={t('vendite.modifica')} chiudi={() => setTesti(false)} fatto={t('comune.chiudi')}>
        <ScrollView contentContainerStyle={s.foglio} keyboardShouldPersistTaps="handled">
          <Text style={[s.etichettaCampo, { color: c.testo2 }]}>{t('vendite.riferimento')}</Text>
          <TextInput
            value={riferimento}
            onChangeText={setRiferimento}
            placeholder={t('vendite.riferimentoEsempio')}
            placeholderTextColor={c.testo3}
            style={[s.input, { color: c.testo, backgroundColor: c.superficie, borderColor: c.bordo }]}
          />
          <Text style={[s.etichettaCampo, { color: c.testo2 }]}>{t('vendite.note')}</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            multiline
            placeholder={t('vendite.noteEsempio')}
            placeholderTextColor={c.testo3}
            style={[s.input, s.area, { color: c.testo, backgroundColor: c.superficie, borderColor: c.bordo }]}
          />
          <Pulsante
            testo={t('comune.salva')}
            onPress={() => {
              setTesti(false)
              void cambia({ riferimento, note }, { riferimento: riferimento.trim(), note: note.trim() })
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
            {valore || t('vendite.nessuno')}
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
  pillole: { flexDirection: 'row', alignItems: 'center', gap: spazio.s },
  pillola: { paddingHorizontal: 10, height: 26, borderRadius: 13, justifyContent: 'center' },
  pillolaTesto: { fontSize: 13, fontWeight: '700' },
  grande: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5, marginTop: spazio.xs },
  sezione: { padding: spazio.m, borderRadius: raggio.l, borderWidth: StyleSheet.hairlineWidth, gap: spazio.s },
  sezioneTitolo: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  riga: { flexDirection: 'row', alignItems: 'center', gap: spazio.m, minHeight: 44 },
  valore: { fontSize: 16, fontWeight: '600' },
  valoreRiga: { fontSize: 15, fontWeight: '600' },
  sotto: { fontSize: 14 },
  piccolo: { fontSize: 13, marginTop: 1 },
  azioni: { flexDirection: 'row', gap: spazio.s, marginTop: spazio.xs },
  azione: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: spazio.s, borderRadius: raggio.m },
  azioneTesto: { fontSize: 12, fontWeight: '700' },
  rigaSezione: { fontSize: 15, fontWeight: '800' },
  rigaNota: { fontSize: 14, fontStyle: 'italic', lineHeight: 20 },
  rigaProdotto: { flexDirection: 'row', alignItems: 'center', gap: spazio.m, paddingVertical: spazio.s, borderBottomWidth: StyleSheet.hairlineWidth, marginHorizontal: -spazio.xs, paddingHorizontal: spazio.xs, borderRadius: raggio.s },
  campo: { flexDirection: 'row', alignItems: 'center', gap: spazio.s, minHeight: 44 },
  etichettaRiga: { fontSize: 15, flexShrink: 0, maxWidth: '55%' },
  campoValore: { flex: 1, alignItems: 'flex-end' },
  persona: { flexDirection: 'row', alignItems: 'center', gap: spazio.s, maxWidth: '100%' },
  descrizione: { fontSize: 15, lineHeight: 22 },
  pulsanti: { gap: spazio.s },
  foglio: { padding: spazio.l, gap: spazio.s },
  tre: { flexDirection: 'row', gap: spazio.s },
  etichettaCampo: { fontSize: 14, fontWeight: '600', marginTop: spazio.s },
  input: { fontSize: 16, padding: spazio.m, borderRadius: raggio.m, borderWidth: StyleSheet.hairlineWidth },
  area: { minHeight: 140, textAlignVertical: 'top' },
  areaBassa: { minHeight: 90, textAlignVertical: 'top' },
})
