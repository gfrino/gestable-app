import Foundation
import Intents

/// Chiamate chieste da fuori dall'app: Siri («Chiama Mario con GestABLE») e un tocco
/// su una chiamata nei Recenti del Telefono di iOS. Arrivano come INStartCallIntent:
/// il numero passa a JS (evento onChiama) o resta in attesa finche' JS non e' pronto.
public final class ChiamateEsterne {
  public static let shared = ChiamateEsterne()

  var inAttesa: String?
  var avvisa: ((String) -> Void)?

  func arriva(_ numero: String) {
    if let avvisa {
      avvisa(numero)
    } else {
      inAttesa = numero
    }
  }

  func prendi() -> String? {
    let numero = inAttesa
    inAttesa = nil
    return numero
  }

  /// Il numero dentro un'attivita' «avvia chiamata», se c'e'.
  public static func numero(da attivita: NSUserActivity) -> String? {
    guard let intent = attivita.interaction?.intent as? INStartCallIntent,
      let valore = intent.contacts?.first?.personHandle?.value?.trimmingCharacters(in: .whitespaces),
      !valore.isEmpty,
      !valore.hasPrefix("client:")
    else { return nil }
    return valore
  }
}

/// Siri: accetta i contatti con un numero e chiede di continuare nell'app, dove parte la chiamata.
public final class GestoreChiamataSiri: NSObject, INStartCallIntentHandling {
  public func resolveContacts(
    for intent: INStartCallIntent,
    with completion: @escaping ([INStartCallContactResolutionResult]) -> Void
  ) {
    guard let contatti = intent.contacts, !contatti.isEmpty else {
      completion([.needsValue()])
      return
    }
    completion(contatti.map { contatto in
      (contatto.personHandle?.value?.isEmpty == false) ? .success(with: contatto) : .unsupported()
    })
  }

  public func handle(intent: INStartCallIntent, completion: @escaping (INStartCallIntentResponse) -> Void) {
    let attivita = NSUserActivity(activityType: NSStringFromClass(INStartCallIntent.self))
    completion(INStartCallIntentResponse(code: .continueInApp, userActivity: attivita))
  }
}

/// Usato dall'AppDelegate (plugins/carplay-siri.js): gestione degli intent dentro l'app.
public enum IntentiGestable {
  public static func gestore(per intent: INIntent) -> Any? {
    return intent is INStartCallIntent ? GestoreChiamataSiri() : nil
  }
}
