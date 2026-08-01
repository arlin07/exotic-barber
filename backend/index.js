const express = require('express');
const cors = require('cors');
// const cron = require('node-cron'); // Desactivado temporalmente
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('./db');
const enviarWhatsApp = require('./whatsapp');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// ---------- LOGIN ADMIN ----------
app.post('/api/admin/login', async (req, res) => {
  try {
    const { telefono, password } = req.body;
    const [rows] = await pool.query("SELECT * FROM usuarios WHERE telefono=? AND rol='admin'", [telefono]);
    if (rows.length === 0) return res.status(401).json({ error: 'Usuario no encontrado' });

    const valido = await bcrypt.compare(password, rows[0].password);
    if (!valido) return res.status(401).json({ error: 'Contraseña incorrecta' });

    const token = jwt.sign({ id: rows[0].id, rol: rows[0].rol }, process.env.JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, nombre: rows[0].nombre });
  } catch (error) {
    console.log('Error en login:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

function verificarToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Token requerido' });
  try {
    req.user = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

// ---------- SERVICIOS (público - solo activos) ----------
app.get('/api/servicios', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM servicios WHERE activo = TRUE');
  res.json(rows);
});

// ---------- HORARIOS OCUPADOS DE UNA FECHA ----------
app.get('/api/horarios-ocupados', async (req, res) => {
  const { fecha } = req.query;
  if (!fecha) return res.json([]);
  const [rows] = await pool.query(
    `SELECT hora FROM turnos WHERE fecha=? AND estado NOT IN ('cancelado','no_asistio')`,
    [fecha]
  );
  const horas = rows.map(r => r.hora.slice(0, 5));
  res.json(horas);
});

// ---------- CREAR TURNO ----------
app.post('/api/turnos', async (req, res) => {
  try {
    const { nombre, telefono, servicio_id, fecha, hora } = req.body;

    const [ocupado] = await pool.query(
      `SELECT id FROM turnos WHERE fecha=? AND hora=? AND estado NOT IN ('cancelado','no_asistio')`,
      [fecha, hora]
    );
    if (ocupado.length > 0) {
      return res.status(400).json({ error: 'Ese horario ya está ocupado, elige otro' });
    }

    let [u] = await pool.query('SELECT id FROM usuarios WHERE telefono=?', [telefono]);
    let usuario_id;
    if (u.length === 0) {
      const [r] = await pool.query('INSERT INTO usuarios (nombre, telefono) VALUES (?,?)', [nombre, telefono]);
      usuario_id = r.insertId;
    } else usuario_id = u[0].id;

    const [result] = await pool.query(
      'INSERT INTO turnos (usuario_id, servicio_id, fecha, hora) VALUES (?,?,?,?)',
      [usuario_id, servicio_id, fecha, hora]
    );

    const [servicio] = await pool.query('SELECT nombre FROM servicios WHERE id=?', [servicio_id]);

    await enviarWhatsApp(process.env.BARBERO_TELEFONO,
      `💈 Nuevo turno en Exotic\nCliente: ${nombre}\nServicio: ${servicio[0].nombre}\nFecha: ${fecha} ${hora}`);
    await enviarWhatsApp(telefono,
      `✅ Tu turno en Exotic quedó agendado para el ${fecha} a las ${hora}. ¡Te esperamos!`);

    res.json({ ok: true, turno_id: result.insertId });
  } catch (error) {
    console.log('Error creando turno:', error);
    res.status(500).json({ error: 'No se pudo agendar el turno' });
  }
});

// ---------- ADMIN: VER TURNOS (con filtro opcional por mes/año) ----------
app.get('/api/admin/turnos', verificarToken, async (req, res) => {
  const { mes, anio } = req.query;
  let query = `
    SELECT t.id, u.nombre, u.telefono, s.nombre AS servicio, s.precio, t.fecha, t.hora, t.estado
    FROM turnos t JOIN usuarios u ON t.usuario_id=u.id JOIN servicios s ON t.servicio_id=s.id`;
  const params = [];
  if (mes && anio) {
    query += ' WHERE MONTH(t.fecha)=? AND YEAR(t.fecha)=?';
    params.push(mes, anio);
  }
  query += ' ORDER BY t.fecha DESC, t.hora DESC';
  const [rows] = await pool.query(query, params);
  res.json(rows);
});

// ---------- ADMIN: CAMBIAR ESTADO DE TURNO (flexible) ----------
app.put('/api/admin/turnos/:id/estado', verificarToken, async (req, res) => {
  const { estado } = req.body;
  await pool.query('UPDATE turnos SET estado=? WHERE id=?', [estado, req.params.id]);
  res.json({ ok: true });
});

// ---------- ADMIN: ELIMINAR TURNO (permanente) ----------
app.delete('/api/admin/turnos/:id', verificarToken, async (req, res) => {
  await pool.query('DELETE FROM turnos WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// ---------- ADMIN: LISTAR TODOS LOS SERVICIOS (incluye inactivos) ----------
app.get('/api/admin/servicios', verificarToken, async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM servicios ORDER BY id');
  res.json(rows);
});

// ---------- ADMIN: CREAR SERVICIO ----------
app.post('/api/admin/servicios', verificarToken, async (req, res) => {
  const { nombre, descripcion, precio, duracion_min, foto_url } = req.body;
  const [r] = await pool.query(
    'INSERT INTO servicios (nombre, descripcion, precio, duracion_min, foto_url, activo) VALUES (?,?,?,?,?,TRUE)',
    [nombre, descripcion, precio, duracion_min, foto_url]
  );
  res.json({ ok: true, id: r.insertId });
});

// ---------- ADMIN: EDITAR SERVICIO ----------
app.put('/api/admin/servicios/:id', verificarToken, async (req, res) => {
  const { nombre, descripcion, precio, duracion_min, foto_url } = req.body;
  await pool.query(
    'UPDATE servicios SET nombre=?, descripcion=?, precio=?, duracion_min=?, foto_url=? WHERE id=?',
    [nombre, descripcion, precio, duracion_min, foto_url, req.params.id]
  );
  res.json({ ok: true });
});

// ---------- ADMIN: DESACTIVAR SERVICIO ----------
app.put('/api/admin/servicios/:id/desactivar', verificarToken, async (req, res) => {
  await pool.query('UPDATE servicios SET activo=FALSE WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// ---------- ADMIN: ELIMINAR SERVICIO (permanente) ----------
app.delete('/api/admin/servicios/:id', verificarToken, async (req, res) => {
  await pool.query('DELETE FROM servicios WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

/* ---------- RECORDATORIO AUTOMÁTICO 15 MIN ANTES (DESACTIVADO TEMPORALMENTE) ----------
cron.schedule('* * * * *', async () => {
  try {
    const ahora = new Date();
    const en15 = new Date(ahora.getTime() + 15 * 60000);

    const fecha = en15.toISOString().slice(0, 10);
    const horaInicio = en15.toTimeString().slice(0, 5);
    const horaFin = new Date(en15.getTime() + 60000).toTimeString().slice(0, 5);

    const [turnos] = await pool.query(
      `SELECT t.id, t.hora, u.nombre, u.telefono, s.nombre AS servicio
       FROM turnos t
       JOIN usuarios u ON t.usuario_id = u.id
       JOIN servicios s ON t.servicio_id = s.id
       WHERE t.fecha = ?
       AND t.hora >= ? AND t.hora < ?
       AND t.estado NOT IN ('cancelado','no_asistio')
       AND t.recordatorio_enviado = FALSE`,
      [fecha, horaInicio, horaFin]
    );

    for (const t of turnos) {
      await enviarWhatsApp(t.telefono,
        `⏰ Recordatorio: tu turno en Exotic para ${t.servicio} es en 15 minutos (${t.hora.slice(0,5)}). ¡Te esperamos!`);
      await pool.query('UPDATE turnos SET recordatorio_enviado = TRUE WHERE id = ?', [t.id]);
    }
  } catch (error) {
    console.log('Error en recordatorio automático:', error);
  }
});
*/

app.listen(process.env.PORT, () => console.log(`Servidor Exotic corriendo en puerto ${process.env.PORT}`));