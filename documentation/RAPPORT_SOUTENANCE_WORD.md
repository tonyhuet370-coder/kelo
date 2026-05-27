# RAPPORT DE SOUTENANCE

## Projet Kélonia

### Plateforme de surveillance temps réel des nids de tortues marines

---

**Nom du projet :** Kélonia  
**Type de projet :** Plateforme IoT de supervision et visualisation de données environnementales  
**Domaine :** Surveillance environnementale / Internet des objets / Monitoring temps réel  
**Année :** 2026  

---

## Page de garde

**Établissement :** ..............................................................  
**Formation :** ...................................................................  
**Nom de l'étudiant :** ...........................................................  
**Encadrant :** ...................................................................  
**Date de soutenance :** .........................................................  

---

## Sommaire

1. Introduction  
2. Présentation générale du projet  
3. Problématique et objectifs  
4. Architecture technique  
5. Technologies utilisées  
6. Fonctionnement de la solution  
7. Réalisations principales  
8. Analyse critique  
9. Limites du projet  
10. Perspectives d'amélioration  
11. Conclusion  

---

# 1. Introduction

Le projet Kélonia s'inscrit dans une démarche de surveillance environnementale appliquée aux nids de tortues marines. L'idée générale consiste à concevoir une plateforme capable de collecter, transmettre, afficher et historiser des données issues de capteurs, afin de faciliter le suivi des conditions de nidification.

Dans un contexte de préservation de la biodiversité, le recours à des solutions connectées permet d'améliorer l'observation des paramètres critiques d'un environnement naturel. Ce projet vise donc à répondre à un besoin de supervision continue en proposant une chaîne technique complète, depuis la génération des données jusqu'à leur exploitation dans une interface de visualisation.

L'intérêt du projet ne se limite pas à la dimension applicative. Il constitue également un cas concret de mise en oeuvre d'une architecture IoT moderne, reposant sur la communication par messages, la supervision en temps réel, l'historisation de séries temporelles et le déploiement conteneurisé.

# 2. Présentation générale du projet

Kélonia est une plateforme de supervision technique dédiée au suivi de nids de tortues marines. Elle permet d'observer différents indicateurs environnementaux, notamment la température, l'humidité, les vibrations et la tension. Ces informations sont soit simulées, soit destinées à représenter les données qui pourraient provenir de capteurs déployés sur le terrain.

Le projet est organisé autour de plusieurs composants complémentaires. Un simulateur produit les mesures, un broker MQTT assure la diffusion temps réel, un collector centralise les dernières données reçues, un système de stockage conserve l'historique, et une interface web rend l'ensemble exploitable par l'utilisateur. La solution comprend aussi un tableau de bord Grafana afin d'apporter une couche professionnelle de supervision et d'analyse.

Le dépôt contient ainsi à la fois les composants applicatifs, les fichiers de configuration, les scripts de déploiement et la documentation d'installation. Cette structuration montre une volonté de proposer un projet cohérent et déployable sur plusieurs environnements, notamment en machine virtuelle ou sur NAS Synology.

# 3. Problématique et objectifs

La problématique principale du projet consiste à mettre en place une solution capable de superviser en continu des données environnementales liées à des nids de tortues, tout en assurant leur disponibilité en temps réel et leur conservation dans le temps.

Pour répondre à cette problématique, plusieurs objectifs ont été définis :

1. Concevoir une architecture capable de transporter efficacement des données issues de capteurs.
2. Mettre en place une chaîne de collecte et de visualisation temps réel.
3. Permettre l'historisation des mesures pour une analyse différée.
4. Fournir une interface web simple et accessible.
5. Faciliter le déploiement du projet grâce à Docker et Docker Compose.
6. Rendre la solution adaptable à différents contextes d'hébergement.

Ces objectifs traduisent une approche complète du problème, qui ne se limite pas à l'affichage de données, mais englobe également les aspects d'intégration, d'exploitation et de maintenance.

# 4. Architecture technique

L'architecture du projet repose sur une logique modulaire. Chaque composant assure une responsabilité précise dans la chaîne de traitement des données.

