// Firebase config
const firebaseConfig = {
  apiKey: 'AIzaSyC7rGR0OTIRZ_QQc3RGZ1HB88FhqudyFV0',
  authDomain: 'sigestur-tx.firebaseapp.com',
  databaseURL: 'https://sigestur-tx-default-rtdb.firebaseio.com',
  projectId: 'sigestur-tx',
  storageBucket: 'sigestur-tx.firebasestorage.app',
  messagingSenderId: '53209086687',
  appId: '1:53209086687:web:7f55fbc6325b99346b076a',
};

// Inizializacion de Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

const loginForm = document.getElementById('login-form');
const loginErrorMsg = document.getElementById('login-error-msg');

loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const email = loginForm.username.value;
  const password = loginForm.password.value;

  auth
    .signInWithEmailAndPassword(email, password)
    .then((userCredential) => {
      // Login exitoso
      window.location.href = 'pages/dashboard.html';
    })
    .catch((error) => {
      console.error(error.code, error.message);
      loginErrorMsg.style.opacity = 1;
    });
});
