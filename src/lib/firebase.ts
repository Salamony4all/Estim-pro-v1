// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyB8eUTkSoyTc354pBN80UawZw2cmqvw-lw",
  authDomain: "tabula-extract.firebaseapp.com",
  projectId: "tabula-extract",
  storageBucket: "tabula-extract.firebasestorage.app",
  messagingSenderId: "391680985959",
  appId: "1:391680985959:web:0c675472afbf54f3c13dc2"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export { app };
