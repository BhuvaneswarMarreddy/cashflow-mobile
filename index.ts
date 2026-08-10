import { registerRootComponent } from 'expo';

import App from './src/App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures the environment is set up correctly in both Expo Go and a
// native build.
registerRootComponent(App);
