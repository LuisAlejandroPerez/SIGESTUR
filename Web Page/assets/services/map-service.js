import { SANTO_DOMINGO_CENTER, busIconSVG } from '../config/firebase-config.js';
import { gtfsService } from './gtfs-service.js';

export class MapService {
  constructor() {
    this.map = null;
    this.busMarkers = new Map(); // Live bus markers
    this.stopMarkers = new Map();
    this.lastKnownBrokenMarkers = new Map(); // Markers for last known broken locations
    this.trafficLayer = null;
    this.isTrafficVisible = false;
    this.isInitialized = false;
  }

  initializeMap() {
    console.log('Initializing Google Maps...');
    const mapElement = document.getElementById('map');
    if (!mapElement) {
      console.error('Map element not found');
      return false;
    }

    try {
      // Check if google is available
      if (typeof window.google === 'undefined' || !window.google.maps) {
        console.error('Google Maps API not loaded');
        // Try to wait for Google Maps to load
        this.waitForGoogleMaps();
        return false;
      }

      this.map = new window.google.maps.Map(mapElement, {
        zoom: 12,
        center: SANTO_DOMINGO_CENTER,
        mapTypeId: 'roadmap',
        streetViewControl: false,
        mapTypeControl: true,
        fullscreenControl: true,
        zoomControl: true,
      });

      // Initialize traffic layer
      this.trafficLayer = new window.google.maps.TrafficLayer();
      this.isInitialized = true;

      console.log('Google Maps initialized successfully');

      // Load stops if GTFS data is available
      const gtfsData = gtfsService.getGTFSData();
      if (gtfsData && gtfsData.stops) {
        this.loadStopsOnMap();
      }

      // Load persisted broken bus locations
      this.loadPersistedBrokenBusLocations();

      return true;
    } catch (error) {
      console.error('Error initializing Google Maps:', error);
      this.isInitialized = false;
      throw error;
    }
  }

  waitForGoogleMaps() {
    console.log('Waiting for Google Maps API to load...');
    let attempts = 0;
    const maxAttempts = 50; // 10 seconds max wait

    const checkGoogle = () => {
      attempts++;
      if (typeof window.google !== 'undefined' && window.google.maps) {
        console.log('Google Maps API loaded, initializing map...');
        this.initializeMap();
      } else if (attempts < maxAttempts) {
        setTimeout(checkGoogle, 200);
      } else {
        console.error('Google Maps API failed to load after 10 seconds');
        // Show user-friendly error
        if (window.uiManager) {
          window.uiManager.showAlert(
            'Error cargando el mapa. Verifique su conexión.',
            'error'
          );
        }
      }
    };

    setTimeout(checkGoogle, 200);
  }

  loadStopsOnMap() {
    if (!this.map) {
      console.warn('Map not initialized, cannot load stops');
      return;
    }

    console.log('Loading stops on map...');
    const gtfsData = gtfsService.getGTFSData();
    if (!gtfsData || !gtfsData.stops) return;

    // Clear existing stop markers
    this.stopMarkers.forEach((marker) => marker.setMap(null));
    this.stopMarkers.clear();

    gtfsData.stops.forEach((stop) => {
      try {
        const marker = new window.google.maps.Marker({
          position: { lat: stop.lat, lng: stop.lng },
          map: this.map,
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
              <h3 style="margin: 0 0 5px 0; color: #2c3e50;">🚏 ${
                stop.name
              }</h3>
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
          infoWindow.open(this.map, marker);
        });

        this.stopMarkers.set(stop.id, marker);
      } catch (error) {
        console.error('Error creating stop marker:', error);
      }
    });

    console.log(`Loaded ${gtfsData.stops.length} stops on map`);
  }

  createBusMarker(busInfo, onClickCallback) {
    if (!this.map) {
      console.warn('Map not initialized, cannot create bus marker');
      return;
    }

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

    // Use green for active buses, red for broken buses (though live broken are not shown)
    const iconColor = isBroken ? '#F44336' : '#4CAF50';

    try {
      const marker = new window.google.maps.Marker({
        position: position,
        map: this.map,
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
        if (onClickCallback) {
          onClickCallback(busInfo);
        }
      });

      this.busMarkers.set(busId, marker);
    } catch (error) {
      console.error('Error creating bus marker:', error);
    }
  }

  clearBusMarkers() {
    this.busMarkers.forEach((marker) => marker.setMap(null));
    this.busMarkers.clear();
  }

