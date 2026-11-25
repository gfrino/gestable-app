import CarPlay
import UIKit

/// Una voce sullo schermo dell'auto: un tocco avvia la chiamata.
struct VoceAuto {
  var titolo: String
  var sottotitolo: String
  var numero: String
  var entrata: Bool
}

struct DatiAuto {
  var accesso: Bool
  var recenti: [VoceAuto]
  var frequenti: [VoceAuto]
  var testi: [String: String]

  static let vuoti = DatiAuto(accesso: false, recenti: [], frequenti: [], testi: [:])

  func testo(_ chiave: String, _ predefinito: String) -> String {
    return testi[chiave] ?? predefinito
  }
}

/// CarPlay (app di comunicazione): due schede, Recenti e Frequenti, con le chiamate del
/// registro di Odoo. Il nativo disegna solo i template; dati e chiamate vengono da JS,
/// che avvia la chiamata VoIP con CallKit (la schermata di chiamata e' quella di CarPlay).
public final class CarPlayPonte: NSObject {
  public static let shared = CarPlayPonte()

  public private(set) var controller: CPInterfaceController?
  var onScelta: ((String) -> Void)?
  var onConnessione: ((Bool) -> Void)?
  private var dati = DatiAuto.vuoti
  private var recenti: CPListTemplate?
  private var frequenti: CPListTemplate?
  private var conAccesso = false

  public func collega(_ controller: CPInterfaceController) {
    self.controller = controller
    mostraRadice(animata: false)
    onConnessione?(true)
  }

  public func scollega() {
    controller = nil
    recenti = nil
    frequenti = nil
    onConnessione?(false)
  }

  func aggiorna(_ nuovi: DatiAuto) {
    dati = nuovi
    guard controller != nil else { return }
    if nuovi.accesso != conAccesso || recenti == nil {
      mostraRadice(animata: false)
    } else {
      recenti?.updateSections([sezione(dati.recenti)])
      frequenti?.updateSections([sezione(dati.frequenti)])
    }
  }

  private func mostraRadice(animata: Bool) {
    guard let controller else { return }
    conAccesso = dati.accesso
    if !dati.accesso {
      let lista = CPListTemplate(title: "GestABLE", sections: [])
      lista.emptyViewTitleVariants = [dati.testo("accedi", "Accedi a GestABLE sul telefono")]
      recenti = nil
      frequenti = nil
      controller.setRootTemplate(lista, animated: animata, completion: nil)
      return
    }
    let r = CPListTemplate(title: dati.testo("recenti", "Recenti"), sections: [sezione(dati.recenti)])
    r.tabTitle = dati.testo("recenti", "Recenti")
    r.tabImage = UIImage(systemName: "clock.fill")
    r.emptyViewTitleVariants = [dati.testo("vuoto", "Nessuna chiamata")]
    let f = CPListTemplate(title: dati.testo("frequenti", "Frequenti"), sections: [sezione(dati.frequenti)])
    f.tabTitle = dati.testo("frequenti", "Frequenti")
    f.tabImage = UIImage(systemName: "star.fill")
    f.emptyViewTitleVariants = [dati.testo("vuoto", "Nessuna chiamata")]
    recenti = r
    frequenti = f
    controller.setRootTemplate(CPTabBarTemplate(templates: [r, f]), animated: animata, completion: nil)
  }

  private func sezione(_ voci: [VoceAuto]) -> CPListSection {
    let massimo = CPListTemplate.maximumItemCount
    let elementi: [CPListItem] = voci.prefix(massimo).map { voce in
      let icona = UIImage(systemName: voce.entrata ? "phone.arrow.down.left.fill" : "phone.arrow.up.right.fill")
      let elemento = CPListItem(text: voce.titolo, detailText: voce.sottotitolo, image: icona)
      elemento.handler = { [weak self] _, fatto in
        self?.onScelta?(voce.numero)
        fatto()
      }
      return elemento
    }
    return CPListSection(items: elementi)
  }
}
