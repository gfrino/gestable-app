/**
 * CarPlay e Siri per GestABLE (iOS).
 *
 * - Siri «Chiama Mario con GestABLE» e i tocchi sulle chiamate nei Recenti del
 *   Telefono: INStartCallIntent, gestito dentro l'app (AppDelegate ->
 *   IntentiGestable del modulo gestable-nativo) e inoltrato a JS.
 * - CarPlay (app di comunicazione): scena CarPlay nel manifest delle scene e
 *   CarPlaySceneDelegate nel target dell'app, che collega i template
 *   (CarPlayPonte) e avvia il JavaScript senza finestra ("GestableAuto", vedi
 *   index.ts), cosi' funziona anche con l'app chiusa e il telefono bloccato.
 * - Entitlement com.apple.developer.carplay-communication: lo concede Apple su
 *   richiesta (store/carplay-entitlement-request.md). Finche' non e' sull'App
 *   ID la firma fallirebbe: si aggiunge solo con CARPLAY_ENTITLED=1 (eas.json
 *   dopo l'approvazione, o per il simulatore).
 *
 * La scena CarPlay si aggiunge al manifest; ./plugins/ciclo-scene-ios scrive solo
 * quella del telefono e tiene le altre.
 */

const fs = require('fs')
const path = require('path')
const {
  IOSConfig,
  withAppDelegate,
  withDangerousMod,
  withEntitlementsPlist,
  withInfoPlist,
  withXcodeProject,
} = require('expo/config-plugins')

const CARPLAY = 'com.apple.developer.carplay-communication'

const DELEGATO_AUTO = `import CarPlay
internal import Expo
internal import GestableNativo
import React

/// Scena CarPlay di GestABLE (generata da plugins/carplay-siri.js).
@objc(CarPlaySceneDelegate)
class CarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
  /// Superficie React Native senza finestra che manda all'auto recenti e frequenti.
  private static var radiceAuto: UIView?

  func templateApplicationScene(
    _ templateApplicationScene: CPTemplateApplicationScene,
    didConnect interfaceController: CPInterfaceController
  ) {
    CarPlayPonte.shared.collega(interfaceController)
    Self.avviaJavaScript()
  }

  func templateApplicationScene(
    _ templateApplicationScene: CPTemplateApplicationScene,
    didDisconnectInterfaceController interfaceController: CPInterfaceController
  ) {
    CarPlayPonte.shared.scollega()
    Self.radiceAuto = nil
  }

  /// Avvia (o riusa) il runtime JS dell'app e monta il componente "GestableAuto".
  private static func avviaJavaScript() {
    guard radiceAuto == nil,
      let provider = UIApplication.shared.delegate as? ExpoReactNativeFactoryProvider,
      let factory = provider.reactNativeFactory
    else { return }
    radiceAuto = factory.rootViewFactory.view(withModuleName: "GestableAuto")
  }
}
`

const GESTORE_SIRI = `
  // Siri: «Chiama ... con GestABLE» (plugins/carplay-siri.js).
  @objc func application(_ application: UIApplication, handlerFor intent: INIntent) -> Any? {
    return IntentiGestable.gestore(per: intent)
  }
`

function conInfoPlist(config) {
  return withInfoPlist(config, (cfg) => {
    const p = cfg.modResults
    // La scena CarPlay si dichiara solo con l'entitlement (stessa condizione di conEntitlement).
    if (process.env.CARPLAY_ENTITLED === '1') {
      const manifest = p.UIApplicationSceneManifest || { UIApplicationSupportsMultipleScenes: false, UISceneConfigurations: {} }
      manifest.UISceneConfigurations = {
        ...manifest.UISceneConfigurations,
        CPTemplateApplicationSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'CarPlay',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).CarPlaySceneDelegate',
          },
        ],
      }
      p.UIApplicationSceneManifest = manifest
    }
    p.NSUserActivityTypes = [...new Set([...(p.NSUserActivityTypes || []), 'INStartCallIntent'])]
    p.INIntentsSupported = [...new Set([...(p.INIntentsSupported || []), 'INStartCallIntent'])]
    p.NSSiriUsageDescription =
      p.NSSiriUsageDescription || 'Con Siri puoi chiamare i tuoi contatti con il numero dell’ufficio, anche in auto.'
    return cfg
  })
}

function conEntitlement(config) {
  return withEntitlementsPlist(config, (cfg) => {
    cfg.modResults['com.apple.developer.siri'] = true
    if (process.env.CARPLAY_ENTITLED === '1') {
      cfg.modResults[CARPLAY] = true
    } else {
      delete cfg.modResults[CARPLAY]
    }
    return cfg
  })
}

function conAppDelegate(config) {
  return withAppDelegate(config, (cfg) => {
    let codice = cfg.modResults.contents
    if (cfg.modResults.language !== 'swift' || codice.includes('IntentiGestable')) {
      return cfg
    }
    if (!codice.includes('  // Linking API')) {
      throw new Error('carplay-siri: AppDelegate diverso da quello atteso, controllare il plugin.')
    }
    codice = codice.replace('internal import Expo\n', 'internal import Expo\ninternal import GestableNativo\nimport Intents\n')
    codice = codice.replace('  // Linking API', `${GESTORE_SIRI.trimStart().replace(/^/, '  ')}\n  // Linking API`)
    cfg.modResults.contents = codice
    return cfg
  })
}

function conFile(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const nome = IOSConfig.XcodeUtils.getProjectName(cfg.modRequest.projectRoot)
      await fs.promises.writeFile(path.join(cfg.modRequest.platformProjectRoot, nome, 'CarPlaySceneDelegate.swift'), DELEGATO_AUTO)
      return cfg
    },
  ])
}

function conProgetto(config) {
  return withXcodeProject(config, (cfg) => {
    const progetto = cfg.modResults
    const nome = IOSConfig.XcodeUtils.getProjectName(cfg.modRequest.projectRoot)
    const percorso = `${nome}/CarPlaySceneDelegate.swift`
    if (!progetto.hasFile(percorso)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({ filepath: percorso, groupName: nome, project: progetto })
    }
    return cfg
  })
}

module.exports = function carplaySiri(config) {
  return conProgetto(conFile(conAppDelegate(conEntitlement(conInfoPlist(config)))))
}
