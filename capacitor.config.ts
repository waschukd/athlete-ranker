import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sidelinestar.evaluator',
  appName: 'Sideline Star Evaluator',
  webDir: 'public',
  server: {
    // Evaluator app lands directly on the login screen instead of the public
    // marketing landing page. If the user is already authenticated, the app's
    // /account/login route redirects to /evaluator.
    url: 'https://sidelinestar.com/account/login',
    cleartext: false,
  },
  plugins: {
    SpeechRecognition: {
      language: 'en-US',
    },
  },
};

export default config;
