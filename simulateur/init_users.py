#!/usr/bin/env python3
"""
Script d'initialisation des utilisateurs pour Kélonia
Crée les utilisateurs par défaut admin, user et viewer
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from auth import init_auth_db, create_user

def main():
    print("Initialisation de la base de données d'authentification...")
    init_auth_db()
    print("✓ Base de données initialisée")
    
    # Créer les utilisateurs par défaut
    print("\nCréation des utilisateurs par défaut...")
    
    users_to_create = [
        {'username': 'admin', 'password': 'admin123', 'email': 'admin@kelo.local', 'role': 'admin'},
        {'username': 'user', 'password': 'user123', 'email': 'user@kelo.local', 'role': 'user'},
        {'username': 'viewer', 'password': 'viewer123', 'email': 'viewer@kelo.local', 'role': 'viewer'},
    ]
    
    for user_data in users_to_create:
        result = create_user(
            username=user_data['username'],
            password=user_data['password'],
            email=user_data['email'],
            role=user_data['role']
        )
        
        if result:
            print(f"  ✓ Utilisateur '{user_data['username']}' créé (rôle: {user_data['role']})")
        else:
            print(f"  ✗ Erreur: Utilisateur '{user_data['username']}' existe déjà ou erreur")
    
    print("\nInitialisation terminée!")
    print("\nCredentials par défaut:")
    print("  Admin   : admin / admin123")
    print("  User    : user / user123")
    print("  Viewer  : viewer / viewer123")
    print("\n⚠️  IMPORTANT: Changez les mots de passe en production!")

if __name__ == '__main__':
    main()
