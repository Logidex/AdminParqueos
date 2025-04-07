require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const sql = require('mssql');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const app = express();

// Validación de variables de entorno requeridas
const requiredEnvVars = ['DB_USER', 'DB_PASSWORD', 'DB_SERVER', 'DB_NAME', 'JWT_SECRET'];
requiredEnvVars.forEach(env => {
  if (!process.env[env]) {
    throw new Error(`Falta la variable de entorno requerida: ${env}`);
  }
});

// Configuración de la base de datos (sin valores por defecto)
// Por esto (no recomendado para producción):
const dbConfig = {
  user: process.env.DB_USER || 'admin',
  password: process.env.DB_PASSWORD || 'Lol1212262830',
  server: process.env.DB_SERVER || 'dbparking.cres0o4iqxbh.us-east-2.rds.amazonaws.com',
  database: process.env.DB_NAME || 'AdminParqueos',
  options: {
    encrypt: true,
    trustServerCertificate: true // Solo para desarrollo
  }
};

const jwtSecret = process.env.JWT_SECRET || 'tu_clave_secreta_aqui';


// Middlewares de seguridad
app.use(helmet()); // Headers de seguridad HTTP
app.use(express.json({ limit: '10kb' })); // Limitar tamaño del payload

// Configuración CORS segura
// Configuración CORS mejorada
// Configuración CORS mejorada
const corsOptions = {
  origin: ['http://127.0.0.1:5500', 'http://localhost:5500', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Añadidos más métodos
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};
app.use(cors(corsOptions));

// Rate limiting para prevenir ataques de fuerza bruta
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // límite de 100 peticiones por IP
  message: 'Too many requests from this IP, please try again later'
});
app.use('/login', limiter);
app.use('/api/register', limiter);

// Pool de conexiones
let pool;
let isDbConnected = false;

async function initializePool() {
  try {
    pool = await sql.connect(dbConfig);
    isDbConnected = true;
    console.log('Conexión a la base de datos establecida');
    
    // Verificar conexión con una consulta simple
    await pool.request().query('SELECT 1 AS test');
    console.log('Conexión verificada con éxito');
    
    return pool;
  } catch (err) {
    console.error('Error al conectar con la base de datos:', err.message); // No mostrar detalles completos
    isDbConnected = false;
    // Reintentar conexión después de 5 segundos
    setTimeout(initializePool, 5000);
    throw err;
  }
}

initializePool();

// Middleware de autenticación JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ 
      success: false, 
      message: 'Token de autenticación requerido' 
    });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      console.error('Error al verificar token:', err);
      return res.status(403).json({ 
        success: false, 
        message: 'Token inválido o expirado',
        details: err.message 
      });
    }
    req.user = user;
    next();
  });
};
// Middleware para verificar conexión a la base de datos
const checkDbConnection = (req, res, next) => {
  if (!isDbConnected) {
    return res.status(503).json({ 
      success: false, 
      message: 'Servicio no disponible temporalmente. Intente nuevamente más tarde.' 
    });
  }
  next();
};

// Ruta de health check
app.get('/health', (req, res) => {
  const status = {
    status: 'OK',
    db: isDbConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  };
  res.json(status);
});

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Ruta de login
app.post('/login', checkDbConnection, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Usuario y contraseña son requeridos'
      });
    }

    // Buscar usuario en la base de datos
    const result = await pool
      .request()
      .input('username', sql.VarChar(50), username)
      .query('SELECT * FROM USUARIOS WHERE username = @username AND activo = 1');

    if (result.recordset.length === 0) {
      return res.status(401).json({ 
        success: false, 
        message: 'Credenciales inválidas' 
      });
    }

    const user = result.recordset[0];

    // Verificar contraseña
    const passwordMatch = await bcrypt.compare(password, user.password_hash.toString());
    if (!passwordMatch) {
      return res.status(401).json({ 
        success: false, 
        message: 'Credenciales inválidas' 
      });
    }

    // Obtener información del rol
    const rolResult = await pool
      .request()
      .input('rol_id', sql.Int, user.rol_id)
      .query('SELECT nombre, permisos FROM ROLES WHERE rol_id = @rol_id');

    const rol = rolResult.recordset[0];

    // Crear token JWT
    const token = jwt.sign(
      {
        userId: user.usuario_id,
        username: user.username,
        rol: rol.nombre,
        permisos: rol.permisos
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    // Actualizar último acceso
    await pool
      .request()
      .input('usuario_id', sql.Int, user.usuario_id)
      .query(
        'UPDATE USUARIOS SET ultimo_acceso = GETDATE() WHERE usuario_id = @usuario_id'
      );

    // Responder con el token y datos del usuario (sin información sensible)
    res.json({
      success: true,
      token,
      user: {
        id: user.usuario_id,
        username: user.username,
        nombre: user.nombre,
        apellido: user.apellido,
        email: user.email,
        rol: rol.nombre,
        avatar: user.avatar_url
      }
    });
  } catch (error) {
    console.error('Error en login:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error en el servidor' 
    });
  }
});

