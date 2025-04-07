// Tipos compatibles
const TIPOS_COMPATIBLES = {
    'Motocicleta': ['Motocicleta'],
    'Automóvil': ['Automóvil', 'Eléctrico'],
    'Camión': ['Camión'],
    'Discapacitados': ['Automóvil', 'Eléctrico'],
    'Eléctrico': ['Eléctrico']
};

// Variables para control de acciones
let currentAction = null;
let currentSpaceId = null;

// Cargar espacios al iniciar
document.addEventListener('DOMContentLoaded', () => {
    loadParkingSpaces();
    setupModalEvents();
    setupSpaceManagement();
    setupAuthModal();
});

// Configuración de gestión de espacios
function setupSpaceManagement() {
    // Configurar botón para añadir espacio
    const addSpaceBtn = document.createElement('button');
    addSpaceBtn.id = 'add-space-btn';
    addSpaceBtn.className = 'btn btn-primary';
    addSpaceBtn.innerHTML = '<i class="fas fa-plus"></i> Añadir Espacio';
    document.querySelector('.header').appendChild(addSpaceBtn);

    addSpaceBtn.addEventListener('click', () => {
        currentAction = 'add';
        showAuthModal();
    });
}

// Configurar eventos del modal de autenticación
function setupAuthModal() {
    const authModal = document.getElementById('auth-modal');
    const confirmBtn = document.getElementById('confirm-auth');
    const cancelBtn = document.getElementById('cancel-auth');
    const closeBtn = authModal.querySelector('.close-modal');

    confirmBtn.addEventListener('click', async () => {
        const username = document.getElementById('auth-username').value;
        const password = document.getElementById('auth-password').value;

        if (!username || !password) {
            alert('Por favor ingrese usuario y contraseña');
            return;
        }

        const isValid = await verifyCredentials(username, password);
        
        if (isValid) {
            authModal.style.display = 'none';
            handleVerifiedAction();
        } else {
            alert('Credenciales incorrectas');
        }
    });

    cancelBtn.addEventListener('click', () => {
        authModal.style.display = 'none';
    });

    closeBtn.addEventListener('click', () => {
        authModal.style.display = 'none';
    });

    window.addEventListener('click', (event) => {
        if (event.target === authModal) {
            authModal.style.display = 'none';
        }
    });
}

// Mostrar modal de autenticación
function showAuthModal() {
    document.getElementById('auth-modal').style.display = 'block';
    document.getElementById('auth-username').value = '';
    document.getElementById('auth-password').value = '';
    document.getElementById('auth-username').focus();
}

// Función para verificar credenciales
async function verifyCredentials(username, password) {
    try {
        const response = await fetch('http://localhost:3000/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        if (!response.ok) {
            throw new Error(`Error HTTP! estado: ${response.status}`);
        }

        const data = await response.json();
        return data.success;
    } catch (error) {
        console.error('Error al verificar credenciales:', error);
        return false;
    }
}

// Manejar acción después de verificación
async function handleVerifiedAction() {
    switch (currentAction) {
        case 'add':
            showAddSpaceModal();
            break;
        case 'delete':
            if (await deleteSpace(currentSpaceId)) {
                document.querySelector(`.space-item[data-space-id="${currentSpaceId}"]`).remove();
            }
            break;
        case 'toggle':
            await toggleSpaceStatus(currentSpaceId);
            loadParkingSpaces();
            break;
    }
}

// Mostrar modal para añadir espacio
function showAddSpaceModal() {
    const modal = document.getElementById('add-space-modal');
    const form = document.getElementById('add-space-form');
    const cancelBtn = document.getElementById('cancel-add');
    const closeBtn = modal.querySelector('.close-modal');

    form.onsubmit = async (e) => {
        e.preventDefault();
        
        const spaceData = {
            codigo: document.getElementById('space-code').value,
            tipo_id: document.getElementById('space-type').value,
            piso: document.getElementById('space-floor').value,
            zona: document.getElementById('space-zone').value,
            estado: 'Disponible'
        };

        if (await addNewSpace(spaceData)) {
            modal.style.display = 'none';
            loadParkingSpaces();
        }
    };

    cancelBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });

    modal.style.display = 'block';
}

