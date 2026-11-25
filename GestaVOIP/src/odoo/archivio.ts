/**
 * L'ultima copia degli elenchi (registro chiamate, contatti, calendario,
 * messaggi, attivita'), salvata sul telefono: all'apertura l'app li mostra
 * subito e intanto chiede a Odoo quelli aggiornati. Senza rete restano
 * visibili gli ultimi.
 *
 * Una copia per server e utente, nella cartella cache dell'app (iOS la puo'
 * svuotare quando manca spazio: si ricarica da Odoo). All'uscita si cancella.
 *
 * expo-file-system arriva con il pacchetto expo ed e' gia' nella build 1.0.0;
 * si importa dal suo percorso dentro expo perche' aggiungerlo alle dipendenze
 * cambierebbe l'impronta nativa e gli aggiornamenti over-the-air non
 * arriverebbero piu' alla 1.0.0. Quando si fa una build nuova va messo nelle
 * dipendenze e importato come 'expo-file-system'.
 */

type ModuloFile = typeof import('expo/node_modules/expo-file-system')

const VERSIONE = 1
const DURATA_MS = 30 * 24 * 3600 * 1000
// Le date salvate da JSON.stringify tornano Date (gli eventi del calendario).
const DATA_ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/

let modulo: ModuloFile | null | undefined

function fs(): ModuloFile | null {
  if (modulo === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      modulo = require('expo/node_modules/expo-file-system') as ModuloFile
    } catch {
      modulo = null
    }
  }
  return modulo
}

function cartella() {
  const m = fs()
  if (!m) {
    return null
  }
  const d = new m.Directory(m.Paths.cache, 'gestavoip-dati')
  if (!d.exists) {
    d.create({ intermediates: true, idempotent: true })
  }
  return d
}

function file(server: string, uid: number, nome: string) {
  const m = fs()
  const d = cartella()
  if (!m || !d || !server) {
    return null
  }
  return new m.File(d, `${encodeURIComponent(server)}_${uid}_${nome}.json`)
}

/** L'ultima copia salvata, o null (mai salvata, troppo vecchia, illeggibile). */
export function leggi<T>(server: string | undefined, uid: number | undefined, nome: string): T | null {
  try {
    const f = file(server || '', uid || 0, nome)
    if (!f || !f.exists) {
      return null
    }
    const d = JSON.parse(f.textSync(), (_k, v: unknown) => (typeof v === 'string' && DATA_ISO.test(v) ? new Date(v) : v)) as {
      v: number
      at: number
      dati: T
    }
    return d.v === VERSIONE && Date.now() - d.at < DURATA_MS ? d.dati : null
  } catch {
    return null
  }
}

/** Salva la copia; un errore di disco non deve mai fermare la schermata. */
export function scrivi(server: string | undefined, uid: number | undefined, nome: string, dati: unknown): void {
  setTimeout(() => {
    try {
      const f = file(server || '', uid || 0, nome)
      f?.write(JSON.stringify({ v: VERSIONE, at: Date.now(), dati }))
    } catch {
      // Spazio pieno o cartella non scrivibile: la prossima volta si ricarica da Odoo.
    }
  }, 0)
}

/** All'uscita: i dati di Odoo non restano sul telefono. */
export function svuota(): void {
  try {
    const m = fs()
    if (!m) {
      return
    }
    const d = new m.Directory(m.Paths.cache, 'gestavoip-dati')
    if (d.exists) {
      d.delete()
    }
  } catch {
    // Niente da fare: la cartella e' gia' vuota o il sistema la svuotera'.
  }
}