Le simulateur, développé en Python avec Flask, génère périodiquement des valeurs représentant l'état d'un nid. Ces données sont publiées sur un broker MQTT. Ce protocole a été retenu car il est particulièrement adapté aux architectures IoT et aux échanges de messages légers entre services.

À partir du broker, les données sont exploitées par deux voies principales. D'une part, un service collector consomme les messages MQTT et expose les dernières mesures sous forme d'API légère et de flux SSE, ce qui permet au tableau de bord web d'afficher un état quasi temps réel. D'autre part, Telegraf consomme également les messages MQTT, puis les transmet à InfluxDB afin de constituer un historique des mesures sous forme de séries temporelles.

Grafana vient ensuite exploiter les données historisées dans InfluxDB pour produire des tableaux de bord avancés. Enfin, Nginx joue le rôle de serveur web et de reverse proxy, en servant l'interface utilisateur et en redirigeant certaines routes vers les services internes, notamment Grafana et le collector.

Cette architecture présente plusieurs avantages : séparation claire des responsabilités, modularité, facilité d'évolution, et conformité avec des pratiques courantes dans les environnements de supervision technique.

# 5. Technologies utilisées

Le projet s'appuie sur un ensemble de technologies cohérentes avec les besoins identifiés.

1. **Python** pour les composants backend.
2. **Flask** pour le simulateur de données.
3. **Aiohttp** pour le collector exposant les flux temps réel.
4. **MQTT** et **Mosquitto** pour le transport des messages.
5. **Telegraf** pour la collecte et la transformation des données.
6. **InfluxDB** pour le stockage de séries temporelles.
7. **Grafana** pour la supervision et la visualisation avancée.
8. **HTML, CSS et JavaScript** pour l'interface utilisateur.
9. **Nginx** pour le service web et le reverse proxy.
10. **Docker** et **Docker Compose** pour l'orchestration des services.

L'utilisation de ces technologies est pertinente car elle permet de reproduire une architecture proche de celles que l'on retrouve dans des projets industriels de supervision, tout en restant accessible dans un cadre pédagogique.

# 6. Fonctionnement de la solution

Le fonctionnement général du projet peut être décrit de façon séquentielle.

Dans un premier temps, le simulateur génère des données environnementales. Ces données comprennent notamment la température, l'humidité, les vibrations et la tension. Elles sont ensuite publiées sur des topics MQTT.

Dans un second temps, les messages sont consommés par le collector, qui conserve le dernier état reçu et le met à disposition du tableau de bord web. Le collector propose également un flux SSE afin de diffuser les nouvelles valeurs aux clients connectés sans devoir recharger la page. Cette approche améliore la réactivité de l'interface.

En parallèle, Telegraf consomme les mêmes messages MQTT et les envoie à InfluxDB. Le stockage des données dans une base spécialisée permet d'exploiter les mesures dans la durée et de construire des graphiques temporels dans Grafana.

Du point de vue utilisateur, le site web constitue l'interface principale de consultation. Il permet d'afficher les indicateurs importants, de visualiser des alertes et d'accéder à Grafana pour une analyse plus poussée. Le projet combine donc visualisation immédiate et supervision historique.

# 7. Réalisations principales

Le projet présente plusieurs réalisations significatives qui témoignent d'une bonne avancée technique.

La première réalisation importante est la mise en place d'une chaîne IoT complète. Le projet ne se limite pas à une simple page web ; il intègre la génération de données, leur transport, leur collecte, leur stockage et leur visualisation.

La deuxième réalisation est l'intégration d'une supervision professionnelle grâce à InfluxDB et Grafana. Cela permet de dépasser le cadre d'une démonstration basique en proposant un véritable environnement d'observation et d'analyse.

La troisième réalisation concerne la conteneurisation. L'usage de Docker facilite la reproductibilité, simplifie le déploiement et permet de lancer l'ensemble des services de manière coordonnée.

Enfin, la présence de scripts de déploiement et de documents dédiés au déploiement sur différents environnements montre une attention portée à l'exploitabilité du projet.

# 8. Analyse critique

L'analyse du dépôt met en évidence plusieurs points forts. Le projet est globalement bien structuré, avec des composants séparés selon leurs responsabilités. L'architecture retenue est cohérente avec un cas d'usage IoT et repose sur des technologies reconnues. Le recours à MQTT, InfluxDB et Grafana est particulièrement pertinent pour un système de supervision temps réel.

