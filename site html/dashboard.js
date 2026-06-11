/* ============================================================
 * dashboard.js - Kelonia Turtle Nest Monitor
 * Ameliorations : lisibilite, robustesse, securite
 * ============================================================ */

'use strict';

// 1. CONFIGURATION

const CONFIG = Object.freeze({
  mqtt: {
    protocol: window.location.protocol === 'https:' ? 'wss:' : 'ws:',
    get defaultUrl() {
      return `${this.protocol}//${window.location.host}/mqtt/`;
    },
    reconnectPeriod: 2000,
    connectTimeout: 5000,
    get url() {
      const saved = Storage.get('mqttWsUrl');
      if (!saved) return this.defaultUrl;

      // Ancien comportement : connexion directe au broker sur :9001.
      // On l'ignore désormais pour forcer le proxy nginx /mqtt/.
      if (/^wss?:\/\/[^/]+:9001\/?$/i.test(String(saved).trim())) {
        Storage.remove('mqttWsUrl');
        return this.defaultUrl;
      }

      return saved;
    },
    get topics() {
      const saved = Storage.get('mqttTopic');
      if (!saved) return ['kelo/nid/+/telemetry', 'kelonia/#'];
      return String(saved).split(',').map((s) => s.trim()).filter(Boolean);
    }
  },
  charts: {
    maxPoints: 24,
    historyMaxPoints: 48,
    historyDefaultHours: 24
  },
  storage: {
    authKey: 'keloniaAuth',
    userKey: 'keloniaUser',
    roleKey: 'keloniaRole'
  },
  alerts: Object.freeze({
    temperature: { min: 24, max: 34 },
    humidite: { min: 60, max: 95 },
    vibration: { min: 3.0, max: 4.5 },
    tension: { min: 0.5, max: 4.5 }
  }),
  alertLogMaxItems: 80,
  collectorPollInterval: 5000
});

// 2. STOCKAGE RESILIENT (localStorage -> sessionStorage -> cookie)

const Storage = (() => {
  function _cookie(key) {
    const match = document.cookie.match(new RegExp(`(?:^|; )${encodeURIComponent(key)}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
  }

  return {
    get(key) {
      try { const value = localStorage.getItem(key); if (value !== null) return value; } catch (_) {}
      try { const value = sessionStorage.getItem(key); if (value !== null) return value; } catch (_) {}
      return _cookie(key);
    },

    set(key, value) {
      try { localStorage.setItem(key, value); return; } catch (_) {}
      try { sessionStorage.setItem(key, value); return; } catch (_) {}
      document.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(value)}; path=/; SameSite=Strict`;
    },

    remove(key) {
      try { localStorage.removeItem(key); } catch (_) {}
      try { sessionStorage.removeItem(key); } catch (_) {}
      document.cookie = `${encodeURIComponent(key)}=; Max-Age=0; path=/; SameSite=Strict`;
    }
  };
})();

// ─────────────────────────────────────────────
// 3. AUTHENTIFICATION & RÔLES
// ─────────────────────────────────────────────

const Auth = {
  isAuthenticated: () => Storage.get(CONFIG.storage.authKey) === '1',

  requireAuth() {
    if (!this.isAuthenticated()) {
      // Redirection sûre : on ne transmet pas l'URL courante pour éviter les open-redirects.
      window.location.replace(`${window.location.origin}/login.html`);
      return false;
    }
    return true;
  },

  getUser:  () => Storage.get(CONFIG.storage.userKey) || 'inconnu',
  getRole:  () => Storage.get(CONFIG.storage.roleKey) || 'viewer',
  isAdmin:  () => Auth.getRole() === 'admin',

  logout() {
    Storage.remove(CONFIG.storage.authKey);
    Storage.remove(CONFIG.storage.userKey);
    Storage.remove(CONFIG.storage.roleKey);
    Realtime.stop();
    window.location.replace(`${window.location.origin}/login.html`);
  }
};

// ─────────────────────────────────────────────
// 4. UTILITAIRES
// ─────────────────────────────────────────────

/**
 * Retourne le premier Number.isFinite parmi les arguments.
 * Évite d'utiliser Number() sur des objets non numériques.
 */
function pickNumber(...values) {
  for (const v of values) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

/**
 * Assainit une chaîne pour l'utiliser en tant qu'ID HTML.
 * N'autorise que les caractères alphanumériques, tirets et underscores.
 */
function sanitizeId(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '_');
}

function parseIsoDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatTimeLabel(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────
// 5. GRAPHIQUES
// ─────────────────────────────────────────────

const Charts = {
  /** Crée un graphique Chart.js linéaire. Retourne null si le canvas est absent. */
  create(canvasId, label, color, data = [], labels = []) {
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
          tension: 0.3,
          spanGaps: true,
          pointRadius: 2
        }]
      },
      options: {
        responsive: true,
        animation: { duration: 450, easing: 'easeOutCubic' },
        plugins: { legend: { labels: { color: '#f5f5f5' } } },
        scales: {
          x: { ticks: { color: '#cfd8dc' } },
          y: { ticks: { color: '#cfd8dc' } }
        }
      }
    });
  },

  /** Vérifie qu'un graphique est utilisable (canvas encore dans le DOM). */
  isUsable(chart) {
    return Boolean(chart?.canvas?.isConnected && chart.ctx);
  },

  /** Met à jour les données d'un graphique si utilisable. */
  update(chart, values, labels) {
    if (!this.isUsable(chart)) return;
    chart.data.datasets[0].data = values;
    chart.data.labels = labels;
    chart.update();
  }
};

