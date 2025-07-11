import { firebaseService } from './firebase-service.js';

export class GTFSService {
  constructor() {
    this.gtfsData = {
      stops: this.getMockStops(),
      routes: [],
      trips: [],
    };
  }

  async loadGTFSData() {
    try {
      console.log('Loading GTFS data from Firebase Storage...');

      // Define the GTFS files to load
      const gtfsFiles = [
        { name: 'stops', path: 'STATIC GTFS/stops.txt' },
        { name: 'routes', path: 'STATIC GTFS/routes.txt' },
        { name: 'trips', path: 'STATIC GTFS/trips.txt' },
      ];

      const gtfsResults = {};
      let successCount = 0;

      // Try to load each file
      for (const file of gtfsFiles) {
        try {
          console.log(`Attempting to load ${file.name} from ${file.path}...`);
          const text = await this.loadGTFSFileWithFetch(file.path);
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
        const parsedStops = this.parseGTFSStops(gtfsResults.stops);
        if (parsedStops.length > 0) {
          this.gtfsData.stops = parsedStops;
        }
      }

      if (gtfsResults.routes) {
        this.gtfsData.routes = this.parseGTFSRoutes(gtfsResults.routes);
      }

      if (gtfsResults.trips) {
        this.gtfsData.trips = this.parseGTFSTrips(gtfsResults.trips);
      }

      console.log('GTFS data processed:', {
        stops: this.gtfsData.stops.length,
        routes: this.gtfsData.routes.length,
        trips: this.gtfsData.trips.length,
        successfulFiles: successCount,
      });

      return {
        success: successCount > 0,
        data: this.gtfsData,
        successCount,
      };
    } catch (error) {
      console.error('Error loading GTFS data:', error);
      throw error;
    }
  }

  async loadGTFSFileWithFetch(filePath) {
    try {
      const downloadURL = await firebaseService.getFileDownloadURL(filePath);
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

  parseGTFSStops(csvText) {
    try {
      const lines = csvText.split('\n').filter((line) => line.trim());
      if (lines.length === 0) return [];

      const headers = lines[0]
        .split(',')
        .map((h) => h.trim().replace(/"/g, ''));
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

  parseGTFSRoutes(csvText) {
    try {
      const lines = csvText.split('\n').filter((line) => line.trim());
      if (lines.length === 0) return [];

      const headers = lines[0]
        .split(',')
        .map((h) => h.trim().replace(/"/g, ''));
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

  parseGTFSTrips(csvText) {
    try {
      const lines = csvText.split('\n').filter((line) => line.trim());
      if (lines.length === 0) return [];

      const headers = lines[0]
        .split(',')
        .map((h) => h.trim().replace(/"/g, ''));
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

  getMockStops() {
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

  getGTFSData() {
    return this.gtfsData;
  }
}

// Create singleton instance
export const gtfsService = new GTFSService();
