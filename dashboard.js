// Données de base (ex : dernières 6 mesures)
const labels = ['T-30min', 'T-25min', 'T-20min', 'T-15min', 'T-10min', 'T-5min'];

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
  [28, 28.5, 29, 29.2, 29.5, 29.7]
);

const humidityChart = createLineChart(
  'humidityChart',
  'Humidité (%)',
  'rgba(54, 162, 235, 1)',
  [70, 71, 72, 73, 74, 75]
);

const vibrationChart = createLineChart(
  'vibrationChart',
  'Vibrations (m/s²)',
  'rgba(255, 206, 86, 1)',
  [0.1, 0.15, 0.2, 0.18, 0.22, 0.25]
);

const soundChart = createLineChart(
  'soundChart',
  'Niveau sonore (dB)',
  'rgba(75, 192, 192, 1)',
  [30, 32, 31, 33, 34, 35]
);

// Exemple de mise à jour toutes les 5 secondes (simulation)
setInterval(() => {
  const nowLabel = 'Maintenant';
  labels.push(nowLabel);
  labels.shift(); // on garde 6 points

  function pushRandom(chart, min, max) {
    const data = chart.data.datasets[0].data;
    const newValue = (Math.random() * (max - min) + min).toFixed(1);
    data.push(Number(newValue));
    data.shift();
    chart.update();
  }

  pushRandom(tempChart, 28, 30);
  pushRandom(humidityChart, 70, 80);
  pushRandom(vibrationChart, 0.1, 0.4);
  pushRandom(soundChart, 30, 40);
}, 5000);
