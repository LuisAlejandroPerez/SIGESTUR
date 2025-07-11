import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getDatabase } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

// Firebase configuration
export const firebaseConfig = {
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

// Initialize Firebase services
export const auth = getAuth(app);
export const database = getDatabase(app);
export const storage = getStorage(app);

// Constants
export const SANTO_DOMINGO_CENTER = { lat: 18.4861, lng: -69.9312 };

// Driver information (manually added for now)
export const driverInfo = {
  C19A: {
    name: 'Juan Pérez',
    phone: '+1-809-555-0101',
    id: 'DRV001',
  },
  C19D: {
    name: 'María González',
    phone: '+1-809-555-0102',
    id: 'DRV002',
  },
  C19M: {
    name: 'Carlos Rodríguez',
    phone: '+1-809-555-0103',
    id: 'DRV003',
  },
  C19O: {
    name: 'Ana Martínez',
    phone: '+1-809-555-0104',
    id: 'DRV004',
  },
  C19S: {
    name: 'Luis Fernández',
    phone: '+1-809-555-0105',
    id: 'DRV005',
  },
  C19X: {
    name: 'Roberto Silva',
    phone: '+1-809-555-0106',
    id: 'DRV006',
  },
};

// FontAwesome Bus Icons (SVG)
export const busIconSVG = (color = '#4CAF50') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" width="32" height="32">
    <path fill="${color}" d="M224 0C348.8 0 448 35.2 448 80l0 16 0 320c0 17.7-14.3 32-32 32l0 32c0 17.7-14.3 32-32 32l-32 0c-17.7 0-32-14.3-32-32l0-32-192 0 0 32c0 17.7-14.3 32-32 32l-32 0c-17.7 0-32-14.3-32-32L0 96 0 80C0 35.2 99.2 0 224 0zM64 128l0 128c0 17.7 14.3 32 32 32l256 0c17.7 0 32-14.3 32-32l0-128c0-17.7-14.3-32-32-32L96 96c-17.7 0-32 14.3-32 32zM80 400a32 32 0 1 0 0-64 32 32 0 1 0 0 64zm288 0a32 32 0 1 0 0-64 32 32 0 1 0 0 64z"/>
  </svg>`;
