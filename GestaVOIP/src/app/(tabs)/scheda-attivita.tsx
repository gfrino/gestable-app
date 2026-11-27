/** Attivita' come scheda in basso (spostate dal menu ≡ in Impostazioni): la stessa schermata, con il menu al posto di «indietro». */

import SchermataAttivita from '../attivita'
import { InScheda } from '../../ui/Testata'

export default function SchedaAttivita() {
  return (
    <InScheda.Provider value>
      <SchermataAttivita />
    </InScheda.Provider>
  )
}
