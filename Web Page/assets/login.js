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
const usernameField = document.getElementById('username-field');
const passwordField = document.getElementById('password-field');
const submitButton = document.getElementById('login-form-submit');

// Funcion para mostrar el mensaje de error
function showError(message = 'Usuario o Contraseña Invalido') {
  loginErrorMsg.textContent = message;
  loginErrorMsg.classList.add('show');

  // Agregar clase de error a los campos
  usernameField.classList.add('error');
  passwordField.classList.add('error');

  // Remover el mensaje despues de 5 segundos
  setTimeout(() => {
    hideError();
  }, 5000);
}

// Funcion para ocultar el mensaje de error
function hideError() {
  loginErrorMsg.classList.remove('show');
  usernameField.classList.remove('error');
  passwordField.classList.remove('error');
}

// Funcion para limpiar errores cuando el usuario empiece a escribir
function clearErrorsOnInput() {
  hideError();
}

// Event listeners para limpiar errores
usernameField.addEventListener('input', clearErrorsOnInput);
passwordField.addEventListener('input', clearErrorsOnInput);

loginForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const email = loginForm.username.value.trim();
  const password = loginForm.password.value;

  // Validacion basica
  if (!email || !password) {
    showError('Por favor, llenar todos los campos');
    return;
  }

  // Deshabilitar el boton durante el proceso
  submitButton.disabled = true;
  submitButton.textContent = 'Logging in...';

  // Ocultar errores previos
  hideError();

  // Iniciar sesion con Firebase
  signInWithEmailAndPassword(auth, email, password)
    .then((userCredential) => {
      console.log('Inicio de sesion exitoso:', userCredential.user);
      window.location.href = 'pages/dashboard.html'; // Redirige al dashboard
    })
    .catch((error) => {
      console.error('Error de inicio de sesion:', error.message);

      // Mostrar mensaje de error especifico basado en el codigo de error
      let errorMessage = 'Usuario o Contraseña Invalido';

      switch (error.code) {
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          errorMessage = 'Usuario o Contraseña Invalido';
          break;
        case 'auth/too-many-requests':
          errorMessage =
            'Demasiados intentos fallidos. Intentalo de nuevo mas tarde.';
          break;
        case 'auth/network-request-failed':
          errorMessage = 'Error de red. Por favor, revise su conexion.';
          break;
        default:
          errorMessage = 'Error al iniciar sesion. Favor intentarlo de nuevo.';
      }

      showError(errorMessage);
    })
    .finally(() => {
      // Rehabilitar el boton
      submitButton.disabled = false;
      submitButton.textContent = 'Login';
    });
});
