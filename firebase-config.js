// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCfragjh50KQRj5G6jm7fZdR2bI2NoQsdk",
  authDomain: "pakbet-b0abe.firebaseapp.com",
  projectId: "pakbet-b0abe",
  storageBucket: "pakbet-b0abe.appspot.com",
  messagingSenderId: "499452911724",
  appId: "1:499452911724:web:7b0e314d16dce8a6dcb849",
  measurementId: "G-QPLND82T33"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };
