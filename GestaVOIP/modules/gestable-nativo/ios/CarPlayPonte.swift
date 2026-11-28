import CarPlay
import UIKit

// MARK: - Dati che arrivano da JS (src/auto/RadiceAuto.tsx)

/// Una chiamata del registro di Odoo.
struct ChiamataAuto {
  var titolo: String
  var sottotitolo: String
  var numero: String
  /// "entrata", "uscita" o "persa".
  var tipo: String
  var foto: UIImage?
}

/// Una persona: preferito, collega (con interno) o contatto di Odoo.
struct PersonaAuto {
  var id: Int
  var nome: String
  var sottotitolo: String
  var dettaglio: String
  var numero: String
  var indirizzo: String
  var foto: UIImage?
  /// Solo i colleghi: true/false = pallino verde/grigio, nil = nessun pallino.
  var disponibile: Bool?
}

struct AppuntamentoAuto {
  var id: Int
  var titolo: String
  /// «10:00» o «Tutto il giorno»: dentro il riquadro colorato.
  var ora: String
  var quando: String
  var luogo: String
  var persone: String
  var numero: String
  var chiamaNome: String
  var colore: UIColor
  var inCorso: Bool
}

struct GiornoAuto {
  var titolo: String
  var sottotitolo: String
  var voci: [AppuntamentoAuto]
}

struct ChatAuto {
  var id: Int
  var nome: String
  var nonLetti: Int
  var dettaglio: String
  var gruppo: Bool
  var numero: String
  var foto: UIImage?
}

struct DatiAuto {
  /// "pronto", "accesso" (nessuna sessione), "bloccato" (portachiavi chiuso), "senzaTelefono".
  var stato: String
  var recenti: [ChiamataAuto] = []
  var preferiti: [PersonaAuto] = []
  var agenda: [GiornoAuto] = []
  var chat: [ChatAuto] = []
  var colleghi: [PersonaAuto] = []
  var contatti: [PersonaAuto] = []
  var testi: [String: String] = [:]

  static let vuoti = DatiAuto(stato: "attesa")

  func testo(_ chiave: String, _ predefinito: String) -> String {
    return testi[chiave] ?? predefinito
  }
}

// MARK: - Colori (quelli della G di GestABLE)

enum ColoriAuto {
  static let magenta = UIColor(red: 179 / 255, green: 58 / 255, blue: 126 / 255, alpha: 1)
  static let blu = UIColor(red: 15 / 255, green: 122 / 255, blue: 182 / 255, alpha: 1)
  static let viola = UIColor(red: 131 / 255, green: 70 / 255, blue: 194 / 255, alpha: 1)
  static let verde = UIColor(red: 52 / 255, green: 199 / 255, blue: 89 / 255, alpha: 1)
  static let rosso = UIColor(red: 1, green: 59 / 255, blue: 48 / 255, alpha: 1)
  static let grigio = UIColor(red: 142 / 255, green: 142 / 255, blue: 147 / 255, alpha: 1)

  /// Due colori per lo sfondo delle iniziali, sempre gli stessi per lo stesso nome.
  static func coppia(per nome: String) -> (UIColor, UIColor) {
    let coppie: [(UIColor, UIColor)] = [(magenta, viola), (blu, viola), (viola, magenta), (blu, magenta)]
    let somma = nome.unicodeScalars.reduce(0) { ($0 &* 31 &+ Int($1.value)) & 0xFFFF }
    return coppie[somma % coppie.count]
  }

  static func esadecimale(_ testo: String) -> UIColor {
    var s = testo.trimmingCharacters(in: .whitespaces)
    if s.hasPrefix("#") { s.removeFirst() }
    guard s.count == 6, let v = UInt32(s, radix: 16) else { return magenta }
    return UIColor(
      red: CGFloat((v >> 16) & 0xFF) / 255, green: CGFloat((v >> 8) & 0xFF) / 255, blue: CGFloat(v & 0xFF) / 255, alpha: 1)
  }
}

