Pod::Spec.new do |s|
  s.name           = 'GestableNativo'
  s.version        = '1.0.0'
  s.summary        = 'GestABLE native bits'
  s.description    = 'Siri / Recents call intents and CarPlay templates for GestABLE.'
  s.author         = 'ticinoWEB'
  s.homepage       = 'https://ticinoweb.com/'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'CarPlay', 'Intents'

  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = "**/*.{h,m,mm,swift}"
end