// ─────────────────────────────────────────────
// 6. SÉRIES TEMPORELLES
// ─────────────────────────────────────────────

const METRIC_ALIASES = Object.freeze({
  temperature: ['temperature', 'temp'],
  humidite:    ['humidite', 'humidity', 'hum'],
  vibration:   ['vibration', 'vib'],
  tension:     ['tension', 'sound']
});

function createSeries() {
  return { labels: [], values: [] };
}

/**
 * Ajoute un point à une série en maintenant une fenêtre glissante.
 * Retourne true si le point a été ajouté (valeur finie).
 */
function pushPoint(series, value, timeLabel) {
  if (!Number.isFinite(value)) return false;

  series.values.push(value);
  series.labels.push(timeLabel);

  if (series.values.length > CONFIG.charts.maxPoints) {
    series.values.shift();
    series.labels.shift();
  }
  return true;
}

/** Construit une série régulière à partir de l'historique brut. */
function buildRegularSeries(history, metric, maxPoints = CONFIG.charts.historyMaxPoints) {
  if (!Array.isArray(history) || history.length === 0) return createSeries();

  const sorted = [...history].sort((a, b) => new Date(a.received_at) - new Date(b.received_at));
  const step    = Math.max(1, Math.ceil(sorted.length / maxPoints));
  const aliases = METRIC_ALIASES[metric] || [metric];
  const labels  = [];
  const values  = [];

  for (let i = 0; i < sorted.length; i += step) {
    const item = sorted[i];
    const date = parseIsoDate(item.received_at);
    if (!date) continue;

    labels.push(formatTimeLabel(date));
    const payload = item.payload ?? {};
    const value   = pickNumber(...aliases.map((k) => payload[k]));
    values.push(Number.isFinite(value) ? value : null);
  }

  return { labels, values };
}

// ─────────────────────────────────────────────
// 7. EXTRACTION DU NID
// ─────────────────────────────────────────────

function extractNid(topic, payload) {
  // Priorité : champ explicite dans le payload
  if (payload?.nid) return String(payload.nid);

  const parts = String(topic ?? '').split('/').filter(Boolean);

  // Topics kelo/nid/<id>/telemetry
  if (parts.length >= 3 && parts[0] === 'kelo' && parts[1] === 'nid') {
    return parts[2];
  }

  // Fallback : premier segment du topic
  return parts[0] ?? 'inconnu';
}

// ─────────────────────────────────────────────
// 8. JOURNALISATION DES ALERTES
// ─────────────────────────────────────────────

const METRIC_LABELS = Object.freeze({
  temperature: 'Température',
  humidite:    'Humidité',
  vibration:   'Vibration',
  tension:     'Tension'
});

