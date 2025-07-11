import { gtfsService } from './gtfs-service.js';
import { mapService } from './map-service.js';

export class BusService {
  constructor() {
    this.previousBusStatuses = new Map();
    this.onBreakdownCallback = null;
    this.onRecoveryCallback = null;
  }

  setNotificationCallbacks(onBreakdown, onRecovery) {
    this.onBreakdownCallback = onBreakdown;
    this.onRecoveryCallback = onRecovery;
  }

  processBusData(gpsData) {
    console.log('Processing bus data...');
    const activeBuses = [];
    const brokenBuses = [];
    const currentBusStatuses = new Map();

    // Borrar los marcadores existentes
    mapService.clearBusMarkers();

    if (!gpsData) {
      console.log('No GPS data available');
      return { activeBuses, brokenBuses };
    }

    // Procesar cada viaje
    Object.keys(gpsData).forEach((tripId) => {
      console.log(`Processing trip: ${tripId}`);
      const tripData = gpsData[tripId];

      Object.keys(tripData).forEach((busId) => {
        const busData = tripData[busId];

        // Obtener informacion del viaje a partir de los datos GTFS (si esta disponible)
        const gtfsData = gtfsService.getGTFSData();
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

        // Comprobar si el bus esta averiado (las coordenadas son 0,0 o la marca de tiempo es 0)
        const isBroken =
          (busData.latitude === 0 && busData.longitude === 0) ||
          busData.timestamp === 0;

        // Track del estado actual
        currentBusStatuses.set(busId, isBroken ? 'broken' : 'active');

        // Comprobar cambio de estado (activa -> averiada)
        const previousStatus = this.previousBusStatuses.get(busId);
        if (previousStatus === 'active' && isBroken) {
          // Mostrar notificacion - OMSA averiada
          this.showBreakdownNotification(busId);
        } else if (previousStatus === 'broken' && !isBroken) {
          // Mostrar notificacion - OMSA volvio a estar online
          this.showRecoveryNotification(busId);
        }

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
          // Crear un marcador con callback para mostrar informacion del bus
          mapService.createBusMarker(busInfo, (busInfo) => {
            // Este callback sera menajo por el main dashboard
            if (window.showBusInfoModal) {
              window.showBusInfoModal(busInfo);
            }
          });
        }
      });
    });

    // Actualizar estados anteriores para la proxima comparacion
    this.previousBusStatuses.clear();
    currentBusStatuses.forEach((status, busId) => {
      this.previousBusStatuses.set(busId, status);
    });

    console.log(
      `Processed ${activeBuses.length} active buses, ${brokenBuses.length} broken buses`
    );

    return { activeBuses, brokenBuses };
  }

  showBreakdownNotification(busId) {
    console.log(`🚨 Bus ${busId} broke down!`);
    if (this.onBreakdownCallback) {
      this.onBreakdownCallback(busId);
    }
  }

  showRecoveryNotification(busId) {
    console.log(`✅ Bus ${busId} is back online!`);
    if (this.onRecoveryCallback) {
      this.onRecoveryCallback(busId);
    }
  }

  focusOnBus(busId) {
    return mapService.focusOnBus(busId);
  }
}

// Instancia singleton
export const busService = new BusService();
