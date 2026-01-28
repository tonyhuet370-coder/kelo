from flask import Flask, jsonify
from flask_cors import CORS
import random, time

app = Flask(__name__)
CORS(app)  # Activer CORS pour les requêtes depuis le navigateur
def generate_data():
    return {
        "nid": "A12",
        "temperature": round(random.uniform(20.0, 30.0), 2),
        "humidite": round(random.randint(70, 90), 2),
        "vibration": round(random.uniform(3.5, 4.2), 2),
        "tension": round(random.uniform(0.0, 4.2),2),
        "horodatage": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    }
@app.route('/data', methods=['GET'])
def send_data():
    return jsonify(generate_data())
    
if __name__ == '__main__':
    app.run(host="0.0.0.0", port=5000)
