import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth,
  signOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getDatabase,
  ref,
  onValue,
  off,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

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
const database = getDatabase(app);

// Global variables
let map;
let busMarkers = new Map();
let stopMarkers = new Map();
let gtfsData = null;
let currentUser = null;
let gpsDataListener = null;

// Santo Domingo coordinates
const SANTO_DOMINGO_CENTER = { lat: 18.4861, lng: -69.9312 };

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  initializeAuth();
  setupEventListeners();
});

// Authentication
function initializeAuth() {
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.href = '../index.html';
    } else {
      currentUser = user;
      const userEmailElement = document.getElementById('user-email');
      if (userEmailElement) {
        userEmailElement.textContent = user.email;
      }
      initializeApplication();
    }
  });
}

// Setup event listeners
function setupEventListeners() {
  // Logout button
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }

  // Map controls
  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', refreshData);
  }

  const centerMapBtn = document.getElementById('center-map-btn');
  if (centerMapBtn) {
    centerMapBtn.addEventListener('click', centerMap);
  }

  // Modal close
  const closeBtn = document.querySelector('.close');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeModal);
  }

  const modal = document.getElementById('bus-modal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target.id === 'bus-modal') {
        closeModal();
      }
    });
  }
}

// Handle logout properly
function handleLogout() {
  try {
    // Clean up listeners before logout
    if (gpsDataListener) {
      const gpsDataRef = ref(database, 'gps_data');
      off(gpsDataRef);
      gpsDataListener = null;
    }

    signOut(auth)
      .then(() => {
        console.log('User signed out successfully');
        window.location.href = '../index.html';
      })
      .catch((error) => {
        console.error('Error signing out:', error);
        showAlert('Error al cerrar sesión');
      });
  } catch (error) {
    console.error('Error in logout handler:', error);
    showAlert('Error al cerrar sesión');
  }
}

// Initialize the main application
async function initializeApplication() {
  try {
    console.log('Initializing SIGESTUR Dashboard...');

    // Load GTFS data first
    await loadGTFSData();

    // Start listening to real-time bus data
    startRealtimeDataListener();
  } catch (error) {
    console.error('Error initializing app:', error);
    showAlert('Error al inicializar la aplicación');
  }
}

// Google Maps initialization (called by Google Maps API)
window.dashboardInitMap = function () {
  console.log('Initializing Google Maps...');

  const mapElement = document.getElementById('map');
  if (!mapElement) {
    console.error('Map element not found');
    return;
  }

  try {
    map = new google.maps.Map(mapElement, {
      zoom: 12,
      center: SANTO_DOMINGO_CENTER,
      mapTypeId: 'roadmap',
      styles: [
        {
          featureType: 'transit',
          elementType: 'labels.icon',
          stylers: [{ visibility: 'off' }],
        },
      ],
    });

    console.log('Google Maps initialized successfully');

    // Load stops if GTFS data is available
    if (gtfsData && gtfsData.stops) {
      loadStopsOnMap();
    }
  } catch (error) {
    console.error('Error initializing Google Maps:', error);
    showAlert('Error al inicializar el mapa');
  }
};

// Load GTFS data from local files
async function loadGTFSData() {
  try {
    console.log('Loading GTFS data from local files...');

    // Load stops data
    const stopsResponse = await fetch('../../STATIC GTFS/stops.txt');
    if (!stopsResponse.ok) throw new Error('Failed to load stops.txt');
    const stopsText = await stopsResponse.text();

    // Load routes data
    const routesResponse = await fetch('../../STATIC GTFS/routes.txt');
    if (!routesResponse.ok) throw new Error('Failed to load routes.txt');
    const routesText = await routesResponse.text();

    // Load trips data
    const tripsResponse = await fetch('../../STATIC GTFS/trips.txt');
    if (!tripsResponse.ok) throw new Error('Failed to load trips.txt');
    const tripsText = await tripsResponse.text();

    // Parse the data
    gtfsData = {
      stops: parseGTFSStops(stopsText),
      routes: parseGTFSRoutes(routesText),
      trips: parseGTFSTrips(tripsText),
    };

    console.log('GTFS data loaded successfully:', {
      stops: gtfsData.stops.length,
      routes: gtfsData.routes.length,
      trips: gtfsData.trips.length,
    });

    updateStopsCounter();
  } catch (error) {
    console.error('Error loading GTFS data:', error);
    // Fallback to mock data
    gtfsData = {
      stops: getMockStops(),
      routes: [],
      trips: [],
    };
    updateStopsCounter();
    showAlert('Error cargando datos GTFS, usando datos de prueba', 'warning');
  }
}

