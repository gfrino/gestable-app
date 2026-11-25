/**
 * La lingua per le schermate: si legge la scelta salvata prima di mostrare
 * l'app. Quando cambia in Impostazioni, la navigazione si ridisegna (chiave
 * React in app/_layout.tsx), cosi' ogni t() prende i testi nuovi; sessione e
 * telefono restano accesi.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { caricaLingua, salvaLingua, sceltaLingua, type Lingua, type SceltaLingua } from '.'

type ValoreLingua = { lingua: Lingua; scelta: SceltaLingua; cambia: (s: SceltaLingua) => Promise<void> }

const Contesto = createContext<ValoreLingua | null>(null)

export function ProviderLingua({ children }: { children: ReactNode }) {
  const [lingua, setLingua] = useState<Lingua | null>(null)
  const [scelta, setScelta] = useState<SceltaLingua>('auto')

  useEffect(() => {
    void caricaLingua().then((l) => {
      setLingua(l)
      setScelta(sceltaLingua())
    })
  }, [])

  const cambia = useCallback(async (s: SceltaLingua) => {
    const l = await salvaLingua(s)
    setScelta(s)
    setLingua(l)
  }, [])

  const valore = useMemo(() => (lingua ? { lingua, scelta, cambia } : null), [lingua, scelta, cambia])

  // Finche' non si sa la lingua non si mostra nulla (una frazione di secondo).
  if (!valore) {
    return null
  }
  return (
    <Contesto.Provider value={valore}>
      {children}
    </Contesto.Provider>
  )
}

export function useLingua(): ValoreLingua {
  const v = useContext(Contesto)
  if (!v) {
    throw new Error('useLingua fuori da ProviderLingua')
  }
  return v
}