  // New: Create marker for last known location of a broken bus
  createLastKnownBrokenMarker(busId, lastKnownLocation) {
    if (!this.map) {
      console.warn(
        'Map not initialized, cannot create last known broken marker'
      );
      return;
    }

    // Remove existing last known marker if it exists
    this.removeLastKnownBrokenMarker(busId);

    const position = {
      lat: lastKnownLocation.lat,
      lng: lastKnownLocation.lng,
    };

    const routeName = lastKnownLocation.routeInfo
      ? `${lastKnownLocation.routeInfo.shortName} - ${lastKnownLocation.routeInfo.longName}`
      : 'Ruta Desconocida';
    const timestamp = new Date(
      lastKnownLocation.timestamp * 1000
    ).toLocaleString();

    try {
      const marker = new window.google.maps.Marker({
        position: position,
        map: this.map,
        title: `OMSA ${busId} (Averiada) - Ultima ubicacion conocida`,
        icon: {
          url:
            'data:image/svg+xml;charset=UTF-8,' +
            encodeURIComponent(`
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="18" cy="18" r="12" fill="#F44336" stroke="white" stroke-width="3"/>
              <path d="M12 12L24 24M12 24L24 12" stroke="white" stroke-width="3" stroke-linecap="round"/>
            </svg>
          `), // Red circle with a white cross
          scaledSize: new window.google.maps.Size(36, 36),
          anchor: new window.google.maps.Point(18, 18),
        },
      });

      const infoWindow = new window.google.maps.InfoWindow({
        content: `
          <div style="padding: 10px;">
            <h3 style="margin: 0 0 5px 0; color: #c62828;">🚨 OMSA ${busId} (Averiada)</h3>
            <p style="margin: 0; color: #7f8c8d; font-size: 12px;">Última ubicación conocida antes de la falla:</p>
            <p style="margin: 5px 0 0 0; color: #7f8c8d; font-size: 12px;">Ruta: ${routeName}</p>
            <p style="margin: 0; color: #7f8c8d; font-size: 12px;">Coordenadas: ${position.lat.toFixed(
              6
            )}, ${position.lng.toFixed(6)}</p>
            <p style="margin: 0; color: #7f8c8d; font-size: 12px;">Hora: ${timestamp}</p>
          </div>
        `,
      });

      marker.addListener('click', () => {
        infoWindow.open(this.map, marker);
        // Zoom to this marker when clicked
        this.focusOnBus(busId); // Re-use focusOnBus, which now checks lastKnownBrokenMarkers
      });

      this.lastKnownBrokenMarkers.set(busId, marker);
      console.log(`Placed last known broken marker for bus ${busId}`);
    } catch (error) {
      console.error('Error creating last known broken marker:', error);
    }
  }

  // New: Remove marker for last known location of a broken bus
  removeLastKnownBrokenMarker(busId) {
    const marker = this.lastKnownBrokenMarkers.get(busId);
    if (marker) {
      marker.setMap(null);
      this.lastKnownBrokenMarkers.delete(busId);
      console.log(`Removed last known broken marker for bus ${busId}`);
    }
  }

  // New: Load all persisted broken bus locations from localStorage
  loadPersistedBrokenBusLocations() {
    if (!this.map) {
      console.warn(
        'Map not initialized, cannot load persisted broken bus locations.'
      );
      return;
    }
    console.log('Loading persisted broken bus locations from localStorage...');
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith('brokenBusLastLocation_')) {
        const busId = key.replace('brokenBusLastLocation_', '');
        try {
          const lastKnownLocation = JSON.parse(localStorage.getItem(key));
          if (
            lastKnownLocation &&
            lastKnownLocation.lat &&
            lastKnownLocation.lng
          ) {
            this.createLastKnownBrokenMarker(busId, lastKnownLocation);
          } else {
            console.warn(
              `Invalid data in localStorage for ${key}:`,
              lastKnownLocation
            );
            localStorage.removeItem(key); // Clean up invalid data
          }
        } catch (e) {
          console.error(`Error parsing localStorage item ${key}:`, e);
          localStorage.removeItem(key); // Remove corrupted data
        }
      }
    }
  }

  toggleTraffic() {
    if (!this.isInitialized || !this.map || !this.trafficLayer) {
      console.error('Map not properly initialized:', {
        isInitialized: this.isInitialized,
        hasMap: !!this.map,
        hasTrafficLayer: !!this.trafficLayer,
      });
      throw new Error('Map or traffic layer not available');
    }

    try {
      if (this.isTrafficVisible) {
        this.trafficLayer.setMap(null);
        this.isTrafficVisible = false;
        return { visible: false, message: 'Capa de tráfico ocultada' };
      } else {
        this.trafficLayer.setMap(this.map);
        this.isTrafficVisible = true;
        return { visible: true, message: 'Capa de tráfico activada' };
      }
    } catch (error) {
      console.error('Error toggling traffic layer:', error);
      throw error;
    }
  }

  centerMap() {
    if (this.map) {
      this.map.setCenter(SANTO_DOMINGO_CENTER);
      this.map.setZoom(12);
      return true;
    }
    console.warn('Map not available for centering');
    return false;
  }

  focusOnBus(busId) {
    // Prioritize live bus marker
    let marker = this.busMarkers.get(busId);
    if (!marker) {
      // Fallback to last known broken marker
      marker = this.lastKnownBrokenMarkers.get(busId);
    }

    if (marker && this.map) {
      this.map.setCenter(marker.getPosition());
      this.map.setZoom(15); // Zoom in for better visibility
      return true;
    }
    return false;
  }

  // Utility methods
  isMapReady() {
    return this.isInitialized && !!this.map;
  }

  getMap() {
    return this.map;
  }

  getBusMarkers() {
    return this.busMarkers;
  }

  getStopMarkers() {
    return this.stopMarkers;
  }
}

// Create singleton instance
export const mapService = new MapService();