Le tableau de bord web apporte une couche d'accessibilité utile, tandis que Grafana renforce la dimension analytique du projet. L'ensemble donne une solution démontrable, crédible et techniquement intéressante dans le cadre d'une soutenance.

Toutefois, une analyse plus rigoureuse montre également que certains éléments du projet ne sont pas parfaitement alignés. La documentation et certains scripts de déploiement décrivent encore une architecture plus ancienne, centrée sur une API `/api/data`, alors que l'implémentation actuelle repose en grande partie sur MQTT, le collector et les routes `/collector/latest` et `/collector/events`. Cet écart n'empêche pas le fonctionnement global, mais il nuit à la lisibilité du projet.

# 9. Limites du projet

Plusieurs limites doivent être signalées afin de présenter une évaluation honnête et professionnelle.

La première limite concerne la sécurité. Un token Telegram et un identifiant de conversation sont directement inscrits dans le code du simulateur. Cette pratique doit être évitée, car les secrets ne doivent jamais être exposés dans le code source. Ils devraient être transmis via des variables d'environnement.

La deuxième limite concerne l'authentification du site web. La logique de connexion observée repose essentiellement sur des mécanismes côté client, ce qui ne constitue pas une sécurité robuste. De plus, cette logique semble dépendre d'un fichier utilisateur non présent dans l'arborescence analysée.

La troisième limite concerne la cohérence documentaire. Pour un projet de soutenance, il est important que le dépôt reflète clairement l'architecture réellement utilisée. Une documentation partiellement obsolète peut créer un décalage entre le discours présenté et l'implémentation effective.

Enfin, le projet apparaît comme un prototype avancé ou une preuve de concept solide, mais il nécessiterait encore un durcissement avant de pouvoir être présenté comme une solution prête pour la production.

# 10. Perspectives d'amélioration

Plusieurs axes d'amélioration peuvent être envisagés pour renforcer le projet.

1. Mettre à jour l'ensemble de la documentation pour l'aligner avec l'architecture actuelle.
2. Externaliser les secrets et paramètres sensibles dans des variables d'environnement.
3. Mettre en place une authentification réellement sécurisée côté serveur.
4. Ajouter des tests automatisés sur les composants critiques.
5. Améliorer la gestion des erreurs et la supervision applicative.
6. Prévoir l'intégration de capteurs réels afin de dépasser le cadre du simulateur.
7. Ajouter des fonctions d'analyse ou d'alerte plus avancées.

Ces perspectives montrent que le projet possède une base technique suffisamment solide pour être prolongé et amélioré dans un cadre plus professionnel.

# 11. Conclusion

Le projet Kélonia constitue une réalisation sérieuse et techniquement intéressante dans le domaine de la supervision environnementale. Il démontre la capacité à concevoir une chaîne complète de traitement de données IoT, depuis la génération des mesures jusqu'à leur visualisation temps réel et leur historisation.

L'ensemble du projet met en évidence des compétences en développement backend, en intégration de services, en visualisation de données, en administration de conteneurs et en structuration d'une architecture distribuée. Ces éléments en font un support pertinent pour une soutenance, car ils permettent d'illustrer à la fois des choix techniques, une logique d'architecture et une démarche de réalisation concrète.

En conclusion, Kélonia est un projet crédible, démonstratif et bien avancé. Ses principales marges de progression concernent la sécurisation, la cohérence documentaire et la consolidation finale. Ces améliorations sont réalistes et renforcent l'idée qu'il s'agit d'un projet disposant d'un réel potentiel d'évolution.

---

## Annexe - Conseils de mise en forme dans Word

Pour une intégration propre dans Word, il est recommandé :

1. d'utiliser le titre principal comme **Titre 1** ;
2. d'appliquer les sections numérotées en **Titre 1** ;
3. d'utiliser, si besoin, les sous-parties en **Titre 2** ;
4. d'insérer un sommaire automatique dans Word à partir des styles de titres ;
5. d'ajouter une page de garde institutionnelle avec logo, nom, formation et date.