// MARK: - Immagini disegnate per l'auto

enum ImmaginiAuto {
  static func iniziali(_ nome: String) -> String {
    let parole = nome.split(whereSeparator: { $0 == " " || $0 == "," || $0 == "-" }).filter { !$0.isEmpty }
    let lettere = parole.prefix(2).compactMap { $0.first }.map { String($0) }
    return lettere.joined().uppercased().isEmpty ? "?" : lettere.joined().uppercased()
  }

  /// Foto rotonda della persona, o le sue iniziali su un cerchio sfumato nei colori del marchio.
  /// Con `disponibile` aggiunge il pallino verde (libero) o grigio (occupato) in basso a destra.
  static func avatar(_ nome: String, foto: UIImage?, lato: CGFloat, scala: CGFloat, disponibile: Bool? = nil) -> UIImage {
    let formato = UIGraphicsImageRendererFormat()
    formato.scale = scala
    let r = CGRect(x: 0, y: 0, width: lato, height: lato)
    return UIGraphicsImageRenderer(size: r.size, format: formato).image { ctx in
      let cerchio = UIBezierPath(ovalIn: r)
      ctx.cgContext.saveGState()
      cerchio.addClip()
      if let foto {
        // Riempie il cerchio senza deformare la foto.
        let k = max(lato / foto.size.width, lato / foto.size.height)
        let w = foto.size.width * k, h = foto.size.height * k
        foto.draw(in: CGRect(x: (lato - w) / 2, y: (lato - h) / 2, width: w, height: h))
      } else {
        let (a, b) = ColoriAuto.coppia(per: nome)
        let sfumatura = CGGradient(
          colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: [a.cgColor, b.cgColor] as CFArray, locations: [0, 1])!
        ctx.cgContext.drawLinearGradient(sfumatura, start: .zero, end: CGPoint(x: lato, y: lato), options: [])
        let testo = iniziali(nome) as NSString
        let font = UIFont.systemFont(ofSize: lato * 0.38, weight: .bold)
        let attr: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: UIColor.white]
        let dim = testo.size(withAttributes: attr)
        testo.draw(at: CGPoint(x: (lato - dim.width) / 2, y: (lato - dim.height) / 2), withAttributes: attr)
      }
      ctx.cgContext.restoreGState()
      if let disponibile {
        let d = lato * 0.30
        let p = CGRect(x: lato - d - lato * 0.02, y: lato - d - lato * 0.02, width: d, height: d)
        UIColor.white.setFill()
        UIBezierPath(ovalIn: p.insetBy(dx: -lato * 0.03, dy: -lato * 0.03)).fill()
        (disponibile ? ColoriAuto.verde : ColoriAuto.grigio).setFill()
        UIBezierPath(ovalIn: p).fill()
      }
    }
  }

  /// Riquadro arrotondato col colore dell'appuntamento e l'ora scritta dentro.
  static func ora(_ ora: String, colore: UIColor, lato: CGFloat, scala: CGFloat) -> UIImage {
    let formato = UIGraphicsImageRendererFormat()
    formato.scale = scala
    let r = CGRect(x: 0, y: 0, width: lato, height: lato)
    return UIGraphicsImageRenderer(size: r.size, format: formato).image { _ in
      colore.setFill()
      UIBezierPath(roundedRect: r, cornerRadius: lato * 0.24).fill()
      let parti = ora.split(separator: ":", maxSplits: 1).map(String.init)
      let bianco = UIColor.white
      if parti.count == 2 {
        // «10» grande e «00» piccolo sotto, come un orologio da calendario.
        let f1 = UIFont.monospacedDigitSystemFont(ofSize: lato * 0.40, weight: .heavy)
        let f2 = UIFont.monospacedDigitSystemFont(ofSize: lato * 0.24, weight: .semibold)
        let a1: [NSAttributedString.Key: Any] = [.font: f1, .foregroundColor: bianco]
        let a2: [NSAttributedString.Key: Any] = [.font: f2, .foregroundColor: bianco.withAlphaComponent(0.85)]
        let s1 = parti[0] as NSString, s2 = parti[1] as NSString
        let d1 = s1.size(withAttributes: a1), d2 = s2.size(withAttributes: a2)
        let alto = d1.height + d2.height - lato * 0.10
        let y = (lato - alto) / 2
        s1.draw(at: CGPoint(x: (lato - d1.width) / 2, y: y), withAttributes: a1)
        s2.draw(at: CGPoint(x: (lato - d2.width) / 2, y: y + d1.height - lato * 0.10), withAttributes: a2)
      } else {
        let conf = UIImage.SymbolConfiguration(pointSize: lato * 0.46, weight: .bold)
        if let s = UIImage(systemName: "sun.max.fill", withConfiguration: conf)?.withTintColor(bianco, renderingMode: .alwaysOriginal) {
          s.draw(at: CGPoint(x: (lato - s.size.width) / 2, y: (lato - s.size.height) / 2))
        }
      }
    }
  }

  /// Simbolo di sistema su un cerchio colorato (azioni: chiama, indicazioni...).
  static func simbolo(_ nome: String, sfondo: UIColor, lato: CGFloat, scala: CGFloat) -> UIImage {
    let formato = UIGraphicsImageRendererFormat()
    formato.scale = scala
    let r = CGRect(x: 0, y: 0, width: lato, height: lato)
    return UIGraphicsImageRenderer(size: r.size, format: formato).image { _ in
      sfondo.setFill()
      UIBezierPath(ovalIn: r).fill()
      let conf = UIImage.SymbolConfiguration(pointSize: lato * 0.44, weight: .semibold)
      if let s = UIImage(systemName: nome, withConfiguration: conf)?.withTintColor(.white, renderingMode: .alwaysOriginal) {
        s.draw(at: CGPoint(x: (lato - s.size.width) / 2, y: (lato - s.size.height) / 2))
      }
    }
  }

  /// Pillola magenta col numero dei messaggi non letti.
  static func contatore(_ n: Int, alto: CGFloat, scala: CGFloat) -> UIImage {
    let testo = (n > 99 ? "99+" : "\(n)") as NSString
    let font = UIFont.monospacedDigitSystemFont(ofSize: alto * 0.62, weight: .bold)
    let attr: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: UIColor.white]
    let dim = testo.size(withAttributes: attr)
    let largo = max(alto, dim.width + alto * 0.7)
    let formato = UIGraphicsImageRendererFormat()
    formato.scale = scala
    return UIGraphicsImageRenderer(size: CGSize(width: largo, height: alto), format: formato).image { _ in
      ColoriAuto.magenta.setFill()
      UIBezierPath(roundedRect: CGRect(x: 0, y: 0, width: largo, height: alto), cornerRadius: alto / 2).fill()
      testo.draw(at: CGPoint(x: (largo - dim.width) / 2, y: (alto - dim.height) / 2), withAttributes: attr)
    }
  }

  static func sistema(_ nome: String, colore: UIColor) -> UIImage? {
    return UIImage(systemName: nome)?.withTintColor(colore, renderingMode: .alwaysOriginal)
  }
}

