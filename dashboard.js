// Configuration MQTT WebSocket (direct broker)
// Ex: ws://<IP_BROKER>:9001
const DEFAULT_MQTT_WS_URL = (window.location.hostname === 'localhost')
  ? 'ws://127.0.0.1:9001'
  : 'ws://127.0.0.1:9001';
const DEFAULT_MQTT_TOPIC = 'kelo/nid/A12/telemetry';
const MQTT_WS_URL = localStorage.getItem('mqttWsUrl') || DEFAULT_MQTT_WS_URL;
const MQTT_TOPIC = localStorage.getItem('mqttTopic') || DEFAULT_MQTT_TOPIC;

// Éléments HTML pour les valeurs actuelles
const tempEl = document.getElementById("temp-value");
const humEl = document.getElementById("hum-value");
const vibEl = document.getElementById("vib-value");
const soundEl = document.getElementById("sound-value");

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
  temperature: [25, 25.5, 26, 26.5, 27, 27.5],
  humidite: [75, 76, 77, 78, 79, 80],
  vibration: [3.7, 3.8, 3.9, 3.85, 4.0, 4.1],
  tension: [1, 1.5, 2.0, 2.2, 2.5, 2.8]
};

function createLineChart(canvasId, label, color, data) {
  const ctx = document.getElementById(canvasId);
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

const tempChartCanvas = document.getElementById("tempChart");
const tempChart = tempChartCanvas ? new Chart(tempChartCanvas, {
  type: "line",
  data: {
    labels: labels,
    datasets: [{
      label: "Température (°C)",
      data: tempData,
      borderColor: "#4bc0c0",
      tension: 0.3
    }]
  }
}) : null;

const humChartCanvas = document.getElementById("humChart");
const humChart = humChartCanvas ? new Chart(humChartCanvas, {
  type: "line",
  data: {
    labels: labels,
    datasets: [{
      label: "Humidité (%)",
      data: humData,
      borderColor: "#ffcc00",
      tension: 0.3
    }]
  }
}) : null;

const vibrationChart = createLineChart(
  'vibrationChart',
  'Vibrations (m/s²)',
  'rgba(255, 206, 86, 1)',
  [...dataHistory.vibration]
);

const soundChart = createLineChart(
  'soundChart',
  'Tension (V)',
  'rgba(75, 192, 192, 1)',
  [...dataHistory.tension]
);

let mqttClient = null;
let fallbackTimer = null;

function isChartUsable(chart) {
  return Boolean(chart && chart.canvas && chart.canvas.isConnected);
}

function updateChartIfUsable(chart, nextData) {
  if (!isChartUsable(chart)) return;
  if (Array.isArray(nextData)) {
    chart.data.datasets[0].data = nextData;
  }
  chart.update();
}

function updateData() {
  const data = {
    temp: (24 + Math.random() * 2).toFixed(2),
    hum: (70 + Math.random() * 5).toFixed(2),
    vib: (0.1 + Math.random() * 0.3).toFixed(2),
    sound: (30 + Math.random() * 10).toFixed(2),
    time: new Date().toLocaleTimeString()
  };

  if (tempEl) tempEl.textContent = data.temp + " °C";
  if (humEl) humEl.textContent = data.hum + " %";
  if (vibEl) vibEl.textContent = data.vib + " m/s²";
  if (soundEl) soundEl.textContent = data.sound + " dB";

  labels.push(data.time);
  tempData.push(data.temp);
  humData.push(data.hum);

  if (labels.length > 12) {
    labels.shift();
    tempData.shift();
    humData.shift();
  }

  dataHistory.vibration.push(parseFloat(data.vib));
  dataHistory.vibration.shift();
  dataHistory.tension.push(parseFloat(data.sound));
  dataHistory.tension.shift();

  updateChartIfUsable(tempChart);
  updateChartIfUsable(humChart);
  updateChartIfUsable(vibrationChart, [...dataHistory.vibration]);
  updateChartIfUsable(soundChart, [...dataHistory.tension]);
}

function updateCharts(payload) {
  if (!payload) return;

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

  dataHistory.temperature.push(temperature);
  dataHistory.temperature.shift();
  dataHistory.humidite.push(safeHumidite);
  dataHistory.humidite.shift();
  dataHistory.vibration.push(safeVibration);
  dataHistory.vibration.shift();
  dataHistory.tension.push(safeTension);
  dataHistory.tension.shift();

  updateChartIfUsable(tempChart, [...tempData]);
  updateChartIfUsable(humChart, [...humData]);
  updateChartIfUsable(vibrationChart, [...dataHistory.vibration]);
  updateChartIfUsable(soundChart, [...dataHistory.tension]);
}

// Gestion de la configuration de l'API
document.addEventListener('DOMContentLoaded', () => {
  const apiUrlInput = document.getElementById('apiUrlInput');
  const topicInput = document.getElementById('mqttTopicInput');
  const saveApiBtn = document.getElementById('saveApiBtn');
  const apiStatus = document.getElementById('apiStatus');

  if (apiUrlInput) apiUrlInput.value = MQTT_WS_URL;
  if (topicInput) topicInput.value = MQTT_TOPIC;

  if (saveApiBtn) {
    saveApiBtn.addEventListener('click', () => {
      const newUrl = apiUrlInput ? apiUrlInput.value.trim() : '';
      const newTopic = topicInput ? topicInput.value.trim() : '';
      if (newUrl) localStorage.setItem('mqttWsUrl', newUrl);
      if (newTopic) localStorage.setItem('mqttTopic', newTopic);
      if (apiStatus) {
        apiStatus.textContent = '✓ MQTT configuré';
        apiStatus.style.color = '#4CAF50';
      }
      startMqtt(newUrl || MQTT_WS_URL, newTopic || MQTT_TOPIC);
    });
  }

  // Démarrer la mise à jour des données (fallback si MQTT non connecté)
  fallbackTimer = setInterval(updateData, 3000);
  updateData();
});

function stopRealtimeUpdates() {
  if (fallbackTimer) {
    clearInterval(fallbackTimer);
    fallbackTimer = null;
  }

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

startMqtt();
