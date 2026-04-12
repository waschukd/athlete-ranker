import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sidelinestar.evaluator',
  appName: 'Sideline Star Evaluator',
  webDir: 'public',
  server: {
    url: 'https://sidelinestar.com',
    cleartext: false,
  },
  plugins: {
    SpeechRecognition: {
      language: 'en-US',
    },
  },
};

export default config;
