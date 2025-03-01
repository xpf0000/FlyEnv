export default {
  startInstall: 'Commencer l\'installation de {service}',
  startDown: 'Commencer le téléchargement de {service}, lien de téléchargement : {url}',
  downSuccess: 'Téléchargement terminé, installer {service}',
  downFail: 'Échec du téléchargement, l\'installation de {service} a échoué',
  installSuccess: 'Installation de {service} réussie, emplacement d\'installation : {appDir}',
  installFail: 'Échec de l\'installation de {service}, raison : {error}',
  installFromZip: 'Le package d\'installation existe déjà, installer {service}',
  installFromZipFail: 'Échec de l\'installation, téléchargez à nouveau le package d\'installation pour l\'installer',

  startServiceBegin: 'Démarrage du service {service}...',
  serviceUseBundle: 'Utilisation de la version intégrée, début de l\'extraction et de l\'installation de {service}',
  bundleUnzipSuccess: 'Extraction de l\'installation terminée, emplacement d\'installation : {appDir}',
  bundleUnzipFail: 'Échec de l\'extraction de l\'installation, raison : {error}',
  confInit: 'Le fichier de configuration n\'existe pas, génération du fichier de configuration',
  confInitSuccess: 'Fichier de configuration généré avec succès, chemin du fichier : {file}',
  confInitFail: 'Échec de la génération du fichier de configuration, raison : {error}',
  apachePortHandleBegin: 'Début de l\'obtention de tous les ports d\'écoute Apache du site',
  apachePortHandleEnd: 'Obtention des ports d\'écoute Apache terminée, écriture du fichier de configuration réussie',
  execStartCommand: 'Démarrer l\'exécution de la commande de démarrage',
  execStartCommandSuccess: 'Commande de démarrage exécutée avec succès, début de la vérification du succès du démarrage',
  execStartCommandFail: 'Échec de l\'exécution de la commande de démarrage, raison : {error}, le service {service} n\'a pas pu démarrer',
  startServiceSuccess: 'Service {service} démarré avec succès, pid : {pid}',
  startServiceFail: 'Le service {service} a échoué à démarrer, raison : {error}',

  stopServiceBegin: 'Début de l\'arrêt du service {service}',
  stopServiceEnd: 'Service {service} arrêté avec succès',

  initDBPass: 'Démarrage de l\'initialisation du mot de passe de la base de données',
  initDBPassSuccess: 'Mot de passe de la base de données initialisé avec succès, mot de passe du compte : {user} {pass}',
  initDBPassFail: 'Échec de l\'initialisation du mot de passe de la base de données, raison : {error}',
  initDBDataDir: 'Dossier de données introuvable, début de l\'initialisation du dossier de données',
  initDBDataDirSuccess: 'Initialisation du dossier de données réussie, chemin du dossier de données : {dir}',
  initDBDataDirFail: 'Échec de l\'initialisation du dossier de données, raison : {error}',

  initPlugin: 'Démarrage de l\'initialisation du plugin et exécution de la commande : {command}',
  initPluginSuccess: 'Plugin initialisé avec succès',
  initPluginFail: 'Échec de l\'initialisation du plugin, raison : {error}',

  erlangEnvInit: 'Tentative d\'initialisation de l\'environnement d\'exécution Erlang',
  erlangEnvInitEnd: 'Initialisation de l\'environnement d\'exécution Erlang terminée',

  newProjectBegin: 'Début de la création d\'un nouveau projet et exécution de la commande : {command}',
  newProjectSuccess: 'Le nouveau projet a été créé avec succès, chemin du projet : {dir}',
  newProjectFail: 'Échec de la création du nouveau projet'
}