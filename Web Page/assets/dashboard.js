// Main Dashboard Controller - Orchestrates all services
import { firebaseService } from './services/firebase-service.js';
import { gtfsService } from './services/gtfs-service.js';
import { mapService } from './services/map-service.js';
import { busService } from './services/bus-service.js';
import { uiManager } from './ui/ui-manager.js';

// Application state
let currentUser = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  console.log('Initializing SIGESTUR Dashboard...');
  initializeAuth();
  setupEventListeners();
  setupGlobalFunctions();
});

// Authentication initialization
function initializeAuth() {
  firebaseService.onAuthStateChanged((user) => {
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

// Main application initialization
async function initializeApplication() {
  try {
    console.log('Starting application initialization...');

    // Setup bus service callbacks for notifications
    busService.setNotificationCallbacks(
      (busId) =>
        uiManager.showAlert(`OMSA ${busId} está averiada`, 'breakdown'),
      (busId) =>
        uiManager.showAlert(`OMSA ${busId} está de vuelta en línea`, 'recovery')
    );

    // Start real-time bus data listener (priority)
    startRealtimeDataListener();

    // Load GTFS data in background
    loadGTFSDataAsync();

    // Initialize map (will wait for Google Maps API if needed)
    initializeMapWhenReady();
  } catch (error) {
    console.error('Error initializing application:', error);
    uiManager.showAlert('Error al inicializar la aplicación');
  }
}

// Initialize map when ready
function initializeMapWhenReady() {
  // Try to initialize immediately
  if (typeof window.google !== 'undefined' && window.google.maps) {
    const success = mapService.initializeMap();
    if (success) {
      console.log('Map initialized immediately');
      return;
    }
  }

  // If not ready, the mapService will handle waiting for Google Maps
  console.log('Google Maps not ready, mapService will wait for it');
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

  // Controls panel toggle
  setupControlsPanel();

  // Keyboard shortcuts
  setupKeyboardShortcuts();
}

// Setup controls panel functionality
function setupControlsPanel() {
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
}

// Setup keyboard shortcuts
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + M for map controls toggle
    if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
      e.preventDefault();
      toggleControlsPanel();
    }
  });
}

// Controls panel management
function toggleControlsPanel() {
  const controlsPanel = document.getElementById('controls-panel');
  if (controlsPanel.classList.contains('active')) {
    closeControlsPanel();
  } else {
    openControlsPanel();
  }
}

function openControlsPanel() {
  const controlsTab = document.getElementById('controls-tab');
  const controlsPanel = document.getElementById('controls-panel');

  controlsTab.classList.add('active');
  controlsPanel.classList.add('active');
  controlsTab.innerHTML = '✖️';
  controlsTab.title = 'Cerrar controles';
}

function closeControlsPanel() {
  const controlsTab = document.getElementById('controls-tab');
  const controlsPanel = document.getElementById('controls-panel');

  controlsTab.classList.remove('active');
  controlsPanel.classList.remove('active');
  controlsTab.innerHTML = '⚙️';
  controlsTab.title = 'Controles del mapa';
}

// Handle logout
async function handleLogout() {
  try {
    // Clean up services
    firebaseService.cleanup();

    await firebaseService.signOut();
    window.location.href = '../index.html';
  } catch (error) {
    console.error('Error signing out:', error);
    uiManager.showAlert('Error al cerrar sesión');
  }
}

// Start real-time bus data listener
function startRealtimeDataListener() {
  console.log('Starting real-time bus data listener...');

  firebaseService.startGPSDataListener((gpsData) => {
    if (gpsData) {
      const { activeBuses, brokenBuses } = busService.processBusData(gpsData);

      // Update UI
      uiManager.updateBusCounters(activeBuses.length, brokenBuses.length);
      uiManager.updateBusList(activeBuses, brokenBuses);
      uiManager.updateAlerts(brokenBuses);
    } else {
      console.log('No GPS data available');
      uiManager.updateBusCounters(0, 0);
      uiManager.updateBusList([], []);
      uiManager.updateAlerts([]);
    }
  });
}

