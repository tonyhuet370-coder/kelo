"""
Système d'authentification et de gestion des utilisateurs pour Kélonia
"""
import sqlite3
import os
import secrets
from datetime import datetime, timedelta
import hashlib
import jwt
from functools import wraps
from flask import request, jsonify


# ============================
# CONFIGURATION
# ============================
DB_PATH = os.getenv('AUTH_DB_PATH', 'data/auth.db')
JWT_SECRET = os.getenv('JWT_SECRET', 'kelo-super-secret-key-change-this')
JWT_EXPIRATION_HOURS = int(os.getenv('JWT_EXPIRATION_HOURS', 24))

# Rôles disponibles
ROLES = {
    'admin': ['view_data', 'manage_users', 'manage_alerts', 'manage_settings'],
    'user': ['view_data', 'manage_alerts'],
    'viewer': ['view_data'],
}


# ============================
# INITIALISATION BD
# ============================
def init_auth_db():
    """Initialise la base de données des utilisateurs."""
    if not os.path.exists(os.path.dirname(DB_PATH) or '.'):
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'viewer',
            created_at TEXT NOT NULL,
            last_login TEXT,
            is_active BOOLEAN DEFAULT 1
        )
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token TEXT UNIQUE NOT NULL,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)
    
    conn.commit()
    conn.close()


# ============================
# HACHAGE DE PASSWORDS
# ============================
def hash_password(password: str) -> str:
    """Hache un mot de passe avec salt."""
    salt = secrets.token_hex(16)
    hash_obj = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000)
    return f"{salt}${hash_obj.hex()}"


def verify_password(password: str, password_hash: str) -> bool:
    """Vérifie un mot de passe contre son hash."""
    try:
        salt, hash_val = password_hash.split('$')
        hash_obj = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000)
        return hash_obj.hex() == hash_val
    except Exception:
        return False


# ============================
# GESTION JWT
# ============================
def create_jwt_token(user_id: int, username: str, role: str) -> str:
    """Crée un JWT token pour l'utilisateur."""
    payload = {
        'user_id': user_id,
        'username': username,
        'role': role,
        'iat': datetime.utcnow(),
        'exp': datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm='HS256')


def verify_jwt_token(token: str) -> dict | None:
    """Vérifie et décode un JWT token."""
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
    except Exception:
        return None


# ============================
# GESTION DES UTILISATEURS
# ============================
def create_user(username: str, password: str, email: str = None, role: str = 'viewer') -> dict | None:
    """Crée un nouvel utilisateur."""
    if role not in ROLES:
        return None
    
    password_hash = hash_password(password)
    created_at = datetime.utcnow().isoformat() + 'Z'
    
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO users (username, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
            (username, email, password_hash, role, created_at)
        )
        user_id = cursor.lastrowid
        conn.commit()
        conn.close()
        return {'id': user_id, 'username': username, 'email': email, 'role': role}
    except sqlite3.IntegrityError:
        return None


def authenticate_user(username: str, password: str) -> dict | None:
    """Authentifie un utilisateur et retourne ses données."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, username, password_hash, role, is_active FROM users WHERE username = ?",
        (username,)
    )
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        return None
    
    user_id, uname, pwd_hash, role, is_active = row
    
    if not is_active or not verify_password(password, pwd_hash):
        return None
    
    # Mise à jour de last_login
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE users SET last_login = ? WHERE id = ?",
        (datetime.utcnow().isoformat() + 'Z', user_id)
    )
    conn.commit()
    conn.close()
    
    return {
        'id': user_id,
        'username': uname,
        'role': role,
        'permissions': ROLES.get(role, []),
    }


def get_user_by_id(user_id: int) -> dict | None:
    """Récupère les infos d'un utilisateur par ID."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, email, role, is_active FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        return None
    
    return {
        'id': row[0],
        'username': row[1],
        'email': row[2],
        'role': row[3],
        'is_active': row[4],
        'permissions': ROLES.get(row[3], []),
    }


def list_users(limit: int = 100) -> list[dict]:
    """Liste tous les utilisateurs."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, email, role, is_active, created_at FROM users LIMIT ?", (limit,))
    rows = cursor.fetchall()
    conn.close()
    
    return [
        {
            'id': r[0],
            'username': r[1],
            'email': r[2],
            'role': r[3],
            'is_active': r[4],
            'created_at': r[5],
        }
        for r in rows
    ]


def update_user_role(user_id: int, new_role: str) -> bool:
    """Change le rôle d'un utilisateur."""
    if new_role not in ROLES:
        return False
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("UPDATE users SET role = ? WHERE id = ?", (new_role, user_id))
    conn.commit()
    conn.close()
    return True


def delete_user(user_id: int) -> bool:
    """Désactive un utilisateur."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("UPDATE users SET is_active = 0 WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()
    return True


# ============================
# DÉCORATEURS FLASK
# ============================
def require_auth(f):
    """Décorateur pour protéger les routes avec JWT."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        
        if not auth_header.startswith('Bearer '):
            return jsonify({'error': 'Authentification requise'}), 401
        
        token = auth_header[7:]
        payload = verify_jwt_token(token)
        
        if not payload:
            return jsonify({'error': 'Token invalide ou expiré'}), 401
        
        request.user = payload
        return f(*args, **kwargs)
    
    return decorated_function


def require_role(required_role: str):
    """Décorateur pour vérifier le rôle de l'utilisateur."""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if not hasattr(request, 'user'):
                return jsonify({'error': 'Non authentifié'}), 401
            
            user_role = request.user.get('role')
            if user_role != required_role and user_role != 'admin':
                return jsonify({'error': 'Accès refusé'}), 403
            
            return f(*args, **kwargs)
        
        return decorated_function
    return decorator


def require_permission(permission: str):
    """Décorateur pour vérifier une permission spécifique."""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if not hasattr(request, 'user'):
                return jsonify({'error': 'Non authentifié'}), 401
            
            user_role = request.user.get('role')
            permissions = ROLES.get(user_role, [])
            
            if permission not in permissions:
                return jsonify({'error': 'Accès refusé'}), 403
            
            return f(*args, **kwargs)
        
        return decorated_function
    return decorator