const AlertLog = {
  _listEl:  null,
  _emptyEl: null,

  init(listEl, emptyEl) {
    this._listEl  = listEl;
    this._emptyEl = emptyEl;
  },

  append(message, metric) {
    if (!this._listEl) return;
    if (this._emptyEl) this._emptyEl.style.display = 'none';

    const item = document.createElement('li');
    item.className = `alert-log-item alert-log-critical alert-log-${metric}`;

    const time = document.createElement('div');
    time.className   = 'alert-log-time';
    time.textContent = new Date().toLocaleTimeString();

    const text = document.createElement('div');
    text.className   = 'alert-log-message';
    // textContent est sûr contre les injections XSS
    text.textContent = message;

    item.append(time, text);
    this._listEl.prepend(item);

    // Limite la taille du journal
    while (this._listEl.children.length > CONFIG.alertLogMaxItems) {
      this._listEl.removeChild(this._listEl.lastElementChild);
    }
  },

  /** Enregistre une transition d'état d'alerte (entrée uniquement). */
  logTransition(state, metric, isAlertNow, value) {
    const previous = Boolean(state.alertStatus[metric]);
    if (previous === isAlertNow || !Number.isFinite(value)) return;

    state.alertStatus[metric] = isAlertNow;
    if (!isAlertNow) return;  // Retour à la normale : pas de log

    const limits    = CONFIG.alerts[metric];
    const direction = value < limits.min ? 'trop basse' : 'trop élevée';
    const label     = METRIC_LABELS[metric] ?? metric;
    this.append(`${label} ${direction} – Nid ${state.nid} (${value.toFixed(2)})`, metric);
  }
};

// ─────────────────────────────────────────────
// 9. ÉTAT PAR NID
// ─────────────────────────────────────────────

const nidStates = new Map();

/** Injecte le bloc HTML d'un nid dans le conteneur et crée son état. */
function createNidState(nid) {
  const container = document.getElementById('nidsContainer');
  if (!container) return null;

  const safeNid = sanitizeId(nid);
  // Vérification : le bloc existe déjà ?
  if (document.getElementById(`nid-${safeNid}`)) return nidStates.get(nid) ?? null;

  const block = document.createElement('section');
  block.className = 'nid-block';
  block.id        = `nid-${safeNid}`;
  block.setAttribute('data-nid', nid);

  // Toutes les chaînes interpolées sont des valeurs contrôlées (safeNid = alphanum/_/-)
  block.innerHTML = `
    <h2>Nid ${safeNid}</h2>
    <div class="charts nid-charts">
      ${_chartSection('Température',  `tempAlert_${safeNid}`,     'tempChart_${safeNid}',
        'Température trop élevée : le sable dépasse 33–34 °C, seuil critique pour les œufs.')}
      ${_chartSection('Humidité',     `humAlert_${safeNid}`,      `humChart_${safeNid}`,
        'Humidité anormale : doit rester entre 60 % et 95 % pour les œufs.')}
      ${_chartSection('Vibrations',   `vibAlert_${safeNid}`,      `vibrationChart_${safeNid}`,
        'Vibrations excessives : entre 3,0 et 4,5 Mpu pour ne pas endommager les œufs.')}
      ${_chartSection('Tension',      `tensionAlert_${safeNid}`,  `tensionChart_${safeNid}`,
        'Tension anormale détectée.')}
    </div>
  `;

  container.appendChild(block);

  const state = {
    nid,
    safeNid,
    lastMetrics: null,
    alertStatus: { temperature: false, humidite: false, vibration: false, tension: false },
    series:      {
      temperature: createSeries(),
      humidite:    createSeries(),
      vibration:   createSeries(),
      tension:     createSeries()
    },
    charts: {
      temperature: Charts.create(`tempChart_${safeNid}`,      `Température (°C) · Nid ${nid}`, 'rgba(75, 192, 192, 1)'),
      humidite:    Charts.create(`humChart_${safeNid}`,       `Humidité (%) · Nid ${nid}`,     'rgba(255, 204, 0, 1)'),
      vibration:   Charts.create(`vibrationChart_${safeNid}`, `Vibrations (Mpu) · Nid ${nid}`, 'rgba(255, 206, 86, 1)'),
      tension:     Charts.create(`tensionChart_${safeNid}`,   `Tension (V) · Nid ${nid}`,      'rgba(153, 102, 255, 1)')
    }
  };

  nidStates.set(nid, state);
  UI.registerNidInSelect(nid);
  UI.applyNidVisibility();
  return state;
}

function _chartSection(title, alertId, chartId, alertMsg) {
  return `
    <div class="chart-container">
      <h3>${title}</h3>
      <div class="alert" id="${alertId}" style="display:none;" role="alert">⚠️ ${alertMsg}</div>
      <canvas id="${chartId}"></canvas>
    </div>
  `;
}

function getNidState(nid) {
  return nidStates.get(nid) ?? createNidState(nid);
}

// ─────────────────────────────────────────────
// 10. MISE À JOUR DES GRAPHIQUES ET ALERTES
// ─────────────────────────────────────────────

