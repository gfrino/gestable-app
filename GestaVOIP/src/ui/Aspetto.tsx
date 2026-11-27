/**
 * Preferenze di aspetto scelte in Impostazioni, salvate sul telefono:
 * - modo: come il telefono, sempre chiaro o sempre scuro (vale anche per la
 *   vista Odoo, che segue lo schema dell'app);
 * - colore del tema (pulsanti, scheda attiva, selezioni);
 * - cosa sta nella barra in basso e cosa nel menu ≡, e in che ordine: la prima
 *   scheda in basso e' quella che si apre all'avvio.
 *
 * Si leggono prima di mostrare l'app, come la lingua, cosi' non c'e' un lampo
 * di colori sbagliati.
 */

import type Ionicons from '@expo/vector-icons/Ionicons'
import * as SecureStore from 'expo-secure-store'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Appearance } from 'react-native'
import { t } from '../i18n'

export type Modo = 'auto' | 'chiaro' | 'scuro'
export type ColoreTema = 'viola' | 'blu' | 'acqua' | 'arancio' | 'rosa'
/**
 * I posti che l'utente puo' mettere nella barra in basso o nel menu ≡.
 * «gestable» raccoglie le app native di Odoo (Helpdesk, ...): Odoo completo si
 * apre dal suo menu ≡ e resta una scheda nascosta (app/(tabs)/odoo.tsx), cosi'
 * «Apri in Odoo» funziona da ovunque. Messaggi, Attivita' e Spese nascono nel
 * menu; in basso usano le schermate app/(tabs)/scheda-*.tsx.
 */
export type Scheda = 'index' | 'recenti' | 'contatti' | 'calendario' | 'gestable' | 'messaggi' | 'attivita' | 'spese'

/** Come si parte: questi in basso, gli altri nel menu. */
export const SCHEDE: Scheda[] = ['index', 'recenti', 'contatti', 'calendario', 'gestable']
export const MENU: Scheda[] = ['messaggi', 'attivita', 'spese']
const TUTTE: Scheda[] = [...SCHEDE, ...MENU]
/** Tastierino e Recenti esistono solo con il telefono (VOIP AI). */
export const SCHEDE_TELEFONO: Scheda[] = ['index', 'recenti']
/** In basso ci stanno al massimo tante schede (su un iPhone stretto di piu' non si leggono). */
export const MAX_IN_BASSO = 5

/** Il nome della schermata in app/(tabs) di ogni posto (Messaggi & co. hanno gia' la loro rotta fuori dalle schede). */
export const ROTTA: Record<Scheda, string> = {
  index: 'index',
  recenti: 'recenti',
  contatti: 'contatti',
  calendario: 'calendario',
  gestable: 'gestable',
  messaggi: 'scheda-messaggi',
  attivita: 'scheda-attivita',
  spese: 'scheda-spese',
}

/**
 * schede: in basso, nell'ordine; menu: nel menu ≡, nell'ordine. Ogni posto sta in uno solo dei due.
 * personalizzato: l'ordine e' stato cambiato almeno una volta (prima di allora, senza telefono si parte da Odoo).
 */
export type Aspetto = { modo: Modo; colore: ColoreTema; schede: Scheda[]; menu: Scheda[]; personalizzato: boolean }

/** Colore principale e la sua tinta tenue, per tema chiaro e scuro. */
export const COLORI_TEMA: Record<ColoreTema, { chiaro: [string, string]; scuro: [string, string] }> = {
  viola: { chiaro: ['#7E3FC0', '#F3EAFB'], scuro: ['#C98AF2', '#33204A'] },
  blu: { chiaro: ['#2563EB', '#E6EEFD'], scuro: ['#7AA8FF', '#18284A'] },
  acqua: { chiaro: ['#0E7C86', '#E0F4F5'], scuro: ['#4FD1DB', '#123438'] },
  arancio: { chiaro: ['#C2570C', '#FDEEE2'], scuro: ['#FFA45C', '#3E2412'] },
  rosa: { chiaro: ['#C2185B', '#FCE6EF'], scuro: ['#FF7FB0', '#42162A'] },
}

const PREDEFINITO: Aspetto = { modo: 'auto', colore: 'viola', schede: SCHEDE, menu: MENU, personalizzato: false }
const CHIAVE = 'gestavoip.aspetto'

/**
 * Accetta solo valori validi; posti doppi o sconosciuti si scartano (uno in basso e nel menu resta in basso),
 * quelli mancanti tornano al loro posto di partenza, in fondo. Le preferenze salvate fino alla 1.3 non hanno
 * «menu»: Messaggi, Attivita' e Spese restano nel menu.
 */
function pulisci(v: unknown): Aspetto {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<Record<keyof Aspetto, unknown>>
  const modo = o.modo === 'chiaro' || o.modo === 'scuro' ? o.modo : 'auto'
  const colore = typeof o.colore === 'string' && o.colore in COLORI_TEMA ? (o.colore as ColoreTema) : 'viola'
  // Fino alla 1.2 la scheda si chiamava «odoo»: il posto scelto passa a GestABLE.
  const valide = (v: unknown): Scheda[] =>
    Array.isArray(v) ? v.map((x) => (x === 'odoo' ? 'gestable' : x)).filter((x): x is Scheda => TUTTE.includes(x as Scheda)) : []
  const schede = [...new Set(valide(o.schede))]
  const menu = [...new Set(valide(o.menu))].filter((x) => !schede.includes(x))
  for (const x of TUTTE) {
    if (!schede.includes(x) && !menu.includes(x)) {
      ;(MENU.includes(x) ? menu : schede).push(x)
    }
  }
  return { modo, colore, schede, menu, personalizzato: o.personalizzato === true }
}

