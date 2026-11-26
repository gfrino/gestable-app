/**
 * Preferenze di aspetto scelte in Impostazioni, salvate sul telefono:
 * - modo: come il telefono, sempre chiaro o sempre scuro (vale anche per la
 *   vista Odoo, che segue lo schema dell'app);
 * - colore del tema (pulsanti, scheda attiva, selezioni);
 * - ordine delle schede in basso: la prima e' quella che si apre all'avvio.
 *
 * Si leggono prima di mostrare l'app, come la lingua, cosi' non c'e' un lampo
 * di colori sbagliati.
 */

import * as SecureStore from 'expo-secure-store'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Appearance } from 'react-native'
import { t } from '../i18n'

export type Modo = 'auto' | 'chiaro' | 'scuro'
export type ColoreTema = 'viola' | 'blu' | 'acqua' | 'arancio' | 'rosa'
/** I nomi delle schermate in app/(tabs). */
/**
 * Le schede della barra in basso. «gestable» raccoglie le app native di Odoo
 * (Helpdesk, ...): Odoo completo si apre dal suo menu ≡ e resta una scheda
 * nascosta (app/(tabs)/odoo.tsx), cosi' «Apri in Odoo» funziona da ovunque.
 */
export type Scheda = 'index' | 'recenti' | 'contatti' | 'calendario' | 'gestable'

export const SCHEDE: Scheda[] = ['index', 'recenti', 'contatti', 'calendario', 'gestable']
/** Tastierino e Recenti esistono solo con il telefono (VOIP AI). */
export const SCHEDE_TELEFONO: Scheda[] = ['index', 'recenti']

/** personalizzato: l'ordine e' stato cambiato almeno una volta (prima di allora, senza telefono si parte da Odoo). */
export type Aspetto = { modo: Modo; colore: ColoreTema; schede: Scheda[]; personalizzato: boolean }

/** Colore principale e la sua tinta tenue, per tema chiaro e scuro. */
export const COLORI_TEMA: Record<ColoreTema, { chiaro: [string, string]; scuro: [string, string] }> = {
  viola: { chiaro: ['#7E3FC0', '#F3EAFB'], scuro: ['#C98AF2', '#33204A'] },
  blu: { chiaro: ['#2563EB', '#E6EEFD'], scuro: ['#7AA8FF', '#18284A'] },
  acqua: { chiaro: ['#0E7C86', '#E0F4F5'], scuro: ['#4FD1DB', '#123438'] },
  arancio: { chiaro: ['#C2570C', '#FDEEE2'], scuro: ['#FFA45C', '#3E2412'] },
  rosa: { chiaro: ['#C2185B', '#FCE6EF'], scuro: ['#FF7FB0', '#42162A'] },
}

const PREDEFINITO: Aspetto = { modo: 'auto', colore: 'viola', schede: SCHEDE, personalizzato: false }
const CHIAVE = 'gestavoip.aspetto'

/** Accetta solo valori validi; schede doppie o sconosciute si scartano, quelle mancanti si aggiungono in fondo. */
function pulisci(v: unknown): Aspetto {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<Record<keyof Aspetto, unknown>>
  const modo = o.modo === 'chiaro' || o.modo === 'scuro' ? o.modo : 'auto'
  const colore = typeof o.colore === 'string' && o.colore in COLORI_TEMA ? (o.colore as ColoreTema) : 'viola'
  // Fino alla 1.2 la scheda si chiamava «odoo»: il posto scelto passa a GestABLE.
  const lette = Array.isArray(o.schede)
    ? o.schede.map((x) => (x === 'odoo' ? 'gestable' : x)).filter((x): x is Scheda => SCHEDE.includes(x as Scheda))
    : []
  const schede = [...new Set(lette)]
  for (const x of SCHEDE) {
    if (!schede.includes(x)) {
      schede.push(x)
    }
  }
  return { modo, colore, schede, personalizzato: o.personalizzato === true }
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

/** Icona (Ionicons) di ogni scheda, la stessa nella barra e in Impostazioni. */
export const ICONE_SCHEDE: Record<Scheda, 'keypad' | 'time' | 'people' | 'calendar' | 'apps'> = {
  index: 'keypad',
  recenti: 'time',
  contatti: 'people',
  calendario: 'calendar',
  gestable: 'apps',
}

export function titoloScheda(s: Scheda): string {
  if (s === 'gestable') {
    return 'GestABLE'
  }
  return t(s === 'index' ? 'schede.tastierino' : `schede.${s}`)
}

/**
 * La scheda che si apre all'avvio: la prima nell'ordine scelto. Finche' l'ordine
 * non e' stato cambiato, chi non ha il telefono parte da Odoo, come prima.
 */
export function schedaAvvio(a: Aspetto, telefono: boolean): Scheda {
  if (!telefono && !a.personalizzato) {
    return 'gestable'
  }
  return schedeVisibili(a.schede, telefono)[0] || 'gestable'
}

/** Le schede nell'ordine scelto, solo quelle che questo utente vede. */
export function schedeVisibili(ordine: Scheda[], telefono: boolean): Scheda[] {
  return ordine.filter((x) => telefono || !SCHEDE_TELEFONO.includes(x))
}
