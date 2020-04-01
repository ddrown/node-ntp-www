'use strict';

const express = require('express');
const { createServer } = require('http');
const WebSocket = require('ws');
const watchChrony = require('./watchChrony');
const gpspipe = require('./gpspipe');

const app = express();
app.use(express.static('public'));

const server = createServer(app);
const wss = new WebSocket.Server({ server });
const lastState = {};

function sendAllClients(data) {
  const jsonData = JSON.stringify(data);

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(jsonData);
    }
  });
}

watchChrony.onData((data) => {
  const msg = {type: "chrony", text: data};
  sendAllClients(msg);
  lastState.chrony = msg;
});

gpspipe.onData((data) => {
  sendAllClients(data);
  lastState.gps = data;
});

wss.on('connection', (ws) => {
  ws.send(JSON.stringify(lastState.chrony));
  if (lastState.gps !== undefined) {
    ws.send(JSON.stringify(lastState.gps));
  }

  ws.on('message', (raw) => {
    const message = JSON.parse(raw);
    if (message.type === "ping") {
      ws.send(JSON.stringify({
        send: message.send,
        recv: Date.now(),
        type: "reply"
      }));
    }
  });
});

const port = 9090;
server.listen(port, function() {
  console.log(`Listening on http://localhost:${port}`);
});
