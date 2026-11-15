const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  fechaBogota,
  sumarDias,
  validarReserva,
  validarCancelacion,
  hashCodigo,
  cupoKey,
} = require("../backend/dominio");

const HOY = "2026-11-15";

const reservaValida = (cambios = {}) =>
  validarReserva(
    {
      nombre: "Ana María López",
      documento: "1017250",
      programa: "Ingeniería de Sistemas",
      sala: "biblioteca-central",
      franja: "08-10",
      fecha: "2026-11-20",
      ...cambios,
    },
    HOY
  );

test("acepta una reserva completa", () => {
  const resultado = reservaValida();
  assert.equal(resultado.ok, true);
  assert.equal(resultado.value.salaNombre, "Biblioteca Central");
  assert.equal(resultado.value.franjaNombre, "08:00–10:00");
  assert.equal(resultado.value.documento, "1017250");
});

test("rechaza documento, sala, franja y fechas imposibles", () => {
  assert.match(reservaValida({ documento: "ABC12" }).error, /documento/i);
  assert.match(reservaValida({ sala: "auditorio" }).error, /sala/i);
  assert.match(reservaValida({ franja: "20-22" }).error, /franja/i);
  assert.match(reservaValida({ fecha: "2026-02-31" }).error, /fecha/i);
  assert.match(reservaValida({ fecha: "2026-11-14" }).error, /pasó/i);
  assert.match(reservaValida({ fecha: sumarDias(HOY, 31) }).error, /30 días/i);
});

test("recorta el nombre y exige un mínimo", () => {
  const resultado = reservaValida({ nombre: "  Ada  " });
  assert.equal(resultado.ok, true);
  assert.equal(resultado.value.nombre, "Ada");
  assert.match(reservaValida({ nombre: "Al" }).error, /nombre/i);
});

test("la fecha de Bogotá cambia a las 05:00 UTC", () => {
  assert.equal(fechaBogota(new Date("2026-11-15T04:30:00Z")), "2026-11-14");
  assert.equal(fechaBogota(new Date("2026-11-15T05:00:00Z")), "2026-11-15");
});

test("el código de cancelación y el cupo tienen forma estable", () => {
  const ok = validarCancelacion("3f2c1a70-6b1e-4f2a-9c3d-1a2b3c4d5e6f", "AB12CD");
  assert.equal(ok.ok, true);
  assert.equal(ok.value.codigo, "ab12cd");
  assert.equal(validarCancelacion("no-es-uuid", "ab12cd").ok, false);
  assert.equal(hashCodigo("ab12cd"), hashCodigo("ab12cd"));
  assert.notEqual(hashCodigo("ab12cd"), hashCodigo("ab12ce"));
  assert.equal(cupoKey("bloque-21", "2026-11-20", "10-12"), "CUPO#bloque-21#2026-11-20#10-12");
});
