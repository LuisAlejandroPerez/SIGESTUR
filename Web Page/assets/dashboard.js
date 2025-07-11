// Importar componentes necesario para hacer funcionar el codigo
import { firebaseService } from './services/firebase-service.js';
import { gtfsService } from './services/gtfs-service.js';
import { mapService } from './services/map-service.js';
import { busService } from './services/bus-service.js';
import { uiManager } from './ui/ui-manager.js';
import { reportService } from './services/report-service.js';

// Estado de la aplicacion
let currentUser = null;
let currentActiveBuses = [];
let currentBrokenBuses = [];
let currentGtfsData = null;

// Inicializar la aplicacion
document.addEventListener('DOMContentLoaded', () => {
  console.log('Initializing SIGESTUR Dashboard...');
  initializeAuth();
  setupEventListeners();
  setupGlobalFunctions();
});

// Inicializacion de la autenticacion
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

// Inicializacion de la aplicacion principal
async function initializeApplication() {
  try {
    console.log('Starting application initialization...');

    // Callbacks para notificaciones
    busService.setNotificationCallbacks(
      (busId) =>
        uiManager.showAlert(`OMSA ${busId} esta averiada`, 'breakdown'),
      (busId) =>
        uiManager.showAlert(`OMSA ${busId} esta de vuelta en linea`, 'recovery')
    );

    // Inicar real-time bus data listener (prioridad)
    startRealtimeDataListener();

    // Carga la data GTFS en segundo plano
    loadGTFSDataAsync();

    // Inicializar mapa (Espera la API de Google Maps si es necesario)
    initializeMapWhenReady();
  } catch (error) {
    console.error('Error initializing application:', error);
    uiManager.showAlert('Error al inicializar la aplicación');
  }
}

// Inicializar mapa cuando este listo
function initializeMapWhenReady() {
  // Trata de inicializarlo inmediatemiente
  if (typeof window.google !== 'undefined' && window.google.maps) {
    const success = mapService.initializeMap();
    if (success) {
      console.log('Map initialized immediately');
      return;
    }
  }

  // Sino esta listo, el mapService va a manejar la espera por Google Maps
  console.log('Google Maps not ready, mapService will wait for it');
}

// Setup event listeners
function setupEventListeners() {
  // Logout button
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }

  // Controles del mapa
  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', toggleTraffic);
  }

  const centerMapBtn = document.getElementById('center-map-btn');
  if (centerMapBtn) {
    centerMapBtn.addEventListener('click', centerMap);
  }

  // Boton para descargar el reporte
  const downloadReportBtn = document.getElementById('download-report-btn');
  if (downloadReportBtn) {
    downloadReportBtn.addEventListener('click', handleDownloadReport);
  }

  // Controls panel toggle
  setupControlsPanel();

  // Keyboard shortcuts
  setupKeyboardShortcuts();
}

// Configurar la funcionalidad del panel de controles
function setupControlsPanel() {
  const controlsTab = document.getElementById('controls-tab');
  const controlsPanel = document.getElementById('controls-panel');

  if (controlsTab && controlsPanel) {
    controlsTab.addEventListener('click', toggleControlsPanel);

    // Cerrar el panel al hacer clic afuera
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

// Configurar keyboard shortcuts
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + M para alternar los controles del mapa
    if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
      e.preventDefault();
      toggleControlsPanel();
    }
  });
}

// Gestion del panel de control
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

// Manejar el cierre de sesion
async function handleLogout() {
  try {
    // Servicios de limpieza
    firebaseService.cleanup();

    await firebaseService.signOut();
    window.location.href = '../index.html';
  } catch (error) {
    console.error('Error signing out:', error);
    uiManager.showAlert('Error al cerrar sesión');
  }
}

// Gestionar informe de descarga
async function handleDownloadReport() {
  if (!currentActiveBuses || !currentBrokenBuses || !currentGtfsData) {
    uiManager.showAlert(
      'Datos no disponibles para generar el reporte. Intente de nuevo en unos segundos.',
      'warning'
    );
    return;
  }
  await reportService.generateStatisticsReport(
    currentActiveBuses,
    currentBrokenBuses,
    currentGtfsData
  );
}

