const MQTT_WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const DEFAULT_MQTT_WS_URL = `${MQTT_WS_PROTOCOL}//${window.location.hostname}:9001`;
const DEFAULT_MQTT_TOPICS = ['kelo/nid/+/telemetry', 'kelonia'];
const MQTT_WS_URL = (() => { try { return localStorage.getItem('mqttWsUrl'); } catch (e) { return null; } })() || DEFAULT_MQTT_WS_URL;
const MQTT_TOPICS = (() => {
  const saved = (() => { try { return localStorage.getItem('mqttTopic'); } catch (e) { return null; } })();
  if (!saved) return DEFAULT_MQTT_TOPICS;
  return String(saved).split(',').map((s) => s.trim()).filter(Boolean);
})();
const MAX_POINTS = 12;
const AUTH_KEY = 'keloniaAuth';
const ALERT_LIMITS = {
  temperature: { min: 24, max: 34 },
  humidite: { min: 60, max: 95 },
  vibration: { min: 3.0, max: 4.5 },
  tension: { min: 0.5, max: 4.5 }
};

const USER_KEY = 'keloniaUser';
const ROLE_KEY = 'keloniaRole';

function storageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (err) {
    // localStorage may be blocked by browser privacy settings.
  }

  try {
    return sessionStorage.getItem(key);
  } catch (err) {
    // sessionStorage may also be blocked in strict modes.
  }

  const cookieMatch = document.cookie.match(new RegExp(`(?:^|; )${key}=([^;]*)`));
  return cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return;
  } catch (err) {
    // Ignore and fallback.
  }

  try {
    sessionStorage.setItem(key, value);
    return;
  } catch (err) {
    // Ignore and fallback.
  }

  document.cookie = `${key}=${encodeURIComponent(value)}; path=/; SameSite=Lax`;
}

function storageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch (err) {
    // Ignore and continue cleanup.
  }

  try {
    sessionStorage.removeItem(key);
  } catch (err) {
    // Ignore and continue cleanup.
  }

  document.cookie = `${key}=; Max-Age=0; path=/; SameSite=Lax`;
}

let tempEl = null;
let humEl = null;
let vibEl = null;
let soundEl = null;
let nidSelectEl = null;
let logoutBtnEl = null;
let userInfoEl = null;
let userRoleEl = null;
let grafanaLinkEl = null;
let alertLogListEl = null;
let alertLogEmptyEl = null;
let mqttClient = null;
let lastPayloadSignature = null;
let selectedNid = null;

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
  nidSelectEl = document.getElementById('nidSelect');
  userInfoEl = document.getElementById('userInfo');
  userRoleEl = document.getElementById('userRole');
  grafanaLinkEl = document.getElementById('grafanaLink');
  alertLogListEl = document.getElementById('alertLogList');
  alertLogEmptyEl = document.getElementById('alertLogEmpty');
  logoutBtnEl = document.getElementById('logoutBtn');

  if (grafanaLinkEl) {
    grafanaLinkEl.href = '/grafana/';
  }

  if (nidSelectEl) {
    nidSelectEl.addEventListener('change', () => {
      selectedNid = nidSelectEl.value || null;
      applyNidVisibility();
      updateSummaryCardsForSelected();
    });
  }

  if (logoutBtnEl) {
    logoutBtnEl.addEventListener('click', () => {
      storageRemove(AUTH_KEY);
      storageRemove(USER_KEY);
      storageRemove(ROLE_KEY);
      stopRealtimeUpdates();
      window.location.href = `${window.location.origin}/login.html`;
    });
  }
}

function ensureAuthenticated() {
  if (storageGet(AUTH_KEY) === '1') return true;
  window.location.href = `${window.location.origin}/login.html`;
  return false;
}

function getAuthenticatedUser() {
  return storageGet(USER_KEY) || 'inconnu';
}

function getCurrentUserRole() {
  return storageGet(ROLE_KEY) || 'viewer';
}

function applyRoleAccessControl() {
  const role = getCurrentUserRole();
  if (role !== 'admin') {
    if (nidSelectEl) nidSelectEl.disabled = true;
    const infoCard = document.createElement('p');
    infoCard.style.fontSize = '0.9rem';
    infoCard.style.color = '#f6c23e';
    infoCard.textContent = 'Mode lecteur : sélection de nid désactivée. Contactez un administrateur pour modifier les paramètres.';
    const filterWrap = document.querySelector('.nid-filter-wrap');
    if (filterWrap && !filterWrap.querySelector('.role-info')) {
      infoCard.className = 'role-info';
      filterWrap.appendChild(infoCard);
    }
  }
}

function applyNidVisibility() {
  const container = document.getElementById('nidsContainer');
  if (!container) return;

  const blocks = container.querySelectorAll('.nid-block');
  blocks.forEach((block) => {
    const nid = block.getAttribute('data-nid');
    block.style.display = selectedNid && nid === selectedNid ? 'block' : 'none';
  });
}

