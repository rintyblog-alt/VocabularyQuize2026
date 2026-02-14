/*
  Copy this file to `config.public.js` and fill in restricted public keys.
  Do not commit `config.public.js`.
*/
window.__PUBLIC_CONFIG__ = {
  firebase: {
    apiKey: "__FIREBASE_API_KEY__",
    authDomain: "__FIREBASE_AUTH_DOMAIN__",
    projectId: "__FIREBASE_PROJECT_ID__",
    storageBucket: "__FIREBASE_STORAGE_BUCKET__",
    messagingSenderId: "__FIREBASE_MESSAGING_SENDER_ID__",
    appId: "__FIREBASE_APP_ID__"
  },
  emailjs: {
    serviceId: "__EMAILJS_SERVICE_ID__",
    templateId: "__EMAILJS_TEMPLATE_ID__",
    publicKey: "__EMAILJS_PUBLIC_KEY__"
  }
};