// Parse GTFS stops data
function parseGTFSStops(csvText) {
  const lines = csvText.split('\n');
  if (lines.length === 0) return [];

  const headers = lines[0].split(',').map((h) => h.trim());
  const stops = [];

  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim()) {
      const values = lines[i].split(',');
      const stop = {};

      headers.forEach((header, index) => {
        stop[header] = values[index]
          ? values[index].trim().replace(/"/g, '')
          : '';
      });

      if (stop.stop_lat && stop.stop_lon) {
        const lat = parseFloat(stop.stop_lat);
        const lng = parseFloat(stop.stop_lon);

        if (!isNaN(lat) && !isNaN(lng)) {
          stops.push({
            id: stop.stop_id,
            name: stop.stop_name || `Parada ${stop.stop_id}`,
            lat: lat,
            lng: lng,
            code: stop.stop_code || '',
          });
        }
      }
    }
  }

  return stops;
}

// Parse GTFS routes data
function parseGTFSRoutes(csvText) {
  const lines = csvText.split('\n');
  if (lines.length === 0) return [];

  const headers = lines[0].split(',').map((h) => h.trim());
  const routes = [];

  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim()) {
      const values = lines[i].split(',');
      const route = {};

      headers.forEach((header, index) => {
        route[header] = values[index]
          ? values[index].trim().replace(/"/g, '')
          : '';
      });

      if (route.route_id) {
        routes.push({
          id: route.route_id,
          shortName: route.route_short_name || '',
          longName: route.route_long_name || '',
          type: route.route_type || '',
          color: route.route_color || '3498db',
        });
      }
    }
  }

  return routes;
}

// Parse GTFS trips data
function parseGTFSTrips(csvText) {
  const lines = csvText.split('\n');
  if (lines.length === 0) return [];

  const headers = lines[0].split(',').map((h) => h.trim());
  const trips = [];

  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim()) {
      const values = lines[i].split(',');
      const trip = {};

      headers.forEach((header, index) => {
        trip[header] = values[index]
          ? values[index].trim().replace(/"/g, '')
          : '';
      });

      if (trip.trip_id) {
        trips.push({
          id: trip.trip_id,
          routeId: trip.route_id,
          serviceId: trip.service_id,
          headsign: trip.trip_headsign || '',
          directionId: trip.direction_id || '0',
        });
      }
    }
  }

  return trips;
}

// Mock stops data for development (Santo Domingo area)
function getMockStops() {
  return [
    {
      id: 'stop_001',
      name: 'Parada Centro Olímpico',
      lat: 18.4861,
      lng: -69.9312,
    },
    {
      id: 'stop_002',
      name: 'Parada Plaza de la Cultura',
      lat: 18.4691,
      lng: -69.9312,
    },
    { id: 'stop_003', name: 'Parada Malecón', lat: 18.4631, lng: -69.8821 },
    {
      id: 'stop_004',
      name: 'Parada Zona Colonial',
      lat: 18.4721,
      lng: -69.8821,
    },
    {
      id: 'stop_005',
      name: 'Parada Av. 27 de Febrero',
      lat: 18.4891,
      lng: -69.9112,
    },
  ];
}

// Load stops on map
function loadStopsOnMap() {
  if (!map || !gtfsData || !gtfsData.stops) return;

  console.log('Loading stops on map...');

  gtfsData.stops.forEach((stop) => {
    try {
      const marker = new google.maps.Marker({
        position: { lat: stop.lat, lng: stop.lng },
        map: map,
        title: stop.name,
        icon: {
          url:
            'data:image/svg+xml;charset=UTF-8,' +
            encodeURIComponent(`
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="8" fill="#3498db" stroke="white" stroke-width="2"/>
              <circle cx="12" cy="12" r="3" fill="white"/>
            </svg>
          `),
          scaledSize: new google.maps.Size(24, 24),
          anchor: new google.maps.Point(12, 12),
        },
      });

      // Add info window for stop
      const infoWindow = new google.maps.InfoWindow({
        content: `
          <div style="padding: 10px;">
            <h3 style="margin: 0 0 5px 0; color: #2c3e50;">${stop.name}</h3>
            <p style="margin: 0; color: #7f8c8d; font-size: 12px;">ID: ${
              stop.id
            }</p>
            ${
              stop.code
                ? `<p style="margin: 0; color: #7f8c8d; font-size: 12px;">Código: ${stop.code}</p>`
                : ''
            }
          </div>
        `,
      });

      marker.addListener('click', () => {
        infoWindow.open(map, marker);
      });

      stopMarkers.set(stop.id, marker);
    } catch (error) {
      console.error('Error creating stop marker:', error);
    }
  });

  console.log(`Loaded ${gtfsData.stops.length} stops on map`);
}

