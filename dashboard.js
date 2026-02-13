// Configuration MQTT WebSocket (direct broker)
// Ex: ws://<IP_BROKER>:9001
const MQTT_WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const DEFAULT_MQTT_WS_URL = `${MQTT_WS_PROTOCOL}//${window.location.hostname}:9001`;
const DEFAULT_MQTT_TOPIC = 'kelo/nid/A12/telemetry';
const MQTT_WS_URL = localStorage.getItem('mqttWsUrl') || DEFAULT_MQTT_WS_URL;
const MQTT_TOPIC = localStorage.getItem('mqttTopic') || DEFAULT_MQTT_TOPIC;
const DEFAULT_GRAFANA_URL = localStorage.getItem('grafanaUrl') || `${window.location.protocol}//${window.location.hostname}:3000`;
const DEFAULT_GRAFANA_UID = localStorage.getItem('grafanaUid') || '';
const DEFAULT_GRAFANA_TEMP_PANEL = localStorage.getItem('grafanaTempPanel') || '1';
const DEFAULT_GRAFANA_HUM_PANEL = localStorage.getItem('grafanaHumPanel') || '2';

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
  temperature: [25, 25.5, 26, 26.5, 27, 27.5],
  humidite: [75, 76, 77, 78, 79, 80],
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
let fallbackTimer = null;

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

function updateData() {
  ensureChartsReady();

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

function initDashboard() {
  initDomRefs();
  initCharts();

  const apiUrlInput = document.getElementById('apiUrlInput');
  const topicInput = document.getElementById('mqttTopicInput');
  const saveApiBtn = document.getElementById('saveApiBtn');
  const apiStatus = document.getElementById('apiStatus');
  const grafanaUrlInput = document.getElementById('grafanaUrlInput');
  const grafanaUidInput = document.getElementById('grafanaUidInput');
  const grafanaTempPanelInput = document.getElementById('grafanaTempPanelInput');
  const grafanaHumPanelInput = document.getElementById('grafanaHumPanelInput');
  const saveGrafanaBtn = document.getElementById('saveGrafanaBtn');

  if (apiUrlInput) apiUrlInput.value = MQTT_WS_URL;
  if (topicInput) topicInput.value = MQTT_TOPIC;
  if (grafanaUrlInput) grafanaUrlInput.value = DEFAULT_GRAFANA_URL;
  if (grafanaUidInput) grafanaUidInput.value = DEFAULT_GRAFANA_UID;
  if (grafanaTempPanelInput) grafanaTempPanelInput.value = DEFAULT_GRAFANA_TEMP_PANEL;
  if (grafanaHumPanelInput) grafanaHumPanelInput.value = DEFAULT_GRAFANA_HUM_PANEL;

  if (saveGrafanaBtn) {
    saveGrafanaBtn.addEventListener('click', () => {
      const baseUrl = grafanaUrlInput ? grafanaUrlInput.value.trim() : '';
      const dashboardUid = grafanaUidInput ? grafanaUidInput.value.trim() : '';
      const tempPanelId = grafanaTempPanelInput ? grafanaTempPanelInput.value.trim() : '';
      const humPanelId = grafanaHumPanelInput ? grafanaHumPanelInput.value.trim() : '';

      if (baseUrl) localStorage.setItem('grafanaUrl', baseUrl);
      if (dashboardUid) localStorage.setItem('grafanaUid', dashboardUid);
      if (tempPanelId) localStorage.setItem('grafanaTempPanel', tempPanelId);
      if (humPanelId) localStorage.setItem('grafanaHumPanel', humPanelId);

      loadGrafanaPanels({
        baseUrl: baseUrl || DEFAULT_GRAFANA_URL,
        dashboardUid: dashboardUid || DEFAULT_GRAFANA_UID,
        tempPanelId: tempPanelId || DEFAULT_GRAFANA_TEMP_PANEL,
        humPanelId: humPanelId || DEFAULT_GRAFANA_HUM_PANEL
      });
    });
  }

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
  if (!fallbackTimer) {
    fallbackTimer = setInterval(updateData, 3000);
  }
  updateData();
  loadGrafanaPanels({
    baseUrl: DEFAULT_GRAFANA_URL,
    dashboardUid: DEFAULT_GRAFANA_UID,
    tempPanelId: DEFAULT_GRAFANA_TEMP_PANEL,
    humPanelId: DEFAULT_GRAFANA_HUM_PANEL
  });
  startMqtt();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDashboard, { once: true });
} else {
  initDashboard();
}

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

function buildGrafanaPanelUrl(baseUrl, dashboardUid, panelId) {
  const normalizedBase = baseUrl.replace(/\/$/, '');
  const params = new URLSearchParams({
    orgId: '1',
    panelId: String(panelId),
    from: 'now-6h',
    to: 'now',
    theme: 'light'
  });
  return `${normalizedBase}/d-solo/${dashboardUid}/kelo?${params.toString()}`;
}

function loadGrafanaPanels(config) {
  const { baseUrl, dashboardUid, tempPanelId, humPanelId } = config;
  const tempFrame = document.getElementById('grafanaTempFrame');
  const humFrame = document.getElementById('grafanaHumFrame');
  const statusEl = document.getElementById('grafanaStatus');

  if (!tempFrame || !humFrame) return;

  if (!baseUrl || !dashboardUid || !tempPanelId || !humPanelId) {
    tempFrame.removeAttribute('src');
    humFrame.removeAttribute('src');
    if (statusEl) {
      statusEl.textContent = '⚠️ URL, UID et panel IDs requis';
      statusEl.style.color = '#FF6B6B';
    }
    return;
  }

  try {
    tempFrame.src = buildGrafanaPanelUrl(baseUrl, dashboardUid, tempPanelId);
    humFrame.src = buildGrafanaPanelUrl(baseUrl, dashboardUid, humPanelId);
    if (statusEl) {
      statusEl.textContent = '✓ Panels Grafana chargés';
      statusEl.style.color = '#4CAF50';
    }
  } catch (err) {
    console.error('Grafana embed error', err);
    if (statusEl) {
      statusEl.textContent = '❌ Erreur URL Grafana';
      statusEl.style.color = '#FF6B6B';
    }
  }
}

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

