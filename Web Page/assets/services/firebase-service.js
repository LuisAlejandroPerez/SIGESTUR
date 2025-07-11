import {
  signOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  ref,
  onValue,
  off,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import {
  ref as storageRef,
  getDownloadURL,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

import { auth, database, storage } from '../config/firebase-config.js';

// Firebase service class
export class FirebaseService {
  constructor() {
    this.gpsDataListener = null;
  }

  // Metodos de autenticacion
  onAuthStateChanged(callback) {
    return onAuthStateChanged(auth, callback);
  }

  async signOut() {
    try {
      await signOut(auth);
      console.log('User signed out successfully');
      return true;
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  }

  // Real-time data methods
  startGPSDataListener(callback) {
    console.log('Starting real-time GPS data listener...');
    const gpsDataRef = ref(database, 'gps_data');

    this.gpsDataListener = onValue(
      gpsDataRef,
      (snapshot) => {
        const data = snapshot.val();
        console.log('GPS data received:', data ? 'Data available' : 'No data');
        callback(data);
      },
      (error) => {
        console.error('Error listening to GPS data:', error);
        throw error;
      }
    );

    return this.gpsDataListener;
  }

  stopGPSDataListener() {
    if (this.gpsDataListener) {
      const gpsDataRef = ref(database, 'gps_data');
      off(gpsDataRef);
      this.gpsDataListener = null;
      console.log('GPS data listener stopped');
    }
  }

  // Metodos de almacenamiento
  async getFileDownloadURL(filePath) {
    try {
      const fileRef = storageRef(storage, filePath);
      const downloadURL = await getDownloadURL(fileRef);
      return downloadURL;
    } catch (error) {
      console.error(`Error getting download URL for ${filePath}:`, error);
      throw error;
    }
  }

  // Cleanup method
  cleanup() {
    this.stopGPSDataListener();
  }
}

// Instancia singleton
export const firebaseService = new FirebaseService();