// Start listening to real-time bus data
function startRealtimeDataListener() {
  console.log('Starting real-time data listener...');

  const gpsDataRef = ref(database, 'gps_data');

  gpsDataListener = onValue(
    gpsDataRef,
    (snapshot) => {
      const data = snapshot.val();
      if (data) {
        processBusData(data);
      } else {
        console.log('No GPS data available');
        updateBusCounters(0, 0);
        updateBusList([], []);
        updateAlerts([]);
      }
    },
    (error) => {
      console.error('Error listening to GPS data:', error);
      showAlert('Error conectando con datos en tiempo real');
    }
  );
}

// Process bus data from Firebase
// Process bus data from Firebase
function processBusData(gpsData) {
  console.log('Processing bus data:', gpsData);

  const activeBuses = [];
  const brokenBuses = [];

  // Clear existing bus markers
  busMarkers.forEach((marker) => marker.setMap(null));
  busMarkers.clear();

  // Process each trip
  Object.keys(gpsData).forEach((tripId) => {
    const tripData = gpsData[tripId];

    Object.keys(tripData).forEach((busId) => {
      const busData = tripData[busId];

      // Get trip information from GTFS data
      const tripInfo =
        gtfsData && gtfsData.trips
          ? gtfsData.trips.find((trip) => trip.id === tripId)
          : null;

      const routeInfo =
        tripInfo && gtfsData.routes
          ? gtfsData.routes.find((route) => route.id === tripInfo.routeId)
          : null;

      // Check if bus is broken (coordinates are 0,0)
      const isBroken = busData.latitude === 0 && busData.longitude === 0;

      const busInfo = {
        id: busId,
        tripId,
        data: busData,
        tripInfo,
        routeInfo,
        isBroken,
      };

      if (isBroken) {
        brokenBuses.push(busInfo);
      } else {
        activeBuses.push(busInfo);
        createBusMarker(busInfo);
      }
    });
  });

  // Update UI
  updateBusCounters(activeBuses.length, brokenBuses.length);
  updateBusList(activeBuses, brokenBuses);
  updateAlerts(brokenBuses);
}

// Create bus marker on map
function createBusMarker(busInfo) {
  if (!map) return;

  const { id: busId, tripId, data: busData, routeInfo, isBroken } = busInfo;

  const position = {
    lat: parseFloat(busData.latitude),
    lng: parseFloat(busData.longitude),
  };

  // Validate coordinates
  if (isNaN(position.lat) || isNaN(position.lng)) {
    console.warn(`Invalid coordinates for bus ${busId}:`, position);
    return;
  }

  // Use route color if available, otherwise default colors
  const iconColor = isBroken
    ? '#e74c3c'
    : routeInfo && routeInfo.color
    ? `#${routeInfo.color}`
    : '#27ae60';

  const iconSvg = `
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="4" y="8" width="24" height="16" rx="2" fill="${iconColor}" stroke="white" stroke-width="2"/>
        <rect x="6" y="10" width="20" height="8" fill="white" opacity="0.3"/>
        <circle cx="10" cy="26" r="2" fill="${iconColor}"/>
        <circle cx="22" cy="26" r="2" fill="${iconColor}"/>
        <rect x="14" y="6" width="4" height="2" fill="${iconColor}"/>
        ${
          isBroken
            ? '<text x="16" y="18" text-anchor="middle" fill="white" font-size="12">!</text>'
            : ''
        }
        ${
          routeInfo && routeInfo.shortName && !isBroken
            ? `<text x="16" y="18" text-anchor="middle" fill="white" font-size="8">${routeInfo.shortName}</text>`
            : ''
        }
      </svg>
    `;

  try {
    const marker = new google.maps.Marker({
      position: position,
      map: map,
      title: `Bus ${busId} - ${routeInfo ? routeInfo.shortName : tripId}`,
      icon: {
        url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(iconSvg),
        scaledSize: new google.maps.Size(32, 32),
        anchor: new google.maps.Point(16, 26),
      },
    });

    // Add click listener to show bus info
    marker.addListener('click', () => {
      showBusInfo(busInfo);
    });

    busMarkers.set(busId, marker);
  } catch (error) {
    console.error('Error creating bus marker:', error);
  }
}

