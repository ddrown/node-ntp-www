'use strict';
const { spawn } = require('child_process');

const watchChrony = spawn('./bin/watch-chrony');

let buffer = "";
let callBack;

function onData(newCallback) {
  callBack = newCallback;
}
exports.onData = onData;

function newData(data) {
  if (callBack !== undefined) {
    callBack(data);
  }
}

watchChrony.stdout.on('data', (data) => {
  buffer = `${buffer}${data}`;
  if (buffer.match(/------------------------------/)) {
    newData(buffer);
    buffer = "";
  }
});

watchChrony.stderr.on('data', (data) => {
  console.error(`watch-chrony stderr: ${data}`);
});

watchChrony.on('close', (code) => {
  console.log(`watch-chrony exited with ${code}`);
});
