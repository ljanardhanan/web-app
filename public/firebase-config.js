<script type="module">
// Import the functions you need from the SDKs you need
// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
//import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBv1kZ3m5Zb0xzMogVkjhWaNPoUE_cfgRc",
  authDomain: "bus-tracker-fba2a.firebaseapp.com",
  projectId: "bus-tracker-fba2a",
  storageBucket: "bus-tracker-fba2a.firebasestorage.app",
  messagingSenderId: "434637310424",
  appId: "1:434637310424:web:47f7a809cbc043648d4aad",
  measurementId: "G-7K38G4WCWM"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
const analytics = getAnalytics(app);
</script>