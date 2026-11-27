/**
 * Modifica di un contatto con tutti i campi del modulo di Odoo che esistono su
 * questo server: persona o azienda, nome, azienda, funzione, titolo,
 * recapiti, indirizzo, dati fiscali, vendite e acquisti (venditore, team,
 * termini di pagamento, listino, settore), lingua, etichette, note interne.
 * Le etichette dei campi sono quelle di Odoo nella lingua dell'utente. Si
 * salvano solo i campi cambiati. Chi lo usa lo rimonta a ogni apertura
 * (key), cosi' riparte sempre dai valori di Odoo.
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useState, type ReactNode } from 'react'
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native'
import { t } from '../../i18n'
import { creaVoce, nomeScelta, opzioniCampo, salvaContatto, type Completa, type Rel, type Valori } from '../../odoo/contatti'
import { Foglio } from '../Foglio'
import { Pulsante } from '../Pulsante'
import { SceltaRicerca, type Opzione } from '../SceltaRicerca'
import { raggio, spazio, useColori } from '../tema'

type Props = { aperto: boolean; server: string; k: Completa; chiudi: () => void; salvato: () => void }

type CampoUno = 'parent_id' | 'title' | 'state_id' | 'country_id' | 'user_id' | 'team_id' | 'property_payment_term_id' | 'property_supplier_payment_term_id' | 'property_product_pricelist' | 'industry_id'
type CampoScelta = 'lang' | 'type'
type CampoTesto = 'name' | 'function' | 'phone' | 'mobile' | 'email' | 'website' | 'vat' | 'company_registry' | 'street' | 'street2' | 'zip' | 'city' | 'ref' | 'barcode'

export function ModuloContatto({ aperto, server, k, chiudi, salvato }: Props) {
  const c = useColori()
  const [b, setB] = useState<Valori>(k.valori)
  const [scelta, setScelta] = useState<CampoUno | CampoScelta | 'category_id' | null>(null)
  const [occupato, setOccupato] = useState(false)

  const ha = (x: string) => x in k.campi
  const nome = (x: string) => k.campi[x]?.string || x
  const persona = !b.is_company

  function cambia<K extends keyof Valori>(x: K, v: Valori[K]) {
    setB((p) => ({ ...p, [x]: v }))
  }

  async function salva() {
    if (!b.name.trim()) {
      Alert.alert(t('schede.contattoNonSalvato'), b.is_company ? t('schede.scriviNomeAzienda') : t('schede.scriviNome'))
      return
    }
    if (b.email.trim() && !/^\S+@\S+\.\S+$/.test(b.email.trim())) {
      Alert.alert(t('schede.contattoNonSalvato'), t('schede.emailSbagliata'))
      return
    }
    const cambi: Partial<Valori> = {}
    for (const x of Object.keys(b) as (keyof Valori)[]) {
      if (JSON.stringify(b[x]) !== JSON.stringify(k.valori[x])) {
        ;(cambi as Record<string, unknown>)[x] = b[x]
      }
    }
    if (!Object.keys(cambi).length) {
      chiudi()
      return
    }
    setOccupato(true)
    try {
      await salvaContatto(server, k.id, cambi)
      setOccupato(false)
      salvato()
    } catch (e) {
      setOccupato(false)
      Alert.alert(t('schede.contattoNonSalvato'), e instanceof Error ? e.message : String(e))
    }
  }

  const testo = (x: CampoTesto, tastiera: KeyboardTypeOptions = 'default', extra: Partial<{ autoCapitalize: 'none' | 'words' | 'sentences' }> = {}) =>
    ha(x) ? (
      <View key={x} style={s.campo}>
        <Text style={[s.etichetta, { color: c.testo2 }]}>{nome(x)}</Text>
        <TextInput
          value={b[x]}
          onChangeText={(v) => cambia(x, v)}
          keyboardType={tastiera}
          autoCorrect={false}
          {...extra}
          style={[s.input, { color: c.testo, backgroundColor: c.superficie, borderColor: c.bordo }]}
        />
      </View>
    ) : null

  const uno = (x: CampoUno) =>
    ha(x) ? <Riga key={x} etichetta={nome(x)} valore={b[x]?.nome || ''} onPress={() => setScelta(x)} /> : null

  const sceltaRiga = (x: CampoScelta) =>
    ha(x) ? <Riga key={x} etichetta={nome(x)} valore={b[x] ? nomeScelta(k.campi[x], b[x]) : ''} onPress={() => setScelta(x)} /> : null

  // Ricerca per il foglio di scelta aperto.
  function cerca(q: string): Promise<Opzione[]> {
    if (!scelta) return Promise.resolve([])
    return opzioniCampo(server, scelta, q, b)
  }

  function scegli(o: Opzione | null) {
    if (!scelta) return
    if (scelta === 'category_id') {
      if (!o) return
      const gia = b.category_id.some((e) => e.id === o.id)
      cambia('category_id', gia ? b.category_id.filter((e) => e.id !== o.id) : [...b.category_id, { id: o.id, nome: o.nome }])
      return
    }
    if (scelta === 'lang' || scelta === 'type') {
      cambia(scelta, o?.valore || '')
    } else {
      cambia(scelta, o ? ({ id: o.id, nome: o.nome } as Rel) : null)
      // Cambiando paese, la provincia di prima non vale piu'.
      if (scelta === 'country_id' && b.state_id && o?.id !== b.country_id?.id) cambia('state_id', null)
    }
    setScelta(null)
  }

  const sceltiOra =
    scelta === 'category_id'
      ? b.category_id.map((e) => e.id)
      : scelta === 'lang' || scelta === 'type'
        ? []
        : scelta && b[scelta]
          ? [(b[scelta] as Rel).id]
          : []

  return (
    <Foglio aperto={aperto} titolo={t('schede.modifica')} chiudi={chiudi} fatto={t('comune.chiudi')}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.contenuto} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
          <View style={[s.segmenti, { backgroundColor: c.superficie }]}>
            {[false, true].map((az) => {
              const attivo = b.is_company === az
              return (
                <Pressable
                  key={String(az)}
                  onPress={() => cambia('is_company', az)}
                  style={[s.segmento, attivo && { backgroundColor: c.primarioTenue }]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: attivo }}
                >
                  <Ionicons name={az ? 'business' : 'person'} size={16} color={attivo ? c.primario : c.testo2} />
                  <Text style={[s.segmentoTesto, { color: attivo ? c.primario : c.testo2 }]} numberOfLines={1}>
                    {az ? t('schede.tipoAzienda') : t('schede.tipoPersona')}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          <Sezione titolo={t('schede.generale')}>
            {testo('name', 'default', { autoCapitalize: 'words' })}
            {persona ? uno('parent_id') : null}
            {persona ? testo('function') : null}
            {persona ? uno('title') : null}
            {b.parent_id ? sceltaRiga('type') : null}
          </Sezione>

          <Sezione titolo={t('schede.recapiti')}>
            {testo('phone', 'phone-pad')}
            {testo('mobile', 'phone-pad')}
            {testo('email', 'email-address', { autoCapitalize: 'none' })}
            {testo('website', 'url', { autoCapitalize: 'none' })}
          </Sezione>

          <Sezione titolo={t('schede.indirizzo')}>
            {testo('street')}
            {testo('street2')}
            <View style={s.due}>
              <View style={{ flex: 1 }}>{testo('zip')}</View>
              <View style={{ flex: 2 }}>{testo('city')}</View>
            </View>
            {uno('country_id')}
            {uno('state_id')}
          </Sezione>

          <Sezione titolo={t('schede.fiscale')}>
            {testo('vat', 'default', { autoCapitalize: 'none' })}
            {testo('company_registry')}
            {testo('ref')}
            {testo('barcode')}
          </Sezione>

          {['user_id', 'team_id', 'property_payment_term_id', 'property_product_pricelist', 'property_supplier_payment_term_id', 'industry_id'].some(ha) ? (
            <Sezione titolo={t('schede.venditeAcquisti')}>
              {uno('user_id')}
              {uno('team_id')}
              {uno('property_payment_term_id')}
              {uno('property_product_pricelist')}
              {uno('property_supplier_payment_term_id')}
              {uno('industry_id')}
            </Sezione>
          ) : null}

          <Sezione titolo={t('schede.preferenze')}>
            {sceltaRiga('lang')}
            {ha('category_id') ? (
              <Riga etichetta={nome('category_id')} valore={b.category_id.map((e) => e.nome).join(', ')} onPress={() => setScelta('category_id')} />
            ) : null}
          </Sezione>

          {ha('comment') ? (
            <Sezione titolo={nome('comment')}>
              <TextInput
                value={b.comment}
                onChangeText={(v) => cambia('comment', v)}
                multiline
                placeholder={t('schede.noteEsempio')}
                placeholderTextColor={c.testo3}
                style={[s.input, s.area, { color: c.testo, backgroundColor: c.superficie, borderColor: c.bordo }]}
              />
            </Sezione>
          ) : null}

          <Pulsante testo={t('comune.salva')} occupato={occupato} onPress={() => void salva()} />
        </ScrollView>
      </KeyboardAvoidingView>

      <SceltaRicerca
        aperto={scelta !== null}
        titolo={scelta ? nome(scelta) : ''}
        cerca={cerca}
        scelti={sceltiOra}
        multipla={scelta === 'category_id'}
        vuota={scelta === 'category_id' || scelta === 'type' ? undefined : t('schede.nessuno')}
        chiudi={() => setScelta(null)}
        scegli={scegli}
        crea={scelta === 'category_id' ? (n) => creaVoce(server, 'category_id', n) : undefined}
      />
    </Foglio>
  )
}

function Sezione({ titolo, children }: { titolo: string; children: ReactNode }) {
  const c = useColori()
  // Una sezione senza campi su questo server non si mostra.
  const pieni = (Array.isArray(children) ? children : [children]).flat().filter(Boolean)
  if (!pieni.length) {
    return null
  }
  return (
    <View style={s.sezione}>
      <Text style={[s.sezioneTitolo, { color: c.testo2 }]}>{titolo}</Text>
      {children}
    </View>
  )
}

function Riga({ etichetta, valore, onPress }: { etichetta: string; valore: string; onPress: () => void }) {
  const c = useColori()
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.riga, { backgroundColor: pressed ? c.superficie2 : c.superficie, borderColor: c.bordo }]} accessibilityRole="button">
      <Text style={[s.rigaEtichetta, { color: c.testo2 }]} numberOfLines={2}>
        {etichetta}
      </Text>
      <Text style={[s.rigaValore, { color: valore ? c.testo : c.testo3 }]} numberOfLines={2}>
        {valore || t('schede.nessuno')}
      </Text>
      <Ionicons name="chevron-forward" size={16} color={c.testo3} />
    </Pressable>
  )
}

const s = StyleSheet.create({
  contenuto: { padding: spazio.l, gap: spazio.m, paddingBottom: spazio.xxl * 2 },
  segmenti: { flexDirection: 'row', padding: 4, borderRadius: raggio.m },
  segmento: { flex: 1, flexDirection: 'row', gap: 6, paddingVertical: 9, borderRadius: raggio.s, alignItems: 'center', justifyContent: 'center' },
  segmentoTesto: { fontSize: 15, fontWeight: '700' },
  sezione: { gap: spazio.s },
  sezioneTitolo: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spazio.s },
  campo: { gap: 4 },
  etichetta: { fontSize: 13, fontWeight: '600' },
  input: { fontSize: 16, paddingHorizontal: spazio.m, paddingVertical: 11, borderRadius: raggio.m, borderWidth: StyleSheet.hairlineWidth },
  area: { minHeight: 120, textAlignVertical: 'top' },
  due: { flexDirection: 'row', gap: spazio.s },
  riga: { flexDirection: 'row', alignItems: 'center', gap: spazio.s, minHeight: 48, paddingVertical: 8, paddingHorizontal: spazio.m, borderRadius: raggio.m, borderWidth: StyleSheet.hairlineWidth },
  rigaEtichetta: { flex: 1, fontSize: 15 },
  rigaValore: { maxWidth: '55%', fontSize: 15, fontWeight: '600', textAlign: 'right' },
})
