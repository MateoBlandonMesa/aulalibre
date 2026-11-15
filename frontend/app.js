const API = (window.AULALIBRE_API || "").replace(/\/$/, "");
const formulario = document.querySelector("#formulario");
const aviso = document.querySelector("#aviso");
const comprobante = document.querySelector("#comprobante");
const tablero = document.querySelector("#tablero");
const filtroFecha = document.querySelector("#filtro-fecha");
const botonEnviar = document.querySelector("#enviar");

function fechaBogota(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function sumarDias(iso, dias) {
  const [anio, mes, dia] = iso.split("-").map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

function mostrarAviso(texto) {
  aviso.hidden = !texto;
  aviso.textContent = texto || "";
}

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.mensaje || "La solicitud no se completó.");
    error.status = response.status;
    throw error;
  }
  return data;
}

function llenarSelect(select, items) {
  select.innerHTML = items
    .map((item) => `<option value="${item.id}">${item.nombre}</option>`)
    .join("");
}

function tarjeta(item) {
  const article = document.createElement("article");
  article.className = "tarjeta";
  article.innerHTML = `
    <p class="sala"></p>
    <div class="tarjeta-cabeza">
      <h3></h3>
      <p class="franja"></p>
    </div>
    <p class="persona"></p>
    <form class="cancelar">
      <input name="codigo" maxlength="6" placeholder="Código" aria-label="Código de cancelación" required />
      <button class="fantasma" type="submit">Cancelar</button>
    </form>
  `;
  article.querySelector(".sala").textContent = item.sala;
  article.querySelector("h3").textContent = item.nombre;
  article.querySelector(".franja").textContent = item.franja;
  article.querySelector(".persona").textContent = item.programa;
  article.querySelector(".cancelar").addEventListener("submit", async (event) => {
    event.preventDefault();
    mostrarAviso("");
    const codigo = new FormData(event.currentTarget).get("codigo");
    const boton = event.currentTarget.querySelector("button");
    boton.disabled = true;
    try {
      await api(`/reservas/${item.id}`, {
        method: "DELETE",
        body: JSON.stringify({ codigo }),
      });
      await cargarReservas();
    } catch (error) {
      mostrarAviso(error.message);
      boton.disabled = false;
    }
  });
  return article;
}

async function cargarReservas() {
  tablero.replaceChildren();
  const data = await api(`/reservas?fecha=${encodeURIComponent(filtroFecha.value)}&limit=50`);
  if (!data.items.length) {
    const vacio = document.createElement("p");
    vacio.className = "vacio";
    vacio.textContent = "No hay reservas para este día. Las cuatro salas están libres.";
    tablero.append(vacio);
    return;
  }
  data.items.forEach((item) => tablero.append(tarjeta(item)));
}

async function iniciar() {
  if (!API) {
    mostrarAviso("Falta la URL de la API en config.js.");
    return;
  }
  const hoy = fechaBogota();
  const fecha = formulario.elements.fecha;
  fecha.min = hoy;
  fecha.max = sumarDias(hoy, 30);
  fecha.value = hoy;
  filtroFecha.min = hoy;
  filtroFecha.value = hoy;

  try {
    const catalogo = await api("/salas");
    llenarSelect(formulario.elements.sala, catalogo.salas);
    llenarSelect(formulario.elements.franja, catalogo.franjas);
    await cargarReservas();
  } catch (error) {
    mostrarAviso(error.message);
  }
}

formulario.addEventListener("submit", async (event) => {
  event.preventDefault();
  mostrarAviso("");
  comprobante.hidden = true;
  const datos = Object.fromEntries(new FormData(formulario));
  botonEnviar.disabled = true;
  try {
    const creada = await api("/reservas", {
      method: "POST",
      body: JSON.stringify(datos),
    });
    document.querySelector("#comprobante-detalle").textContent =
      `${creada.sala} · ${creada.fecha} · ${creada.franja}`;
    document.querySelector("#comprobante-codigo").textContent = creada.codigo;
    comprobante.hidden = false;
    formulario.reset();
    formulario.elements.fecha.value = filtroFecha.value || fechaBogota();
    filtroFecha.value = creada.fecha;
    await cargarReservas();
  } catch (error) {
    mostrarAviso(error.message);
  } finally {
    botonEnviar.disabled = false;
  }
});

filtroFecha.addEventListener("change", () => {
  cargarReservas().catch((error) => mostrarAviso(error.message));
});

iniciar();
