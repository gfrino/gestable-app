/**
 * Lo stato condiviso dall'app: chi e' collegato, a quale Odoo, e il telefono.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { accedi, esci, infoServer, type InfoServer } from '../odoo/client'
import { dimenticaSessione, leggiSessione, salvaSessione, type Sessione } from '../odoo/sessione'
import { segnalaErrore, utenteCrash } from '../ui/crash'
import { telefono, type StatoTelefono } from './telefono'

type Fase = 'caricamento' | 'fuori' | 'dentro'

type ValoreApp = {
  fase: Fase
  sessione: Sessione | null
  verificaServer: (indirizzo: string) => Promise<InfoServer>
  entra: (server: string, info: InfoServer, email: string, password: string) => Promise<void>
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
    if (!sessione) {
      return
    }
    telefono.suSessioneScaduta = () => void chiudiLocale()
    utenteCrash(`${sessione.db}:${sessione.utente.uid}`)
    telefono.avvia(sessione).catch((e) => segnalaErrore(e, 'avvio telefono'))
  }, [sessione, chiudiLocale])

  const valore = useMemo<ValoreApp>(
    () => ({
      fase,
      sessione,
      verificaServer: (indirizzo) => infoServer(indirizzo),
      entra: async (server, info, email, password) => {
        const utente = await accedi(server, info.db, email.trim(), password)
        const nuova: Sessione = { server, db: info.db, azienda: info.company, utente }
        await salvaSessione(nuova)
        setSessione(nuova)
        setFase('dentro')
      },
      esci: async () => {
        const server = sessione?.server
        await telefono.ferma()
        if (server) {
          await esci(server)
        }
        await chiudiLocale()
      },
    }),
    [fase, sessione, chiudiLocale],
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
