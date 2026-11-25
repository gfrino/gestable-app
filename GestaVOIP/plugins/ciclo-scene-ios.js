/**
 * Ciclo di vita a scene per iOS.
 *
 * Le app compilate con l'SDK di iOS 27 non partono se non adottano le scene
 * (UIScene): il sistema le chiude all'avvio. Il modello nativo di Expo SDK 57
 * crea ancora la finestra nell'AppDelegate; quello di SDK 58 usa un
 * SceneDelegate che eredita da ExpoAppSceneDelegate (gia' presente nel
 * pacchetto expo 57). Questo plugin porta la stessa soluzione nella 57:
 *
 * - AppDelegate: conforme a ExpoReactNativeFactoryProvider, senza creare la
 *   finestra (la crea la scena);
 * - SceneDelegate.swift aggiunto al progetto Xcode;
 * - UIApplicationSceneManifest in Info.plist.
 *
 * Se l'AppDelegate e' gia' quello nuovo (aggiornamento a SDK 58) non fa nulla:
 * si puo' togliere quando si passa alla 58.
 */

const fs = require('fs')
const path = require('path')
const {
  IOSConfig,
  withAppDelegate,
  withDangerousMod,
  withInfoPlist,
  withXcodeProject,
} = require('expo/config-plugins')

const SCENE_DELEGATE = `internal import Expo

@objc(SceneDelegate)
class SceneDelegate: ExpoAppSceneDelegate {
  // Punto di estensione per i config plugin.
}
`

const FINESTRA = /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\)\n#endif\n/

function conAppDelegate(config) {
  return withAppDelegate(config, (cfg) => {
    let codice = cfg.modResults.contents
    if (cfg.modResults.language !== 'swift' || codice.includes('ExpoReactNativeFactoryProvider')) {
      return cfg
    }
    if (!FINESTRA.test(codice) || !codice.includes('class AppDelegate: ExpoAppDelegate {')) {
      throw new Error('ciclo-scene-ios: AppDelegate diverso da quello atteso, controllare il plugin.')
    }
    codice = codice.replace(
      'class AppDelegate: ExpoAppDelegate {',
      'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {',
    )
    codice = codice.replace(
      FINESTRA,
      '\n    // La finestra la crea SceneDelegate (ciclo di vita a scene, iOS 27).\n',
    )
    cfg.modResults.contents = codice
    return cfg
  })
}

function conFile(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const nome = IOSConfig.XcodeUtils.getProjectName(cfg.modRequest.projectRoot)
      const file = path.join(cfg.modRequest.platformProjectRoot, nome, 'SceneDelegate.swift')
      if (!fs.existsSync(file)) {
        fs.writeFileSync(file, SCENE_DELEGATE)
      }
      return cfg
    },
  ])
}

function conProgetto(config) {
  return withXcodeProject(config, (cfg) => {
    const progetto = cfg.modResults
    const nome = IOSConfig.XcodeUtils.getProjectName(cfg.modRequest.projectRoot)
    const percorso = `${nome}/SceneDelegate.swift`
    if (!progetto.hasFile(percorso)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({ filepath: percorso, groupName: nome, project: progetto })
    }
    return cfg
  })
}

function conInfoPlist(config) {
  return withInfoPlist(config, (cfg) => {
    // Le altre scene (CarPlay, da plugins/carplay-siri.js) restano: si sostituisce solo quella del telefono.
    const prima = cfg.modResults.UIApplicationSceneManifest?.UISceneConfigurations || {}
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        ...prima,
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    }
    return cfg
  })
}

module.exports = function cicloSceneIos(config) {
  return conInfoPlist(conProgetto(conFile(conAppDelegate(config))))
}
