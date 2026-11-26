import ExpoModulesCore
import Intents

struct VoceAutoRecord: Record {
  @Field var titolo: String = ""
  @Field var sottotitolo: String = ""
  @Field var numero: String = ""
  @Field var entrata: Bool = false
}

struct DatiAutoRecord: Record {
  @Field var accesso: Bool = false
  @Field var recenti: [VoceAutoRecord] = []
  @Field var frequenti: [VoceAutoRecord] = []
  @Field var testi: [String: String] = [:]
}

/// Ponte JS <-> nativo di GestABLE: chiamate chieste da Siri e dai Recenti di iOS, CarPlay.
public class GestableNativoModule: Module {
  public func definition() -> ModuleDefinition {
    Name("GestableNativo")

    Events("onChiama", "onSceltaAuto", "onConnessioneAuto")

    OnStartObserving {
      ChiamateEsterne.shared.avvisa = { [weak self] numero in
        self?.sendEvent("onChiama", ["numero": numero])
      }
      CarPlayPonte.shared.onScelta = { [weak self] numero in
        self?.sendEvent("onSceltaAuto", ["numero": numero])
      }
      CarPlayPonte.shared.onConnessione = { [weak self] collegata in
        self?.sendEvent("onConnessioneAuto", ["collegata": collegata])
      }
    }

    OnStopObserving {
      ChiamateEsterne.shared.avvisa = nil
      CarPlayPonte.shared.onScelta = nil
      CarPlayPonte.shared.onConnessione = nil
    }

    /// Un numero chiesto da Siri o dai Recenti prima che JS fosse pronto (app chiusa).
    Function("prendiNumeroInAttesa") { () -> String? in
      return ChiamateEsterne.shared.prendi()
    }

    Function("autoCollegata") { () -> Bool in
      return CarPlayPonte.shared.controller != nil
    }

    AsyncFunction("aggiornaAuto") { (d: DatiAutoRecord) in
      let voci = { (lista: [VoceAutoRecord]) in
        lista.map { VoceAuto(titolo: $0.titolo, sottotitolo: $0.sottotitolo, numero: $0.numero, entrata: $0.entrata) }
      }
      CarPlayPonte.shared.aggiorna(
        DatiAuto(accesso: d.accesso, recenti: voci(d.recenti), frequenti: voci(d.frequenti), testi: d.testi))
    }.runOnQueue(.main)

    /// Spese: scanner degli scontrini (o una foto dalla galleria dove non c'e' la fotocamera).
    Function("scannerScontrini") { () -> Bool in
      return ScontrinoScanner.scannerDisponibile
    }

    AsyncFunction("scansionaScontrino") { (promise: Promise) in
      ScontrinoScanner.shared.scansiona(promise, da: self.appContext?.utilities?.currentViewController())
    }.runOnQueue(.main)

    AsyncFunction("scegliFotoScontrino") { (promise: Promise) in
      ScontrinoScanner.shared.scegliFoto(promise, da: self.appContext?.utilities?.currentViewController())
    }.runOnQueue(.main)

    /// Permesso per Siri («Chiama Mario con GestABLE»): lo chiede una volta.
    AsyncFunction("chiediSiri") { (promise: Promise) in
      if INPreferences.siriAuthorizationStatus() != .notDetermined {
        promise.resolve(INPreferences.siriAuthorizationStatus() == .authorized)
        return
      }
      INPreferences.requestSiriAuthorization { stato in
        promise.resolve(stato == .authorized)
      }
    }
  }
}
