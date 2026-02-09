// Configuration MQTT WebSocket (direct broker)
// Ex: ws://<IP_BROKER>:9001
const DEFAULT_MQTT_WS_URL = (window.location.hostname === 'localhost')
  ? 'ws://127.0.0.1:9001'
  : 'ws://127.0.0.1:9001';
const DEFAULT_MQTT_TOPIC = 'kelo/nid/A12/telemetry';
const MQTT_WS_URL = localStorage.getItem('mqttWsUrl') || DEFAULT_MQTT_WS_URL;
const MQTT_TOPIC = localStorage.getItem('mqttTopic') || DEFAULT_MQTT_TOPIC;

// Données de base (ex : dernières 6 mesures)
const labels = ['T-30min', 'T-25min', 'T-20min', 'T-15min', 'T-10min', 'T-5min'];

// Historique des données (garder 6 dernières mesures)
const dataHistory = {
  temperature: [25, 25.5, 26, 26.5, 27, 27.5],
  humidite: [75, 76, 77, 78, 79, 80],
  vibration: [3.7, 3.8, 3.9, 3.85, 4.0, 4.1],
  tension: [1, 1.5, 2.0, 2.2, 2.5, 2.8]
};

function createLineChart(canvasId, label, color, data) {
  const ctx = document.getElementById(canvasId);
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

const tempChart = createLineChart(
  'tempChart',
  'Température (°C)',
  'rgba(255, 99, 132, 1)',
  [...dataHistory.temperature]
);

const humidityChart = createLineChart(
  'humidityChart',
  'Humidité (%)',
  'rgba(54, 162, 235, 1)',
  [...dataHistory.humidite]
);

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

function updateCharts(payload) {
  if (!payload) return;

  const normalized = payload.data ? payload.data : payload;
  const jsonDisplay = document.getElementById('jsonData');
  if (jsonDisplay) jsonDisplay.textContent = JSON.stringify(normalized, null, 2);

  const temperature = Number(normalized.temperature);
  const humidite = Number(normalized.humidite);
  const vibration = Number(normalized.vibration);
  const tension = Number(normalized.tension);

  if (!Number.isFinite(temperature)) return;

  dataHistory.temperature.push(temperature);
  dataHistory.temperature.shift();
  dataHistory.humidite.push(humidite);
  dataHistory.humidite.shift();
  dataHistory.vibration.push(vibration);
  dataHistory.vibration.shift();
  dataHistory.tension.push(tension);
  dataHistory.tension.shift();

  tempChart.data.datasets[0].data = [...dataHistory.temperature];
  tempChart.update();
  humidityChart.data.datasets[0].data = [...dataHistory.humidite];
  humidityChart.update();
  vibrationChart.data.datasets[0].data = [...dataHistory.vibration];
  vibrationChart.update();
  soundChart.data.datasets[0].data = [...dataHistory.tension];
  soundChart.update();
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
});

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
    try {
      const payload = JSON.parse(message.toString());
      if (statusEl) {
        statusEl.textContent = '✓ MQTT connecté (message reçu)';
        statusEl.style.color = '#4CAF50';
      }
      updateCharts(payload);
    } catch (err) {
      console.error('MQTT parse error', err);
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
