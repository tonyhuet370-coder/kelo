"""
GUIDE D'INTÉGRATION DE L'AUTHENTIFICATION DANS SIMULATEUR.PY
============================================================

Pour activer l'authentification dans votre application Flask existante,
suivez ces étapes:

1. INSTALLATION DES DÉPENDANCES
   ==============================
   pip install -r requirements.txt
   
   (PyJWT a été ajouté à requirements.txt)


2. INITIALISATION DES UTILISATEURS
   ==================================
   python init_users.py
   
   Cela crée une base de données auth.db avec les utilisateurs par défaut:
   - admin / admin123 (rôle: admin)
   - user / user123 (rôle: user)
   - viewer / viewer123 (rôle: viewer)


3. INTÉGRATION DANS SIMULATEUR.PY
   ================================
   
   a) Ajouter au début du fichier (après les imports):
   
   ```python
   from auth_routes import auth_bp
   from auth import init_auth_db
   
   # Initialiser la BD d'auth au démarrage
   init_auth_db()
   
   # Enregistrer les routes d'authentification
   app.register_blueprint(auth_bp)
   ```
   
   b) Protéger les routes existantes (optionnel):
   
   ```python
   from auth import require_auth, require_permission
   
   @app.route('/data', methods=['GET'])
   @require_auth
   def send_data():
       # Retourne les données du simulateur (authentification requise)
       data = generate_data(SIMULATED_NID)
       return jsonify(data)
   
   @app.route('/alert', methods=['POST'])
   @require_auth
   @require_permission('manage_alerts')
   def alert():
       # Envoie une alerte (permission requise)
       data = request.get_json()
       message = f"🚨 Alerte : {data['type']} - Valeur : {data['value']}"
       send_telegram_alert(message)
       return jsonify({"status": "sent"})
   ```


4. ENDPOINTS DISPONIBLES
   =======================
   
   POST   /auth/login
   - Authentifier un utilisateur
   - Body: {"username": "...", "password": "..."}
   - Retourne un JWT token
   
   POST   /auth/register
   - Créer un nouvel utilisateur (admin uniquement)
   - Body: {"username": "...", "password": "...", "email": "...", "role": "viewer|user|admin"}
   
   GET    /auth/me
   - Récupérer l'utilisateur connecté
   - Header: Authorization: Bearer <token>
   
   GET    /auth/users
   - Lister tous les utilisateurs (permission manage_users)
   - Header: Authorization: Bearer <token>
   
   GET    /auth/users/<user_id>
   - Récupérer les infos d'un utilisateur (permission manage_users)
   
   PUT    /auth/users/<user_id>/role
   - Changer le rôle d'un utilisateur (permission manage_users)
   - Body: {"role": "viewer|user|admin"}
   
   DELETE /auth/users/<user_id>
   - Désactiver un utilisateur (permission manage_users)
   
   GET    /auth/roles
   - Récupérer la liste des rôles et permissions disponibles


5. UTILISATION CLIENT (JAVASCRIPT/FRONTEND)
   ==========================================
   
   // Connexion
   const response = await fetch('/auth/login', {
     method: 'POST',
     headers: {'Content-Type': 'application/json'},
     body: JSON.stringify({username: 'admin', password: 'admin123'})
   });
   
   const data = await response.json();
   const token = data.token;
   
   // Appel avec authentification
   const dataResponse = await fetch('/data', {
     headers: {'Authorization': `Bearer ${token}`}
   });
   
   // Récupérer l'utilisateur courant
   const userResponse = await fetch('/auth/me', {
     headers: {'Authorization': `Bearer ${token}`}
   });


6. VARIABLES D'ENVIRONNEMENT (OPTIONNELLES)
   =========================================
   
   JWT_SECRET                 (défaut: kelo-super-secret-key-change-this)
   JWT_EXPIRATION_HOURS       (défaut: 24)
   AUTH_DB_PATH              (défaut: data/auth.db)


7. RÔLES ET PERMISSIONS
   ======================
   
   ADMIN:
   - view_data
   - manage_users
   - manage_alerts
   - manage_settings
   
   USER:
   - view_data
   - manage_alerts
   
   VIEWER:
   - view_data


8. NOTES DE SÉCURITÉ
   ==================
   
   ⚠️  Changez JWT_SECRET en production!
   ⚠️  Changez les mots de passe par défaut!
   ⚠️  Utilisez HTTPS en production!
   ⚠️  Stockez les tokens JWT de manière sécurisée (pas dans localStorage en production)


EXEMPLE COMPLET D'INTÉGRATION
===============================

Au début de simulateur.py:

```python
from auth_routes import auth_bp
from auth import init_auth_db, require_auth, require_permission

# ... autres imports et configs ...

# Initialiser l'authentification
init_auth_db()

# Enregistrer les routes d'authentification
app.register_blueprint(auth_bp)

# ... autres configurations ...

# Routes protégées
@app.route('/data', methods=['GET'])
@require_auth
def send_data():
    data = generate_data(SIMULATED_NID)
    return jsonify(data)

@app.route('/alert', methods=['POST'])
@require_auth
@require_permission('manage_alerts')
def alert():
    data = request.get_json()
    message = f"🚨 Alerte : {data['type']} - Valeur : {data['value']}"
    send_telegram_alert(message)
    return jsonify({"status": "sent"})

# ... rest du code ...
```
"""
