// Punto d'ingresso: l'app (Expo Router) e la superficie senza finestra di CarPlay.
import { AppRegistry } from 'react-native'
import 'expo-router/entry'
import { RadiceAuto } from './src/auto/RadiceAuto'

// CarPlay: avviata dalla scena dell'auto (plugins/carplay-siri.js), anche ad app chiusa.
AppRegistry.registerComponent('GestableAuto', () => RadiceAuto)
