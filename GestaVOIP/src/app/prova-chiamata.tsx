/**
 * Solo nelle build di sviluppo: simula una chiamata per vedere la schermata
 * senza telefonare a nessuno (gestavoip://prova-chiamata?fase=squillo&numero=...).
 * Nelle build per TestFlight e App Store rimanda alla home.
 */

import { Redirect, router, useLocalSearchParams } from 'expo-router'
import { useEffect } from 'react'
import { telefono, type Chiamata, type Fase } from '../voip/telefono'

export default function ProvaChiamata() {
  const { fase = 'squillo', numero = '+41765714982', nome = '', direzione = 'uscita' } = useLocalSearchParams<{
    fase?: string
    numero?: string
    nome?: string
    direzione?: string
  }>()

  useEffect(() => {
    if (!__DEV__) {
      return
    }
    const chiamata: Chiamata | null =
      fase === 'fine'
        ? null
        : {
            direzione: direzione === 'entrata' ? 'entrata' : 'uscita',
            numero,
            nome,
            logId: null,
            fase: fase as Fase,
            inizio: fase === 'connessa' ? Date.now() - 83_000 : null,
            muto: false,
            attesa: false,
          }
    // Stato finto: nessuna chiamata parte davvero. Dopo il ritorno alla home,
    // altrimenti il Redirect chiude la schermata della chiamata appena aperta.
    // Il timer non si annulla: questa pagina si chiude subito per il Redirect.
    setTimeout(() => {
      ;(telefono as unknown as { aggiorna: (p: { chiamata: Chiamata | null }) => void }).aggiorna({ chiamata })
      if (chiamata) {
        router.push('/chiamata')
      }
    }, 500)
  }, [fase, numero, nome, direzione])

  return <Redirect href="/" />
}
