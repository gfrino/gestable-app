/**
 * Lo stato condiviso dall'app: chi e' collegato, a quale Odoo, e il telefono.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Alert } from 'react-native'
import { t } from '../i18n'
import { messaggioNonAutorizzato, messaggioNonVerificabile, verificaServer as autorizzato } from '../odoo/autorizzati'
import { accedi, accediDallaPagina, confermaCodice, dimenticaContesto, ErroreOdoo, esci, infoServer, infoSessione, sessioneAutomatica, type InfoServer, type Utente } from '../odoo/client'
import { dimenticaMenu } from '../odoo/capacita'
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
    dimenticaMenu()
    dimenticaContesto()
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
      // Un server tolto dalla lista di ticinoWEB esce anche da chi era gia'
      // dentro. Se la lista non si puo' verificare (niente rete) non si caccia
      // nessuno: si riprova al prossimo avvio.
      if (s) {
        autorizzato(s.server).then((esito) => {
          if (vivo && esito === 'non-autorizzato') {
            void chiudiLocale()
            Alert.alert(t('accesso.serverNonAbilitato'), messaggioNonAutorizzato())
          }
        })
      }
    })
    return () => {
      vivo = false
    }
  }, [chiudiLocale])

  // Il telefono si accende con la sessione e si spegne con lei.
  useEffect(() => {
    if (!sessione || !conTelefono(sessione)) {
      return
    }
    telefono.suSessioneScaduta = () => void chiudiLocale()
    utenteCrash(`${sessione.db}:${sessione.utente.uid}`)
    telefono.avvia(sessione).catch((e) => segnalaErrore(e, 'avvio telefono'))
  }, [sessione, chiudiLocale])

  const apri = useCallback(async (server: string, info: InfoServer, utente: Utente & { db?: string }) => {
    // Senza VOIP AI database e azienda li dice la sessione appena aperta.
    const nuova: Sessione = {
      server,
      db: info.db || utente.db || '',
      azienda: info.company || utente.company || '',
      utente: { uid: utente.uid, name: utente.name, login: utente.login, company: utente.company },
      voip: info.voip,
    }
    await salvaSessione(nuova)
    setSessione(nuova)
    setFase('dentro')
  }, [])

  const valore = useMemo<ValoreApp>(
    () => ({
      fase,
      sessione,
      verificaServer: async (indirizzo) => {
        // Prima la lista dei server autorizzati, poi il server stesso: chi non
        // e' abilitato lo sa subito, senza digitare la password.
        const esito = await autorizzato(indirizzo)
        if (esito === 'non-autorizzato') {
          throw new ErroreOdoo('server', messaggioNonAutorizzato())
        }
        if (esito === 'non-verificabile') {
          throw new ErroreOdoo('rete', messaggioNonVerificabile())
        }
        const info = await infoServer(indirizzo)
        // Odoo demo (accesso senza password): si entra subito, come nel browser.
        if (!info.voip) {
          const demo = await sessioneAutomatica(indirizzo)
          if (demo) {
            await apri(indirizzo, info, demo)
          }
        }
        return info
      },
      entra: async (server, info, email, password) => {
        // Con VOIP AI si conosce il database e si entra via JSON; senza, dalla
        // pagina di login di Odoo, che il database lo sceglie da sola.
        const utente = info.voip
          ? await accedi(server, info.db, email.trim(), password)
          : await accediDallaPagina(server, email.trim(), password)
        await apri(server, info, utente)
      },
      entraConCodice: async (server, info, codice) => {
        const utente = await confermaCodice(server, codice)
        await apri(server, info, info.voip ? utente : (await infoSessione(server)) || utente)
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
