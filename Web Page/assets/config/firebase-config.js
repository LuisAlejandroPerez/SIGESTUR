import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getDatabase } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

// Configuracion de Firebase
export const firebaseConfig = {
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

// Inicializar servicios de Firebase
export const auth = getAuth(app);
export const database = getDatabase(app);
export const storage = getStorage(app);

// Constante de SD
export const SANTO_DOMINGO_CENTER = { lat: 18.4861, lng: -69.9312 };

// Informacion de Conductores (hardcoded)
export const driverInfo = {
  C19A: {
    name: 'Luis Perez',
    phone: '+1-829-098-0101',
    id: 'DRV001',
  },
  C19D: {
    name: 'Juan Perez',
    phone: '+1-829-555-0102',
    id: 'DRV002',
  },
  C19M: {
    name: 'Carlos Rodriguez',
    phone: '+1-829-515-0103',
    id: 'DRV003',
  },
  C19O: {
    name: 'Pedro Maria',
    phone: '+1-829-902-0104',
    id: 'DRV004',
  },
  C19S: {
    name: 'Sebastian Cespedes',
    phone: '+1-829-123-0205',
    id: 'DRV005',
  },
  C19X: {
    name: 'Roberto Rodriguez',
    phone: '+1-829-525-0106',
    id: 'DRV006',
  },
};

// Icono de BUS-FontAwesome
export const busIconSVG = (color = '#4CAF50') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" width="32" height="32">
    <path fill="${color}" d="M224 0C348.8 0 448 35.2 448 80l0 16 0 320c0 17.7-14.3 32-32 32l0 32c0 17.7-14.3 32-32 32l-32 0c-17.7 0-32-14.3-32-32l0-32-192 0 0 32c0 17.7-14.3 32-32 32l-32 0c-17.7 0-32-14.3-32-32L0 96 0 80C0 35.2 99.2 0 224 0zM64 128l0 128c0 17.7 14.3 32 32 32l256 0c17.7 0 32-14.3 32-32l0-128c0-17.7-14.3-32-32-32L96 96c-17.7 0-32 14.3-32 32zM80 400a32 32 0 1 0 0-64 32 32 0 1 0 0 64zm288 0a32 32 0 1 0 0-64 32 32 0 1 0 0 64z"/>
  </svg>`;
