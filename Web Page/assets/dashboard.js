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
import {
  getStorage,
  ref as storageRef,
  getDownloadURL,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

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
const storage = getStorage(app);

// Global variables
let map;
const busMarkers = new Map();
const stopMarkers = new Map();
let trafficLayer;
let gtfsData = null;
let currentUser = null;
let gpsDataListener = null;
let isTrafficVisible = false;

// Santo Domingo coordinates
const SANTO_DOMINGO_CENTER = { lat: 18.4861, lng: -69.9312 };

// Driver information (manually added for now)
const driverInfo = {
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
const busIconSVG = (
  color = '#4CAF50'
) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" width="32" height="32">
  <path fill="${color}" d="M224 0C348.8 0 448 35.2 448 80l0 16 0 320c0 17.7-14.3 32-32 32l0 32c0 17.7-14.3 32-32 32l-32 0c-17.7 0-32-14.3-32-32l0-32-192 0 0 32c0 17.7-14.3 32-32 32l-32 0c-17.7 0-32-14.3-32-32L0 96 0 80C0 35.2 99.2 0 224 0zM64 128l0 128c0 17.7 14.3 32 32 32l256 0c17.7 0 32-14.3 32-32l0-128c0-17.7-14.3-32-32-32L96 96c-17.7 0-32 14.3-32 32zM80 400a32 32 0 1 0 0-64 32 32 0 1 0 0 64zm288 0a32 32 0 1 0 0-64 32 32 0 1 0 0 64z"/>
</svg>`;

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
    refreshBtn.addEventListener('click', toggleTraffic);
  }

  const centerMapBtn = document.getElementById('center-map-btn');
  if (centerMapBtn) {
    centerMapBtn.addEventListener('click', centerMap);
  }

  // Controls tab toggle
  const controlsTab = document.getElementById('controls-tab');
  const controlsPanel = document.getElementById('controls-panel');
  if (controlsTab && controlsPanel) {
    controlsTab.addEventListener('click', toggleControlsPanel);

    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
      if (
        !controlsTab.contains(e.target) &&
        !controlsPanel.contains(e.target)
      ) {
        closeControlsPanel();
      }
    });
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

// Toggle controls panel
function toggleControlsPanel() {
  const controlsTab = document.getElementById('controls-tab');
  const controlsPanel = document.getElementById('controls-panel');

  if (controlsPanel.classList.contains('active')) {
    closeControlsPanel();
  } else {
    openControlsPanel();
  }
}

// Open controls panel
function openControlsPanel() {
  const controlsTab = document.getElementById('controls-tab');
  const controlsPanel = document.getElementById('controls-panel');

  controlsTab.classList.add('active');
  controlsPanel.classList.add('active');
  controlsTab.innerHTML = '✖️'; // Change icon to close
  controlsTab.title = 'Cerrar controles';
}

// Close controls panel
function closeControlsPanel() {
  const controlsTab = document.getElementById('controls-tab');
  const controlsPanel = document.getElementById('controls-panel');

  controlsTab.classList.remove('active');
  controlsPanel.classList.remove('active');
  controlsTab.innerHTML = '⚙️'; // Change icon back to settings
  controlsTab.title = 'Controles del mapa';
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
    // Start listening to real-time bus data FIRST (this is the priority)
    startRealtimeDataListener();
    // Load GTFS data in background (non-blocking)
    loadGTFSData().catch((error) => {
      console.warn('GTFS loading failed, continuing with mock data:', error);
    });
  } catch (error) {
    console.error('Error initializing app:', error);
    showAlert('Error al inicializar la aplicación');
  }
}

// Google Maps initialization (called by Google Maps API)
window.dashboardInitMap = () => {
  console.log('Initializing Google Maps...');
  const mapElement = document.getElementById('map');
  if (!mapElement) {
    console.error('Map element not found');
    return;
  }

  try {
    // Check if google is available
    if (typeof window.google === 'undefined' || !window.google.maps) {
      console.error('Google Maps API not loaded');
      showAlert('Error: Google Maps no se pudo cargar');
      return;
    }

    map = new window.google.maps.Map(mapElement, {
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

    // Initialize traffic layer
    trafficLayer = new window.google.maps.TrafficLayer();

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

// Toggle traffic layer
function toggleTraffic() {
  if (!trafficLayer || !map) {
    showAlert('Mapa no disponible', 'warning');
    return;
  }

  if (isTrafficVisible) {
    trafficLayer.setMap(null);
    isTrafficVisible = false;
    document.getElementById('refresh-btn').textContent = '🚦 Mostrar Tráfico';
    showAlert('Capa de tráfico ocultada', 'info');
  } else {
    trafficLayer.setMap(map);
    isTrafficVisible = true;
    document.getElementById('refresh-btn').textContent = '🚦 Ocultar Tráfico';
    showAlert('Capa de tráfico activada', 'success');
  }
}

// Load GTFS data with multiple fallback strategies
async function loadGTFSData() {
  try {
    console.log('Loading GTFS data from Firebase Storage...');
    showAlert('Cargando datos GTFS...', 'info');

    // Initialize with mock data first
    gtfsData = {
      stops: getMockStops(),
      routes: [],
      trips: [],
    };

    updateStopsCounter();

    // Define the GTFS files to load (matching your Python script paths)
    const gtfsFiles = [
      { name: 'stops', path: 'STATIC GTFS/stops.txt' },
      { name: 'routes', path: 'STATIC GTFS/routes.txt' },
      { name: 'trips', path: 'STATIC GTFS/trips.txt' },
    ];

    const gtfsResults = {};
    let successCount = 0;

    // Try to load each file with multiple strategies
    for (const file of gtfsFiles) {
      try {
        console.log(`Attempting to load ${file.name} from ${file.path}...`);
        // Strategy 1: Try with fetch and CORS mode
        const text = await loadGTFSFileWithFetch(file.path);
        gtfsResults[file.name] = text;
        successCount++;
        console.log(
          `✅ Successfully loaded ${file.name} (${text.length} characters)`
        );
      } catch (error) {
        console.warn(`❌ Failed to load ${file.name}:`, error.message);
        gtfsResults[file.name] = null;
      }
    }

    // Parse successfully loaded data
    if (gtfsResults.stops) {
      const parsedStops = parseGTFSStops(gtfsResults.stops);
      if (parsedStops.length > 0) {
        gtfsData.stops = parsedStops;
      }
    }

    if (gtfsResults.routes) {
      gtfsData.routes = parseGTFSRoutes(gtfsResults.routes);
    }

    if (gtfsResults.trips) {
      gtfsData.trips = parseGTFSTrips(gtfsResults.trips);
    }

    console.log('GTFS data processed:', {
      stops: gtfsData.stops.length,
      routes: gtfsData.routes.length,
      trips: gtfsData.trips.length,
      successfulFiles: successCount,
    });

    updateStopsCounter();

    // Load stops on map if map is ready
    if (map && gtfsData.stops.length > 0) {
      loadStopsOnMap();
    }

    if (successCount > 0) {
      showAlert(
        `GTFS parcialmente cargado: ${gtfsData.stops.length} paradas, ${gtfsData.routes.length} rutas`,
        'success'
      );
    } else {
      showAlert('Usando datos de prueba - Error cargando GTFS', 'warning');
    }
  } catch (error) {
    console.error('Error loading GTFS data:', error);
    showAlert('Error cargando GTFS, usando datos de prueba', 'warning');
  }
}

// Load GTFS file using fetch with proper CORS handling
async function loadGTFSFileWithFetch(filePath) {
  try {
    // Get download URL from Firebase Storage
    const fileRef = storageRef(storage, filePath);
    const downloadURL = await getDownloadURL(fileRef);
    console.log(`Got download URL for ${filePath}:`, downloadURL);

    // Try fetch with different CORS modes
    const corsOptions = [
      { mode: 'cors', credentials: 'omit' },
      { mode: 'no-cors' },
      {},
    ];

    for (const options of corsOptions) {
      try {
        const response = await fetch(downloadURL, {
          method: 'GET',
          headers: {
            Accept: 'text/plain,text/csv,*/*',
          },
          ...options,
        });

        if (response.ok) {
          const text = await response.text();
          if (text && text.length > 0) {
            return text;
          }
        }
      } catch (fetchError) {
        console.warn(
          `Fetch attempt failed for ${filePath}:`,
          fetchError.message
        );
        continue;
      }
    }

    throw new Error(`All fetch attempts failed for ${filePath}`);
  } catch (error) {
    console.error(`Error loading ${filePath}:`, error);
    throw error;
  }
}

// Parse GTFS stops data
function parseGTFSStops(csvText) {
  try {
    const lines = csvText.split('\n').filter((line) => line.trim());
    if (lines.length === 0) return [];

    const headers = lines[0].split(',').map((h) => h.trim().replace(/"/g, ''));
    const stops = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',');
      const stop = {};

      headers.forEach((header, index) => {
        stop[header] = values[index]
          ? values[index].trim().replace(/"/g, '')
          : '';
      });

      if (stop.stop_lat && stop.stop_lon) {
        const lat = Number.parseFloat(stop.stop_lat);
        const lng = Number.parseFloat(stop.stop_lon);

        if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
          stops.push({
            id: stop.stop_id || `stop_${i}`,
            name: stop.stop_name || `Parada ${stop.stop_id || i}`,
            lat: lat,
            lng: lng,
            code: stop.stop_code || '',
          });
        }
      }
    }

    console.log(`Parsed ${stops.length} stops from GTFS data`);
    return stops;
  } catch (error) {
    console.error('Error parsing GTFS stops:', error);
    return [];
  }
}

// Parse GTFS routes data
function parseGTFSRoutes(csvText) {
  try {
    const lines = csvText.split('\n').filter((line) => line.trim());
    if (lines.length === 0) return [];

    const headers = lines[0].split(',').map((h) => h.trim().replace(/"/g, ''));
    const routes = [];

    for (let i = 1; i < lines.length; i++) {
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
          color: route.route_color || '4CAF50',
        });
      }
    }

    console.log(`Parsed ${routes.length} routes from GTFS data`);
    return routes;
  } catch (error) {
    console.error('Error parsing GTFS routes:', error);
    return [];
  }
}

// Parse GTFS trips data
function parseGTFSTrips(csvText) {
  try {
    const lines = csvText.split('\n').filter((line) => line.trim());
    if (lines.length === 0) return [];

    const headers = lines[0].split(',').map((h) => h.trim().replace(/"/g, ''));
    const trips = [];

    for (let i = 1; i < lines.length; i++) {
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

    console.log(`Parsed ${trips.length} trips from GTFS data`);
    return trips;
  } catch (error) {
    console.error('Error parsing GTFS trips:', error);
    return [];
  }
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

  // Clear existing stop markers
  stopMarkers.forEach((marker) => marker.setMap(null));
  stopMarkers.clear();

  gtfsData.stops.forEach((stop) => {
    try {
      const marker = new window.google.maps.Marker({
        position: { lat: stop.lat, lng: stop.lng },
        map: map,
        title: stop.name,
        icon: {
          url:
            'data:image/svg+xml;charset=UTF-8,' +
            encodeURIComponent(`
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="8" fill="#2196F3" stroke="white" stroke-width="2"/>
              <circle cx="12" cy="12" r="3" fill="white"/>
            </svg>
          `),
          scaledSize: new window.google.maps.Size(24, 24),
          anchor: new window.google.maps.Point(12, 12),
        },
      });

      // Add info window for stop
      const infoWindow = new window.google.maps.InfoWindow({
        content: `
          <div style="padding: 10px;">
            <h3 style="margin: 0 0 5px 0; color: #2c3e50;">🚏 ${stop.name}</h3>
            <p style="margin: 0; color: #7f8c8d; font-size: 12px;">ID: ${
              stop.id
            }</p>
            ${
              stop.code
                ? `<p style="margin: 0; color: #7f8c8d; font-size: 12px;">Código: ${stop.code}</p>`
                : ''
            }
            <p style="margin: 5px 0 0 0; color: #7f8c8d; font-size: 11px;">
              Coordenadas: ${stop.lat.toFixed(6)}, ${stop.lng.toFixed(6)}
            </p>
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

// Start listening to real-time bus data (PRIORITY FUNCTION)
function startRealtimeDataListener() {
  console.log('Starting real-time data listener...');
  const gpsDataRef = ref(database, 'gps_data');

  gpsDataListener = onValue(
    gpsDataRef,
    (snapshot) => {
      const data = snapshot.val();
      console.log('GPS data received:', data ? 'Data available' : 'No data');

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
      showAlert('Error conectando con datos en tiempo real', 'error');
    }
  );
}

// Process bus data from Firebase (CRITICAL FUNCTION)
function processBusData(gpsData) {
  console.log('Processing bus data...');
  const activeBuses = [];
  const brokenBuses = [];

  // Clear existing bus markers
  busMarkers.forEach((marker) => marker.setMap(null));
  busMarkers.clear();

  // Process each trip
  Object.keys(gpsData).forEach((tripId) => {
    console.log(`Processing trip: ${tripId}`);
    const tripData = gpsData[tripId];

    Object.keys(tripData).forEach((busId) => {
      const busData = tripData[busId];

      // Get trip information from GTFS data (if available)
      const tripInfo =
        gtfsData && gtfsData.trips
          ? gtfsData.trips.find((trip) => trip.id === tripId)
          : null;

      const routeInfo =
        tripInfo && gtfsData.routes
          ? gtfsData.routes.find((route) => route.id === tripInfo.routeId)
          : null;

      console.log(
        `Bus ${busId}: tripInfo =`,
        tripInfo,
        `routeInfo =`,
        routeInfo
      );

      // Check if bus is broken (coordinates are 0,0 or timestamp is 0)
      const isBroken =
        (busData.latitude === 0 && busData.longitude === 0) ||
        busData.timestamp === 0;

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

  console.log(
    `Processed ${activeBuses.length} active buses, ${brokenBuses.length} broken buses`
  );

  // Update UI
  updateBusCounters(activeBuses.length, brokenBuses.length);
  updateBusList(activeBuses, brokenBuses);
  updateAlerts(brokenBuses);
}

// Create bus marker on map using FontAwesome icon
function createBusMarker(busInfo) {
  if (!map) return;

  const { id: busId, tripId, data: busData, routeInfo, isBroken } = busInfo;

  const position = {
    lat: Number.parseFloat(busData.latitude),
    lng: Number.parseFloat(busData.longitude),
  };

  // Validate coordinates
  if (isNaN(position.lat) || isNaN(position.lng)) {
    console.warn(`Invalid coordinates for bus ${busId}:`, position);
    return;
  }

  // Use green for active buses, red for broken buses
  const iconColor = isBroken ? '#F44336' : '#4CAF50';

  try {
    const marker = new window.google.maps.Marker({
      position: position,
      map: map,
      title: `OMSA ${busId} - ${routeInfo ? routeInfo.shortName : tripId}`,
      icon: {
        url:
          'data:image/svg+xml;charset=UTF-8,' +
          encodeURIComponent(busIconSVG(iconColor)),
        scaledSize: new window.google.maps.Size(32, 32),
        anchor: new window.google.maps.Point(16, 26),
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

// Show bus information modal with driver info
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

  // Get modal content element to add appropriate class
  const modalContent = modal.querySelector('.modal-content');

  // Remove existing bus status classes
  modalContent.classList.remove('bus-active', 'bus-broken');

  // Add appropriate class based on bus status
  if (isBroken) {
    modalContent.classList.add('bus-broken');
  } else {
    modalContent.classList.add('bus-active');
  }

  const timestamp = new Date(busData.timestamp * 1000);
  const now = new Date();
  const formattedDate = timestamp.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const driver = driverInfo[busId] || {
    name: 'No asignado',
    phone: 'N/A',
    id: 'N/A',
  };

  // Update modal title with appropriate icon
  const modalTitle = modal.querySelector('#modal-title');
  if (modalTitle) {
    modalTitle.innerHTML = `${
      isBroken ? '🚌💥' : '🚌✅'
    } Información de la OMSA`;
  }

  content.innerHTML = `
      <div class="bus-info">
        <div class="info-row">
          <strong data-label="id">ID de OMSA:</strong> 
          <span>${busId}</span>
        </div>
        <div class="info-row">
          <strong data-label="route">Ruta ID:</strong> 
          <span>${
            tripInfo && tripInfo.routeId
              ? tripInfo.routeId
              : routeInfo
              ? routeInfo.id
              : tripId
          }</span>
        </div>
        ${
          routeInfo
            ? `
          <div class="info-row">
            <strong data-label="route">Ruta:</strong> 
            <span>${routeInfo.shortName} - ${routeInfo.longName}</span>
          </div>
        `
            : ''
        }
        ${
          tripInfo && tripInfo.headsign
            ? `
          <div class="info-row">
            <strong data-label="direction">Destino:</strong> 
            <span>${tripInfo.headsign}</span>
          </div>
        `
            : ''
        }
        <div class="info-row">
          <strong data-label="status">Estado:</strong> 
          <span class="status-badge ${isBroken ? 'broken' : 'active'}">
            ${isBroken ? 'Averiada' : 'Activa'}
          </span>
        </div>
        <div class="info-row">
          <strong data-label="direction">Dirección:</strong> 
          <span>${busData.direction_id === '0' ? 'Vuelta' : 'Ida'}</span>
        </div>
        <div class="info-row">
          <strong data-label="location">Latitud:</strong> 
          <span>${Number.parseFloat(busData.latitude).toFixed(6)}</span>
        </div>
        <div class="info-row">
          <strong data-label="location">Longitud:</strong> 
          <span>${Number.parseFloat(busData.longitude).toFixed(6)}</span>
        </div>
        <div class="info-row">
          <strong data-label="time">Última actualización:</strong> 
          <span>${formattedDate}</span>
        </div>
        <div class="info-row">
          <strong data-label="driver">Conductor:</strong> 
          <span>${driver.name}</span>
        </div>
        <div class="info-row">
          <strong data-label="driver">ID Conductor:</strong> 
          <span>${driver.id}</span>
        </div>
        <div class="info-row">
          <strong data-label="phone">Teléfono:</strong> 
          <span>${driver.phone}</span>
        </div>
        ${
          isBroken
            ? '<div class="alert-message">Esta OMSA está fuera de servicio - Sin señal GPS</div>'
            : ''
        }
      </div>
    `;

  modal.style.display = 'block';

  // Add smooth scroll behavior to modal content
  modalContent.style.scrollBehavior = 'smooth';
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

// Update buses list in sidebar (only active buses) - FIXED VERSION
function updateBusList(activeBuses, brokenBuses) {
  const busesList = document.getElementById('buses-list');
  if (!busesList) return;

  // Store current search value if exists
  const existingSearch = busesList.querySelector('input[type="text"]');
  const currentSearchValue = existingSearch ? existingSearch.value : '';

  // Clear and add search input
  busesList.innerHTML = '';

  // Add search functionality
  const searchContainer = document.createElement('div');
  searchContainer.style.cssText = `
    padding: 0.5rem;
    margin-bottom: 1rem;
    background: var(--bg-tertiary);
    border-radius: var(--radius-md);
  `;

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = 'Buscar OMSA por ID...';
  searchInput.value = currentSearchValue; // Restore previous search
  searchInput.style.cssText = `
    width: 100%;
    padding: 0.5rem;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    font-size: 0.9rem;
    outline: none;
    box-sizing: border-box;
  `;

  searchContainer.appendChild(searchInput);
  busesList.appendChild(searchContainer);

  // Filter and display function
  const displayBuses = (searchTerm = '') => {
    // Clear existing bus items and messages (keep search)
    const busItems = busesList.querySelectorAll('.bus-item');
    const noResultsMessages = busesList.querySelectorAll('.no-results-message');

    busItems.forEach((item) => item.remove());
    noResultsMessages.forEach((msg) => msg.remove());

    // Filter active buses based on search
    const filteredBuses = activeBuses.filter((busInfo) =>
      busInfo.id.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Add filtered active buses only
    filteredBuses.forEach((busInfo) => {
      const busItem = createBusListItem(busInfo, false);
      busesList.appendChild(busItem);
    });

    // Show message if no buses match
    if (filteredBuses.length === 0) {
      const noResultsMsg = document.createElement('p');
      noResultsMsg.className = 'no-results-message';
      noResultsMsg.style.cssText =
        'text-align: center; color: #7f8c8d; padding: 1rem; margin: 0;';
      noResultsMsg.textContent = searchTerm
        ? `No se encontraron OMSAs con ID "${searchTerm}"`
        : 'No hay OMSAs activas en línea';
      busesList.appendChild(noResultsMsg);
    }
  };

  // Add search event listener with debouncing
  let searchTimeout;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      displayBuses(e.target.value);
    }, 300); // 300ms debounce
  });

  // Initial display with current search value
  displayBuses(currentSearchValue);
}

// Create bus list item
function createBusListItem(busInfo, isBroken) {
  const { id: busId, tripId, routeInfo } = busInfo;

  const item = document.createElement('div');
  item.className = `bus-item ${isBroken ? 'broken' : ''}`;
  item.innerHTML = `
      <div>
        <div class="bus-id">OMSA ${busId}</div>
        ${
          routeInfo
            ? `<div style="font-size: 0.8rem; color: #7f8c8d;">${routeInfo.shortName}</div>`
            : ''
        }
      </div>
      <div class="bus-status ${isBroken ? 'broken' : 'active'}">
        ${isBroken ? 'Averiada' : 'Activa'}
      </div>
    `;

  item.addEventListener('click', () => {
    if (!isBroken) {
      // Center map on bus location if available
      const marker = busMarkers.get(busId);
      if (marker && map) {
        map.setCenter(marker.getPosition());
        map.setZoom(15);
      }
    }
    // Show bus info
    showBusInfo(busInfo);
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
      '<p style="color: #4CAF50; text-align: center; padding: 1rem;">No hay alertas activas</p>';
    return;
  }

  brokenBuses.forEach((busInfo) => {
    const { id: busId, routeInfo } = busInfo;

    const alertItem = document.createElement('div');
    alertItem.className = 'alert-item';
    alertItem.innerHTML = `
        <strong>OMSA ${busId}</strong>
        ${routeInfo ? `<br><small>Ruta: ${routeInfo.shortName}</small>` : ''}
        <br><small>Fuera de servicio - Sin señal GPS</small>
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
        loadStopsOnMap();
      }
      showAlert('Datos actualizados correctamente', 'success');
    })
    .catch((error) => {
      console.error('Error refreshing data:', error);
      showAlert('Error al actualizar los datos', 'error');
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
      border-radius: 8px;
      z-index: 3000;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      font-size: 0.9rem;
      max-width: 300px;
      word-wrap: break-word;
      backdrop-filter: blur(10px);
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
      return '#4CAF50';
    case 'warning':
      return '#FF9800';
    case 'info':
      return '#2196F3';
    default:
      return '#F44336';
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
    window.google.maps.event.trigger(map, 'resize');
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

// Export functions for debugging and global access
window.debugDashboard = {
  gtfsData: () => gtfsData,
  busMarkers: () => busMarkers,
  stopMarkers: () => stopMarkers,
  refreshData,
  centerMap,
  toggleTraffic,
  map: () => map,
};

// Make functions available globally for HTML onclick events
window.focusOnBus = (busId) => {
  const marker = busMarkers.get(busId);
  if (marker && map) {
    map.setCenter(marker.getPosition());
    map.setZoom(16);
  }
};

// Filter out browser extension errors from console
const originalConsoleError = console.error;
console.error = (...args) => {
  const message = args.join(' ');
  if (
    message.includes('chrome-extension://') ||
    message.includes('runtime/sendMessage') ||
    message.includes('kwift.CHROME.js')
  ) {
    return; // Ignore browser extension errors
  }
  originalConsoleError.apply(console, args);
};

console.log('SIGESTUR Dashboard script loaded successfully');
