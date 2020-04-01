'use strict';
const { spawn } = require('child_process');

const gpspipe = spawn('gpspipe', ["-r"]);

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

let buffer = "";
let sawZDA = false;
gpspipe.stdout.on('data', (data) => {
  buffer = `${buffer}${data}`;

  // prefer ZDA because it's usually last
  if (!sawZDA && buffer.match(/\$GPVTG,[^\n]+\n/)) {
    gpsmessages(buffer);
    buffer = "";
  } else if (buffer.match(/\$GPZDA,[^\n]+\n/)) {
    sawZDA = true;
    gpsmessages(buffer);
    buffer = "";
  }
});

gpspipe.stderr.on('data', (data) => {
  console.error(`gpspipe stderr: ${data}`);
});

gpspipe.on('close', (code) => {
  console.log(`gpspipe exited with ${code}`);
});

function gpsmessages(buffer) {
  // only if the satelites are updating
  if(buffer.match(/\$GPGSV/)) {
    const data = parse(buffer);
    newData(data);
  }
}

let last_gps_lock;
function parse(buffer) {
  const lines = buffer.split(/\n/);
  const parsed = {
    GPGSA: "",
    GPGSV: [],
  };

  const used_in_lock = {};
  const sats = {};
  lines.forEach((line) => {
    const fields = line.split(/[,*]/);

    if (fields[0] === '$GPGSA') { // $GPGSA,A,1, , , , , , , , , , , , ,3.5,3.4,1.0*30
      parsed.GPGSA = parse_sat_lock(fields);
      if(fields[2] > 1) {
	last_gps_lock = Date.now();
      }
      Object.assign(used_in_lock, gsa(fields, ""));
    } else if(fields[0] === '$GLGSA') {
      Object.assign(used_in_lock, gsa(fields, "GL"));
    } else if(fields[0] === '$BDGSA') {
      Object.assign(used_in_lock, gsa(fields, "BD"));
    } else if(fields[0] === '$GPGSV') {
      Object.assign(sats, gsv(fields, ""));
    } else if(fields[0] === '$GLGSV') {
      Object.assign(sats, gsv(fields, "GL"));
    } else if(fields[0] === '$BDGSV') {
      Object.assign(sats, gsv(fields, "BD"));
    }
  });

  parsed.GPGSV = satdata(sats, used_in_lock);

  const data = {
    type: "gps",
    text: "",
    parsed,
    lastlock: last_gps_lock,
  };

  return data;
}

function satdata(sats, used_in_lock) {
  for(const satname in used_in_lock) {
    sats[satname].used_in_lock = true;
  }
  const satarray = Object.values(sats);

  satarray.sort((a, b) => {
    return a.snr - b.snr;
  });

  return satarray;
}

function parse_sat_lock(fields) {
  const locks = ["???", "No Lock", "2D Lock", "3D/Full Lock"];
  const lockstate = fields[2];

  if (lockstate > 0 && lockstate < locks.length) {
    return `Lock=${locks[lockstate]}`;
  } else {
    return `Lock=? ${lockstate}`;
  }
}

function gsa(fields,satid_prefix) {
  const used_in_lock = {};
  for(let i = 3; i <= 14; i++) {
    if(fields[i] > 0) {
      const name = `${satid_prefix}${fields[i]}`;
      used_in_lock[name] = true;
    }
  }
  return used_in_lock;
}

function gsv(fields,satid_prefix) {
  const special_sats = {
    46: "WAAS (Inmarsat)",
    48: "WAAS (Galaxy 15)",
    51: "WAAS (Anik F1R)",
  };

  const sats = {};
  for(let i = 4; i+3 < fields.length; i += 4) {
    const satname = `${satid_prefix}${fields[i]}`;
    const sat = {
      id: unpad0(satname),
      elevation: unpad0(fields[i+1]),
      azimuth: unpad0(fields[i+2]),
      snr: unpad0(fields[i+3]),
      special: "",
      used_in_lock: false
    };
    if (special_sats.hasOwnProperty(satname)) {
      sat.special = special_sats[satname];
    }
    sats[satname] = sat;
  }

  return sats;
}

function unpad0(str) {
  return str.replace(/^0/,"");
}