function updateUserHeader() {
  if (userInfoEl) userInfoEl.textContent = `Utilisateur : ${getAuthenticatedUser()}`;
  if (userRoleEl) userRoleEl.textContent = `Rôle : ${getCurrentUserRole()}`;
}

function updateSummaryCardsForSelected() {
  if (!selectedNid) return;
  const state = nidStates.get(selectedNid);
  if (!state || !state.lastMetrics) return;

  const metrics = state.lastMetrics;
  if (tempEl && Number.isFinite(metrics.temperature)) tempEl.textContent = `${metrics.temperature.toFixed(2)} °C`;
  if (humEl && Number.isFinite(metrics.humidite)) humEl.textContent = `${metrics.humidite.toFixed(2)} %`;
  if (vibEl && Number.isFinite(metrics.vibration)) vibEl.textContent = `${metrics.vibration.toFixed(2)} m/s²`;
  if (soundEl && Number.isFinite(metrics.tension)) soundEl.textContent = `${metrics.tension.toFixed(2)} V`;
}

function registerNidInSelect(nid) {
  if (!nidSelectEl) return;

  const exists = Array.from(nidSelectEl.options).some((option) => option.value === nid);
  if (!exists) {
    const option = document.createElement('option');
    option.value = nid;
    option.textContent = `Nid ${nid}`;
    nidSelectEl.appendChild(option);
  }
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

function getMetricLabel(metric) {
  if (metric === 'temperature') return 'Température';
  if (metric === 'humidite') return 'Humidité';
  if (metric === 'vibration') return 'Vibration';
  if (metric === 'tension') return 'Tension';
  return metric;
}

function appendAlertLog(message, metric) {
  if (!alertLogListEl) return;

  if (alertLogEmptyEl) {
    alertLogEmptyEl.style.display = 'none';
  }

  const item = document.createElement('li');
  item.className = `alert-log-item alert-log-critical alert-log-${metric}`;

  const time = document.createElement('div');
  time.className = 'alert-log-time';
  time.textContent = new Date().toLocaleTimeString();

  const text = document.createElement('div');
  text.className = 'alert-log-message';
  text.textContent = message;

  item.appendChild(time);
  item.appendChild(text);
  alertLogListEl.prepend(item);

  while (alertLogListEl.children.length > 80) {
    alertLogListEl.removeChild(alertLogListEl.lastElementChild);
  }
}

function logAlertTransition(state, metric, isAlertNow, value) {
  const previous = Boolean(state.alertStatus[metric]);
  if (previous === isAlertNow || !Number.isFinite(value)) return;

  if (!isAlertNow) {
    state.alertStatus[metric] = false;
    return;
  }

  const limits = ALERT_LIMITS[metric];
  const direction = value < limits.min ? 'trop basse' : 'trop élevée';
  appendAlertLog(`${getMetricLabel(metric)} ${direction} chez le Nid ${state.nid} (${value.toFixed(2)})`, metric);
  state.alertStatus[metric] = true;
}

function createNidState(nid) {
  const container = document.getElementById('nidsContainer');
  if (!container) return null;

  const safeNid = sanitizeId(nid);
  const block = document.createElement('section');
  block.className = 'nid-block';
  block.id = `nid-${safeNid}`;
  block.setAttribute('data-nid', nid);

  block.innerHTML = `
    <h2>Nid ${nid}</h2>
    <div class="charts nid-charts">
      <div class="chart-container">
        <h3>Température</h3>
        <div class="alert" id="tempAlert_${safeNid}" style="display: none;">⚠️ Température trop élevée pour les nids de tortues : le seuil critique. Les nids de tortues deviennent dangereux lorsque la température du sable dépasse environ 33–34 °C</div>
        <canvas id="tempChart_${safeNid}"></canvas>
      </div>
      <div class="chart-container">
        <h3>Humidité</h3>
        <div class="alert" id="humAlert_${safeNid}" style="display: none;">⚠️ Humidité anormale pour les nids de tortues : le seuil critique. L'humidité doit rester entre 60 et 95 % pour assurer un environnement optimal aux œufs</div>
        <canvas id="humChart_${safeNid}"></canvas>
      </div>
      <div class="chart-container">
        <h3>Vibrations</h3>
        <div class="alert" id="vibAlert_${safeNid}" style="display: none;">⚠️ Vibrations élevées dans le nid : le seuil critique. Les vibrations excessives peuvent déranger et endommager les œufs. Les niveaux doivent rester entre 3,0 et 4,5 m/s²</div>
        <canvas id="vibrationChart_${safeNid}"></canvas>
      </div>
      <div class="chart-container">
        <h3>Tension</h3>
        <div class="alert" id="tensionAlert_${safeNid}" style="display: none;">⚠️ Tension anormale</div>
        <canvas id="tensionChart_${safeNid}"></canvas>
      </div>
    </div>
  `;

  container.appendChild(block);

  const state = {
    nid,
    safeNid,
    lastMetrics: null,
    alertStatus: {
      temperature: false,
      humidite: false,
      vibration: false,
      tension: false
    },
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
  registerNidInSelect(nid);
  applyNidVisibility();
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

function updateAlerts(state, metrics) {
  const safeNid = state.safeNid;
  let isTempAlert = false;
  let isHumAlert = false;
  let isVibAlert = false;
  let isTensionAlert = false;

  const tempAlert = document.getElementById(`tempAlert_${safeNid}`);
  isTempAlert = Number.isFinite(metrics.temperature)
    && (metrics.temperature < ALERT_LIMITS.temperature.min || metrics.temperature > ALERT_LIMITS.temperature.max);
  if (tempAlert) {
    tempAlert.style.display = isTempAlert ? 'block' : 'none';
  }

  const humAlert = document.getElementById(`humAlert_${safeNid}`);
  isHumAlert = Number.isFinite(metrics.humidite)
    && (metrics.humidite < ALERT_LIMITS.humidite.min || metrics.humidite > ALERT_LIMITS.humidite.max);
  if (humAlert) {
    humAlert.style.display = isHumAlert ? 'block' : 'none';
  }

  const vibAlert = document.getElementById(`vibAlert_${safeNid}`);
  isVibAlert = Number.isFinite(metrics.vibration)
    && (metrics.vibration < ALERT_LIMITS.vibration.min || metrics.vibration > ALERT_LIMITS.vibration.max);
  if (vibAlert) {
    vibAlert.style.display = isVibAlert ? 'block' : 'none';
  }

  const tensionAlert = document.getElementById(`tensionAlert_${safeNid}`);
  isTensionAlert = Number.isFinite(metrics.tension)
    && (metrics.tension < ALERT_LIMITS.tension.min || metrics.tension > ALERT_LIMITS.tension.max);
  if (tensionAlert) {
    tensionAlert.style.display = isTensionAlert ? 'block' : 'none';
  }

  logAlertTransition(state, 'temperature', isTempAlert, metrics.temperature);
  logAlertTransition(state, 'humidite', isHumAlert, metrics.humidite);
  logAlertTransition(state, 'vibration', isVibAlert, metrics.vibration);
  logAlertTransition(state, 'tension', isTensionAlert, metrics.tension);
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

  updateAlerts(state, metrics);

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
  if (!selectedNid) return;
  if (tempEl && flags.hasTemperature) tempEl.textContent = `${metrics.temperature.toFixed(2)} °C`;
  if (humEl && flags.hasHumidite) humEl.textContent = `${metrics.humidite.toFixed(2)} %`;
  if (vibEl && flags.hasVibration) vibEl.textContent = `${metrics.vibration.toFixed(2)} m/s²`;
  if (soundEl && flags.hasTension) soundEl.textContent = `${metrics.tension.toFixed(2)} V`;
}

function updateCharts(payload, topic) {
  if (!payload) return;

  const normalized = payload.data ?? payload;
  if (!normalized || typeof normalized !== 'object') return;

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

  state.lastMetrics = {
    temperature: Number.isFinite(metrics.temperature) ? metrics.temperature : NaN,
    humidite: Number.isFinite(metrics.humidite) ? metrics.humidite : NaN,
    vibration: Number.isFinite(metrics.vibration) ? metrics.vibration : NaN,
    tension: Number.isFinite(metrics.tension) ? metrics.tension : NaN
  };

  if (selectedNid === nid) {
    updateSummaryCards(metrics, flags);
  }
}

function stopRealtimeUpdates() {
  if (!mqttClient) return;
  try {
    mqttClient.end(true);
  } catch (_err) {
  }
  mqttClient = null;
}

function startMqtt(wsUrl = MQTT_WS_URL, topics = MQTT_TOPICS) {
  if (!window.mqtt) return;

  if (mqttClient) {
    mqttClient.end(true);
  }

  mqttClient = window.mqtt.connect(wsUrl, {
    reconnectPeriod: 2000,
    connectTimeout: 5000
  });

  mqttClient.on('connect', () => {
    mqttClient.subscribe(topics);
  });

  mqttClient.on('message', (receivedTopic, message) => {
    const payloadText = message.toString();
    const signature = `${receivedTopic}::${payloadText}`;
    if (signature === lastPayloadSignature) return;

    let payload;
    try {
      payload = JSON.parse(payloadText);
    } catch (err) {
      console.error('MQTT JSON parse error', err);
      return;
    }

    lastPayloadSignature = signature;
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
  if (!ensureAuthenticated()) return;
  initDomRefs();
  updateUserHeader();
  applyRoleAccessControl();
  startMqtt();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDashboard, { once: true });
} else {
  initDashboard();
}

window.addEventListener('beforeunload', stopRealtimeUpdates);
window.addEventListener('pagehide', stopRealtimeUpdates);
