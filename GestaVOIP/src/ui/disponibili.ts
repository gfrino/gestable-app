/**
 * Cosa puo' usare l'utente collegato: telefono (VOIP AI), Messaggi e Attivita'
 * (serve l'utente dell'app: chi entra dalla pagina di Odoo con Google o
 * Microsoft li ha nella vista Odoo) e Spese (app Spese in Odoo e scanner nella
 * build). Lo usano la barra in basso, il menu ≡ e Impostazioni, cosi' i tre
 * mostrano sempre gli stessi posti.
 */

import { useEffect, useMemo, useState } from 'react'
import { spesePossibili } from '../../modules/gestable-nativo'
import { APP, menuOdoo, menuSalvato } from '../odoo/capacita'
import { conTelefono } from '../odoo/sessione'
import { useApp } from '../voip/Contesto'
import type { Disponibili } from './Aspetto'

export function useDisponibili(): Disponibili {
  const { sessione } = useApp()
  const server = sessione?.server || ''
  const uid = sessione?.utente.uid || 0
  const telefono = conTelefono(sessione)
  // Spese: subito dall'ultima lista salvata, poi da Odoo.
  const [spese, setSpese] = useState(() => spesePossibili && !!uid && !!menuSalvato(server, uid)?.has(APP.spese))

  useEffect(() => {
    let vivo = true
    if (spesePossibili && server && uid) {
      menuOdoo(server, false, uid)
        .then((m) => vivo && m && setSpese(m.has(APP.spese)))
        .catch(() => undefined)
    }
    return () => {
      vivo = false
    }
  }, [server, uid])

  // Senza utente dell'app (o senza scanner) niente Spese, qualunque cosa dica l'ultima lista.
  return useMemo(() => ({ telefono, utente: !!uid, spese: spesePossibili && !!uid && spese }), [telefono, uid, spese])
}
