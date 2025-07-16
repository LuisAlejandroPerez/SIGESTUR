import { gtfsService } from './gtfs-service.js';
import { mapService } from './map-service.js';

export class BusService {
  constructor() {
    this.previousBusStatuses = new Map(); // Tracks 'active' or 'broken' status
    this.lastValidCoordinates = new Map(); // Stores last known non-0,0 coordinates
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

    // Clear existing live bus markers
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

        // Find route information using routeId from tripInfo
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

        // Get previous status for comparison
        const previousStatus = this.previousBusStatuses.get(busId);

        // Store last valid coordinates if not broken
        if (!isBroken && busData.latitude !== 0 && busData.longitude !== 0) {
          this.lastValidCoordinates.set(busId, {
            lat: Number.parseFloat(busData.latitude),
            lng: Number.parseFloat(busData.longitude),
            timestamp: busData.timestamp,
            routeInfo: routeInfo, // Store route info for the marker tooltip
          });
        }

        // Handle status change: active -> broken
        if (previousStatus === 'active' && isBroken) {
          // Bus just broke down - show notification and save last valid location
          this.showBreakdownNotification(busId);
          const lastCoords = this.lastValidCoordinates.get(busId);
          if (lastCoords) {
            localStorage.setItem(
              `brokenBusLastLocation_${busId}`,
              JSON.stringify(lastCoords)
            );
            mapService.createLastKnownBrokenMarker(busId, lastCoords);
            console.log(
              `Saved last valid location for broken bus ${busId}:`,
              lastCoords
            );
          }
        }
        // Handle status change: broken -> active
        else if (previousStatus === 'broken' && !isBroken) {
          // Bus is back online - show recovery notification and remove saved location
          this.showRecoveryNotification(busId);
          localStorage.removeItem(`brokenBusLastLocation_${busId}`);
          mapService.removeLastKnownBrokenMarker(busId);
          console.log(`Removed last valid location for recovered bus ${busId}`);
        }

        const busInfo = {
          id: busId,
          tripId,
          data: busData,
          tripInfo,
          routeInfo, // Ensure routeInfo is passed correctly
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
