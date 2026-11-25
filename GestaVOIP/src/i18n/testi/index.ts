/**
 * Tutti i testi dell'app, per lingua. Ogni area ha il suo file con
 * `export const it = {...}` e `export const en: Record<keyof typeof it, string> = {...}`:
 * cosi' l'inglese non puo' dimenticare una chiave.
 */

import * as accesso from './accesso'
import * as calendario from './calendario'
import * as comune from './comune'
import * as lavoro from './lavoro'
import * as schede from './schede'
import * as telefono from './telefono'

type Dizionario = Record<string, string>

const GRUPPI: { it: Dizionario; en: Dizionario }[] = [comune, accesso, schede, calendario, telefono, lavoro]

function unisci(lingua: 'it' | 'en'): Dizionario {
  return Object.assign({}, ...GRUPPI.map((g) => g[lingua]))
}

export const TESTI: Record<'it' | 'en', Dizionario> = {
  it: unisci('it'),
  en: unisci('en'),
}
