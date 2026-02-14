// Configuration MQTT WebSocket (direct broker)
// Ex: ws://<IP_BROKER>:9001
const MQTT_WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const DEFAULT_MQTT_WS_URL = `${MQTT_WS_PROTOCOL}//${window.location.hostname}:9001`;
const DEFAULT_MQTT_TOPIC = 'kelo/nid/A12/telemetry';
const MQTT_WS_URL = localStorage.getItem('mqttWsUrl') || DEFAULT_MQTT_WS_URL;
const MQTT_TOPIC = localStorage.getItem('mqttTopic') || DEFAULT_MQTT_TOPIC;

// Éléments HTML pour les valeurs actuelles
let tempEl = null;
let humEl = null;
let vibEl = null;
let soundEl = null;

// Données de base
let labels = [];
let tempData = [];
let humData = [];
let lastKnown = {
  temperature: 25,
  humidite: 75,
  vibration: 3.8,
  tension: 2.0
};

// Historique des données (garder 6 dernières mesures)
const dataHistory = {
  vibration: [3.7, 3.8, 3.9, 3.85, 4.0, 4.1],
  tension: [1, 1.5, 2.0, 2.2, 2.5, 2.8]
};

function createLineChart(canvasId, label, color, data) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof canvas.getContext !== 'function') return null;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  return new Chart(ctx, {
    type: 'line',
    data: {
      labels,
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

let tempChart = null;
let humChart = null;
let vibrationChart = null;
let soundChart = null;

let mqttClient = null;

function initDomRefs() {
  tempEl = document.getElementById("temp-value");
  humEl = document.getElementById("hum-value");
  vibEl = document.getElementById("vib-value");
  soundEl = document.getElementById("sound-value");
}

function initCharts() {
  if (!window.Chart) return;

  if (!tempChart) {
    tempChart = createLineChart(
      'tempChart',
      'Température (°C)',
      'rgba(75, 192, 192, 1)',
      tempData
    );
  }

  if (!humChart) {
    humChart = createLineChart(
      'humChart',
      'Humidité (%)',
      'rgba(255, 204, 0, 1)',
      humData
    );
  }

  if (!vibrationChart) {
    vibrationChart = createLineChart(
      'vibrationChart',
      'Vibrations (m/s²)',
      'rgba(255, 206, 86, 1)',
      [...dataHistory.vibration]
    );
  }

  if (!soundChart) {
    soundChart = createLineChart(
      'soundChart',
      'Tension (V)',
      'rgba(75, 192, 192, 1)',
      [...dataHistory.tension]
    );
  }
}

function ensureChartsReady() {
  if (!isChartUsable(tempChart) || !isChartUsable(humChart) || !isChartUsable(vibrationChart) || !isChartUsable(soundChart)) {
    initCharts();
  }
}

function isChartUsable(chart) {
  return Boolean(chart && chart.canvas && chart.canvas.isConnected && chart.ctx);
}

function updateChartIfUsable(chart, nextData) {
  if (!isChartUsable(chart)) return;
  if (Array.isArray(nextData)) {
    chart.data.datasets[0].data = nextData;
  }
  chart.update();
}

function updateCharts(payload) {
  if (!payload) return;
  ensureChartsReady();

  const normalized = payload.data ?? payload;
  if (!normalized || typeof normalized !== 'object') return;
  const jsonDisplay = document.getElementById('jsonData');
  if (jsonDisplay) jsonDisplay.textContent = JSON.stringify(normalized, null, 2);

  const pickNumber = (...values) => {
    for (const value of values) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return NaN;
  };

  const temperature = pickNumber(normalized.temperature, normalized.temp);
  const humidite = pickNumber(normalized.humidite, normalized.humidity, normalized.hum);
  const vibration = pickNumber(normalized.vibration, normalized.vib);
  const tension = pickNumber(normalized.tension, normalized.sound);

  if (!Number.isFinite(temperature)) return;

  if (Number.isFinite(temperature)) lastKnown.temperature = temperature;
  if (Number.isFinite(humidite)) lastKnown.humidite = humidite;
  if (Number.isFinite(vibration)) lastKnown.vibration = vibration;
  if (Number.isFinite(tension)) lastKnown.tension = tension;

  const safeHumidite = Number.isFinite(humidite) ? humidite : lastKnown.humidite;
  const safeVibration = Number.isFinite(vibration) ? vibration : lastKnown.vibration;
  const safeTension = Number.isFinite(tension) ? tension : lastKnown.tension;

  // Mise à jour des affichages actuels
  if (tempEl) tempEl.textContent = temperature.toFixed(2) + " °C";
  if (humEl) humEl.textContent = safeHumidite.toFixed(2) + " %";
  if (vibEl) vibEl.textContent = safeVibration.toFixed(2) + " m/s²";
  if (soundEl) soundEl.textContent = safeTension.toFixed(2) + " V";

  // Mise à jour avec timestamp
  const time = new Date().toLocaleTimeString();
  labels.push(time);
  tempData.push(temperature);
  humData.push(safeHumidite);

  if (labels.length > 12) {
    labels.shift();
    tempData.shift();
    humData.shift();
  }

  dataHistory.vibration.push(safeVibration);
  dataHistory.vibration.shift();
  dataHistory.tension.push(safeTension);
  dataHistory.tension.shift();

  updateChartIfUsable(tempChart, [...tempData]);
  updateChartIfUsable(humChart, [...humData]);
  updateChartIfUsable(vibrationChart, [...dataHistory.vibration]);
  updateChartIfUsable(soundChart, [...dataHistory.tension]);
}

function initDashboard() {
  initDomRefs();
  initCharts();

  startMqtt();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDashboard, { once: true });
} else {
  initDashboard();
}

function stopRealtimeUpdates() {
  if (mqttClient) {
    try {
      mqttClient.end(true);
    } catch (_err) {
      // noop
    }
    mqttClient = null;
  }
}

window.addEventListener('beforeunload', stopRealtimeUpdates);
window.addEventListener('pagehide', stopRealtimeUpdates);

function startMqtt(wsUrl = MQTT_WS_URL, topic = MQTT_TOPIC) {
  const statusEl = document.getElementById('apiStatus');
  if (!window.mqtt) {
    if (statusEl) {
      statusEl.textContent = '❌ mqtt.js manquant';
      statusEl.style.color = '#FF6B6B';
    }
    return;
  }

  if (mqttClient) {
    mqttClient.end(true);
  }

  if (statusEl) {
    statusEl.textContent = '⏳ Connexion MQTT...';
    statusEl.style.color = '#f3c74b';
  }

  mqttClient = window.mqtt.connect(wsUrl, {
    reconnectPeriod: 2000,
    connectTimeout: 5000
  });

  mqttClient.on('connect', () => {
    if (statusEl) {
      statusEl.textContent = '✓ MQTT connecté';
      statusEl.style.color = '#4CAF50';
    }
    mqttClient.subscribe(topic, (err) => {
      if (err) {
        if (statusEl) {
          statusEl.textContent = '❌ Abonnement MQTT échoué';
          statusEl.style.color = '#FF6B6B';
        }
      }
    });
  });

  mqttClient.on('message', (_topic, message) => {
    let payload;
    try {
      payload = JSON.parse(message.toString());
    } catch (err) {
      console.error('MQTT JSON parse error', err);
      return;
    }

    try {
      if (statusEl) {
        statusEl.textContent = '✓ MQTT connecté (message reçu)';
        statusEl.style.color = '#4CAF50';
      }
      updateCharts(payload);
    } catch (err) {
      console.error('MQTT chart update error', err);
    }
  });

  mqttClient.on('error', (err) => {
    console.error('MQTT error', err);
    if (statusEl) {
      statusEl.textContent = '❌ Erreur MQTT';
      statusEl.style.color = '#FF6B6B';
    }
  });
}