// Iniciar real-time bus data listener
function startRealtimeDataListener() {
  console.log('Starting real-time bus data listener...');

  firebaseService.startGPSDataListener((gpsData) => {
    if (gpsData) {
      const { activeBuses, brokenBuses } = busService.processBusData(gpsData);
      currentActiveBuses = activeBuses; // Guardar para informe
      currentBrokenBuses = brokenBuses; // Guardar para informe

      // Actualiza la UI
      uiManager.updateBusCounters(activeBuses.length, brokenBuses.length);
      uiManager.updateBusList(activeBuses, brokenBuses);
      uiManager.updateAlerts(brokenBuses);
    } else {
      console.log('No GPS data available');
      currentActiveBuses = [];
      currentBrokenBuses = [];
      uiManager.updateBusCounters(0, 0);
      uiManager.updateBusList([], []);
      uiManager.updateAlerts([]);
    }
  });
}

// Cargar datos GTFS de forma asincronica
async function loadGTFSDataAsync() {
  try {
    uiManager.showAlert('Cargando datos GTFS...', 'info');

    const result = await gtfsService.loadGTFSData();

    // Update stops counter
    currentGtfsData = gtfsService.getGTFSData(); // Guardar para informe
    uiManager.updateStopsCounter(currentGtfsData.stops.length);

    // Cargar paradas en el mapa si el mapa esta listo
    if (mapService.isMapReady() && currentGtfsData.stops.length > 0) {
      mapService.loadStopsOnMap();
    }

    if (result.success) {
      uiManager.showAlert(
        `GTFS cargado: ${currentGtfsData.stops.length} paradas, ${currentGtfsData.routes.length} rutas`,
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

// Activar o desactivar la capa de trafico
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

// Centrar el mapa
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

// Configurar funciones globales para HTML y debugging
function setupGlobalFunctions() {
  // inicializacion de Google Maps callback
  window.dashboardInitMap = () => {
    try {
      const success = mapService.initializeMap();
      if (success) {
        console.log('Google Maps initialized successfully via callback');

        // La carga se detiene si hay datos GTFS disponibles
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

  // Funcion global para enfocar el bus (usada por la UI)
  window.focusOnBus = (busId) => {
    const success = busService.focusOnBus(busId);
    if (!success) {
      console.warn(`Could not focus on bus ${busId}`);
    }
  };

  // Funcion global para mostrar información modal del bus (utilizada por los servicios)
  window.showBusInfoModal = (busInfo) => {
    uiManager.showBusInfo(busInfo);
  };

  // Hacer que uiManager este disponible globalmente para el servicio de maps
  window.uiManager = uiManager;

  // Funcion de Debug
  window.debugDashboard = {
    gtfsData: () => gtfsService.getGTFSData(),
    busMarkers: () => mapService.getBusMarkers(),
    stopMarkers: () => mapService.getStopMarkers(),
    map: () => mapService.getMap(),
    mapReady: () => mapService.isMapReady(),
    refreshData: loadGTFSDataAsync,
    centerMap,
    toggleTraffic,
    generateReport: handleDownloadReport, // Expose for debugging
    services: {
      firebase: firebaseService,
      gtfs: gtfsService,
      map: mapService,
      bus: busService,
      ui: uiManager,
      report: reportService,
    },
  };
}

// Gestionar cambios de visibilidad de la pagina
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    console.log('Page hidden - reducing update frequency');
  } else {
    console.log('Page visible - resuming normal updates');
  }
});

// Manejar el cambio de tamano de la ventana para un mapa responsivo
window.addEventListener('resize', () => {
  const map = mapService.getMap();
  if (map && window.google) {
    window.google.maps.event.trigger(map, 'resize');
  }
});

// Manejo global de errores
window.addEventListener('error', (event) => {
  console.error('Uncaught error:', event.error);
  uiManager.showAlert('Ha ocurrido un error inesperado');
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  uiManager.showAlert('Error de conexión - verificando...');
});

// Filtrar errores de extensiones del navegador
const originalConsoleError = console.error;
console.error = (...args) => {
  const message = args.join(' ');
  if (
    message.includes('chrome-extension://') ||
    message.includes('runtime/sendMessage') ||
    message.includes('kwift.CHROME.js')
  ) {
    return; // Ignorar los errores de extensión del navegador
  }
  originalConsoleError.apply(console, args);
};

console.log('SIGESTUR Dashboard initialized successfully');