// Load GTFS data asynchronously
async function loadGTFSDataAsync() {
  try {
    uiManager.showAlert('Cargando datos GTFS...', 'info');

    const result = await gtfsService.loadGTFSData();

    // Update stops counter
    const gtfsData = gtfsService.getGTFSData();
    uiManager.updateStopsCounter(gtfsData.stops.length);

    // Load stops on map if map is ready
    if (mapService.isMapReady() && gtfsData.stops.length > 0) {
      mapService.loadStopsOnMap();
    }

    if (result.success) {
      uiManager.showAlert(
        `GTFS cargado: ${gtfsData.stops.length} paradas, ${gtfsData.routes.length} rutas`,
        'success'
      );
    } else {
      uiManager.showAlert(
        'Usando datos de prueba - Error cargando GTFS',
        'warning'
      );
    }
  } catch (error) {
    console.error('Error loading GTFS data:', error);
    uiManager.showAlert(
      'Error cargando GTFS, usando datos de prueba',
      'warning'
    );
  }
}

// Toggle traffic layer
function toggleTraffic() {
  try {
    if (!mapService.isMapReady()) {
      uiManager.showAlert(
        'El mapa aún no está listo. Intente de nuevo en unos segundos.',
        'warning'
      );
      return;
    }

    const result = mapService.toggleTraffic();
    const refreshBtn = document.getElementById('refresh-btn');

    if (refreshBtn) {
      refreshBtn.textContent = result.visible
        ? '🚦 Ocultar Tráfico'
        : '🚦 Mostrar Tráfico';
    }

    uiManager.showAlert(result.message, result.visible ? 'success' : 'info');
  } catch (error) {
    console.error('Error toggling traffic:', error);
    uiManager.showAlert('Error al cambiar la capa de tráfico', 'error');
  }
}

// Center map
function centerMap() {
  try {
    if (!mapService.isMapReady()) {
      uiManager.showAlert(
        'El mapa aún no está listo. Intente de nuevo en unos segundos.',
        'warning'
      );
      return;
    }

    const success = mapService.centerMap();
    if (success) {
      uiManager.showAlert('Mapa centrado en Santo Domingo', 'info');
    } else {
      uiManager.showAlert('Error al centrar el mapa', 'error');
    }
  } catch (error) {
    console.error('Error centering map:', error);
    uiManager.showAlert('Error al centrar el mapa', 'error');
  }
}

// Setup global functions for HTML and debugging
function setupGlobalFunctions() {
  // Google Maps initialization callback
  window.dashboardInitMap = () => {
    try {
      const success = mapService.initializeMap();
      if (success) {
        console.log('Google Maps initialized successfully via callback');

        // Load stops if GTFS data is available
        const gtfsData = gtfsService.getGTFSData();
        if (gtfsData && gtfsData.stops.length > 0) {
          mapService.loadStopsOnMap();
        }

        uiManager.showAlert('Mapa cargado correctamente', 'success');
      }
    } catch (error) {
      console.error('Error initializing Google Maps:', error);
      uiManager.showAlert('Error al inicializar el mapa');
    }
  };

  // Global function for focusing on bus (used by UI)
  window.focusOnBus = (busId) => {
    const success = busService.focusOnBus(busId);
    if (!success) {
      console.warn(`Could not focus on bus ${busId}`);
    }
  };

  // Global function for showing bus info modal (used by services)
  window.showBusInfoModal = (busInfo) => {
    uiManager.showBusInfo(busInfo);
  };

  // Make uiManager globally available for map service
  window.uiManager = uiManager;

  // Debug functions
  window.debugDashboard = {
    gtfsData: () => gtfsService.getGTFSData(),
    busMarkers: () => mapService.getBusMarkers(),
    stopMarkers: () => mapService.getStopMarkers(),
    map: () => mapService.getMap(),
    mapReady: () => mapService.isMapReady(),
    refreshData: loadGTFSDataAsync,
    centerMap,
    toggleTraffic,
    services: {
      firebase: firebaseService,
      gtfs: gtfsService,
      map: mapService,
      bus: busService,
      ui: uiManager,
    },
  };
}

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    console.log('Page hidden - reducing update frequency');
  } else {
    console.log('Page visible - resuming normal updates');
  }
});

// Handle window resize for responsive map
window.addEventListener('resize', () => {
  const map = mapService.getMap();
  if (map && window.google) {
    window.google.maps.event.trigger(map, 'resize');
  }
});

// Global error handling
window.addEventListener('error', (event) => {
  console.error('Uncaught error:', event.error);
  uiManager.showAlert('Ha ocurrido un error inesperado');
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  uiManager.showAlert('Error de conexión - verificando...');
});

// Filter out browser extension errors
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

console.log('SIGESTUR Dashboard initialized successfully');
