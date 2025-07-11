import { uiManager } from '../ui/ui-manager.js';

export class ReportService {
  constructor() {
    // Asegurar de que jsPDF este cargado
    if (
      typeof window.jspdf === 'undefined' ||
      typeof window.jspdf.jsPDF === 'undefined'
    ) {
      console.error(
        'jsPDF library not loaded. Make sure the CDN script is included.'
      );
      uiManager.showAlert('Error: Librería de PDF no cargada.', 'error');
    }
  }

  async generateStatisticsReport(activeBuses, brokenBuses, gtfsData) {
    if (
      typeof window.jspdf === 'undefined' ||
      typeof window.jspdf.jsPDF === 'undefined'
    ) {
      uiManager.showAlert('Error: Librería de PDF no disponible.', 'error');
      return;
    }

    uiManager.showAlert('Generando reporte PDF...', 'info');

    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();

      let y = 20; // Posicion inicial Y

      // Titulo
      doc.setFontSize(22);
      doc.text(
        'Reporte de Estadísticas de OMSAs',
        105,
        y,
        null,
        null,
        'center'
      );
      y += 10;

      // Fecha
      doc.setFontSize(10);
      doc.text(
        `Fecha de Generación: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
        105,
        y,
        null,
        null,
        'center'
      );
      y += 20;

      // Resumen
      doc.setFontSize(16);
      doc.text('Resumen General', 20, y);
      y += 10;
      doc.setFontSize(12);
      doc.text(`Total de OMSAs Activas: ${activeBuses.length}`, 20, y);
      y += 7;
      doc.text(
        `Total de OMSAs Averiadas (actualmente): ${brokenBuses.length}`,
        20,
        y
      );
      y += 7;
      doc.text(`Total de Paradas Registradas: ${gtfsData.stops.length}`, 20, y);
      y += 7;
      doc.text(`Total de Rutas Registradas: ${gtfsData.routes.length}`, 20, y);
      y += 15;

      // Seccion de OMSAS averiadas
      if (brokenBuses.length > 0) {
        doc.setFontSize(16);
        doc.text('OMSA Averiadas', 20, y);
        y += 10;
        doc.setFontSize(12);

        brokenBuses.forEach((bus, index) => {
          if (y > 280) {
            // Comprobar si se necesita una nueva pagina
            doc.addPage();
            y = 20;
            doc.setFontSize(16);
            doc.text('OMSA Averiadas (Continuación)', 20, y);
            y += 10;
            doc.setFontSize(12);
          }
          const routeName = bus.routeInfo
            ? `Ruta: ${bus.routeInfo.shortName} - ${bus.routeInfo.longName}`
            : 'Ruta: Desconocida';
          doc.text(`- OMSA ID: ${bus.id} (${routeName})`, 20, y);
          y += 7;
          doc.text(
            `  Última señal: ${new Date(
              bus.data.timestamp * 1000
            ).toLocaleString()}`,
            25,
            y
          );
          y += 10;
        });
      } else {
        doc.setFontSize(16);
        doc.text('OMSA Averiadas', 20, y);
        y += 10;
        doc.setFontSize(12);
        doc.text('No hay OMSAs averiadas actualmente. ¡Todo en orden!', 20, y);
        y += 15;
      }

      // Save the PDF
      doc.save(
        `Reporte_Estadisticas_OMSAs_${new Date()
          .toISOString()
          .slice(0, 10)}.pdf`
      );
      uiManager.showAlert('Reporte PDF generado exitosamente.', 'success');
    } catch (error) {
      console.error('Error generating PDF report:', error);
      uiManager.showAlert('Error al generar el reporte PDF.', 'error');
    }
  }
}

//nstancia singleton
export const reportService = new ReportService();
