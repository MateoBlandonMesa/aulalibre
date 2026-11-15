const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} = require("@aws-sdk/lib-dynamodb");
const { randomUUID, randomBytes } = require("crypto");
const {
  SALAS,
  FRANJAS,
  fechaBogota,
  validarReserva,
  validarCancelacion,
  hashCodigo,
  cupoKey,
  ordenKey,
} = require("./dominio");

const TABLE = process.env.RESERVAS_TABLE;
const INDEX = process.env.LISTAR_INDEX;

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const respuesta = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

function leerBody(event) {
  if (!event || !event.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
  if (raw.length > 4000) return { __tooBig: true };
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function aPublica(item) {
  return {
    id: item.pk,
    nombre: item.nombre,
    programa: item.programa,
    sala: item.salaNombre,
    franja: item.franjaNombre,
    fecha: item.fecha,
    creadoEn: item.creadoEn,
  };
}

function leerCursor(raw) {
  if (!raw) return undefined;
  try {
    const json = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
    if (!json || json.tipoLista !== "reserva" || typeof json.orden !== "string") return null;
    return { tipoLista: "reserva", orden: json.orden };
  } catch {
    return null;
  }
}

const catalogo = async () =>
  respuesta(200, {
    salas: SALAS,
    franjas: FRANJAS,
    zona: "America/Bogota",
  });

const crear = async (event) => {
  const data = leerBody(event);
  if (data && data.__tooBig) return respuesta(400, { mensaje: "La petición es demasiado grande." });
  if (data === null) return respuesta(400, { mensaje: "El cuerpo debe ser un JSON válido." });

  const validacion = validarReserva(data, fechaBogota());
  if (!validacion.ok) return respuesta(400, { mensaje: validacion.error });

  const reserva = validacion.value;
  const id = randomUUID();
  const codigo = randomBytes(3).toString("hex");
  const ahora = new Date().toISOString();

  try {
    await db.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: TABLE,
              Item: {
                pk: id,
                tipo: "reserva",
                tipoLista: "reserva",
                orden: ordenKey(reserva.fecha, reserva.salaId, reserva.franjaId),
                nombre: reserva.nombre,
                documento: reserva.documento,
                programa: reserva.programa,
                salaId: reserva.salaId,
                salaNombre: reserva.salaNombre,
                franjaId: reserva.franjaId,
                franjaNombre: reserva.franjaNombre,
                fecha: reserva.fecha,
                codigoHash: hashCodigo(codigo),
                creadoEn: ahora,
              },
              ConditionExpression: "attribute_not_exists(pk)",
            },
          },
          {
            Put: {
              TableName: TABLE,
              Item: {
                pk: cupoKey(reserva.salaId, reserva.fecha, reserva.franjaId),
                tipo: "cupo",
                reservaId: id,
              },
              ConditionExpression: "attribute_not_exists(pk)",
            },
          },
        ],
      })
    );
  } catch (error) {
    const reasons = error.CancellationReasons || [];
    if (error.name === "TransactionCanceledException" && reasons[1] && reasons[1].Code === "ConditionalCheckFailed") {
      return respuesta(409, {
        mensaje: "Ese cupo ya está reservado. Elige otra sala o otra franja.",
      });
    }
    console.error(JSON.stringify({ op: "crear", nombre: error.name, mensaje: error.message }));
    return respuesta(500, { mensaje: "No se pudo guardar la reserva." });
  }

  return respuesta(201, {
    mensaje: "Reserva confirmada. Guarda el código: hace falta para cancelar.",
    id,
    codigo,
    sala: reserva.salaNombre,
    franja: reserva.franjaNombre,
    fecha: reserva.fecha,
  });
};

const listar = async (event) => {
  const query = event.queryStringParameters || {};
  const fecha = query.fecha ? String(query.fecha) : "";
  if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return respuesta(400, { mensaje: "La fecha del filtro no es válida." });
  }

  let limit = Number(query.limit || 50);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) limit = 50;

  const cursor = leerCursor(query.cursor);
  if (cursor === null) return respuesta(400, { mensaje: "El cursor de paginación no es válido." });

  const params = {
    TableName: TABLE,
    IndexName: INDEX,
    KeyConditionExpression: fecha
      ? "tipoLista = :tipo AND begins_with(orden, :prefijo)"
      : "tipoLista = :tipo",
    ExpressionAttributeValues: fecha
      ? { ":tipo": "reserva", ":prefijo": `${fecha}#` }
      : { ":tipo": "reserva" },
    Limit: limit,
    ScanIndexForward: true,
  };
  if (cursor) params.ExclusiveStartKey = cursor;

  try {
    const result = await db.send(new QueryCommand(params));
    const last = result.LastEvaluatedKey;
    return respuesta(200, {
      items: (result.Items || []).map(aPublica),
      cursor: last ? Buffer.from(JSON.stringify(last)).toString("base64") : null,
    });
  } catch (error) {
    console.error(JSON.stringify({ op: "listar", nombre: error.name, mensaje: error.message }));
    return respuesta(500, { mensaje: "No se pudo consultar el tablero." });
  }
};

const cancelar = async (event) => {
  const data = leerBody(event);
  if (data && data.__tooBig) return respuesta(400, { mensaje: "La petición es demasiado grande." });
  if (data === null) return respuesta(400, { mensaje: "El cuerpo debe ser un JSON válido." });

  const id = event.pathParameters && event.pathParameters.id;
  const validacion = validarCancelacion(id, data.codigo);
  if (!validacion.ok) return respuesta(400, { mensaje: validacion.error });

  let item;
  try {
    const found = await db.send(
      new GetCommand({
        TableName: TABLE,
        Key: { pk: validacion.value.id },
      })
    );
    item = found.Item;
  } catch (error) {
    console.error(JSON.stringify({ op: "cancelar", nombre: error.name, mensaje: error.message }));
    return respuesta(500, { mensaje: "No se pudo cancelar la reserva." });
  }

  if (!item || item.tipo !== "reserva") {
    return respuesta(404, { mensaje: "Esa reserva no existe." });
  }
  if (item.codigoHash !== hashCodigo(validacion.value.codigo)) {
    return respuesta(403, { mensaje: "El código de cancelación no coincide." });
  }

  try {
    await db.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Delete: {
              TableName: TABLE,
              Key: { pk: item.pk },
              ConditionExpression: "attribute_exists(pk)",
            },
          },
          {
            Delete: {
              TableName: TABLE,
              Key: { pk: cupoKey(item.salaId, item.fecha, item.franjaId) },
            },
          },
        ],
      })
    );
  } catch (error) {
    if (error.name === "TransactionCanceledException") {
      return respuesta(404, { mensaje: "Esa reserva no existe." });
    }
    console.error(JSON.stringify({ op: "cancelar", nombre: error.name, mensaje: error.message }));
    return respuesta(500, { mensaje: "No se pudo cancelar la reserva." });
  }

  return respuesta(200, { mensaje: "Reserva cancelada. El cupo volvió a quedar libre." });
};

module.exports = { catalogo, crear, listar, cancelar };
