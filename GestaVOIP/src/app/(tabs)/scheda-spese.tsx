/**
 * Spese come scheda in basso (spostate dal menu ≡ in Impostazioni): la stessa
 * schermata, con il menu al posto di «indietro». Dalla scheda si apre l'elenco;
 * lo scanner parte con il pulsante (dal menu invece si apre subito).
 */

import SchermataSpese from '../spese/index'
import { InScheda } from '../../ui/Testata'

export default function SchedaSpese() {
  return (
    <InScheda.Provider value>
      <SchermataSpese />
    </InScheda.Provider>
  )
}
