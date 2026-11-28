import ExpoModulesCore
import Intents
import UIKit

struct ChiamataAutoRecord: Record {
  @Field var titolo: String = ""
  @Field var sottotitolo: String = ""
  @Field var numero: String = ""
  @Field var tipo: String = "uscita"
  @Field var foto: String = ""
}

struct PersonaAutoRecord: Record {
  @Field var id: Int = 0
  @Field var nome: String = ""
  @Field var sottotitolo: String = ""
  @Field var dettaglio: String = ""
  @Field var numero: String = ""
  @Field var indirizzo: String = ""
  @Field var foto: String = ""
  @Field var disponibile: Bool? = nil
}

struct AppuntamentoAutoRecord: Record {
  @Field var id: Int = 0
  @Field var titolo: String = ""
  @Field var ora: String = ""
  @Field var quando: String = ""
  @Field var luogo: String = ""
  @Field var persone: String = ""
  @Field var numero: String = ""
  @Field var chiamaNome: String = ""
  @Field var colore: String = ""
  @Field var inCorso: Bool = false
}

struct GiornoAutoRecord: Record {
  @Field var titolo: String = ""
  @Field var sottotitolo: String = ""
  @Field var voci: [AppuntamentoAutoRecord] = []
}

struct ChatAutoRecord: Record {
  @Field var id: Int = 0
  @Field var nome: String = ""
  @Field var nonLetti: Int = 0
  @Field var dettaglio: String = ""
  @Field var gruppo: Bool = false
  @Field var numero: String = ""
  @Field var foto: String = ""
}

/// Foto in base64 (PNG/JPEG/WebP da Odoo): nil se vuota o non leggibile.
private func immagine(_ b64: String) -> UIImage? {
  guard !b64.isEmpty, let d = Data(base64Encoded: b64, options: .ignoreUnknownCharacters) else { return nil }
  return UIImage(data: d)
}

/// Dati letti da uno scontrino dal modello sul telefono (vedi ScontrinoLettore).
struct DatiScontrinoRecord: Record {
  @Field var negozio: String = ""
  @Field var descrizione: String = ""
  @Field var totale: Double = 0
  @Field var data: String = ""
  @Field var valuta: String = ""
  @Field var categoria: String = ""
}

struct DatiAutoRecord: Record {
  @Field var stato: String = "accesso"
  @Field var recenti: [ChiamataAutoRecord] = []
  @Field var preferiti: [PersonaAutoRecord] = []
  @Field var agenda: [GiornoAutoRecord] = []
  @Field var chat: [ChatAutoRecord] = []
  @Field var colleghi: [PersonaAutoRecord] = []
  @Field var contatti: [PersonaAutoRecord] = []
  @Field var testi: [String: String] = [:]

  func dati() -> DatiAuto {
    let persona = { (p: PersonaAutoRecord) in
      PersonaAuto(id: p.id, nome: p.nome, sottotitolo: p.sottotitolo, dettaglio: p.dettaglio, numero: p.numero,
                  indirizzo: p.indirizzo, foto: immagine(p.foto), disponibile: p.disponibile)
    }
    return DatiAuto(
      stato: stato,
      recenti: recenti.map { ChiamataAuto(titolo: $0.titolo, sottotitolo: $0.sottotitolo, numero: $0.numero, tipo: $0.tipo, foto: immagine($0.foto)) },
      preferiti: preferiti.map(persona),
      agenda: agenda.map { g in
        GiornoAuto(titolo: g.titolo, sottotitolo: g.sottotitolo, voci: g.voci.map { a in
          AppuntamentoAuto(id: a.id, titolo: a.titolo, ora: a.ora, quando: a.quando, luogo: a.luogo, persone: a.persone,
                           numero: a.numero, chiamaNome: a.chiamaNome, colore: ColoriAuto.esadecimale(a.colore), inCorso: a.inCorso)
        })
      },
      chat: chat.map { ChatAuto(id: $0.id, nome: $0.nome, nonLetti: $0.nonLetti, dettaglio: $0.dettaglio, gruppo: $0.gruppo, numero: $0.numero, foto: immagine($0.foto)) },
      colleghi: colleghi.map(persona),
      contatti: contatti.map(persona),
      testi: testi)
  }
}

/// Ponte JS <-> nativo di GestABLE: chiamate chieste da Siri e dai Recenti di iOS, CarPlay.
public class GestableNativoModule: Module {
  public func definition() -> ModuleDefinition {
    Name("GestableNativo")

    Events("onChiama", "onSceltaAuto", "onConnessioneAuto", "onLettaAuto")

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
      CarPlayPonte.shared.onLetta = { [weak self] id in
        self?.sendEvent("onLettaAuto", ["id": id])
      }
    }

    OnStopObserving {
      ChiamateEsterne.shared.avvisa = nil
      CarPlayPonte.shared.onScelta = nil
      CarPlayPonte.shared.onConnessione = nil
      CarPlayPonte.shared.onLetta = nil
    }

    /// Un numero chiesto da Siri o dai Recenti prima che JS fosse pronto (app chiusa).
    Function("prendiNumeroInAttesa") { () -> String? in
      return ChiamateEsterne.shared.prendi()
    }

    Function("autoCollegata") { () -> Bool in
      return CarPlayPonte.shared.controller != nil
    }

    AsyncFunction("aggiornaAuto") { (d: DatiAutoRecord) in
      CarPlayPonte.shared.aggiorna(d.dati())
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

    /// Testo degli scontrini (riconoscimento del testo di Apple, sul telefono).
    AsyncFunction("leggiTestoScontrino") { (pagine: [String]) throws -> [String] in
      return try ScontrinoLettore.righe(pagine)
    }

    /// Apple Intelligence sul telefono (iOS 26+, dispositivi compatibili).
    Function("aiScontriniDisponibile") { () -> Bool in
      return ScontrinoLettore.aiDisponibile
    }

    AsyncFunction("analizzaScontrino") { (testo: String, categorie: [String]) async -> DatiScontrinoRecord? in
      return await ScontrinoLettore.analizza(testo: testo, categorie: categorie)
    }

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
