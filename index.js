// index.js - Integración Contadores + Detector de Presencia VS370

const express = require('express');
const mqtt = require('mqtt');
const dgram = require('dgram');
const fetch = require('node-fetch');
const path = require('path');
const { Buffer } = require('buffer');

const app = express();
const port = 4000;

/* =========================
   CONFIGURACIÓN GENERAL
========================= */

// SENSOR QUE SÍ ENVÍA A LA API
const TARGET_COUNTER_ID = '24e124757d369504';

// SENSOR DE PRESENCIA
const TARGET_PRESENCE_ID = '24e124773f021757';

// API
const API_URL = 'https://api.museodesarrollo.info/camara/actualizar';

// MQTT
const BROKER_URL = 'mqtt://broker.hivemq.com:1883';
const TOPIC_SUBSCRIBE = 'museo/conteo/#';

/* =========================
   DECODERS
========================= */
const { milesightDeviceDecode } = require('./payloadCodec');
const { vs121Decode } = require('./vsCodec');

/* =========================
   STATIC
========================= */
app.use(express.static(path.join(__dirname, 'public')));

/* =========================
   UDP ESCENAS
========================= */
const CONTROLLER_IP = "192.168.100.101";
const CONTROLLER_PORT = 2430;

const HEX_CODES = {
  "1": Buffer.from("53495544493130416D000100000100000000000000000000", "hex"),
  "2": Buffer.from("53495544493130416D000200000100000000000000000000", "hex"),
  "0": Buffer.from("53495544493130416D000000000100000000000000000000", "hex")
};

function sendUDPCommand(idEscena) {
  const comandoBuffer = HEX_CODES[idEscena];
  if (!comandoBuffer) return;

  const client = dgram.createSocket("udp4");
  client.send(comandoBuffer, CONTROLLER_PORT, CONTROLLER_IP, (err) => {
    client.close();
    if (err) console.error("❌ UDP Error:", err);
    else console.log(`🎬 Escena ${idEscena} enviada por UDP`);
  });
}

/* =========================
   API
========================= */
async function sendApiUpdate(totalIn, totalOut) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entrada: totalIn,
        salida: totalOut
      })
    });

    if (response.ok) {
      console.log('[API] ✅ Datos de conteo actualizados en el servidor.');
    } else {
      console.error(`[API] ❌ El servidor respondió con error: ${response.status}`);
    }
  } catch (err) {
    console.error('[API] ❌ Error de conexión:', err.message);
  }
}

/* =========================
   MQTT
========================= */
const mqttClient = mqtt.connect(BROKER_URL);

mqttClient.on('connect', () => {
  console.log('[MQTT] ✅ Conectado a broker');
  mqttClient.subscribe(TOPIC_SUBSCRIBE);
});

mqttClient.on('error', (err) => {
  console.error('[MQTT] ❌ Error:', err);
});

/* =========================
   ESTADO GLOBAL
========================= */
let CONTEO_ESTADO = {};

// PRESENCIA
let ESTADO_OCUPACION_CARTAS = 'OFF';
let TIMER_LUZ_CARTAS = null;
const TIEMPO_VIGENCIA_MS = 10 * 60 * 1000;

/* =========================
   DECODER MAP
========================= */
const SENSOR_DECODER_MAP = {
  [TARGET_PRESENCE_ID]: vs121Decode,
  '24e124757d369504': milesightDeviceDecode,
  '24e124757d369680': milesightDeviceDecode // solo log
};

/* =========================
   MQTT MESSAGE HANDLER
========================= */
mqttClient.on('message', (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());
    const sensorId = (payload.devEUI || payload.deviceEui || '').toLowerCase();
    const sensorName = payload.deviceName || 'unknown-device';
    const base64Payload = payload.data || '';

    const decoder = SENSOR_DECODER_MAP[sensorId];
    if (!decoder) return;

    const bytes = Array.from(Buffer.from(base64Payload, 'base64'));
    const decodedData = decoder(bytes);

    /* =========================
       PRESENCIA (VS370)
    ========================= */
    if (sensorId === TARGET_PRESENCE_ID.toLowerCase()) {
      const hayPresencia = decodedData.occupancy === 'occupied';

      if (hayPresencia) {
        if (ESTADO_OCUPACION_CARTAS === 'OFF') {
          ESTADO_OCUPACION_CARTAS = 'ON';
          sendUDPCommand("2");
          console.log('[PRESENCIA] 🟢 Luces ON');
        }

        if (TIMER_LUZ_CARTAS) clearTimeout(TIMER_LUZ_CARTAS);

        TIMER_LUZ_CARTAS = setTimeout(() => {
          ESTADO_OCUPACION_CARTAS = 'OFF';
          sendUDPCommand("0");
          console.log('[PRESENCIA] 🔴 Luces OFF (timeout)');
        }, TIEMPO_VIGENCIA_MS);
      }

      console.log(`--- UPLINK PRESENCIA (${sensorName}) ---`);
      console.log(decodedData);
      return;
    }

    /* =========================
       CONTEO (VS133)
    ========================= */
    if (!CONTEO_ESTADO[sensorId]) {
      CONTEO_ESTADO[sensorId] = {
        in: 0,
        out: 0,
        lastSent: { in: null, out: null }
      };
    }

    const estado = CONTEO_ESTADO[sensorId];
    const inPkt = decodedData.line_1_total_in;
    const outPkt = decodedData.line_1_total_out;

    if (typeof inPkt === 'number' && inPkt >= estado.in) estado.in = inPkt;
    if (typeof outPkt === 'number' && outPkt >= estado.out) estado.out = outPkt;

    console.log(`--- UPLINK CONTEO (${sensorName}) ---`);
    console.log(`Estado: In=${estado.in} | Out=${estado.out}`);

    /* =========================
       SOLO ESTE SENSOR MANDA API
    ========================= */
    if (sensorId === TARGET_COUNTER_ID) {
      const last = estado.lastSent;

      const cambioReal =
        estado.in !== last.in ||
        estado.out !== last.out;

      const zeroInicial =
        estado.in === 0 &&
        estado.out === 0 &&
        last.in === null &&
        last.out === null;

      if (cambioReal && !zeroInicial) {
        sendApiUpdate(estado.in, estado.out);
        estado.lastSent = {
          in: estado.in,
          out: estado.out
        };
      }
    }

  } catch (err) {
    console.error('❌ Error procesando MQTT:', err.message);
  } finally {
    console.log('------------------------------------------');
  }
});

/* =========================
   EXPRESS
========================= */
app.get('/activar/:id', (req, res) => {
  const id = req.params.id;
  if (!HEX_CODES[id]) {
    return res.status(400).json({ error: 'Escena inválida' });
  }
  sendUDPCommand(id);
  res.json({ ok: true, escena: id });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`🏛️ Servidor activo en http://localhost:${port}`);
});
