const MQTT_WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const DEFAULT_MQTT_WS_URL = `${MQTT_WS_PROTOCOL}//${window.location.hostname}:9001`;
const DEFAULT_MQTT_TOPIC = 'kelo/nid/+/telemetry';
const MQTT_WS_URL = localStorage.getItem('mqttWsUrl') || DEFAULT_MQTT_WS_URL;
const MQTT_TOPIC = localStorage.getItem('mqttTopic') || DEFAULT_MQTT_TOPIC;
const MAX_POINTS = 12;

let tempEl = null;
let humEl = null;
let vibEl = null;
let soundEl = null;
let mqttClient = null;
let lastPayloadSignature = null;

const nidStates = new Map();

function createLineChart(canvasId, label, color, data, chartLabels) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof canvas.getContext !== 'function') return null;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: chartLabels,
      datasets: [{
        label,
        data,
        borderColor: color,
        backgroundColor: color.replace('1)', '0.2)'),
        tension: 0.3
      }]
    },
    options: {
      responsive: true,
      animation: {
        duration: 450,
        easing: 'easeOutCubic'
      },
      plugins: {
        legend: { labels: { color: '#f5f5f5' } }
      },
      scales: {
        x: { ticks: { color: '#cfd8dc' } },
        y: { ticks: { color: '#cfd8dc' } }
      }
    }
  });
}

function isChartUsable(chart) {
  return Boolean(chart && chart.canvas && chart.canvas.isConnected && chart.ctx);
}

function updateChartIfUsable(chart, values, labels) {
  if (!isChartUsable(chart)) return;
  chart.data.datasets[0].data = values;
  chart.data.labels = labels;
  chart.update();
}

function sanitizeId(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '_');
}

function initDomRefs() {
  tempEl = document.getElementById('temp-value');
  humEl = document.getElementById('hum-value');
  vibEl = document.getElementById('vib-value');
  soundEl = document.getElementById('sound-value');
}

function extractNid(topic, payload) {
  if (payload && payload.nid) return String(payload.nid);

  const parts = String(topic || '').split('/').filter(Boolean);
  if (parts.length >= 3 && parts[0] === 'kelo' && parts[1] === 'nid') {
    return parts[2];
  }

  return 'inconnu';
}

function createSeries() {
  return {
    labels: [],
    values: []
  };
}

function createNidState(nid) {
  const container = document.getElementById('nidsContainer');
  if (!container) return null;

  const safeNid = sanitizeId(nid);
  const block = document.createElement('section');
  block.className = 'nid-block';
  block.id = `nid-${safeNid}`;

  block.innerHTML = `
    <h2>Nid ${nid}</h2>
    <div class="charts nid-charts">
      <div class="chart-container">
        <h3>Température</h3>
        <canvas id="tempChart_${safeNid}"></canvas>
      </div>
      <div class="chart-container">
        <h3>Humidité</h3>
        <canvas id="humChart_${safeNid}"></canvas>
      </div>
      <div class="chart-container">
        <h3>Vibrations</h3>
        <canvas id="vibrationChart_${safeNid}"></canvas>
      </div>
      <div class="chart-container">
        <h3>Tension</h3>
        <canvas id="tensionChart_${safeNid}"></canvas>
      </div>
    </div>
  `;

  container.appendChild(block);

  const state = {
    nid,
    safeNid,
    series: {
      temperature: createSeries(),
      humidite: createSeries(),
      vibration: createSeries(),
      tension: createSeries()
    },
    charts: {
      temperature: createLineChart(
        `tempChart_${safeNid}`,
        `Température (°C) · Nid ${nid}`,
        'rgba(75, 192, 192, 1)',
        [],
        []
      ),
      humidite: createLineChart(
        `humChart_${safeNid}`,
        `Humidité (%) · Nid ${nid}`,
        'rgba(255, 204, 0, 1)',
        [],
        []
      ),
      vibration: createLineChart(
        `vibrationChart_${safeNid}`,
        `Vibrations (m/s²) · Nid ${nid}`,
        'rgba(255, 206, 86, 1)',
        [],
        []
      ),
      tension: createLineChart(
        `tensionChart_${safeNid}`,
        `Tension (V) · Nid ${nid}`,
        'rgba(153, 102, 255, 1)',
        [],
        []
      )
    }
  };

  nidStates.set(nid, state);
  return state;
}

function getNidState(nid) {
  return nidStates.get(nid) || createNidState(nid);
}

