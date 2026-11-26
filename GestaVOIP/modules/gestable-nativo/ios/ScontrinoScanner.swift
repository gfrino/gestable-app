import ExpoModulesCore
import PhotosUI
import UIKit
import VisionKit

/// Scanner degli scontrini per le Spese.
///
/// Usa lo scanner di documenti di iOS (quello di Note: trova i bordi, ritaglia e
/// raddrizza). Dove non c'e' la fotocamera (simulatore) e per «Dalla galleria»
/// si sceglie una foto. Ogni pagina diventa un JPEG nella cartella temporanea;
/// la promessa restituisce gli indirizzi file:// (vuota se l'utente annulla).
final class ScontrinoScanner: NSObject, VNDocumentCameraViewControllerDelegate, PHPickerViewControllerDelegate {
  static let shared = ScontrinoScanner()

  /// Lato lungo massimo e qualita': uno scontrino resta leggibile e pesa 200-600 KB.
  private let latoMassimo: CGFloat = 2000
  private let qualita: CGFloat = 0.72

  private var promessa: Promise?
  /// Il controller aperto: se sparisce senza avvisare, la prossima richiesta riparte.
  private weak var aperto: UIViewController?

  /// Sul simulatore VisionKit dice di esserci ma non ha la fotocamera: si chiude subito.
  static var scannerDisponibile: Bool {
    #if targetEnvironment(simulator)
      return false
    #else
      return VNDocumentCameraViewController.isSupported
    #endif
  }

  /// Il controller da cui aprire scanner e galleria (quello di React Native in cima).
  private weak var base: UIViewController?

  func scansiona(_ promise: Promise, da: UIViewController?) {
    guard inizia(promise) else { return }
    base = da
    guard Self.scannerDisponibile else {
      apriGalleria()
      return
    }
    let vc = VNDocumentCameraViewController()
    vc.delegate = self
    presenta(vc)
  }

  func scegliFoto(_ promise: Promise, da: UIViewController?) {
    guard inizia(promise) else { return }
    base = da
    apriGalleria()
  }

  // MARK: - Scanner di documenti

  func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan) {
    let pagine = (0..<scan.pageCount).map { scan.imageOfPage(at: $0) }
    controller.dismiss(animated: true) { [weak self] in
      self?.concludi(pagine)
    }
  }

  func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
    controller.dismiss(animated: true) { [weak self] in
      self?.concludi([])
    }
  }

  func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFailWithError error: Error) {
    controller.dismiss(animated: true) { [weak self] in
      self?.fallisci(error.localizedDescription)
    }
  }

  // MARK: - Galleria

  private func apriGalleria() {
    var conf = PHPickerConfiguration()
    conf.filter = .images
    conf.selectionLimit = 1
    let vc = PHPickerViewController(configuration: conf)
    vc.delegate = self
    presenta(vc)
  }

  func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
    picker.dismiss(animated: true)
    guard let fornitore = results.first?.itemProvider, fornitore.canLoadObject(ofClass: UIImage.self) else {
      concludi([])
      return
    }
    fornitore.loadObject(ofClass: UIImage.self) { [weak self] oggetto, _ in
      DispatchQueue.main.async {
        self?.concludi((oggetto as? UIImage).map { [$0] } ?? [])
      }
    }
  }

  // MARK: - Utilita'

  private func inizia(_ promise: Promise) -> Bool {
    if let vecchia = promessa {
      if aperto?.presentingViewController != nil {
        promise.reject("SCANNER_OCCUPATO", "Lo scanner e' gia' aperto.")
        return false
      }
      // Chiuso senza avvisare (es. fotocamera non disponibile): si chiude la vecchia richiesta.
      vecchia.resolve([String]())
      promessa = nil
    }
    promessa = promise
    return true
  }

  private func concludi(_ immagini: [UIImage]) {
    guard let p = promessa else { return }
    promessa = nil
    var file: [String] = []
    for immagine in immagini {
      if let url = salva(immagine) {
        file.append(url.absoluteString)
      }
    }
    p.resolve(file)
  }

  private func fallisci(_ messaggio: String) {
    guard let p = promessa else { return }
    promessa = nil
    p.reject("SCANNER_ERRORE", messaggio)
  }

  private func salva(_ immagine: UIImage) -> URL? {
    let lato = max(immagine.size.width, immagine.size.height)
    let scala = lato > latoMassimo ? latoMassimo / lato : 1
    let misura = CGSize(width: floor(immagine.size.width * scala), height: floor(immagine.size.height * scala))
    let formato = UIGraphicsImageRendererFormat.default()
    formato.scale = 1
    let ridotta = UIGraphicsImageRenderer(size: misura, format: formato).image { _ in
      immagine.draw(in: CGRect(origin: .zero, size: misura))
    }
    guard let dati = ridotta.jpegData(compressionQuality: qualita) else { return nil }
    let url = FileManager.default.temporaryDirectory.appendingPathComponent("scontrino-\(UUID().uuidString).jpg")
    do {
      try dati.write(to: url)
      return url
    } catch {
      return nil
    }
  }

  private func presenta(_ vc: UIViewController) {
    var cima = base ?? Self.controllerInCima()
    while let sopra = cima?.presentedViewController, !sopra.isBeingDismissed {
      cima = sopra
    }
    guard let sopra = cima else {
      fallisci("Nessuna finestra attiva.")
      return
    }
    aperto = vc
    sopra.present(vc, animated: true)
  }

  private static func controllerInCima() -> UIViewController? {
    let scene = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .first { $0.activationState == .foregroundActive } ?? UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
    var vc = scene?.windows.first { $0.isKeyWindow }?.rootViewController ?? scene?.windows.first?.rootViewController
    // Si sale fino all'ultima finestra aperta, saltando quelle che si stanno chiudendo.
    while let sopra = vc?.presentedViewController, !sopra.isBeingDismissed {
      vc = sopra
    }
    return vc
  }
}
