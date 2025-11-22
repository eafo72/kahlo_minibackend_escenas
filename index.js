const express = require('express');
const dgram = require('dgram');
const app = express();
const port = 4000;


const IP = "192.168.100.101";  // IP del SLESA-U10
const PORT = 2430;           // Puerto fijo

///////////////////////////////////////////////////////////////////////////
const client = dgram.createSocket("udp4");

// --- CÓDIGOS HEXADECIMALES DEL MANUAL ---
// Fuente: Documento "SIUDI10A Remote Protocol Examples", Página 1 [cite: 1, 7]

// ESCENA 1
// Nota: El byte "01" en medio indica la escena.
const SCENE_1 = Buffer.from(
  "53495544493130416D000100000100000000000000000000",
  "hex"
);

// ESCENA 2
// Nota: Cambiamos el byte a "02".
const SCENE_2 = Buffer.from(
  "53495544493130416D000200000100000000000000000000",
  "hex"
);

console.log(`📡 Conectando a ${IP}:${PORT} usando protocolo SIUDI nativo...`);

// FUNCIÓN DE DISPARO
function activar(escenaBuffer, nombre) {
  client.send(escenaBuffer, PORT, IP, (err) => {
    if (err) {
      console.error(`❌ Error enviando ${nombre}:`, err);
    } else {
      console.log(`✅ ¡ENVIADO ${nombre}! -> Mira las luces.`);
    }
  });
}

// --- SECUENCIA DE PRUEBA ---
console.log("💡 Activando ESCENA 1 (Cartas)...");
activar(SCENE_1, "Escena 1");

setTimeout(() => {
  console.log("⏳ Esperando 3 segundos...");
}, 1000);

setTimeout(() => {
  console.log("💡 Activando ESCENA 2 (Servicio)...");
  activar(SCENE_2, "Escena 2");

  // Cerramos
  setTimeout(() => {
    console.log("🏁 Prueba terminada.");
    client.close();
  }, 1000);
}, 3000);

///////////////////////////////////////////////////////////////////////////


app.listen(port, () => console.log(`Servidor escuchando en http://localhost:${port}`));