// Importaciones
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth,
  signInWithEmailAndPassword,
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

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const loginForm = document.getElementById('login-form');
const loginErrorMsg = document.getElementById('login-error-msg');

loginForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const email = loginForm.username.value;
  const password = loginForm.password.value;

  // Iniciar sesion con Firebase
  signInWithEmailAndPassword(auth, email, password)
    .then((userCredential) => {
      console.log('Inicio de sesion exitoso:', userCredential.user);
      window.location.href = 'pages/dashboard.html'; // Redirige al dashboard
    })
    .catch((error) => {
      console.error('Error de inicio de sesion:', error.message);
      loginErrorMsg.style.opacity = 1;
    });
});
