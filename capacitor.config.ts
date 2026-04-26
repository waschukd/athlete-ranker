import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sidelinestar.evaluator',
  appName: 'Sideline Star Evaluator',
  webDir: 'public',
  server: {
    // Evaluator app lands directly on the sign-in screen instead of the public
    // marketing landing page. If the user is already authenticated, the app's
    // /account/signin route redirects onward to /evaluator/dashboard.
    url: 'https://sidelinestar.com/account/signin',
    cleartext: false,
    // Without this, Capacitor 8 treats sidelinestar.com as "external" and
    // launches Chrome via Intent.ACTION_VIEW instead of loading in the WebView.
    allowNavigation: ['sidelinestar.com', '*.sidelinestar.com'],
  },
  plugins: {
    SpeechRecognition: {
      language: 'en-US',
    },
  },
};

export default config;