// Ruta protegida de ejemplo
app.get('/profile', authenticateToken, checkDbConnection, async (req, res) => {
  try {
    const user = await pool
      .request()
      .input('usuario_id', sql.Int, req.user.userId)
      .query(
        'SELECT usuario_id, username, nombre, apellido, email, avatar_url FROM USUARIOS WHERE usuario_id = @usuario_id'
      );

    if (user.recordset.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Usuario no encontrado' 
      });
    }

    res.json({ 
      success: true, 
      user: user.recordset[0] 
    });
  } catch (error) {
    console.error('Error al obtener perfil:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error en el servidor' 
    });
  }
});

// Ruta de registro
app.post('/api/register', checkDbConnection, async (req, res) => {
  try {
    const { username, email, password, nombre, apellido } = req.body;

    // Validaciones básicas
    if (!username || !email || !password || !nombre || !apellido) {
      return res.status(400).json({ 
        success: false, 
        message: 'Todos los campos son requeridos' 
      });
    }

    // Validar formato de email
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'El formato del email es inválido'
      });
    }

    // Validar fortaleza de contraseña
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'La contraseña debe tener al menos 8 caracteres'
      });
    }

    // Verificar si el usuario ya existe
    const userExists = await pool.request()
      .input('username', sql.VarChar(50), username)
      .input('email', sql.VarChar(100), email)
      .query(`
        SELECT usuario_id FROM USUARIOS 
        WHERE username = @username OR email = @email
      `);

    if (userExists.recordset.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'El usuario o email ya están registrados'
      });
    }

    // Generar salt y hash de la contraseña
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Convertir a Buffer para SQL Server
    const passwordHashBuffer = Buffer.from(hashedPassword);
    const saltBuffer = Buffer.from(salt);

    // Crear usuario en la base de datos
    const result = await pool.request()
      .input('username', sql.VarChar(50), username)
      .input('email', sql.VarChar(100), email)
      .input('password_hash', sql.VarBinary(256), passwordHashBuffer)
      .input('password_salt', sql.VarBinary(128), saltBuffer)
      .input('nombre', sql.VarChar(100), nombre)
      .input('apellido', sql.VarChar(100), apellido)
      .query(`
        INSERT INTO USUARIOS 
        (rol_id, username, password_hash, password_salt, email, nombre, apellido)
        VALUES (2, @username, @password_hash, @password_salt, @email, @nombre, @apellido);
        SELECT SCOPE_IDENTITY() AS usuario_id;
      `);

    const userId = result.recordset[0].usuario_id;

    // Responder con éxito
    res.status(201).json({
      success: true,
      message: 'Usuario registrado exitosamente',
      userId
    });

  } catch (error) {
    console.error('Error en registro:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error en el servidor al registrar usuario'
    });
  }
});

// Rutas del Dashboard
const dashboardRouter = express.Router();

// Ruta para obtener estadísticas del dashboard
dashboardRouter.get('/stats', authenticateToken, checkDbConnection, async (req, res) => {
  try {
    const result = await pool.request()
      .query(`
        SELECT 
          (SELECT COUNT(*) FROM ESPACIOS) AS totalSpaces,
          (SELECT COUNT(*) FROM ESPACIOS WHERE estado = 'Ocupado') AS occupied,
          (SELECT COUNT(*) FROM ESPACIOS WHERE estado = 'Disponible') AS available
      `);
    res.json({
      success: true,
      data: result.recordset[0]
    });
  } catch (error) {
    console.error('Error al obtener estadísticas:', error.message);
    res.status(500).json({ 
      success: false,
      message: 'Error al obtener estadísticas' 
    });
  }
});

