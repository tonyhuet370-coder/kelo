FROM python:3.11-slim

WORKDIR /app

COPY simulateur.py /app

RUN pip install flask flask-cors

EXPOSE 5000

CMD ["python", "simulateur.py"]