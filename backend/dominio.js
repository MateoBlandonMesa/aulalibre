const { createHash } = require("crypto");

const ZONA = "America/Bogota";
const DIAS_MAXIMOS = 30;

const SALAS = [
  { id: "biblioteca-central", nombre: "Biblioteca Central" },
  { id: "bloque-21", nombre: "Bloque 21" },
  { id: "ingenieria", nombre: "Ingeniería" },
  { id: "ciencias-exactas", nombre: "Ciencias Exactas" },
];

const FRANJAS = [
  { id: "08-10", nombre: "08:00–10:00" },
  { id: "10-12", nombre: "10:00–12:00" },
  { id: "14-16", nombre: "14:00–16:00" },
  { id: "16-18", nombre: "16:00–18:00" },
];

const salaPorId = (id) => SALAS.find((sala) => sala.id === id);
const franjaPorId = (id) => FRANJAS.find((franja) => franja.id === id);

function fechaBogota(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA,
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

function esFechaReal(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return false;
  const anio = Number(match[1]);
  const mes = Number(match[2]);
  const dia = Number(match[3]);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia
  );
}

function fallo(error) {
  return { ok: false, error };
}

function validarReserva(data, hoy) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return fallo("El cuerpo debe ser un JSON válido.");
  }

  const nombre = typeof data.nombre === "string" ? data.nombre.trim() : "";
  const documento = typeof data.documento === "string" ? data.documento.trim() : "";
  const programa = typeof data.programa === "string" ? data.programa.trim() : "";
  const salaId = typeof data.sala === "string" ? data.sala.trim() : "";
  const franjaId = typeof data.franja === "string" ? data.franja.trim() : "";
  const fecha = typeof data.fecha === "string" ? data.fecha.trim() : "";

  if (!/^[A-Za-zÁÉÍÓÚáéíóúÑñÜü .'-]{3,80}$/.test(nombre)) {
    return fallo("El nombre debe tener entre 3 y 80 letras.");
  }
  if (!/^[0-9]{5,12}$/.test(documento)) {
    return fallo("El documento debe tener entre 5 y 12 dígitos.");
  }
  if (programa.length < 3 || programa.length > 80) {
    return fallo("El programa debe tener entre 3 y 80 caracteres.");
  }

  const sala = salaPorId(salaId);
  const franja = franjaPorId(franjaId);
  if (!sala) return fallo("La sala no existe.");
  if (!franja) return fallo("La franja no existe.");
  if (!esFechaReal(fecha)) return fallo("La fecha no es válida. Usa el formato AAAA-MM-DD.");

  const limite = sumarDias(hoy, DIAS_MAXIMOS);
  if (fecha < hoy) return fallo("La fecha ya pasó. Elige hoy o un día próximo.");
  if (fecha > limite) {
    return fallo(`Solo se puede reservar con hasta ${DIAS_MAXIMOS} días de anticipación.`);
  }

  return {
    ok: true,
    value: {
      nombre,
      documento,
      programa,
      salaId: sala.id,
      salaNombre: sala.nombre,
      franjaId: franja.id,
      franjaNombre: franja.nombre,
      fecha,
    },
  };
}

function validarCancelacion(id, codigo) {
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return fallo("El identificador de la reserva no es válido.");
  }
  if (typeof codigo !== "string" || !/^[0-9a-f]{6}$/i.test(codigo.trim())) {
    return fallo("El código de cancelación debe tener 6 caracteres.");
  }
  return { ok: true, value: { id, codigo: codigo.trim().toLowerCase() } };
}

function hashCodigo(codigo) {
  return createHash("sha256").update(codigo).digest("hex");
}

function cupoKey(salaId, fecha, franjaId) {
  return `CUPO#${salaId}#${fecha}#${franjaId}`;
}

function ordenKey(fecha, salaId, franjaId) {
  return `${fecha}#${salaId}#${franjaId}`;
}

module.exports = {
  SALAS,
  FRANJAS,
  ZONA,
  fechaBogota,
  sumarDias,
  validarReserva,
  validarCancelacion,
  hashCodigo,
  cupoKey,
  ordenKey,
};
