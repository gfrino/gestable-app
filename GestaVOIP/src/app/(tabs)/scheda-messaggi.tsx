/** Messaggi come scheda in basso (spostati dal menu ≡ in Impostazioni): la stessa schermata, con il menu al posto di «indietro». */

import Messaggi from '../messaggi/index'
import { InScheda } from '../../ui/Testata'

export default function SchedaMessaggi() {
  return (
    <InScheda.Provider value>
      <Messaggi />
    </InScheda.Provider>
  )
}
