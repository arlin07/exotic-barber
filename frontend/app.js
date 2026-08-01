const API = 'http://localhost:4000/api';

async function cargarServicios() {
  const res = await fetch(`${API}/servicios`);
  const servicios = await res.json();

  const select = document.getElementById('servicio_id');
  const cont = document.getElementById('listaServicios');

  servicios.forEach(s => {
    select.innerHTML += `<option value="${s.id}">${s.nombre} - $${s.precio}</option>`;
    cont.innerHTML += `
      <div class="servicio-card">
        <h3>${s.nombre}</h3>
        <p>${s.descripcion}</p>
        <div class="servicio-precio">
          <strong>$${Number(s.precio).toLocaleString('es-CO')}</strong>
          <span>${s.duracion_min} min</span>
        </div>
      </div>`;
  });
}
cargarServicios();

document.getElementById('formTurno').addEventListener('submit', async (e) => {
  e.preventDefault();

  const data = {
    nombre: document.getElementById('nombre').value,
    telefono: document.getElementById('telefono').value,
    servicio_id: document.getElementById('servicio_id').value,
    fecha: document.getElementById('fecha').value,
    hora: document.getElementById('hora').value
  };

  const res = await fetch(`${API}/turnos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  const resultado = await res.json();
  const mensaje = document.getElementById('mensajeConfirmacion');

  if (res.ok) {
    mensaje.style.color = '#4caf50';
    mensaje.textContent = '✅ ¡Turno agendado con éxito! Te esperamos en Exotic.';
    document.getElementById('formTurno').reset();
  } else {
    mensaje.style.color = '#ff5555';
    mensaje.textContent = '❌ Error: ' + (resultado.error || 'no se pudo agendar');
  }
});

const elementosAnimados = document.querySelectorAll('.fade-in');
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) entry.target.classList.add('visible');
  });
}, { threshold: 0.15 });
elementosAnimados.forEach(el => observer.observe(el));

const HORA_APERTURA = 7;
const HORA_CIERRE = 22;
const INTERVALO_MIN = 30;

document.getElementById('fecha').min = new Date().toISOString().split('T')[0];

async function cargarHorasDisponibles() {
  const fecha = document.getElementById('fecha').value;
  const selectHora = document.getElementById('hora');
  if (!fecha) return;

  const res = await fetch(`${API}/horarios-ocupados?fecha=${fecha}`);
  const ocupados = await res.json();

  const ahora = new Date();
  const esHoy = fecha === ahora.toISOString().split('T')[0];

  selectHora.innerHTML = '<option value="">Elige una hora</option>';
  for (let h = HORA_APERTURA; h < HORA_CIERRE; h++) {
    for (let m = 0; m < 60; m += INTERVALO_MIN) {
      const horaStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const yaOcupado = ocupados.includes(horaStr);

      let yaPaso = false;
      if (esHoy) {
        const [hh, mm] = horaStr.split(':').map(Number);
        const horaSlot = new Date();
        horaSlot.setHours(hh, mm, 0, 0);
        if (horaSlot <= ahora) yaPaso = true;
      }

      if (!yaOcupado && !yaPaso) {
        selectHora.innerHTML += `<option value="${horaStr}">${horaStr}</option>`;
      }
    }
  }

  if (selectHora.options.length === 1) {
    selectHora.innerHTML = '<option value="">No hay horarios disponibles ese día</option>';
  }
}