// MARK: - Ponte CarPlay

/// CarPlay (app di comunicazione): quattro schede native — Telefono, Agenda, Messaggi,
/// Contatti — con i dati di Odoo. Il nativo disegna solo i template; dati e azioni passano
/// da JS, che avvia la chiamata VoIP con CallKit (la schermata di chiamata e' quella di CarPlay).
/// I testi dei messaggi non si mostrano: alla guida CarPlay vieta di leggerli sullo schermo.
public final class CarPlayPonte: NSObject {
  public static let shared = CarPlayPonte()

  public private(set) var controller: CPInterfaceController?
  private weak var scena: CPTemplateApplicationScene?
  var onScelta: ((String) -> Void)?
  var onConnessione: ((Bool) -> Void)?
  var onLetta: ((Int) -> Void)?
  private var dati = DatiAuto.vuoti
  private var statoMostrato = ""
  private var telefono: CPListTemplate?
  private var agenda: CPListTemplate?
  private var messaggi: CPListTemplate?
  private var contatti: CPListTemplate?

  private var scala: CGFloat {
    let s = controller?.carTraitCollection.displayScale ?? 0
    return s > 0 ? s : 2
  }

  private var latoImmagine: CGFloat {
    let m = CPListItem.maximumImageSize
    return max(28, min(m.width, m.height))
  }

