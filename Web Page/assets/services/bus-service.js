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

    // Clear existing bus markers
    mapService.clearBusMarkers();

    if (!gpsData) {
      console.log('No GPS data available');
      return { activeBuses, brokenBuses };
    }

    // Process each trip
    Object.keys(gpsData).forEach((tripId) => {
      console.log(`Processing trip: ${tripId}`);
      const tripData = gpsData[tripId];

      Object.keys(tripData).forEach((busId) => {
        const busData = tripData[busId];

        // Get trip information from GTFS data (if available)
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

        // Check if bus is broken (coordinates are 0,0 or timestamp is 0)
        const isBroken =
          (busData.latitude === 0 && busData.longitude === 0) ||
          busData.timestamp === 0;

        // Track current status
        currentBusStatuses.set(busId, isBroken ? 'broken' : 'active');

        // Check for status change (active -> broken)
        const previousStatus = this.previousBusStatuses.get(busId);
        if (previousStatus === 'active' && isBroken) {
          // Bus just broke down - show notification
          this.showBreakdownNotification(busId);
        } else if (previousStatus === 'broken' && !isBroken) {
          // Bus is back online - show recovery notification
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
          // Create marker with callback for showing bus info
          mapService.createBusMarker(busInfo, (busInfo) => {
            // This callback will be handled by the main dashboard
            if (window.showBusInfoModal) {
              window.showBusInfoModal(busInfo);
            }
          });
        }
      });
    });

    // Update previous statuses for next comparison
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

// Create singleton instance
export const busService = new BusService();
