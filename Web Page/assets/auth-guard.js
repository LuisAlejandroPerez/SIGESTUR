import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

// Firebase Config
const firebaseConfig = {
  apiKey: 'AIzaSyC7rGR0OTIRZ_QQc3RGZ1HB88FhqudyFV0',
  authDomain: 'sigestur-tx.firebaseapp.com',
  databaseURL: 'https://sigestur-tx-default-rtdb.firebaseio.com',
  projectId: 'sigestur-tx',
  storageBucket: 'sigestur-tx.firebasestorage.app',
  messagingSenderId: '53209086687',
  appId: '1:53209086687:web:7f55fbc6325b99346b076a',
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Verificar si hay usuario logueado
onAuthStateChanged(auth, (user) => {
  if (!user) {
    // Si no esta autenticado, redirige al login
    window.location.href = '../index.html';
  } else {
    // Mostrar el correo del usuario
    document.getElementById('user-email').textContent = user.email;
  }
});
