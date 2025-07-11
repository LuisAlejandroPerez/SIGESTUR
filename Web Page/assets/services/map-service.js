import { SANTO_DOMINGO_CENTER, busIconSVG } from '../config/firebase-config.js';
import { gtfsService } from './gtfs-service.js';

export class MapService {
  constructor() {
    this.map = null;
    this.busMarkers = new Map();
    this.stopMarkers = new Map();
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
      // Verifica si Google esta disponible
      if (typeof window.google === 'undefined' || !window.google.maps) {
        console.error('Google Maps API not loaded');
        // Intente esperar a que se cargue Google Maps
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

      // Inicializar la capa de trafico
      this.trafficLayer = new window.google.maps.TrafficLayer();
      this.isInitialized = true;

      console.log('Google Maps initialized successfully');

      // La carga se detiene si hay datos GTFS disponibles
      const gtfsData = gtfsService.getGTFSData();
      if (gtfsData && gtfsData.stops) {
        this.loadStopsOnMap();
      }

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
    const maxAttempts = 50; // 10 segundos de espera maximo

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

    // Borrar los marcadores de parada existentes
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

        // Añadir ventana de informacion para la parada
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

    // Validar coordenadas
    if (isNaN(position.lat) || isNaN(position.lng)) {
      console.warn(`Invalid coordinates for bus ${busId}:`, position);
      return;
    }

    // Uitlizar verde para las OMSAS activas y rojo para las averiadas
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

      // Agregar un click listener para mostrar la info de esa OMSA
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
    const marker = this.busMarkers.get(busId);
    if (marker && this.map) {
      this.map.setCenter(marker.getPosition());
      this.map.setZoom(15);
      return true;
    }
    return false;
  }

  // Metodos de utilidad
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

// Instancia singleton
export const mapService = new MapService();
