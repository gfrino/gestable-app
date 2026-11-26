Pod::Spec.new do |s|
  s.name           = 'GestableNativo'
  s.version        = '1.0.0'
  s.summary        = 'GestABLE native bits'
  s.description    = 'Siri / Recents call intents, CarPlay templates and the receipt scanner for GestABLE.'
  s.author         = 'ticinoWEB'
  s.homepage       = 'https://ticinoweb.com/'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'CarPlay', 'Intents', 'VisionKit', 'PhotosUI', 'Vision'
  # FoundationModels c'e' solo da iOS 26: collegata «weak», l'app parte anche su iOS 16-25.
  s.weak_frameworks = 'FoundationModels'

  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'OTHER_LDFLAGS' => '$(inherited) -weak_framework FoundationModels' }
  s.source_files = "**/*.{h,m,mm,swift}"
end