// Ruta para obtener movimientos
dashboardRouter.get('/movements', authenticateToken, checkDbConnection, async (req, res) => {
  try {
    const result = await pool.request()
      .query(`
        SELECT TOP 10 
          e.codigo AS spaceCode,
          v.placa AS plate,
          CONVERT(varchar, m.fecha_hora, 120) AS entryTime,
          m.tipo AS status
        FROM MOVIMIENTOS m
        JOIN ESPACIOS e ON m.espacio_id = e.espacio_id
        LEFT JOIN VEHICULOS v ON m.vehiculo_id = v.vehiculo_id
        ORDER BY m.fecha_hora DESC
      `);
    res.json({
      success: true,
      data: result.recordset
    });
  } catch (error) {
    console.error('Error al obtener movimientos:', error.message);
    res.status(500).json({ 
      success: false,
      message: 'Error al obtener movimientos' 
    });
  }
});

// Ruta para obtener todos los tipos de espacio
app.get('/api/tipos-espacio', authenticateToken, checkDbConnection, async (req, res) => {
  try {
    const result = await pool.request()
      .query('SELECT tipo_id, nombre FROM TIPO_ESPACIO');

    res.json({
      success: true,
      data: result.recordset
    });
  } catch (error) {
    console.error('Error al obtener tipos de espacio:', error.message);
    res.status(500).json({ 
      success: false,
      message: 'Error al obtener tipos de espacio'
    });
  }
});

// Ruta para obtener espacios con filtros (protegida contra SQL injection)
app.get('/api/espacios', authenticateToken, checkDbConnection, async (req, res) => {
  try {
    const { search } = req.query;
    const request = pool.request();
    let query = `
      SELECT 
        e.espacio_id, 
        e.codigo, 
        e.tipo_id, 
        te.nombre AS tipo_nombre,
        e.ubicacion, 
        e.estado, 
        e.piso, 
        e.zona
      FROM ESPACIOS e
      JOIN TIPO_ESPACIO te ON e.tipo_id = te.tipo_id
    `;

    if (search) {
      query += `
        WHERE e.codigo LIKE '%' + @search + '%' 
        OR te.nombre LIKE '%' + @search + '%'
        OR e.ubicacion LIKE '%' + @search + '%'
      `;
      request.input('search', sql.VarChar(100), search);
    }

    const result = await request.query(query);
    
    res.json({
      success: true,
      data: result.recordset
    });
  } catch (error) {
    console.error('Error al obtener espacios:', error.message);
    res.status(500).json({ 
      success: false,
      message: 'Error al obtener espacios' 
    });
  }
});

// Ruta para crear un nuevo espacio
app.post('/api/espacios', authenticateToken, checkDbConnection, async (req, res) => {
  try {
    const { codigo, tipo_id, ubicacion, estado, piso, zona } = req.body;

    // Validaciones básicas
    if (!codigo || !tipo_id || !ubicacion || !estado) {
      return res.status(400).json({
        success: false,
        message: 'Código, tipo, ubicación y estado son requeridos'
      });
    }

    // Validar estado válido
    const estadosValidos = ['Disponible', 'Ocupado', 'Mantenimiento'];
    if (!estadosValidos.includes(estado)) {
      return res.status(400).json({
        success: false,
        message: 'Estado no válido'
      });
    }

    const result = await pool.request()
      .input('codigo', sql.VarChar(20), codigo)
      .input('tipo_id', sql.Int, tipo_id)
      .input('ubicacion', sql.VarChar(100), ubicacion)
      .input('estado', sql.VarChar(20), estado)
      .input('piso', sql.Int, piso)
      .input('zona', sql.VarChar(50), zona)
      .query(`
        INSERT INTO ESPACIOS 
        (codigo, tipo_id, ubicacion, estado, piso, zona)
        VALUES (@codigo, @tipo_id, @ubicacion, @estado, @piso, @zona);
        SELECT SCOPE_IDENTITY() AS espacio_id;
      `);

    res.status(201).json({
      success: true,
      message: 'Espacio creado exitosamente',
      espacio_id: result.recordset[0].espacio_id
    });
  } catch (error) {
    console.error('Error al crear espacio:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error al crear espacio'
    });
  }
});

