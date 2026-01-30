// Configuration de l'API - À modifier selon l'environnement
// En local: 'http://localhost:5000'
// Avec VM: 'http://<IP_VM>:5000' ou 'http://<hostname_VM>:5000'
// En production: 'https://api.example.com'
const API_URL = localStorage.getItem('apiUrl') || 'http://localhost:5000';

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

// Fonction pour mettre à jour les graphiques avec les données du simulateur
async function updateChartsFromSimulator() {
  try {
    // Récupérer les données du simulateur (API Python)
    const response = await fetch(API_URL + '/data');
    const data = await response.json();

    console.log('📊 Données reçues du simulateur:', data);

    // Afficher les données JSON en temps réel
    const jsonDisplay = document.getElementById('jsonData');
    jsonDisplay.textContent = JSON.stringify(data, null, 2);

    // Mettre à jour l'historique
    dataHistory.temperature.push(data.temperature);
    dataHistory.temperature.shift();

    dataHistory.humidite.push(data.humidite);
    dataHistory.humidite.shift();

    dataHistory.vibration.push(data.vibration);
    dataHistory.vibration.shift();

    dataHistory.tension.push(data.tension);
    dataHistory.tension.shift();

    console.log('📈 Historique température:', dataHistory.temperature);
    console.log('📈 Historique vibration:', dataHistory.vibration);

    // Mettre à jour les graphiques
    tempChart.data.datasets[0].data = [...dataHistory.temperature];
    tempChart.update();

    humidityChart.data.datasets[0].data = [...dataHistory.humidite];
    humidityChart.update();

    vibrationChart.data.datasets[0].data = [...dataHistory.vibration];
    vibrationChart.update();

    soundChart.data.datasets[0].data = [...dataHistory.tension];
    soundChart.update();

  } catch (error) {
    console.error('❌ Erreur lors de la récupération des données:', error);
    const statusEl = document.getElementById('apiStatus');
    if (statusEl) {
      statusEl.textContent = '❌ Connexion échouée - Vérifier l\'URL';
      statusEl.style.color = '#FF6B6B';
    }
  }
}

// Gestion de la configuration de l'API
document.addEventListener('DOMContentLoaded', () => {
  const apiUrlInput = document.getElementById('apiUrlInput');
  const saveApiBtn = document.getElementById('saveApiBtn');
  const apiStatus = document.getElementById('apiStatus');

  if (apiUrlInput) {
    apiUrlInput.value = API_URL;
    
    saveApiBtn.addEventListener('click', () => {
      const newUrl = apiUrlInput.value.trim();
      if (newUrl) {
        localStorage.setItem('apiUrl', newUrl);
        window.API_URL = newUrl; // Mettre à jour la variable globale
        apiStatus.textContent = '✓ Configuration enregistrée!';
        apiStatus.style.color = '#4CAF50';
        updateChartsFromSimulator(); // Tester la connexion immédiatement
      }
    });

    apiUrlInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        saveApiBtn.click();
      }
    });
  }
});

// Mettre à jour les graphiques toutes les 5 secondes avec les données du simulateur
setInterval(updateChartsFromSimulator, 5000);

// Première mise à jour immédiate
updateChartsFromSimulator();