  public func collega(_ controller: CPInterfaceController, scena: CPTemplateApplicationScene? = nil) {
    self.controller = controller
    self.scena = scena
    statoMostrato = ""
    mostraRadice()
    onConnessione?(true)
  }

  public func scollega() {
    controller = nil
    scena = nil
    telefono = nil
    agenda = nil
    messaggi = nil
    contatti = nil
    statoMostrato = ""
    onConnessione?(false)
  }

  func aggiorna(_ nuovi: DatiAuto) {
    dati = nuovi
    guard controller != nil else { return }
    if nuovi.stato != statoMostrato || telefono == nil {
      mostraRadice()
      return
    }
    telefono?.updateSections(sezioniTelefono())
    agenda?.updateSections(sezioniAgenda())
    messaggi?.updateSections(sezioniMessaggi())
    contatti?.updateSections(sezioniContatti())
  }

  // MARK: Radice

  private func mostraRadice() {
    guard let controller else { return }
    statoMostrato = dati.stato
    guard dati.stato == "pronto" else {
      telefono = nil
      agenda = nil
      messaggi = nil
      contatti = nil
      let lista = CPListTemplate(title: "GestABLE", sections: [])
      switch dati.stato {
      case "bloccato":
        lista.emptyViewTitleVariants = [dati.testo("bloccatoTitolo", "Sblocca l’iPhone")]
        lista.emptyViewSubtitleVariants = [dati.testo("bloccato", "Serve una volta, poi GestABLE funziona anche a telefono bloccato")]
      case "senzaTelefono":
        lista.emptyViewTitleVariants = [dati.testo("senzaTelefono", "Il centralino non è attivo su questo Odoo")]
      case "accesso":
        lista.emptyViewTitleVariants = [dati.testo("accedi", "Accedi a GestABLE sul telefono")]
      default:
        lista.emptyViewTitleVariants = [dati.testo("caricamento", "Caricamento…")]
      }
      controller.setRootTemplate(lista, animated: false, completion: nil)
      return
    }
    let t = CPListTemplate(title: dati.testo("telefono", "Telefono"), sections: sezioniTelefono())
    t.tabTitle = dati.testo("telefono", "Telefono")
    t.tabImage = UIImage(systemName: "phone.fill")
    t.emptyViewTitleVariants = [dati.testo("vuoto", "Nessuna chiamata")]
    let a = CPListTemplate(title: dati.testo("agenda", "Agenda"), sections: sezioniAgenda())
    a.tabTitle = dati.testo("agenda", "Agenda")
    a.tabImage = UIImage(systemName: "calendar")
    a.emptyViewTitleVariants = [dati.testo("agendaVuota", "Nessun appuntamento oggi e domani")]
    let m = CPListTemplate(title: dati.testo("messaggi", "Messaggi"), sections: sezioniMessaggi())
    m.tabTitle = dati.testo("messaggi", "Messaggi")
    m.tabImage = UIImage(systemName: "message.fill")
    m.emptyViewTitleVariants = [dati.testo("messaggiVuoti", "Nessuna chat")]
    let c = CPListTemplate(title: dati.testo("contatti", "Contatti"), sections: sezioniContatti())
    c.tabTitle = dati.testo("contatti", "Contatti")
    c.tabImage = UIImage(systemName: "person.crop.circle.fill")
    c.emptyViewTitleVariants = [dati.testo("contattiVuoti", "Nessun contatto")]
    telefono = t
    agenda = a
    messaggi = m
    contatti = c
    aggiornaContatoreMessaggi()
    controller.setRootTemplate(CPTabBarTemplate(templates: [t, a, m, c]), animated: false, completion: nil)
  }