// Ruta para actualizar un espacio
app.put('/api/espacios/:id', authenticateToken, checkDbConnection, async (req, res) => {
  try {
    const { id } = req.params;
    const { codigo, tipo_id, ubicacion, estado, piso, zona } = req.body;

    // Validaciones básicas
    if (!codigo || !tipo_id || !ubicacion || !estado) {
      return res.status(400).json({
        success: false,
        message: 'Código, tipo, ubicación y estado son requeridos'
      });
    }

    await pool.request()
      .input('espacio_id', sql.Int, id)
      .input('codigo', sql.VarChar(20), codigo)
      .input('tipo_id', sql.Int, tipo_id)
      .input('ubicacion', sql.VarChar(100), ubicacion)
      .input('estado', sql.VarChar(20), estado)
      .input('piso', sql.Int, piso)
      .input('zona', sql.VarChar(50), zona)
      .query(`
        UPDATE ESPACIOS SET
          codigo = @codigo,
          tipo_id = @tipo_id,
          ubicacion = @ubicacion,
          estado = @estado,
          piso = @piso,
          zona = @zona
        WHERE espacio_id = @espacio_id
      `);

    res.json({
      success: true,
      message: 'Espacio actualizado exitosamente'
    });
  } catch (error) {
    console.error('Error al actualizar espacio:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar espacio'
    });
  }
});