function updateAlerts(state, metrics) {
  const checks = {
    temperature: metrics.temperature,
    humidite:    metrics.humidite,
    vibration:   metrics.vibration,
    tension:     metrics.tension
  };

  const alertIds = {
    temperature: `tempAlert_${state.safeNid}`,
    humidite:    `humAlert_${state.safeNid}`,
    vibration:   `vibAlert_${state.safeNid}`,
    tension:     `tensionAlert_${state.safeNid}`
  };

  for (const [metric, value] of Object.entries(checks)) {
    const limits  = CONFIG.alerts[metric];
    const isAlert = Number.isFinite(value) && (value < limits.min || value > limits.max);
    const el      = document.getElementById(alertIds[metric]);

    if (el) el.style.display = isAlert ? 'block' : 'none';
    AlertLog.logTransition(state, metric, isAlert, value);
  }
}

function updateNidCharts(state, metrics, timeLabel) {
  const flags = {
    hasTemperature: pushPoint(state.series.temperature, metrics.temperature, timeLabel),
    hasHumidite:    pushPoint(state.series.humidite,    metrics.humidite,    timeLabel),
    hasVibration:   pushPoint(state.series.vibration,   metrics.vibration,   timeLabel),
    hasTension:     pushPoint(state.series.tension,     metrics.tension,     timeLabel)
  };

  if (flags.hasTemperature) Charts.update(state.charts.temperature, [...state.series.temperature.values], [...state.series.temperature.labels]);
  if (flags.hasHumidite)    Charts.update(state.charts.humidite,    [...state.series.humidite.values],    [...state.series.humidite.labels]);
  if (flags.hasVibration)   Charts.update(state.charts.vibration,   [...state.series.vibration.values],   [...state.series.vibration.labels]);
  if (flags.hasTension)     Charts.update(state.charts.tension,     [...state.series.tension.values],     [...state.series.tension.labels]);

  updateAlerts(state, metrics);
  return flags;
}

// ─────────────────────────────────────────────
// 11. POINT D'ENTRÉE DE MISE À JOUR (MQTT / SSE / POLLING)
// ─────────────────────────────────────────────

function updateCharts(payload, topic) {
  if (!payload || typeof payload !== 'object') return;

  // Support de l'enveloppe collector : { data: { ... }, nid: '...' }
  const normalized = payload.data ?? payload;
  if (!normalized || typeof normalized !== 'object') return;

  const nid   = extractNid(topic, payload);
  const state = getNidState(nid);
  if (!state) return;

  const metrics = {
    temperature: pickNumber(normalized.temperature, normalized.temp),
    humidite:    pickNumber(normalized.humidite,    normalized.humidity, normalized.hum),
    vibration:   pickNumber(normalized.vibration,   normalized.vib),
    tension:     pickNumber(normalized.tension,      normalized.sound)
  };

  const timeLabel = new Date().toLocaleTimeString();
  const flags     = updateNidCharts(state, metrics, timeLabel);

  // Mise en cache des dernières métriques connues
  state.lastMetrics = {
    temperature: Number.isFinite(metrics.temperature) ? metrics.temperature : NaN,
    humidite:    Number.isFinite(metrics.humidite)    ? metrics.humidite    : NaN,
    vibration:   Number.isFinite(metrics.vibration)   ? metrics.vibration   : NaN,
    tension:     Number.isFinite(metrics.tension)     ? metrics.tension     : NaN
  };

  if (UI.selectedNid === nid) {
    UI.updateSummaryCards(metrics, flags);
  }
}

// ─────────────────────────────────────────────
// 12. INTERFACE UTILISATEUR
// ─────────────────────────────────────────────