  private func aggiornaContatoreMessaggi() {
    let n = dati.chat.reduce(0) { $0 + $1.nonLetti }
    messaggi?.showsTabBadge = n > 0
  }

  // MARK: Telefono

  private func sezioniTelefono() -> [CPListSection] {
    var sezioni: [CPListSection] = []
    let lato = latoImmagine
    let preferiti = Array(dati.preferiti.prefix(CPMaximumNumberOfGridImages))
    if !preferiti.isEmpty {
      let immagini = preferiti.map {
        ImmaginiAuto.avatar($0.nome, foto: $0.foto, lato: CPListImageRowItem.maximumImageSize.height, scala: scala)
      }
      let riga: CPListImageRowItem
      if #available(iOS 17.4, *) {
        riga = CPListImageRowItem(text: dati.testo("preferiti", "Preferiti"), images: immagini, imageTitles: preferiti.map { primoNome($0.nome) })
      } else {
        riga = CPListImageRowItem(text: dati.testo("preferiti", "Preferiti"), images: immagini)
      }
      riga.listImageRowHandler = { [weak self] _, indice, fatto in
        if indice < preferiti.count { self?.onScelta?(preferiti[indice].numero) }
        fatto()
      }
      riga.handler = { [weak self] _, fatto in
        if let primo = preferiti.first { self?.onScelta?(primo.numero) }
        fatto()
      }
      sezioni.append(CPListSection(items: [riga]))
    }
    let massimo = max(1, CPListTemplate.maximumItemCount - sezioni.count)
    let voci: [CPListItem] = dati.recenti.prefix(massimo).map { c in
      let elemento = CPListItem(
        text: c.titolo, detailText: c.sottotitolo,
        image: ImmaginiAuto.avatar(c.titolo, foto: c.foto, lato: lato, scala: scala))
      switch c.tipo {
      case "persa":
        elemento.setAccessoryImage(ImmaginiAuto.sistema("phone.down.fill", colore: ColoriAuto.rosso))
      case "entrata":
        elemento.setAccessoryImage(ImmaginiAuto.sistema("phone.arrow.down.left.fill", colore: ColoriAuto.blu))
      default:
        elemento.setAccessoryImage(ImmaginiAuto.sistema("phone.arrow.up.right.fill", colore: ColoriAuto.verde))
      }
      elemento.handler = { [weak self] _, fatto in
        self?.onScelta?(c.numero)
        fatto()
      }
      return elemento
    }
    if !voci.isEmpty {
      sezioni.append(CPListSection(items: voci, header: dati.testo("recenti", "Recenti"), sectionIndexTitle: nil))
    }
    return sezioni
  }

  private func primoNome(_ nome: String) -> String {
    let pulito = nome.components(separatedBy: ",").last?.trimmingCharacters(in: .whitespaces) ?? nome
    return pulito.split(separator: " ").first.map(String.init) ?? pulito
  }

  // MARK: Agenda

  private func sezioniAgenda() -> [CPListSection] {
    let lato = latoImmagine
    var restano = CPListTemplate.maximumItemCount
    var sezioni: [CPListSection] = []
    for giorno in dati.agenda.prefix(CPListTemplate.maximumSectionCount) where restano > 0 && !giorno.voci.isEmpty {
      let voci: [CPListItem] = giorno.voci.prefix(restano).map { a in
        let dettaglio = [a.inCorso ? dati.testo("inCorso", "In corso") : a.quando, a.luogo].filter { !$0.isEmpty }.joined(separator: " · ")
        let elemento = CPListItem(
          text: a.titolo, detailText: dettaglio, image: ImmaginiAuto.ora(a.ora, colore: a.colore, lato: lato, scala: scala),
          accessoryImage: nil, accessoryType: .disclosureIndicator)
        elemento.handler = { [weak self] _, fatto in
          self?.apriAppuntamento(a)
          fatto()
        }
        return elemento
      }
      restano -= voci.count
      sezioni.append(
        CPListSection(items: voci, header: giorno.titolo, headerSubtitle: giorno.sottotitolo, headerImage: nil, headerButton: nil, sectionIndexTitle: nil))
    }
    return sezioni
  }

  private func apriAppuntamento(_ a: AppuntamentoAuto) {
    let lato = latoImmagine
    var info: [CPListItem] = []
    let quando = CPListItem(text: a.quando, detailText: a.inCorso ? dati.testo("inCorso", "In corso") : nil,
                            image: ImmaginiAuto.simbolo("clock.fill", sfondo: a.colore, lato: lato, scala: scala))
    info.append(quando)
    if !a.luogo.isEmpty {
      info.append(CPListItem(text: a.luogo, detailText: nil, image: ImmaginiAuto.simbolo("mappin", sfondo: ColoriAuto.rosso, lato: lato, scala: scala)))
    }
    if !a.persone.isEmpty {
      info.append(CPListItem(text: a.persone, detailText: nil, image: ImmaginiAuto.simbolo("person.2.fill", sfondo: ColoriAuto.viola, lato: lato, scala: scala)))
    }
    var azioni: [CPListItem] = []
    if !a.numero.isEmpty {
      let chiama = CPListItem(
        text: String(format: dati.testo("chiamaNome", "Chiama %@"), a.chiamaNome), detailText: a.numero,
        image: ImmaginiAuto.simbolo("phone.fill", sfondo: ColoriAuto.verde, lato: lato, scala: scala))
      chiama.handler = { [weak self] _, fatto in
        self?.onScelta?(a.numero)
        fatto()
      }
      azioni.append(chiama)
    }
    if !a.luogo.isEmpty, !a.luogo.lowercased().hasPrefix("http") {
      let vai = CPListItem(
        text: dati.testo("indicazioni", "Indicazioni"), detailText: dati.testo("indicazioniApri", "Apri in Mappe"),
        image: ImmaginiAuto.simbolo("car.fill", sfondo: ColoriAuto.blu, lato: lato, scala: scala))
      vai.handler = { [weak self] _, fatto in
        self?.apriMappe(a.luogo)
        fatto()
      }
      azioni.append(vai)
    }
    var sezioni = [CPListSection(items: info)]
    if !azioni.isEmpty { sezioni.append(CPListSection(items: azioni)) }
    controller?.pushTemplate(CPListTemplate(title: a.titolo, sections: sezioni), animated: true, completion: nil)
  }

  private func apriMappe(_ indirizzo: String) {
    var c = URLComponents(string: "maps://")!
    c.queryItems = [URLQueryItem(name: "daddr", value: indirizzo)]
    guard let url = c.url else { return }
    scena?.open(url, options: nil, completionHandler: nil)
  }

  // MARK: Messaggi

  private func sezioniMessaggi() -> [CPListSection] {
    let lato = latoImmagine
    let voci: [CPListItem] = dati.chat.prefix(CPListTemplate.maximumItemCount).map { chat in
      let icona = chat.gruppo
        ? ImmaginiAuto.simbolo("number", sfondo: ColoriAuto.coppia(per: chat.nome).0, lato: lato, scala: scala)
        : ImmaginiAuto.avatar(chat.nome, foto: chat.foto, lato: lato, scala: scala)
      let elemento = CPListItem(text: chat.nome, detailText: chat.dettaglio, image: icona)
      if chat.nonLetti > 0 {
        elemento.setAccessoryImage(ImmaginiAuto.contatore(chat.nonLetti, alto: 22, scala: scala))
      }
      elemento.handler = { [weak self] _, fatto in
        self?.apriChat(chat)
        fatto()
      }
      return elemento
    }
    aggiornaContatoreMessaggi()
    return voci.isEmpty ? [] : [CPListSection(items: voci)]
  }

  /// Foglio con le azioni possibili alla guida: chiamare chi scrive e segnare la chat come letta.
  private func apriChat(_ chat: ChatAuto) {
    var azioni: [CPAlertAction] = []
    if !chat.numero.isEmpty {
      azioni.append(CPAlertAction(title: String(format: dati.testo("chiamaNome", "Chiama %@"), primoNome(chat.nome)), style: .default) { [weak self] _ in
        self?.controller?.dismissTemplate(animated: true, completion: nil)
        self?.onScelta?(chat.numero)
      })
    }
    if chat.nonLetti > 0 {
      azioni.append(CPAlertAction(title: dati.testo("segnaLetta", "Segna come letta"), style: .default) { [weak self] _ in
        self?.controller?.dismissTemplate(animated: true, completion: nil)
        self?.onLetta?(chat.id)
      })
    }
    azioni.append(CPAlertAction(title: dati.testo("chiudi", "Chiudi"), style: .cancel) { [weak self] _ in
      self?.controller?.dismissTemplate(animated: true, completion: nil)
    })
    let messaggio = chat.nonLetti > 0
      ? String(format: dati.testo("nonLettiGuida", "%d messaggi da leggere: li trovi sul telefono quando sei fermo"), chat.nonLetti)
      : dati.testo("nessunNuovo", "Nessun messaggio nuovo")
    controller?.presentTemplate(CPActionSheetTemplate(title: chat.nome, message: messaggio, actions: azioni), animated: true, completion: nil)
  }

  // MARK: Contatti

  private func sezioniContatti() -> [CPListSection] {
    let lato = latoImmagine
    var restano = CPListTemplate.maximumItemCount
    var sezioni: [CPListSection] = []
    let gruppi: [(String, [PersonaAuto])] = [
      (dati.testo("colleghi", "Colleghi"), dati.colleghi),
      (dati.testo("frequenti", "Contatti frequenti"), dati.contatti),
    ]
    for (titolo, persone) in gruppi where !persone.isEmpty && restano > 0 {
      let voci: [CPListItem] = persone.prefix(restano).map { p in
        let elemento = CPListItem(
          text: p.nome, detailText: p.sottotitolo,
          image: ImmaginiAuto.avatar(p.nome, foto: p.foto, lato: lato, scala: scala, disponibile: p.disponibile),
          accessoryImage: nil, accessoryType: .disclosureIndicator)
        elemento.handler = { [weak self] _, fatto in
          self?.apriPersona(p)
          fatto()
        }
        return elemento
      }
      restano -= voci.count
      sezioni.append(CPListSection(items: voci, header: titolo, sectionIndexTitle: nil))
    }
    return sezioni
  }

  private func apriPersona(_ p: PersonaAuto) {
    let contatto = CPContact(name: p.nome, image: ImmaginiAuto.avatar(p.nome, foto: p.foto, lato: 120, scala: scala, disponibile: p.disponibile))
    contatto.subtitle = p.sottotitolo
    contatto.informativeText = p.dettaglio
    var azioni: [CPButton] = []
    if !p.numero.isEmpty {
      azioni.append(CPContactCallButton { [weak self] _ in self?.onScelta?(p.numero) })
    }
    if !p.indirizzo.isEmpty {
      azioni.append(CPContactDirectionsButton { [weak self] _ in self?.apriMappe(p.indirizzo) })
    }
    contatto.actions = azioni
    controller?.pushTemplate(CPContactTemplate(contact: contatto), animated: true, completion: nil)
  }
}