// Función para añadir nuevo espacio
async function addNewSpace(spaceData) {
    try {
        const response = await fetch('/api/espacios', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(spaceData)
        });

        const result = await response.json();
        
        if (result.success) {
            alert('Espacio añadido correctamente');
            return true;
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error('Error al añadir espacio:', error);
        alert('Error al añadir espacio: ' + error.message);
        return false;
    }
}

// Función para eliminar espacio
async function deleteSpace(spaceId) {
    if (!confirm('¿Está seguro que desea eliminar este espacio permanentemente?')) {
        return false;
    }

    try {
        const response = await fetch(`/api/espacios/${spaceId}`, {
            method: 'DELETE'
        });

        const result = await response.json();
        
        if (result.success) {
            alert('Espacio eliminado correctamente');
            return true;
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error('Error al eliminar espacio:', error);
        alert('Error al eliminar espacio: ' + error.message);
        return false;
    }
}

// Función para cambiar estado de espacio
async function toggleSpaceStatus(spaceId) {
    try {
        // Primero obtener el estado actual
        const getResponse = await fetch(`/api/espacios/${spaceId}`);
        const spaceData = await getResponse.json();
        
        if (!spaceData.success) {
            throw new Error(spaceData.message);
        }

        const newStatus = spaceData.data.estado === 'Disponible' ? 'Mantenimiento' : 'Disponible';
        
        // Actualizar el estado
        const updateResponse = await fetch(`/api/espacios/${spaceId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                ...spaceData.data,
                estado: newStatus
            })
        });

        const result = await updateResponse.json();
        
        if (!result.success) {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error('Error al cambiar estado:', error);
        alert('Error al cambiar estado: ' + error.message);
    }
}

// Función para cargar espacios
async function loadParkingSpaces() {
    try {
        const response = await fetch('http://localhost:3000/api/espacios-disponibles');
        
        if (!response.ok) {
            // Si el error es 404, sugiere revisar la ruta en el servidor
            if (response.status === 404) {
                throw new Error(`La ruta no existe. Verifica que '/api/espacios-disponibles' esté correctamente definida en el servidor.`);
            }
            throw new Error(`Error HTTP! estado: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.success) {
            displayParkingSpaces(data.data);
        } else {
            throw new Error(data.message || 'Error en la respuesta del servidor');
        }
    } catch (error) {
        console.error('Error al cargar espacios:', error);
        alert(`Error al cargar espacios: ${error.message}\n\nVerifica la consola para más detalles.`);
    }
}

// Función para mostrar espacios
function displayParkingSpaces(spaces) {
    const parkingGrid = document.getElementById('parking-grid');
    parkingGrid.innerHTML = '';

    spaces.forEach(space => {
        const spaceCard = document.createElement('div');
        spaceCard.className = `parking-space ${space.estado.toLowerCase()}`;
        spaceCard.dataset.spaceId = space.id;
        
        spaceCard.innerHTML = `
            <div class="space-header">
                <h3>${space.codigo}</h3>
                <span class="badge ${space.estado.toLowerCase()}">${space.estado}</span>
            </div>
            <div class="space-body">
                <p><strong>Ubicación:</strong> Piso ${space.piso}, Zona ${space.zona}</p>
                <p><strong>Tipo:</strong> ${space.tipo}</p>
                ${space.vehiculo ? `
                <div class="vehicle-info">
                    <p><strong>Vehículo:</strong> ${space.vehiculo.placa}</p>
                    <p><strong>Tipo:</strong> ${space.vehiculo.tipo}</p>
                </div>
                ` : ''}
            </div>
            <div class="space-actions">
                <button class="btn ${space.estado === 'Disponible' ? 'btn-assign' : 'btn-release'}" 
                    data-space-id="${space.id}">
                    ${space.estado === 'Disponible' ? 'Asignar' : 'Liberar'}
                </button>
                <button class="btn btn-secondary toggle-space" data-space-id="${space.id}">
                    ${space.estado === 'Disponible' ? 'Deshabilitar' : 'Habilitar'}
                </button>
                <button class="btn btn-danger delete-space" data-space-id="${space.id}">
                    Eliminar
                </button>
            </div>
        `;
        parkingGrid.appendChild(spaceCard);
    });

    // Configurar eventos para los nuevos botones
    document.querySelectorAll('.delete-space').forEach(btn => {
        btn.addEventListener('click', (e) => {
            currentAction = 'delete';
            currentSpaceId = e.target.dataset.spaceId;
            showAuthModal();
        });
    });

    document.querySelectorAll('.toggle-space').forEach(btn => {
        btn.addEventListener('click', (e) => {
            currentAction = 'toggle';
            currentSpaceId = e.target.dataset.spaceId;
            showAuthModal();
        });
    });
}

// Configurar eventos de los modales existentes
function setupModalEvents() {
    // Modal de asignación de vehículo (existente)
    const assignModal = document.getElementById('assign-modal');
    const closeAssignModal = document.getElementById('close-modal');
    const cancelBtn = document.getElementById('cancel-btn');

    closeAssignModal.addEventListener('click', () => {
        assignModal.style.display = 'none';
    });

    cancelBtn.addEventListener('click', () => {
        assignModal.style.display = 'none';
    });

    window.addEventListener('click', (event) => {
        if (event.target === assignModal) {
            assignModal.style.display = 'none';
        }
    });

    // Formulario de asignación
    document.getElementById('assign-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await assignVehicleToSpace();
    });
}

