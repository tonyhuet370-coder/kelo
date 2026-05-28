# 🔐 Gestion des Comptes Utilisateurs - Kélonia

## Résumé de la fonctionnalité

Un système complet d'authentification et de gestion des rôles a été mis en place pour l'application Kélonia :

- ✅ **Authentification JWT** : Tokens sécurisés avec expiration configurable
- ✅ **Gestion des utilisateurs** : Création, modification, suppression
- ✅ **Système de rôles** : Admin, User, Viewer avec permissions granulaires
- ✅ **Base de données SQLite** : Stockage sécurisé des credentials avec hachage PBKDF2
- ✅ **Protection des routes** : Décorateurs pour protéger les endpoints Flask
- ✅ **Historique des connexions** : Suivi des last_login


## 📁 Fichiers créés

| Fichier | Description |
|---------|-------------|
| `simulateur/auth.py` | Cœur du système d'authentification |
| `simulateur/auth_routes.py` | Routes Flask pour login, register, gestion des users |
| `simulateur/init_users.py` | Script pour initialiser les utilisateurs par défaut |
| `simulateur/AUTH_INTEGRATION_GUIDE.md` | Guide complet d'intégration |


## 🚀 Démarrage rapide

### 1. Installation
```bash
cd simulateur
pip install -r requirements.txt
```

### 2. Initialisation de la base de données
```bash
python init_users.py
```

Cela crée les utilisateurs par défaut :
- **admin** / `admin123` (toutes les permissions)
- **user** / `user123` (voir données + gérer alertes)
- **viewer** / `viewer123` (lecture seule)

### 3. Intégration dans simulateur.py

Ajoutez au début du fichier (après les imports) :

```python
from auth_routes import auth_bp
from auth import init_auth_db

# Initialiser la base de données d'authentification
init_auth_db()

# Enregistrer les routes d'authentification
app.register_blueprint(auth_bp)
```

Puis protégez les routes existantes avec `@require_auth` :

```python
from auth import require_auth, require_permission

@app.route('/data', methods=['GET'])
@require_auth
def send_data():
    data = generate_data(SIMULATED_NID)
    return jsonify(data)
```


## 🔑 API Endpoints

### Authentification

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/auth/login` | Connexion utilisateur |
| POST | `/auth/register` | Créer un nouvel utilisateur |
| GET | `/auth/me` | Infos de l'utilisateur connecté |
| GET | `/auth/roles` | Lister les rôles disponibles |

### Gestion des utilisateurs (admin uniquement)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/auth/users` | Lister tous les utilisateurs |
| GET | `/auth/users/<id>` | Infos d'un utilisateur |
| PUT | `/auth/users/<id>/role` | Changer le rôle |
| DELETE | `/auth/users/<id>` | Désactiver un utilisateur |


## 📊 Rôles et permissions

### Admin
- `view_data` - Voir les données
- `manage_users` - Gérer les utilisateurs
- `manage_alerts` - Gérer les alertes
- `manage_settings` - Gérer les paramètres

### User
- `view_data` - Voir les données
- `manage_alerts` - Gérer les alertes

### Viewer
- `view_data` - Voir les données uniquement


## 🔐 Sécurité

- **Hachage PBKDF2** : 100 000 itérations avec salt aléatoire
- **JWT Tokens** : Expiration par défaut 24h
- **Validation côté serveur** : Les permissions sont vérifiées à chaque requête
- **Stockage sécurisé** : Pas de stockage de mots de passe en clair


## ⚙️ Variables d'environnement

```env
JWT_SECRET=votre-clé-secrète-très-longue-et-sécurisée
JWT_EXPIRATION_HOURS=24
AUTH_DB_PATH=data/auth.db
```

⚠️ **Important** : Changez `JWT_SECRET` en production !


## 📝 Exemple d'utilisation côté client

### Connexion
```javascript
const response = await fetch('/auth/login', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    username: 'admin',
    password: 'admin123'
  })
});

const {token, user} = await response.json();
localStorage.setItem('authToken', token);
```

### Appel protégé
```javascript
const token = localStorage.getItem('authToken');
const response = await fetch('/data', {
  headers: {'Authorization': `Bearer ${token}`}
});

const data = await response.json();
```

### Récupérer l'utilisateur courant
```javascript
const token = localStorage.getItem('authToken');
const response = await fetch('/auth/me', {
  headers: {'Authorization': `Bearer ${token}`}
});

const {user} = await response.json();
console.log(user.role, user.permissions);
```


## 🐳 Docker Compose

Mise à jour automatique du service simulateur :

```yaml
simulateur:
  build:
    context: ../simulateur
    dockerfile: Dockerfile
  ports:
    - "5000:5000"
  environment:
    - JWT_SECRET=kelo-change-me
    - FLASK_ENV=production
  volumes:
    - simulateur-data:/app/data
  networks:
    - kelo-network
```


## 📋 Checklist d'intégration

- [ ] Modifier `simulateur/simulateur.py` pour importer `auth_routes` et `init_auth_db`
- [ ] Exécuter `python init_users.py` pour initialiser les utilisateurs
- [ ] Ajouter `@require_auth` aux endpoints sensibles
- [ ] Mettre à jour `JWT_SECRET` dans les variables d'environnement
- [ ] Tester avec curl ou Postman
- [ ] Mettre à jour le frontend pour envoyer le token JWT
- [ ] Changer les mots de passe par défaut en production

---

**Pour plus de détails** : Consultez `AUTH_INTEGRATION_GUIDE.md`