// Show bus information modal
function showBusInfo(busInfo) {
  const {
    id: busId,
    tripId,
    data: busData,
    tripInfo,
    routeInfo,
    isBroken,
  } = busInfo;
  const modal = document.getElementById('bus-modal');
  const content = document.getElementById('bus-info-content');

  if (!modal || !content) {
    console.error('Modal elements not found');
    return;
  }

  const timestamp = new Date(busData.timestamp * 1000).toLocaleString();

  content.innerHTML = `
      <div class="bus-info">
        <div class="info-row">
          <strong>ID del Bus:</strong> 
          <span>${busId}</span>
        </div>
        <div class="info-row">
          <strong>ID del Viaje:</strong> 
          <span>${tripId}</span>
        </div>
        ${
          routeInfo
            ? `
          <div class="info-row">
            <strong>Ruta:</strong> 
            <span>${routeInfo.shortName} - ${routeInfo.longName}</span>
          </div>
        `
            : ''
        }
        ${
          tripInfo && tripInfo.headsign
            ? `
          <div class="info-row">
            <strong>Destino:</strong> 
            <span>${tripInfo.headsign}</span>
          </div>
        `
            : ''
        }
        <div class="info-row">
          <strong>Estado:</strong> 
          <span class="status-badge ${isBroken ? 'broken' : 'active'}">
            ${isBroken ? 'Averiado' : 'Activo'}
          </span>
        </div>
        <div class="info-row">
          <strong>Dirección:</strong> 
          <span>${busData.direction_id === '0' ? 'Ida' : 'Vuelta'}</span>
        </div>
        <div class="info-row">
          <strong>Coordenadas:</strong> 
          <span>${busData.latitude}, ${busData.longitude}</span>
        </div>
        <div class="info-row">
          <strong>Última Actualización:</strong> 
          <span>${timestamp}</span>
        </div>
        ${
          isBroken
            ? '<div class="alert-message">⚠️ Este bus está reportado como averiado</div>'
            : ''
        }
      </div>
    `;

  modal.style.display = 'block';
}