// Ruta para obtener un espacio específico
app.get('/api/espacios/:id', authenticateToken, checkDbConnection, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.request()
      .input('espacio_id', sql.Int, id)
      .query(`
        SELECT 
          e.espacio_id, 
          e.codigo, 
          e.tipo_id, 
          te.nombre AS tipo_nombre,
          e.ubicacion, 
          e.estado, 
          e.piso, 
          e.zona
        FROM ESPACIOS e
        JOIN TIPO_ESPACIO te ON e.tipo_id = te.tipo_id
        WHERE e.espacio_id = @espacio_id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Espacio no encontrado'
      });
    }

    res.json({
      success: true,
      data: result.recordset[0]
    });
  } catch (error) {
    console.error('Error al obtener espacio:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error al obtener espacio'
    });
  }
});

app.get('/api/espacios-disponibles', checkDbConnection, async (req, res) => {
  try {
      const result = await pool.request().query(`
          SELECT 
              e.espacio_id as id,
              e.codigo,
              te.nombre as tipo,
              e.piso,
              e.zona,
              e.estado,
              v.placa,
              v.tipo as tipo_vehiculo
          FROM ESPACIOS e
          JOIN TIPO_ESPACIO te ON e.tipo_id = te.tipo_id
          LEFT JOIN MOVIMIENTOS m ON e.espacio_id = m.espacio_id AND m.tipo = 'Entrada'
          LEFT JOIN VEHICULOS v ON m.vehiculo_id = v.vehiculo_id
          WHERE e.estado IN ('Disponible', 'Ocupado')
          ORDER BY e.piso, e.zona, e.codigo
      `);

      const espacios = result.recordset.map(space => ({
          id: space.id,
          codigo: space.codigo,
          tipo: space.tipo,
          piso: space.piso,
          zona: space.zona,
          estado: space.placa ? 'Ocupado' : space.estado,
          vehiculo: space.placa ? {
              placa: space.placa,
              tipo: space.tipo_vehiculo
          } : null
      }));

      res.json({ success: true, data: espacios });
  } catch (error) {
      console.error('Error al obtener espacios:', error);
      res.status(500).json({ 
          success: false, 
          message: 'Error al obtener espacios',
          error: error.message
      });
  }
});

app.post('/api/asignar-vehiculo', checkDbConnection, async (req, res) => {
  const { espacio_id, placa, tipo } = req.body;
  const transaction = new sql.Transaction(pool);
  
  try {
    await transaction.begin();
    
    // Registrar o encontrar vehículo
    let result = await new sql.Request(transaction)
      .input('placa', sql.VarChar(20), placa)
      .query('SELECT vehiculo_id FROM VEHICULOS WHERE placa = @placa');

    let vehiculo_id = result.recordset[0]?.vehiculo_id;
    if (!vehiculo_id) {
      result = await new sql.Request(transaction)
        .input('placa', sql.VarChar(20), placa)
        .input('tipo', sql.VarChar(50), tipo)
        .query(`
          INSERT INTO VEHICULOS (placa, tipo) 
          VALUES (@placa, @tipo);
          SELECT SCOPE_IDENTITY() AS vehiculo_id;
        `);
      vehiculo_id = result.recordset[0].vehiculo_id;
    }

    // Actualizar espacio
    await new sql.Request(transaction)
      .input('espacio_id', sql.Int, espacio_id)
      .input('vehiculo_id', sql.Int, vehiculo_id)
      .query(`
        UPDATE ESPACIOS 
        SET estado = 'Ocupado', vehiculo_id = @vehiculo_id
        WHERE espacio_id = @espacio_id
      `);

    // Registrar movimiento
    await new sql.Request(transaction)
      .input('espacio_id', sql.Int, espacio_id)
      .input('vehiculo_id', sql.Int, vehiculo_id)
      .query(`
        INSERT INTO MOVIMIENTOS (espacio_id, vehiculo_id, tipo)
        VALUES (@espacio_id, @vehiculo_id, 'Entrada')
      `);

    await transaction.commit();
    res.json({ success: true, message: 'Vehículo asignado correctamente' });
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({ success: false, message: 'Error al asignar vehículo' });
  }
});

// Ruta para liberar espacio
app.post('/api/liberar-espacio/:id', checkDbConnection, async (req, res) => {
  const transaction = new sql.Transaction(pool);
  
  try {
    const espacioId = req.params.id;

    await transaction.begin();

    // 1. Verificar el espacio
    const espacio = await new sql.Request(transaction)
      .input('espacio_id', sql.Int, espacioId)
      .query('SELECT estado, vehiculo_id FROM ESPACIOS WHERE espacio_id = @espacio_id');

    if (espacio.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Espacio no encontrado' });
    }

    // 2. Actualizar espacio a Disponible
    await new sql.Request(transaction)
      .input('espacio_id', sql.Int, espacioId)
      .query(`
        UPDATE ESPACIOS 
        SET estado = 'Disponible', vehiculo_id = NULL
        WHERE espacio_id = @espacio_id
      `);

    // 3. Registrar movimiento de salida
    await new sql.Request(transaction)
      .input('espacio_id', sql.Int, espacioId)
      .input('vehiculo_id', sql.Int, espacio.recordset[0].vehiculo_id)
      .query(`
        INSERT INTO MOVIMIENTOS (espacio_id, vehiculo_id, tipo)
        VALUES (@espacio_id, @vehiculo_id, 'Salida')
      `);

    await transaction.commit();
    res.json({ success: true, message: 'Espacio liberado correctamente' });
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({ success: false, message: 'Error al liberar espacio' });
  }
});

// Ruta para eliminar un espacio (añadir junto a las otras rutas de espacios)
app.delete('/api/espacios/:id', authenticateToken, checkDbConnection, async (req, res) => {
  try {
      const { id } = req.params;

      // Verificar permisos del usuario
      if (req.user.rol !== 'Administrador') {
          return res.status(403).json({
              success: false,
              message: 'No tiene permisos para esta acción'
          });
      }

      // Verificar si el espacio está ocupado
      const espacio = await pool.request()
          .input('espacio_id', sql.Int, id)
          .query('SELECT estado FROM ESPACIOS WHERE espacio_id = @espacio_id');

      if (espacio.recordset.length === 0) {
          return res.status(404).json({
              success: false,
              message: 'Espacio no encontrado'
          });
      }

      if (espacio.recordset[0].estado === 'Ocupado') {
          return res.status(400).json({
              success: false,
              message: 'No se puede eliminar un espacio ocupado'
          });
      }

      // Eliminar el espacio
      await pool.request()
          .input('espacio_id', sql.Int, id)
          .query('DELETE FROM ESPACIOS WHERE espacio_id = @espacio_id');

      res.json({
          success: true,
          message: 'Espacio eliminado correctamente'
      });
  } catch (error) {
      console.error('Error al eliminar espacio:', error.message);
      res.status(500).json({
          success: false,
          message: 'Error al eliminar espacio'
      });
  }
});

// Montar las rutas bajo /api/dashboard
app.use('/api/dashboard', dashboardRouter);

// Manejador de errores global
app.use((err, req, res, next) => {
  console.error('Error global:', err.message);
  res.status(500).json({
    success: false,
    message: 'Error interno del servidor'
  });
});

// Ruta 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Ruta no encontrada'
  });
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

// Manejo de cierre de conexión
process.on('SIGINT', async () => {
  try {
    await pool.close();
    console.log('Conexión a la base de datos cerrada');
    process.exit(0);
  } catch (err) {
    console.error('Error al cerrar la conexión:', err.message);
    process.exit(1);
  }
});
