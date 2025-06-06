// Firestore用の初期化とエクスポート
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.8.0/firebase-firestore.js";

// This file is generated by GitHub Actions during deployment.
// Do not commit this file directly if it contains sensitive information.
export const firebaseConfig = {
    apiKey: "${FIREBASE_API_KEY}",
    authDomain: "${FIREBASE_AUTH_DOMAIN}",
    projectId: "${FIREBASE_PROJECT_ID}",
    storageBucket: "${FIREBASE_STORAGE_BUCKET}",
    messagingSenderId: "${FIREBASE_MESSAGING_SENDER_ID}",
    appId: "${FIREBASE_APP_ID}",
    measurementId: "${FIREBASE_MEASUREMENT_ID}"
};

// Note: The `${VAR_NAME}` syntax is a placeholder.
// The GitHub Actions workflow will replace these placeholders
// with actual values from repository secrets.
// For local development, you might replace these placeholders
// with your actual Firebase config values, but ensure this file
// is listed in .gitignore to avoid committing secrets.

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };