import { driverInfo } from '../config/firebase-config.js';

export class UIManager {
  constructor() {
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Modal close
    const closeBtn = document.querySelector('.close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeModal());
    }

    const modal = document.getElementById('bus-modal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target.id === 'bus-modal') {
          this.closeModal();
        }
      });
    }
  }

  updateBusCounters(active, broken) {
    const totalBusesElement = document.getElementById('total-buses');
    const brokenBusesElement = document.getElementById('broken-buses');

    if (totalBusesElement) totalBusesElement.textContent = active;
    if (brokenBusesElement) brokenBusesElement.textContent = broken;
  }

  updateStopsCounter(count) {
    const totalStopsElement = document.getElementById('total-stops');
    if (totalStopsElement) {
      totalStopsElement.textContent = count;
    }
  }

  updateBusList(activeBuses, brokenBuses) {
    const busesList = document.getElementById('buses-list');
    if (!busesList) return;

    // Almacenar el valor de busqueda actual si existe
    const existingSearch = busesList.querySelector('input[type="text"]');
    const currentSearchValue = existingSearch ? existingSearch.value : '';

    // Borrar y agregar entrada de busqueda
    busesList.innerHTML = '';

    // Añadir funcionalidad de busqueda
    const searchContainer = this.createSearchContainer();
    const searchInput = searchContainer.querySelector('input');
    searchInput.value = currentSearchValue; // Restaurar busqueda anterior

    busesList.appendChild(searchContainer);

    //Funcion de filtro y visualización
    const displayBuses = (searchTerm = '') => {
      // Borrar elementos y mensajes de OMSAS existentes (mantener la busqueda)
      const busItems = busesList.querySelectorAll('.bus-item');
      const noResultsMessages = busesList.querySelectorAll(
        '.no-results-message'
      );

      busItems.forEach((item) => item.remove());
      noResultsMessages.forEach((msg) => msg.remove());

      // Filtrar OMSAS activas segun la busqueda
      const filteredBuses = activeBuses.filter((busInfo) =>
        busInfo.id.toLowerCase().includes(searchTerm.toLowerCase())
      );

      // Agregar solo OMSAS activas filtradas
      filteredBuses.forEach((busInfo) => {
        const busItem = this.createBusListItem(busInfo, false);
        busesList.appendChild(busItem);
      });

      // Mostrar mensaje si no hay OMSAS que coincidan
      if (filteredBuses.length === 0) {
        const noResultsMsg = document.createElement('p');
        noResultsMsg.className = 'no-results-message';
        noResultsMsg.style.cssText =
          'text-align: center; color: var(--text-muted); padding: 1rem; margin: 0;';
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

    // Pantalla inicial con el valor de busqueda actual
    displayBuses(currentSearchValue);
  }

  createSearchContainer() {
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
    searchInput.style.cssText = `
      width: 100%;
      padding: 0.5rem;
      border: 1px solid var(--border-color);
      border-radius: var(--radius-sm);
      font-size: 0.9rem;
      outline: none;
      box-sizing: border-box;
      background: var(--bg-secondary);
      color: var(--text-primary);
      transition: all var(--transition-normal);
    `;

    searchContainer.appendChild(searchInput);
    return searchContainer;
  }

  createBusListItem(busInfo, isBroken) {
    const { id: busId, tripId, routeInfo } = busInfo;

    const item = document.createElement('div');
    item.className = `bus-item ${isBroken ? 'broken' : ''}`;
    item.innerHTML = `
      <div>
        <div class="bus-id">OMSA ${busId}</div>
        ${
          routeInfo
            ? `<div style="font-size: 0.8rem; color: var(--text-muted);">${routeInfo.shortName}</div>`
            : ''
        }
      </div>
      <div class="bus-status ${isBroken ? 'broken' : 'active'}">
        ${isBroken ? 'Averiada' : 'Activa'}
      </div>
    `;

    item.addEventListener('click', () => {
      if (!isBroken && window.focusOnBus) {
        window.focusOnBus(busId);
      }
      if (window.showBusInfoModal) {
        window.showBusInfoModal(busInfo);
      }
    });

    return item;
  }

  updateAlerts(brokenBuses) {
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
        if (window.showBusInfoModal) {
          window.showBusInfoModal(busInfo);
        }
      });

      alertsContainer.appendChild(alertItem);
    });
  }

  showBusInfo(busInfo) {
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

    // Eliminar las clases de estado de bus existentes
    modalContent.classList.remove('bus-active', 'bus-broken');

    // Agregue la clase apropiada segun el estado del autobus
    if (isBroken) {
      modalContent.classList.add('bus-broken');
    } else {
      modalContent.classList.add('bus-active');
    }

    const timestamp = new Date(busData.timestamp * 1000);
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

    // Actualizar el título modal con el icono apropiado
    const modalTitle = modal.querySelector('#modal-title');
    if (modalTitle) {
      modalTitle.innerHTML = `🚌 Información de la OMSA`;
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

    // Comportamiento de desplazamiento suave al contenido modal
    modalContent.style.scrollBehavior = 'smooth';
  }

  closeModal() {
    const modal = document.getElementById('bus-modal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  showAlert(message, type = 'error') {
    // Eliminar alertas existentes
    const existingAlerts = document.querySelectorAll('.temp-alert');
    existingAlerts.forEach((alert) => alert.remove());

    // Crear nueva alerta
    const alertDiv = document.createElement('div');
    alertDiv.className = 'temp-alert';
    alertDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 1rem 1.5rem;
      background-color: ${this.getAlertColor(type)};
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

    // Eliminacion automatica despues de 4seg
    setTimeout(() => {
      if (alertDiv.parentNode) {
        alertDiv.remove();
      }
    }, 4000);
  }

  getAlertColor(type) {
    switch (type) {
      case 'success':
        return '#4CAF50';
      case 'warning':
        return '#FF9800';
      case 'info':
        return '#2196F3';
      case 'breakdown':
        return '#F44336'; // Roja para las notificaciones de averia
      case 'recovery':
        return '#4CAF50'; // Verde para notificaciones de recuperacion
      default:
        return '#F44336';
    }
  }
}

// Instancia singleton
export const uiManager = new UIManager();