const UI = {
  selectedNid: null,

  // Éléments DOM
  els: {},

  init() {
    const ids = [
      'temp-value',  'hum-value', 'vib-value', 'sound-value',
      'nidSelect',   'historyHours', 'loadHistoryBtn', 'historyStatus',
      'userInfo',    'userRole', 'grafanaLink',
      'alertLogList','alertLogEmpty', 'logoutBtn'
    ];

    for (const id of ids) {
      this.els[id] = document.getElementById(id);
    }

    if (this.els['grafanaLink']) {
      this.els['grafanaLink'].href = '/grafana/';
    }

    AlertLog.init(this.els['alertLogList'], this.els['alertLogEmpty']);
    this._bindEvents();
  },

  _bindEvents() {
    this.els['nidSelect']?.addEventListener('change', () => {
      this.selectedNid = this.els['nidSelect'].value || null;
      this.applyNidVisibility();
      this.updateSummaryCardsForSelected();
    });

    this.els['loadHistoryBtn']?.addEventListener('click', () => this._onLoadHistory());

    this.els['logoutBtn']?.addEventListener('click', () => Auth.logout());
  },

  async _onLoadHistory() {
    const statusEl = this.els['historyStatus'];

    if (!this.selectedNid) {
      if (statusEl) statusEl.textContent = 'Veuillez choisir un nid avant de charger l\'historique.';
      return;
    }

    const hours = Number(this.els['historyHours']?.value) || CONFIG.charts.historyDefaultHours;
    if (statusEl) statusEl.textContent = `Chargement de l'historique ${hours}h pour ${this.selectedNid}…`;

    await History.loadForNid(this.selectedNid, hours, statusEl);
  },

  registerNidInSelect(nid) {
    const sel = this.els['nidSelect'];
    if (!sel) return;

    const exists = Array.from(sel.options).some((o) => o.value === nid);
    if (!exists) {
      const opt = document.createElement('option');
      opt.value       = nid;
      opt.textContent = `Nid ${nid}`;
      sel.appendChild(opt);
    }

    if (!this.selectedNid) {
      this.selectedNid = nid;
      sel.value        = nid;
    }
  },

  applyNidVisibility() {
    const container = document.getElementById('nidsContainer');
    if (!container) return;

    container.querySelectorAll('.nid-block').forEach((block) => {
      const nid = block.getAttribute('data-nid');
      block.style.display = (this.selectedNid && nid === this.selectedNid) ? 'block' : 'none';
    });
  },

  updateHeader() {
    if (this.els['userInfo']) this.els['userInfo'].textContent = `Utilisateur : ${Auth.getUser()}`;
    if (this.els['userRole']) this.els['userRole'].textContent = `Rôle : ${Auth.getRole()}`;
  },

  applyRoleAccessControl() {
    if (Auth.isAdmin()) return;

    const sel = this.els['nidSelect'];
    if (sel) sel.disabled = true;

    const filterWrap = document.querySelector('.nid-filter-wrap');
    if (filterWrap && !filterWrap.querySelector('.role-info')) {
      const info = document.createElement('p');
      info.className   = 'role-info';
      info.style.cssText = 'font-size:0.9rem; color:#f6c23e;';
      info.textContent = 'Mode lecteur : sélection de nid désactivée. Contactez un administrateur.';
      filterWrap.appendChild(info);
    }
  },

  updateSummaryCards(metrics, flags) {
    if (!this.selectedNid) return;
    const { els } = this;
    if (els['temp-value']  && flags.hasTemperature) els['temp-value'].textContent  = `${metrics.temperature.toFixed(2)} °C`;
    if (els['hum-value']   && flags.hasHumidite)    els['hum-value'].textContent   = `${metrics.humidite.toFixed(2)} %`;
    if (els['vib-value']   && flags.hasVibration)   els['vib-value'].textContent   = `${metrics.vibration.toFixed(2)} Mpu`;
    if (els['sound-value'] && flags.hasTension)     els['sound-value'].textContent = `${metrics.tension.toFixed(2)} V`;
  },

  updateSummaryCardsForSelected() {
    if (!this.selectedNid) return;
    const state = nidStates.get(this.selectedNid);
    if (!state?.lastMetrics) return;

    const m = state.lastMetrics;
    const { els } = this;
    if (els['temp-value']  && Number.isFinite(m.temperature)) els['temp-value'].textContent  = `${m.temperature.toFixed(2)} °C`;
    if (els['hum-value']   && Number.isFinite(m.humidite))    els['hum-value'].textContent   = `${m.humidite.toFixed(2)} %`;
    if (els['vib-value']   && Number.isFinite(m.vibration))   els['vib-value'].textContent   = `${m.vibration.toFixed(2)} Mpu`;
    if (els['sound-value'] && Number.isFinite(m.tension))     els['sound-value'].textContent = `${m.tension.toFixed(2)} V`;
  },

  /** Affiche une alerte visuelle (conservé pour la compatibilité). */
  showVisualAlert(message) {
    const alertBox = document.getElementById('alertBox');
    if (!alertBox) return;
    alertBox.textContent = message; // textContent, pas innerHTML → pas d'injection XSS
    alertBox.style.display = 'block';
    alertBox.classList.add('blink');
  }
};

// ─────────────────────────────────────────────
// 13. HISTORIQUE
// ─────────────────────────────────────────────

