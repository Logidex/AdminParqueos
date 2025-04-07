// Configuración
const API_BASE_URL = 'http://localhost:3000/api/dashboard';

// Función para mostrar mensajes de error
function showError(message) {
  const errorElement = document.getElementById('error-message');
  errorElement.textContent = message;
  errorElement.style.display = 'block';
  setTimeout(() => {
    errorElement.style.display = 'none';
  }, 5000);
}

// Función para cargar estadísticas
async function loadStats() {
  try {
    const authToken = localStorage.getItem('authToken');
    const response = await fetch(`${API_BASE_URL}/stats`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }

    const { success, data, message } = await response.json();
    
    if (!success) {
      throw new Error(message);
    }

    document.getElementById('total-spaces').textContent = data.totalSpaces || '0';
    document.getElementById('occupied').textContent = data.occupied || '0';
    document.getElementById('available').textContent = data.available || '0';
  } catch (error) {
    console.error('Error al cargar estadísticas:', error);
    showError('Error al cargar estadísticas. Intente nuevamente.');
  }
}

// Función para cargar movimientos
async function loadMovements() {
  try {
    const authToken = localStorage.getItem('authToken');
    const response = await fetch(`${API_BASE_URL}/movements`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }

    const { success, data, message } = await response.json();
    
    if (!success) {
      throw new Error(message);
    }

    const tableBody = document.getElementById('movements-table');
    tableBody.innerHTML = '';

    if (!data || data.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="4">No hay movimientos recientes</td>
        </tr>
      `;
      return;
    }

    data.forEach(movement => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${movement.spaceCode || 'N/A'}</td>
        <td>${movement.plate || 'N/A'}</td>
        <td>${new Date(movement.entryTime).toLocaleString() || 'N/A'}</td>
        <td>
          <span class="status ${movement.status?.toLowerCase()}">
            ${movement.status || 'N/A'}
          </span>
        </td>
      `;
      tableBody.appendChild(row);
    });
  } catch (error) {
    console.error('Error al cargar movimientos:', error);
    showError('Error al cargar movimientos. Intente nuevamente.');
  }
}

// Función principal para cargar el dashboard
async function loadDashboard() {
  try {
    document.getElementById('refresh-btn').disabled = true;
    document.getElementById('refresh-btn').innerHTML = `
      <i class="fas fa-spinner fa-spin"></i> Cargando...
    `;
    
    await Promise.all([loadStats(), loadMovements()]);
  } catch (error) {
    console.error('Error general:', error);
  } finally {
    document.getElementById('refresh-btn').disabled = false;
    document.getElementById('refresh-btn').innerHTML = `
      <i class="fas fa-sync-alt"></i> Actualizar
    `;
  }
}

// Event Listeners
document.getElementById('refresh-btn').addEventListener('click', loadDashboard);

// Cargar datos al iniciar
document.addEventListener('DOMContentLoaded', () => {
  // Verificar autenticación
  if (!localStorage.getItem('authToken')) {
    window.location.href = 'login.html';
    return;
  }
  
  loadDashboard();
  
  // Actualizar cada 30 segundos
  setInterval(loadDashboard, 30000);
});