import ExpoModulesCore

/// Riceve le attivita' «avvia chiamata» (Siri, Recenti di iOS) inoltrate dalla scena.
public class GestableAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    guard let numero = ChiamateEsterne.numero(da: userActivity) else { return false }
    ChiamateEsterne.shared.arriva(numero)
    return true
  }
}
