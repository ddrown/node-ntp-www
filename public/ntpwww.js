"use strict";
let ws;
let connected = 0;

function set_date_element(element_id, when) {
  const date = new Date(when);
  const pretty_time = $(`<span class="pretty-time" title="${date.toUTCString()}">`).text(date.toDateString());
  $(pretty_time).prettyDate();
  $(element_id).html(pretty_time);
}

let last_ping = 0;
function check_ping() {
  const ts = Date.now();
  if(ws && connected && (last_ping + 10000) < ts) {
    last_ping = ts;
    const msg = {
      "type": "ping",
      "send": Date.now()
    };
    ws.send(JSON.stringify(msg));
    set_date_element("#ping_ts", last_ping);
  }
}

function ping_reply(d, ts) {
  const sent = parseInt(d.send,10);
  const recv = parseInt(d.recv,10);
  const rtt = ts-sent;
  $("#ping_reply").text(`rtt: ${rtt}ms, clock difference: ${ts-recv-(rtt/2)}ms`);
}

function SNR_line_x(snr) {
  let x = 302 * snr/50;
  if(x > 302) {
    x = 302;
  }
  return x;
}

let gps_hidden = true;
function show_radar(element) {
  const width = 355;
  const height = 315;
  if (gps_hidden) {
    $("#gps").show();
    gps_hidden = false;
  }
  const ctx = element.getContext("2d");

  // clear
  ctx.fillStyle = "rgb(0,0,0)";
  ctx.clearRect(0, 0, width, height);

  // radar circles
  ctx.strokeStyle = "rgba(0,0,0, 0.3)";
  ctx.lineWidth = 1;
  for(let radius = 150; radius >= 10; radius = radius - 46) {
    ctx.beginPath();
    ctx.arc(151, 151, radius, 0, Math.PI*2, true);
    ctx.closePath();
    ctx.stroke();
  }

  // radar cross
  ctx.beginPath();
  ctx.moveTo(0,151);
  ctx.lineTo(302,151);
  ctx.moveTo(151,0);
  ctx.lineTo(151,302);
  ctx.closePath();
  ctx.stroke();

  // SNR line
  ctx.beginPath();
  ctx.moveTo(0, 310);
  ctx.lineTo(302, 310);
  ctx.closePath();
  ctx.stroke();

  // radar "N"
  ctx.strokeStyle = "rgb(0,0,0)";
  ctx.font = "15px Georgia";
  ctx.fillText("N",152,16);

  // "0 dB" and "50 dB" for SNR line
  ctx.fillText("0 dB",10,300);
  ctx.fillText("50 dB",272,300);

  // 25 dB for SNR line
  const SNR_25 = SNR_line_x(25);
  ctx.beginPath();
  ctx.moveTo(SNR_25, 307);
  ctx.lineTo(SNR_25, 313);
  ctx.closePath();
  ctx.stroke();
}

function show_radar_sats(element, sats) {
  const ctx = element.getContext("2d");
  ctx.strokeStyle = "rgb(0,0,0)";
  ctx.lineWidth = 2;
  for(let i = 0; i < sats.length; i++) {
    const elevation_rad = (90-sats[i].elevation) * Math.PI / 180; // from horizon
    const r = Math.sin(elevation_rad) * 150;

    const azimuth_rad = (540 - sats[i].azimuth) % 360 * Math.PI / 180; // clockwise from north
    const x = Math.sin(azimuth_rad) * r + 151;
    const y = Math.cos(azimuth_rad) * r + 151;

    ctx.beginPath();
    ctx.arc(x,y,5,0,Math.PI*2, true);
    ctx.closePath();
    if(sats[i].snr < 2) {
      ctx.fillStyle = "rgb(0,0,0)";
    } else if(sats[i].snr < 10) {
      ctx.fillStyle = "rgb(255,0,0)";
    } else if(sats[i].snr < 20) {
      ctx.fillStyle = "rgb(255,255,0)";
    } else if(sats[i].snr < 30) {
      ctx.fillStyle = "rgb(196,232,104)";
    } else {
      ctx.fillStyle = "rgb(0,214,7)";
    }
    ctx.fill();
    if(sats[i].used_in_lock) {
      ctx.stroke();
    }

    const SNR_x = SNR_line_x(sats[i].snr);
    ctx.beginPath();
    ctx.arc(SNR_x, 310, 2, 0, Math.PI*2, true);
    ctx.closePath();
    ctx.fill();

    if(sats[i].used_in_lock) {
      ctx.fillStyle = "rgb(46,27,250)";
    } else {
      ctx.fillStyle = "rgb(0,0,0)";
    }

    ctx.fillText(sats[i].id,x+8,y+5);
  }
}

function gps_msg(d, ts) {
  $(`#messages_${d.type}`).text(d.text);
  set_date_element(`#messages_time_${d.type}`, ts);
  if(d.type === "gps") {
    set_date_element("#messages_time_gps_lock", d.lastlock);
    $("#GPGSA").html(d.parsed.GPGSA);
    let sats = "";
    for(let i = 0; i < d.parsed.GPGSV.length; i++) {
      if(d.parsed.GPGSV[i]["special"].length > 0) {
        sats += 
	  `id = ${d.parsed.GPGSV[i]["id"]}` + 
	  `, snr = ${d.parsed.GPGSV[i]["snr"]}` +
          `, special = ${d.parsed.GPGSV[i]["special"]}` +
          "<br/>";
      }
    }
    $("#GPGSV").html(sats);
    const gps_radar = $('#gps_radar')[0];
    show_radar(gps_radar);
    show_radar_sats(gps_radar,d.parsed.GPGSV);
  }
}

$(() => {
    if ("WebSocket" in window) {
	let proto = "ws://";
	if(document.location.protocol == "https:") {
		proto = "wss://";
	}
        ws = new WebSocket(`${proto}${location.host}`);
    }
    else {
        $("#ws_error").text("This browser doesn't support WebSocket.");
        $("#connected").text("not connected");
        return;
    }

    if (ws) {
        connected = 1;
        $("#connected").text("Connected");
        ws.onmessage = (ev) => {
            const ts = Date.now();
            try {
                const d = JSON.parse(ev.data);
                if(d.type == "reply") {
                  ping_reply(d, ts);
                } else {
                  gps_msg(d, ts);
                }
            } catch(e) { if (console) console.log(e) }
        }
        ws.onerror = (ev) => {
	  $("#ws_error").text(`WebSocket error: [${ev.code}]${ev.reason}`);
	  $("#connected").text("not connected");
	  connected = 0;
        }
        ws.onclose = (ev) => {
	  $("#ws_close").text(`WebSocket closed: [${ev.code}]${ev.reason}`);
	  $("#connected").text("not connected");
	  connected = 0;
        }
    }

    window.setInterval(() => { $(".pretty-time").prettyDate(); check_ping(); }, 1000);
});
