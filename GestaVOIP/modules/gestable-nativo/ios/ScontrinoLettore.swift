import Foundation
import Vision

#if canImport(FoundationModels)
  import FoundationModels
#endif

/// Lettura degli scontrini sul telefono, senza servizi esterni.
///
/// 1. Il testo: riconoscimento del testo di Apple (Vision), in italiano, tedesco,
///    francese e inglese. Le righe tornano nell'ordine di lettura; le parti sulla
///    stessa riga («Caffe' ... 3.50») vengono unite.
/// 2. Dove c'e' Apple Intelligence (iOS 26+), il modello sul telefono estrae
///    negozio, totale, data, valuta e categoria dal testo. Altrove l'app usa le
///    sue regole (src/spese/leggiScontrino.ts).
enum ScontrinoLettore {
  /// Righe di testo dei file indicati (file://), in ordine di lettura.
  static func righe(_ indirizzi: [String]) throws -> [String] {
    var tutte: [String] = []
    for indirizzo in indirizzi {
      guard let url = URL(string: indirizzo) else { continue }
      let richiesta = VNRecognizeTextRequest()
      richiesta.recognitionLevel = .accurate
      richiesta.usesLanguageCorrection = true
      richiesta.recognitionLanguages = ["it-IT", "de-DE", "fr-FR", "en-US"]
      try VNImageRequestHandler(url: url).perform([richiesta])
      let pezzi = (richiesta.results ?? []).compactMap { o -> (testo: String, box: CGRect)? in
        guard let t = o.topCandidates(1).first?.string else { return nil }
        return (t, o.boundingBox)
      }
      tutte.append(contentsOf: unisciRighe(pezzi))
    }
    return tutte
  }

  /// Unisce i pezzi alla stessa altezza (colonne di uno scontrino) e li ordina dall'alto.
  private static func unisciRighe(_ pezzi: [(testo: String, box: CGRect)]) -> [String] {
    let ordinati = pezzi.sorted { $0.box.midY > $1.box.midY }
    var righe: [[(testo: String, box: CGRect)]] = []
    for p in ordinati {
      if let ultima = righe.last, let primo = ultima.first,
        abs(primo.box.midY - p.box.midY) < max(primo.box.height, p.box.height) * 0.5
      {
        righe[righe.count - 1].append(p)
      } else {
        righe.append([p])
      }
    }
    return righe.map { riga in riga.sorted { $0.box.minX < $1.box.minX }.map(\.testo).joined(separator: "  ") }
  }

  static var aiDisponibile: Bool {
    #if canImport(FoundationModels)
      if #available(iOS 26.0, *) {
        return SystemLanguageModel.default.isAvailable
      }
    #endif
    return false
  }

  /// Dati estratti dal modello sul telefono; nil se non c'e' o non risponde.
  static func analizza(testo: String, categorie: [String]) async -> DatiScontrinoRecord? {
    #if canImport(FoundationModels)
      if #available(iOS 26.0, *), SystemLanguageModel.default.isAvailable {
        do {
          let sessione = LanguageModelSession(
            instructions: """
              Leggi il testo di uno scontrino (anche in tedesco, francese o inglese) e ricava i dati \
              per una nota spese. Non inventare: se un dato non c'e', lascialo vuoto o a zero. \
              Il totale e' l'importo finale pagato, non un subtotale, l'IVA o il resto.
              """)
          let elenco = categorie.isEmpty ? "(nessuna)" : categorie.joined(separator: ", ")
          let risposta = try await sessione.respond(
            to: "Categorie possibili: \(elenco)\n\nTesto dello scontrino:\n\(testo)",
            generating: DatiScontrinoAI.self)
          let d = risposta.content
          var r = DatiScontrinoRecord()
          r.negozio = d.negozio
          r.descrizione = d.descrizione
          r.totale = d.totale
          r.data = d.data
          r.valuta = d.valuta
          r.categoria = d.categoria
          return r
        } catch {
          return nil
        }
      }
    #endif
    return nil
  }
}

#if canImport(FoundationModels)
  @available(iOS 26.0, *)
  @Generable
  struct DatiScontrinoAI {
    @Guide(description: "Nome del negozio, ristorante o fornitore, come scritto in alto sullo scontrino")
    var negozio: String
    @Guide(description: "Il tipo di spesa in una o due parole italiane, per esempio Pranzo, Cena, Caffè, Carburante, Albergo, Parcheggio, Treno, Taxi, Materiale ufficio. Non elencare gli articoli dello scontrino")
    var descrizione: String
    @Guide(description: "Importo totale pagato come numero, per esempio 35.50; 0 se non si legge")
    var totale: Double
    @Guide(description: "Data dello scontrino nel formato AAAA-MM-GG; vuota se non c'e'")
    var data: String
    @Guide(description: "Codice ISO della valuta, per esempio CHF, EUR o USD; vuoto se non c'e'")
    var valuta: String
    @Guide(description: "La categoria piu' adatta, copiata esattamente dall'elenco delle categorie possibili; vuota se nessuna va bene")
    var categoria: String
  }
#endif
