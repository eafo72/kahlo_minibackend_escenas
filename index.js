const express = require('express');
const dgram = require('dgram');
const app = express();
const port = 4000;

const path = require('path');

//servir archivos estáticos desde la carpeta "public"
app.use(express.static(path.join(__dirname, 'public')))

// --- CONFIGURACIÓN DEL CONTROLADOR ---
const CONTROLLER_IP = "192.168.100.101";
const CONTROLLER_PORT = 2430;

///////////////////////////////////////////////////////////////////////////
// --- CÓDIGOS HEXADECIMALES "SIUDI10A" ---
// Fuente: Documentación oficial SLESA-U10 / SIUDI10A
const HEX_CODES = {
    "1": Buffer.from("53495544493130416D000100000100000000000000000000", "hex"), // Escena 1
    "2": Buffer.from("53495544493130416D000200000100000000000000000000", "hex"), // Escena 2
    "0": Buffer.from("53495544493130416D000000000100000000000000000000", "hex")  // Blackout (Escena 0)
};

// --- ENDPOINT API ---
// Uso: GET /activar/1  o  GET /activar/2
app.get("/activar/:id", (req, res) => {
    const idEscena = req.params.id;
    const comandoBuffer = HEX_CODES[idEscena];

    if (!comandoBuffer) {
        return res.status(400).json({ 
            status: "error", 
            mensaje: "Escena no válida. Usa 1 o 2." 
        });
    }

    // Crear socket UDP para este disparo
    const client = dgram.createSocket("udp4");

    client.send(comandoBuffer, CONTROLLER_PORT, CONTROLLER_IP, (err) => {
        client.close(); // Cerramos socket inmediatamente después de enviar

        if (err) {
            console.error("❌ Error enviando UDP:", err);
            return res.status(500).json({ status: "error", mensaje: "Fallo de red con el controlador" });
        }

        console.log(`✅ Escena ${idEscena} activada en ${CONTROLLER_IP}`);
        return res.json({ status: "ok", escena_activada: idEscena });
    });
});

///////////////////////////////////////////////////////////////////////////

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- INICIAR SERVIDOR ---
app.listen(port, () => {
    console.log(`🏛️  Servidor Casa Kahlo listo en http://localhost:${port}`);
});

