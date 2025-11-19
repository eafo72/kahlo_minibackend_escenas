const express = require('express');
const dgram = require('dgram');
const app = express();
const port = 3000;

const path = require('path');

//servir archivos estáticos desde la carpeta "public"
app.use(express.static(path.join(__dirname, 'public')))


// CONFIGURA TUS DATOS:
const DMX_IP = "192.168.1.150";  // IP del SLESA-U10
const DMX_PORT = 2430;           // Puerto fijo

app.get('/activar/:escena', (req, res) => {
  const index = parseInt(req.params.escena);
  
  const client = dgram.createSocket('udp4');
  const message = Buffer.from([index]);

  client.send(message, DMX_PORT, DMX_IP, err => {
    client.close();
    if (err) return res.status(500).send("Error al enviar UDP");
    res.send(`Escena ${index} activada`);
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => console.log(`Servidor escuchando en http://localhost:${port}`));