const History = {
  async loadForNid(nid, hours = CONFIG.charts.historyDefaultHours, statusEl = null) {
    const state = getNidState(nid);
    if (!state) return;

    try {
      const url = `/collector/history?nid=${encodeURIComponent(nid)}&hours=${encodeURIComponent(hours)}&limit=${CONFIG.charts.historyMaxPoints}`;
      const res = await fetch(url, { cache: 'no-store' });

      if (!res.ok) throw new Error(`Erreur serveur ${res.status}`);

      const json    = await res.json();
      const history = Array.isArray(json.results) ? json.results : [];

      this._apply(state, history);
      if (statusEl) statusEl.textContent = `Données historiques chargées (${history.length} points).`;
    } catch (err) {
      if (statusEl) statusEl.textContent = 'Impossible de charger l\'historique. Vérifiez le collector.';
      console.error('[History] Erreur de chargement :', err);
    }
  },

  _apply(state, history) {
    const metrics = ['temperature', 'humidite', 'vibration', 'tension'];

    for (const metric of metrics) {
      const series = buildRegularSeries(history, metric);
      state.series[metric] = series;
      Charts.update(state.charts[metric], series.values, series.labels);
    }
  }
};

// ─────────────────────────────────────────────
// 14. TEMPS RÉEL : MQTT + SSE + POLLING
// ─────────────────────────────────────────────

const Realtime = (() => {
  let mqttClient           = null;
  let sseSource            = null;
  let pollHandle           = null;
  let lastPayloadSignature = null;

  function _parsePayload(raw) {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function _onPayload(payload, topic) {
    if (!payload) return;
    try {
      updateCharts(payload, topic);
    } catch (err) {
      console.error('[Realtime] Erreur de mise à jour :', err);
    }
  }

  async function _pollLatest() {
    try {
      const res = await fetch('/collector/latest', { cache: 'no-store' });
      if (!res.ok) return;
      const payload = await res.json();
      _onPayload(payload, payload.topic || 'collector/latest');
    } catch (_) {}
  }

  return {
    start() {
      this.startMqtt();
      this.startSSE();

      if (!pollHandle) {
        pollHandle = window.setInterval(_pollLatest, CONFIG.collectorPollInterval);
        _pollLatest(); // chargement immédiat
      }
    },

    stop() {
      if (mqttClient)   { try { mqttClient.end(true); } catch (_) {}; mqttClient = null; }
      if (sseSource)    { try { sseSource.close();    } catch (_) {}; sseSource  = null; }
      if (pollHandle)   { window.clearInterval(pollHandle); pollHandle = null; }
    },

    startMqtt() {
      if (!window.mqtt) return;
      if (mqttClient)   { mqttClient.end(true); }

      mqttClient = window.mqtt.connect(CONFIG.mqtt.url, {
        reconnectPeriod: CONFIG.mqtt.reconnectPeriod,
        connectTimeout:  CONFIG.mqtt.connectTimeout
      });

      mqttClient.on('connect', () => {
        mqttClient.subscribe(CONFIG.mqtt.topics);
      });

      mqttClient.on('message', (topic, message) => {
        const text = message.toString();
        // Déduplication : évite de traiter deux fois le même message (MQTT QoS ≥ 1)
        const sig = `${topic}::${text}`;
        if (sig === lastPayloadSignature) return;
        lastPayloadSignature = sig;

        const payload = _parsePayload(text);
        _onPayload(payload, topic);
      });

      mqttClient.on('error', (err) => console.error('[MQTT] Erreur :', err));
    },

    startSSE() {
      if (typeof EventSource === 'undefined') return;
      if (sseSource) { try { sseSource.close(); } catch (_) {} }

      sseSource = new EventSource('/collector/events');
      sseSource.onmessage = (event) => {
        const payload = _parsePayload(event.data);
        _onPayload(payload, payload?.topic || 'collector/events');
      };
      // EventSource reconnecte automatiquement en cas d'erreur.
    }
  };
})();

// ─────────────────────────────────────────────
// 15. INITIALISATION
// ─────────────────────────────────────────────

function initDashboard() {
  if (!Auth.requireAuth()) return;

  UI.init();
  UI.updateHeader();
  UI.applyRoleAccessControl();
  Realtime.start();
}

// Lancement au bon moment selon l'état du DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDashboard, { once: true });
} else {
  initDashboard();
}

// Nettoyage propre à la fermeture/navigation
window.addEventListener('beforeunload', () => Realtime.stop());
window.addEventListener('pagehide',     () => Realtime.stop());

// Export pour compatibilité externe (e.g. HTML inline onclick)
window.showVisualAlert = (msg) => UI.showVisualAlert(msg);