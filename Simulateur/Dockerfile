FROM python:3.11-slim

WORKDIR /app

# Copier requirements.txt d'abord (meilleur caching des couches Docker)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copier le script du simulateur
COPY simulateur.py .

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:5000/health')"

EXPOSE 5000

CMD ["python", "simulateur.py"]
