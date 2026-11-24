/**
 * Lo stato condiviso dall'app: chi e' collegato, a quale Odoo, e il telefono.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { accedi, confermaCodice, esci, infoServer, type InfoServer, type Utente } from '../odoo/client'
import { conTelefono, dimenticaSessione, leggiSessione, salvaSessione, type Sessione } from '../odoo/sessione'
import { segnalaErrore, utenteCrash } from '../ui/crash'
import { telefono, type StatoTelefono } from './telefono'

type Fase = 'caricamento' | 'fuori' | 'dentro'

type ValoreApp = {
  fase: Fase
  sessione: Sessione | null
  verificaServer: (indirizzo: string) => Promise<InfoServer>
  /** Con la verifica in due passaggi attiva lancia ErroreOdoo di tipo 'codice'. */
  entra: (server: string, info: InfoServer, email: string, password: string) => Promise<void>
  /** Secondo passo dell'accesso: il codice della verifica in due passaggi. */
  entraConCodice: (server: string, info: InfoServer, codice: string) => Promise<void>
  /** Odoo senza VOIP AI: si salva solo l'indirizzo, l'accesso lo fa Odoo. */
  entraSoloOdoo: (server: string) => Promise<void>
  esci: () => Promise<void>
}

const ContestoApp = createContext<ValoreApp | null>(null)

export function ProviderApp({ children }: { children: ReactNode }) {
  const [fase, setFase] = useState<Fase>('caricamento')
  const [sessione, setSessione] = useState<Sessione | null>(null)

  const chiudiLocale = useCallback(async () => {
    await dimenticaSessione()
    setSessione(null)
    setFase('fuori')
  }, [])

  useEffect(() => {
    let vivo = true
    leggiSessione().then((s) => {
      if (!vivo) {
        return
      }
      setSessione(s)
      setFase(s ? 'dentro' : 'fuori')
    })
    return () => {
      vivo = false
    }
  }, [])

  // Il telefono si accende con la sessione e si spegne con lei.
  useEffect(() => {
    if (!sessione || !conTelefono(sessione)) {
      return
    }
    telefono.suSessioneScaduta = () => void chiudiLocale()
    utenteCrash(`${sessione.db}:${sessione.utente.uid}`)
    telefono.avvia(sessione).catch((e) => segnalaErrore(e, 'avvio telefono'))
  }, [sessione, chiudiLocale])

  const apri = useCallback(async (server: string, info: InfoServer, utente: Utente) => {
    const nuova: Sessione = { server, db: info.db, azienda: info.company, utente, voip: true }
    await salvaSessione(nuova)
    setSessione(nuova)
    setFase('dentro')
  }, [])

  const valore = useMemo<ValoreApp>(
    () => ({
      fase,
      sessione,
      verificaServer: (indirizzo) => infoServer(indirizzo),
      entra: async (server, info, email, password) => {
        await apri(server, info, await accedi(server, info.db, email.trim(), password))
      },
      entraConCodice: async (server, info, codice) => {
        await apri(server, info, await confermaCodice(server, codice))
      },
      entraSoloOdoo: async (server) => {
        const nuova: Sessione = {
          server,
          db: '',
          azienda: '',
          utente: { uid: 0, name: '', login: '', company: '' },
          voip: false,
        }
        await salvaSessione(nuova)
        setSessione(nuova)
        setFase('dentro')
      },
      esci: async () => {
        const server = sessione?.server
        if (conTelefono(sessione)) {
          await telefono.ferma()
        }
        if (server) {
          await esci(server)
        }
        await chiudiLocale()
      },
    }),
    [fase, sessione, chiudiLocale, apri],
  )

  return <ContestoApp.Provider value={valore}>{children}</ContestoApp.Provider>
}

export function useApp(): ValoreApp {
  const v = useContext(ContestoApp)
  if (!v) {
    throw new Error('useApp fuori da ProviderApp')
  }
  return v
}

export function useTelefono(): StatoTelefono {
  return useSyncExternalStore(
    (fn) => telefono.osserva(fn),
    () => telefono.leggi(),
  )
}