// Función para asignar vehículo (existente)
async function assignVehicleToSpace() {
    const espacioId = document.getElementById('espacio_id').value;
    const placa = document.getElementById('placa').value.toUpperCase();
    const tipoVehiculo = document.getElementById('tipo_vehiculo').value;

    try {
        const response = await fetch('/api/asignar-vehiculo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ espacio_id: espacioId, placa, tipo: tipoVehiculo })
        });

        const result = await response.json();
        if (!result.success) throw new Error(result.message);

        alert('Vehículo asignado correctamente');
        document.getElementById('assign-modal').style.display = 'none';
        loadParkingSpaces();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

// Función para abrir modal de asignación (existente)
async function openAssignModal(spaceId) {
    try {
        const response = await fetch(`/api/espacios-disponibles`);
        const { data } = await response.json();
        const espacio = data.find(s => s.id == spaceId);

        document.getElementById('espacio_id').value = spaceId;
        document.getElementById('space-type').textContent = espacio.tipo;

        const select = document.getElementById('tipo_vehiculo');
        select.innerHTML = '';
        const tiposPermitidos = TIPOS_COMPATIBLES[espacio.tipo] || [];
        
        tiposPermitidos.forEach(tipo => {
            const option = document.createElement('option');
            option.value = tipo;
            option.textContent = tipo;
            select.appendChild(option);
        });

        document.getElementById('assign-modal').style.display = 'block';
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

// Configurar eventos de clic para asignar/liberar
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('btn-assign')) {
        openAssignModal(e.target.getAttribute('data-space-id'));
    }
    if (e.target.classList.contains('btn-release')) {
        releaseParkingSpace(e.target.getAttribute('data-space-id'));
    }
});

// Función para liberar espacio (existente)
async function releaseParkingSpace(spaceId) {
    if (!confirm('¿Está seguro que desea liberar este espacio?')) return;
    
    try {
        const btn = document.querySelector(`.btn-release[data-space-id="${spaceId}"]`);
        const spaceCard = btn.closest('.parking-space');
        
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Liberando...';

        const response = await fetch(`/api/liberar-espacio/${spaceId}`, {
            method: 'POST'
        });

        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.message || 'Error al liberar espacio');
        }

        spaceCard.className = spaceCard.className.replace('ocupado', 'disponible');
        spaceCard.querySelector('.badge').className = 'badge disponible';
        spaceCard.querySelector('.badge').textContent = 'Disponible';
        btn.className = 'btn btn-assign';
        btn.textContent = 'Asignar';
        
        const vehicleInfo = spaceCard.querySelector('.vehicle-info');
        if (vehicleInfo) vehicleInfo.remove();

        setTimeout(loadParkingSpaces, 1000);
        
        alert('Espacio liberado correctamente');
    } catch (error) {
        alert('Error: ' + error.message);
        loadParkingSpaces();
    }
}
