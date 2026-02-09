// Configuration du collector SSE (MQTT -> SSE)
// En local: 'http://localhost:8081'
// En réseau: 'http://<IP_DU_NAS>:8081'
// En prod derrière nginx: même origine
const DEFAULT_COLLECTOR_BASE_URL = (window.location.hostname === 'localhost')
  ? 'http://localhost:8081'
  : window.location.origin;
const COLLECTOR_BASE_URL = localStorage.getItem('collectorUrl') || DEFAULT_COLLECTOR_BASE_URL;

function buildCollectorEventsUrl(baseUrl) {
  if (!baseUrl) return '/collector/events';
  if (baseUrl.endsWith('/collector/events')) return baseUrl;
  return baseUrl.replace(/\/+$/, '') + '/collector/events';
}

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

let eventSource = null;

// Gestion de la configuration de l'API
document.addEventListener('DOMContentLoaded', () => {
  const apiUrlInput = document.getElementById('apiUrlInput');
  const saveApiBtn = document.getElementById('saveApiBtn');
  const apiStatus = document.getElementById('apiStatus');

  if (apiUrlInput) {
    apiUrlInput.value = COLLECTOR_BASE_URL;

    saveApiBtn.addEventListener('click', () => {
      const newUrl = apiUrlInput.value.trim();
      if (newUrl) {
        localStorage.setItem('collectorUrl', newUrl);
        apiStatus.textContent = '✓ Collector configuré';
        apiStatus.style.color = '#4CAF50';
        startSSE(newUrl);
      }
    });

    apiUrlInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        saveApiBtn.click();
      }
    });
  }
});

// SSE real-time subscription to collector
function startSSE(baseUrl = COLLECTOR_BASE_URL) {
  const sseUrl = buildCollectorEventsUrl(baseUrl);
  const statusEl = document.getElementById('apiStatus');
  if (eventSource) {
    eventSource.close();
  }
  try {
    eventSource = new EventSource(sseUrl);
    if (statusEl) {
      statusEl.textContent = '⏳ Connexion au collector...';
      statusEl.style.color = '#f3c74b';
    }
    eventSource.onopen = () => {
      if (statusEl) {
        statusEl.textContent = '✓ Collector connecté';
        statusEl.style.color = '#4CAF50';
      }
    };
    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        // update display and charts
        const jsonDisplay = document.getElementById('jsonData');
        if (jsonDisplay) jsonDisplay.textContent = JSON.stringify(data, null, 2);

        // if payload nested under data key (collector), adapt
        const payload = data.data ? data.data : data;

        dataHistory.temperature.push(payload.temperature);
        dataHistory.temperature.shift();
        dataHistory.humidite.push(payload.humidite);
        dataHistory.humidite.shift();
        dataHistory.vibration.push(payload.vibration);
        dataHistory.vibration.shift();
        dataHistory.tension.push(payload.tension);
        dataHistory.tension.shift();

        tempChart.data.datasets[0].data = [...dataHistory.temperature];
        tempChart.update();
        humidityChart.data.datasets[0].data = [...dataHistory.humidite];
        humidityChart.update();
        vibrationChart.data.datasets[0].data = [...dataHistory.vibration];
        vibrationChart.update();
        soundChart.data.datasets[0].data = [...dataHistory.tension];
        soundChart.update();
      } catch (err) {
        console.error('SSE parse error', err);
      }
    };
    eventSource.onerror = (err) => {
      console.warn('SSE error', err);
      if (statusEl) {
        statusEl.textContent = '❌ Connexion SSE échouée';
        statusEl.style.color = '#FF6B6B';
      }
      eventSource.close();
      eventSource = null;
    };
  } catch (e) {
    console.warn('SSE not available', e);
    if (statusEl) {
      statusEl.textContent = '❌ SSE indisponible';
      statusEl.style.color = '#FF6B6B';
    }
  }
}

// Start SSE and fallback automatically
startSSE();
