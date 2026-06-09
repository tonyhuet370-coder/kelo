"""
Routes d'authentification pour Kélonia
À importer dans simulateur.py
"""
from flask import Blueprint, request, jsonify
from auth import (
    create_user, authenticate_user, get_user_by_id, list_users,
    update_user_role, delete_user, create_jwt_token, require_auth,
    require_role, require_permission, init_auth_db, ROLES
)

auth_bp = Blueprint('auth', __name__, url_prefix='/auth')


@auth_bp.route('/register', methods=['POST'])
def register():
    """Crée un nouvel utilisateur (admin uniquement)."""
    data = request.get_json() or {}
    
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()
    email = data.get('email', '').strip() or None
    role = data.get('role', 'viewer').lower()
    
    if not username or not password:
        return jsonify({'error': 'Username et password requis'}), 400
    
    if role not in ROLES:
        return jsonify({'error': f'Rôle invalide. Rôles valides: {list(ROLES.keys())}'}), 400
    
    user = create_user(username, password, email, role)
    if not user:
        return jsonify({'error': 'Username déjà existant'}), 409
    
    return jsonify({
        'success': True,
        'user': user,
    }), 201


@auth_bp.route('/login', methods=['POST'])
def login():
    """Authentifie un utilisateur et retourne un JWT token."""
    data = request.get_json() or {}
    
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()
    
    if not username or not password:
        return jsonify({'error': 'Username et password requis'}), 400
    
    user = authenticate_user(username, password)
    if not user:
        return jsonify({'error': 'Identifiants invalides'}), 401
    
    token = create_jwt_token(user['id'], user['username'], user['role'])
    
    return jsonify({
        'success': True,
        'token': token,
        'user': {
            'id': user['id'],
            'username': user['username'],
            'role': user['role'],
            'permissions': user['permissions'],
        }
    }), 200


@auth_bp.route('/me', methods=['GET'])
@require_auth
def get_current_user():
    """Retourne les infos de l'utilisateur connecté."""
    user = get_user_by_id(request.user['user_id'])
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404
    
    return jsonify({'user': user}), 200


@auth_bp.route('/users', methods=['GET'])
@require_auth
@require_permission('manage_users')
def list_all_users():
    """Liste tous les utilisateurs (admin/manager uniquement)."""
    limit = request.args.get('limit', 100, type=int)
    if limit <= 0 or limit > 1000:
        limit = 100
    
    users = list_users(limit)
    return jsonify({
        'count': len(users),
        'users': users,
    }), 200


@auth_bp.route('/users/<int:user_id>', methods=['GET'])
@require_auth
@require_permission('manage_users')
def get_user(user_id):
    """Récupère les infos d'un utilisateur spécifique."""
    user = get_user_by_id(user_id)
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404
    
    return jsonify({'user': user}), 200


@auth_bp.route('/users/<int:user_id>/role', methods=['PUT'])
@require_auth
@require_permission('manage_users')
def change_user_role(user_id):
    """Change le rôle d'un utilisateur."""
    data = request.get_json() or {}
    new_role = data.get('role', '').lower()
    
    if not new_role or new_role not in ROLES:
        return jsonify({'error': f'Rôle invalide. Rôles valides: {list(ROLES.keys())}'}), 400
    
    if not update_user_role(user_id, new_role):
        return jsonify({'error': 'Erreur lors de la mise à jour'}), 500
    
    user = get_user_by_id(user_id)
    return jsonify({
        'success': True,
        'user': user,
    }), 200


@auth_bp.route('/users/<int:user_id>', methods=['DELETE'])
@require_auth
@require_permission('manage_users')
def remove_user(user_id):
    """Désactive un utilisateur."""
    if not delete_user(user_id):
        return jsonify({'error': 'Erreur lors de la suppression'}), 500
    
    return jsonify({'success': True}), 200


@auth_bp.route('/roles', methods=['GET'])
def get_available_roles():
    """Retourne la liste des rôles et permissions disponibles."""
    return jsonify({
        'roles': ROLES,
    }), 200
