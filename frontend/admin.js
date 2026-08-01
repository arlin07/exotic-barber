const API = 'http://localhost:4000/api';
let token = localStorage.getItem('token');
let turnosData = [];
let filtroActual = 'todos';
let filtroMesActual = '';
let filtroAnioActual = '';

if (token) mostrarPanel();

async function login() {
  const telefono = document.getElementById('telefono').value;
  const password = document.getElementById('password').value;
  const res = await fetch(`${API}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ telefono, password })
  });
  const data = await res.json();
  if (res.ok) {
    token = data.token;
    localStorage.setItem('token', token);
    mostrarPanel();
  } else {
    document.getElementById('errorLogin').textContent = data.error;
  }
}

function logout() {
  localStorage.removeItem('token');
  location.reload();
}

function mostrarPanel() {
  document.getElementById('loginBox').style.display = 'none';
  document.getElementById('panelBox').style.display = 'block';
  cargarTurnos();
  cargarServiciosAdmin();
  setInterval(() => cargarTurnos(filtroMesActual, filtroAnioActual), 15000);
}

async function cargarTurnos(mes = '', anio = '') {
  let url = `${API}/admin/turnos`;
  if (mes && anio) url += `?mes=${mes}&anio=${anio}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) { logout(); return; }
  turnosData = await res.json();
  actualizarResumen();
  renderizarTabla();
}

function aplicarFiltroFecha() {
  filtroMesActual = document.getElementById('filtroMes').value;
  filtroAnioActual = document.getElementById('filtroAnio').value;
  cargarTurnos(filtroMesActual, filtroAnioActual);
}

function actualizarResumen() {
  const agendados = turnosData.filter(t => t.estado === 'agendado' || t.estado === 'pendiente' || t.estado === 'confirmado' || t.estado === 'recordado').length;
  const realizados = turnosData.filter(t => t.estado === 'realizado').length;
  const cancelados = turnosData.filter(t => t.estado === 'cancelado' || t.estado === 'no_asistio').length;
  const ingresos = turnosData.filter(t => t.estado === 'realizado').reduce((sum, t) => sum + Number(t.precio), 0);

  document.getElementById('totalAgendados').textContent = agendados;
  document.getElementById('totalRealizados').textContent = realizados;
  document.getElementById('totalCancelados').textContent = cancelados;
  document.getElementById('totalIngresos').textContent = '$' + ingresos.toLocaleString('es-CO');
}

function filtrar(estado) {
  filtroActual = estado;
  document.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('activo'));
  event.target.classList.add('activo');
  renderizarTabla();
}

function renderizarTabla() {
  const tbody = document.querySelector('#tablaTurnos tbody');
  tbody.innerHTML = '';
  const lista = filtroActual === 'todos' ? turnosData : turnosData.filter(t => t.estado === filtroActual);

  lista.forEach(t => {
    tbody.innerHTML += `<tr>
      <td>${t.nombre}</td>
      <td>${t.telefono}</td>
      <td>${t.servicio}</td>
      <td>$${Number(t.precio).toLocaleString('es-CO')}</td>
      <td>${t.fecha}</td>
      <td>${t.hora}</td>
      <td><span class="estado-badge estado-${t.estado}">${t.estado}</span></td>
      <td class="celda-acciones">
        <select onchange="cambiarEstado(${t.id}, this.value)">
          <option value="">Cambiar estado</option>
          <option value="pendiente">Pendiente</option>
          <option value="confirmado">Confirmado</option>
          <option value="realizado">Realizado</option>
          <option value="cancelado">Cancelado</option>
          <option value="no_asistio">No asistió</option>
        </select>
        <button class="btn-eliminar-turno" onclick="eliminarTurno(${t.id})">🗑</button>
      </td>
    </tr>`;
  });
}

async function cambiarEstado(id, estado) {
  if (!estado) return;
  await fetch(`${API}/admin/turnos/${id}/estado`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ estado })
  });
  cargarTurnos(filtroMesActual, filtroAnioActual);
}

async function eliminarTurno(id) {
  if (!confirm('¿Seguro que quieres eliminar este turno? Esta acción no se puede deshacer.')) return;
  await fetch(`${API}/admin/turnos/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  cargarTurnos(filtroMesActual, filtroAnioActual);
}

function mostrarFormServicio() {
  const box = document.getElementById('formServicioBox');
  box.style.display = box.style.display === 'none' ? 'flex' : 'none';
}

async function guardarServicio() {
  const data = {
    nombre: document.getElementById('srvNombre').value,
    descripcion: document.getElementById('srvDescripcion').value,
    precio: document.getElementById('srvPrecio').value,
    duracion_min: document.getElementById('srvDuracion').value,
    foto_url: document.getElementById('srvFoto').value
  };
  await fetch(`${API}/admin/servicios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data)
  });
  document.getElementById('srvNombre').value = '';
  document.getElementById('srvDescripcion').value = '';
  document.getElementById('srvPrecio').value = '';
  document.getElementById('srvDuracion').value = '';
  document.getElementById('srvFoto').value = '';
  document.getElementById('formServicioBox').style.display = 'none';
  cargarServiciosAdmin();
}

async function cargarServiciosAdmin() {
  const res = await fetch(`${API}/admin/servicios`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) return;
  const servicios = await res.json();
  const cont = document.getElementById('listaServiciosAdmin');
  cont.innerHTML = '';
  servicios.forEach(s => {
    cont.innerHTML += `<div class="servicio-admin-card">
      ${s.foto_url ? `<img src="${s.foto_url}">` : ''}
      <h4>${s.nombre} ${s.activo ? '' : '(inactivo)'}</h4>
      <p>$${Number(s.precio).toLocaleString('es-CO')} · ${s.duracion_min} min</p>
      <div class="servicio-admin-acciones">
        ${s.activo ? `<button class="btn-desactivar" onclick="desactivarServicio(${s.id})">Desactivar</button>` : ''}
        <button class="btn-eliminar" onclick="eliminarServicio(${s.id})">Eliminar</button>
      </div>
    </div>`;
  });
}

async function desactivarServicio(id) {
  await fetch(`${API}/admin/servicios/${id}/desactivar`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` } });
  cargarServiciosAdmin();
}

async function eliminarServicio(id) {
  if (!confirm('¿Seguro que quieres eliminar este servicio? Esta acción no se puede deshacer.')) return;
  await fetch(`${API}/admin/servicios/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  cargarServiciosAdmin();
}