function pushPoint(series, value, timeLabel) {
  if (!Number.isFinite(value)) return false;

  series.values.push(value);
  series.labels.push(timeLabel);

  if (series.values.length > MAX_POINTS) {
    series.values.shift();
    series.labels.shift();
  }

  return true;
}

function updateNidCharts(state, metrics, timeLabel) {
  const hasTemperature = pushPoint(state.series.temperature, metrics.temperature, timeLabel);
  const hasHumidite = pushPoint(state.series.humidite, metrics.humidite, timeLabel);
  const hasVibration = pushPoint(state.series.vibration, metrics.vibration, timeLabel);
  const hasTension = pushPoint(state.series.tension, metrics.tension, timeLabel);

  if (hasTemperature) {
    updateChartIfUsable(
      state.charts.temperature,
      [...state.series.temperature.values],
      [...state.series.temperature.labels]
    );
  }

  if (hasHumidite) {
    updateChartIfUsable(
      state.charts.humidite,
      [...state.series.humidite.values],
      [...state.series.humidite.labels]
    );
  }

  if (hasVibration) {
    updateChartIfUsable(
      state.charts.vibration,
      [...state.series.vibration.values],
      [...state.series.vibration.labels]
    );
  }

  if (hasTension) {
    updateChartIfUsable(
      state.charts.tension,
      [...state.series.tension.values],
      [...state.series.tension.labels]
    );
  }

  return { hasTemperature, hasHumidite, hasVibration, hasTension };
}

function pickNumber(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return NaN;
}

function updateSummaryCards(metrics, flags) {
  if (tempEl && flags.hasTemperature) tempEl.textContent = `${metrics.temperature.toFixed(2)} °C`;
  if (humEl && flags.hasHumidite) humEl.textContent = `${metrics.humidite.toFixed(2)} %`;
  if (vibEl && flags.hasVibration) vibEl.textContent = `${metrics.vibration.toFixed(2)} m/s²`;
  if (soundEl && flags.hasTension) soundEl.textContent = `${metrics.tension.toFixed(2)} V`;
}

function updateCharts(payload, topic) {
  if (!payload) return;

  const normalized = payload.data ?? payload;
  if (!normalized || typeof normalized !== 'object') return;

  const jsonDisplay = document.getElementById('jsonData');
  if (jsonDisplay) jsonDisplay.textContent = JSON.stringify(normalized, null, 2);

  const nid = extractNid(topic, normalized);
  const state = getNidState(nid);
  if (!state) return;

  const metrics = {
    temperature: pickNumber(normalized.temperature, normalized.temp),
    humidite: pickNumber(normalized.humidite, normalized.humidity, normalized.hum),
    vibration: pickNumber(normalized.vibration, normalized.vib),
    tension: pickNumber(normalized.tension, normalized.sound)
  };

  const time = new Date().toLocaleTimeString();
  const flags = updateNidCharts(state, metrics, time);
  updateSummaryCards(metrics, flags);
}

function stopRealtimeUpdates() {
  if (!mqttClient) return;
  try {
    mqttClient.end(true);
  } catch (_err) {
  }
  mqttClient = null;
}

function startMqtt(wsUrl = MQTT_WS_URL, topic = MQTT_TOPIC) {
  if (!window.mqtt) return;

  if (mqttClient) {
    mqttClient.end(true);
  }

  mqttClient = window.mqtt.connect(wsUrl, {
    reconnectPeriod: 2000,
    connectTimeout: 5000
  });

  mqttClient.on('connect', () => {
    mqttClient.subscribe(topic);
  });

  mqttClient.on('message', (receivedTopic, message) => {
    const payloadText = message.toString();
    if (payloadText === lastPayloadSignature) return;

    let payload;
    try {
      payload = JSON.parse(payloadText);
    } catch (err) {
      console.error('MQTT JSON parse error', err);
      return;
    }

    lastPayloadSignature = payloadText;
    try {
      updateCharts(payload, receivedTopic);
    } catch (err) {
      console.error('MQTT chart update error', err);
    }
  });

  mqttClient.on('error', (err) => {
    console.error('MQTT error', err);
  });
}

function initDashboard() {
  initDomRefs();
  startMqtt();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDashboard, { once: true });
} else {
  initDashboard();
}

window.addEventListener('beforeunload', stopRealtimeUpdates);
window.addEventListener('pagehide', stopRealtimeUpdates);