function applicaModo(modo: Modo) {
  try {
    Appearance.setColorScheme(modo === 'chiaro' ? 'light' : modo === 'scuro' ? 'dark' : 'unspecified')
  } catch {
    // vale lo schema del telefono
  }
}

type ValoreAspetto = { aspetto: Aspetto; cambia: (parziale: Partial<Aspetto>) => void }

const Contesto = createContext<ValoreAspetto | null>(null)

export function ProviderAspetto({ children }: { children: ReactNode }) {
  const [aspetto, setAspetto] = useState<Aspetto | null>(null)

  useEffect(() => {
    void SecureStore.getItemAsync(CHIAVE)
      .then((testo) => pulisci(testo ? JSON.parse(testo) : null))
      .catch(() => PREDEFINITO)
      .then((a) => {
        applicaModo(a.modo)
        setAspetto(a)
      })
  }, [])

  const cambia = useCallback(
    (parziale: Partial<Aspetto>) => {
      const nuovo = pulisci({ ...(aspetto || PREDEFINITO), ...parziale })
      if (parziale.modo) {
        applicaModo(nuovo.modo)
      }
      setAspetto(nuovo)
      SecureStore.setItemAsync(CHIAVE, JSON.stringify(nuovo)).catch(() => {
        // resta per questa sessione
      })
    },
    [aspetto],
  )

  const valore = useMemo(() => (aspetto ? { aspetto, cambia } : null), [aspetto, cambia])

  // Finche' non si sanno le preferenze non si mostra nulla (una frazione di secondo).
  if (!valore) {
    return null
  }
  return <Contesto.Provider value={valore}>{children}</Contesto.Provider>
}

const SENZA_PROVIDER: ValoreAspetto = { aspetto: PREDEFINITO, cambia: () => {} }

export function useAspetto(): ValoreAspetto {
  return useContext(Contesto) || SENZA_PROVIDER
}

/** Icona (Ionicons) di ogni posto, la stessa nella barra, nel menu e in Impostazioni. */
export const ICONE_SCHEDE: Record<Scheda, keyof typeof Ionicons.glyphMap> = {
  index: 'keypad',
  recenti: 'time',
  contatti: 'people',
  calendario: 'calendar',
  gestable: 'apps',
  messaggi: 'chatbubbles',
  attivita: 'checkmark-done-circle',
  spese: 'receipt',
}

export function titoloScheda(s: Scheda): string {
  switch (s) {
    case 'gestable':
      return 'GestABLE'
    case 'index':
      return t('schede.tastierino')
    case 'messaggi':
      return t('accesso.messaggi')
    case 'attivita':
      return t('accesso.attivita')
    case 'spese':
      return t('spese.titolo')
    default:
      return t(`schede.${s}`)
  }
}

/** Cosa puo' usare questo utente su questo server (vedi ui/disponibili.ts). */
export type Disponibili = { telefono: boolean; utente: boolean; spese: boolean }

/** Il posto esiste per questo utente? Tastierino e Recenti col telefono, Messaggi e Attivita' con l'utente dell'app, Spese con l'app Spese. */
export function disponibile(x: Scheda, d: Disponibili): boolean {
  if (SCHEDE_TELEFONO.includes(x)) {
    return d.telefono
  }
  if (x === 'messaggi' || x === 'attivita') {
    return d.utente
  }
  if (x === 'spese') {
    return d.spese
  }
  return true
}

/**
 * La scheda che si apre all'avvio: la prima nell'ordine scelto. Finche' l'ordine
 * non e' stato cambiato, chi non ha il telefono parte da Odoo, come prima.
 */
export function schedaAvvio(a: Aspetto, d: Disponibili): Scheda {
  if (!d.telefono && !a.personalizzato) {
    return 'gestable'
  }
  return schedeVisibili(a.schede, d)[0] || 'gestable'
}

/** I posti di una lista (barra o menu) nell'ordine scelto, solo quelli che questo utente vede. */
export function schedeVisibili(ordine: Scheda[], d: Disponibili): Scheda[] {
  return ordine.filter((x) => disponibile(x, d))
}

/**
 * Rimette in una lista completa i posti visibili nel nuovo ordine: quelli che l'utente non vede (Tastierino senza
 * telefono, Spese senza l'app) restano al loro posto, i visibili riempiono gli altri posti e i nuovi vanno in fondo.
 */
export function rimonta(vecchia: Scheda[], nuoveVisibili: Scheda[], d: Disponibili): Scheda[] {
  const risultato: Scheda[] = []
  let k = 0
  for (const x of vecchia) {
    if (!disponibile(x, d)) {
      risultato.push(x)
    } else if (k < nuoveVisibili.length) {
      risultato.push(nuoveVisibili[k++])
    }
  }
  return [...risultato, ...nuoveVisibili.slice(k)]
}