// Close modal
function closeModal() {
  const modal = document.getElementById('bus-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

// Update counters
function updateBusCounters(active, broken) {
  const totalBusesElement = document.getElementById('total-buses');
  const brokenBusesElement = document.getElementById('broken-buses');

  if (totalBusesElement) totalBusesElement.textContent = active;
  if (brokenBusesElement) brokenBusesElement.textContent = broken;
}

function updateStopsCounter() {
  const stopsCount = gtfsData && gtfsData.stops ? gtfsData.stops.length : 0;
  const totalStopsElement = document.getElementById('total-stops');
  if (totalStopsElement) {
    totalStopsElement.textContent = stopsCount;
  }
}

// Update buses list in sidebar
function updateBusList(activeBuses, brokenBuses) {
  const busesList = document.getElementById('buses-list');
  if (!busesList) return;

  busesList.innerHTML = '';

  // Add active buses
  activeBuses.forEach((busInfo) => {
    const busItem = createBusListItem(busInfo, false);
    busesList.appendChild(busItem);
  });

  // Add broken buses
  brokenBuses.forEach((busInfo) => {
    const busItem = createBusListItem(busInfo, true);
    busesList.appendChild(busItem);
  });

  // Show message if no buses
  if (activeBuses.length === 0 && brokenBuses.length === 0) {
    busesList.innerHTML =
      '<p style="text-align: center; color: #7f8c8d; padding: 1rem;">No hay buses en línea</p>';
  }
}

// Create bus list item
function createBusListItem(busInfo, isBroken) {
  const { id: busId, tripId, routeInfo } = busInfo;
  const item = document.createElement('div');
  item.className = `bus-item ${isBroken ? 'broken' : ''}`;

  item.innerHTML = `
      <div>
        <div class="bus-id">${busId}</div>
        ${
          routeInfo
            ? `<div style="font-size: 0.8rem; color: #7f8c8d;">${routeInfo.shortName}</div>`
            : ''
        }
      </div>
      <div class="bus-status ${isBroken ? 'broken' : 'active'}">
        ${isBroken ? 'Averiado' : 'Activo'}
      </div>
    `;

  item.addEventListener('click', () => {
    // Center map on bus location if available
    const marker = busMarkers.get(busId);
    if (marker && map) {
      map.setCenter(marker.getPosition());
      map.setZoom(15);

      // Show bus info
      showBusInfo(busInfo);
    }
  });

  return item;
}

// Update alerts
function updateAlerts(brokenBuses) {
  const alertsContainer = document.getElementById('alerts-container');
  if (!alertsContainer) return;

  alertsContainer.innerHTML = '';

  if (brokenBuses.length === 0) {
    alertsContainer.innerHTML =
      '<p style="color: #27ae60; text-align: center; padding: 1rem;">No hay alertas activas</p>';
    return;
  }

  brokenBuses.forEach((busInfo) => {
    const { id: busId, routeInfo } = busInfo;
    const alertItem = document.createElement('div');
    alertItem.className = 'alert-item';
    alertItem.innerHTML = `
        <strong>Bus ${busId}</strong>
        ${routeInfo ? `<br><small>Ruta: ${routeInfo.shortName}</small>` : ''}
        <br><small>Reportado como averiado</small>
      `;

    alertItem.addEventListener('click', () => {
      showBusInfo(busInfo);
    });

    alertsContainer.appendChild(alertItem);
  });
}

// Utility functions
function refreshData() {
  console.log('Refreshing data...');

  // Reload GTFS data
  loadGTFSData()
    .then(() => {
      if (map && gtfsData && gtfsData.stops) {
        // Clear existing stop markers
        stopMarkers.forEach((marker) => marker.setMap(null));
        stopMarkers.clear();

        // Reload stops
        loadStopsOnMap();
      }

      showAlert('Datos actualizados correctamente', 'success');
    })
    .catch((error) => {
      console.error('Error refreshing data:', error);
      showAlert('Error al actualizar los datos');
    });
}

function centerMap() {
  if (map) {
    map.setCenter(SANTO_DOMINGO_CENTER);
    map.setZoom(12);
  }
}

function showAlert(message, type = 'error') {
  // Remove existing alerts
  const existingAlerts = document.querySelectorAll('.temp-alert');
  existingAlerts.forEach((alert) => alert.remove());

  // Create new alert
  const alertDiv = document.createElement('div');
  alertDiv.className = 'temp-alert';
  alertDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 1rem 1.5rem;
      background-color: ${getAlertColor(type)};
      color: white;
      border-radius: 4px;
      z-index: 3000;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      font-size: 0.9rem;
      max-width: 300px;
      word-wrap: break-word;
    `;
  alertDiv.textContent = message;

  document.body.appendChild(alertDiv);

  // Auto remove after 4 seconds
  setTimeout(() => {
    if (alertDiv.parentNode) {
      alertDiv.remove();
    }
  }, 4000);
}

function getAlertColor(type) {
  switch (type) {
    case 'success':
      return '#27ae60';
    case 'warning':
      return '#f39c12';
    case 'info':
      return '#3498db';
    default:
      return '#e74c3c';
  }
}

// Handle page visibility changes to manage resources
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    console.log('Page hidden - reducing update frequency');
  } else {
    console.log('Page visible - resuming normal updates');
  }
});

// Handle window resize for responsive map
window.addEventListener('resize', () => {
  if (map) {
    google.maps.event.trigger(map, 'resize');
  }
});

// Error handling for uncaught errors
window.addEventListener('error', (event) => {
  console.error('Uncaught error:', event.error);
  showAlert('Ha ocurrido un error inesperado');
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  showAlert('Error de conexión - verificando...');
});

// Export functions for debugging (optional)
window.debugDashboard = {
  gtfsData: () => gtfsData,
  busMarkers: () => busMarkers,
  stopMarkers: () => stopMarkers,
  refreshData,
  centerMap,
  map: () => map,
};

console.log('Dashboard script loaded successfully');
