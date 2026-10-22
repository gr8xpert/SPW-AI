import type { SharedText } from './en';

const loc = (n: number) => (n === 1 ? 'localisation' : 'localisations');
const typ = (n: number) => (n === 1 ? 'type de bien' : 'types de bien');

export const fr: SharedText = {
  bulkSeo: {
    button: 'SEO en masse',
    running: (progress) => `SEO ${progress} %`,
    title: 'Générer le SEO avec l’IA',
    description:
      'Remplit le titre de page, le méta-titre, la méta-description et les mots-clés de tout votre catalogue. S’exécute en arrière-plan sur votre crédit d’IA.',
    languages: 'Langues',
    overwrite: 'Écraser le SEO existant',
    overwriteHelp:
      'Désactivé : les biens qui ont déjà du SEO dans une langue sont ignorés et ne coûtent rien. Activé : tout est régénéré, y compris ce qui a été écrit à la main.',
    schema: 'Générer le schéma JSON-LD',
    schemaHelp:
      'Ajoute un appel IA de plus par bien. Utile seulement si vous voulez un schéma personnalisé au lieu de celui créé automatiquement à partir des champs du bien.',
    slug: 'Remplir les slugs vides',
    slugHelp: 'N’écrit un slug que là où il n’y en a pas. Les slugs existants sont des URL en ligne et ne sont jamais réécrits.',
    counting: 'Comptage des biens…',
    estimate: (properties) => `{properties} ${properties === 1 ? 'bien' : 'biens'} · jusqu’à {calls} appels IA`,
    fewerInPractice: '— moins en pratique, car les biens qui ont déjà du SEO sont ignorés',
    cancel: 'Annuler',
    start: 'Démarrer',
    pickLanguage: 'Choisissez au moins une langue',
    finishedWithErrors: 'SEO en masse terminé avec des erreurs',
    complete: 'SEO en masse terminé',
    summary: (generated, skipped, failed, total) =>
      `${generated} générés, ${skipped} avaient déjà du SEO, ${failed} en échec sur ${total}.`,
    alreadyRunning: 'Le SEO en masse est déjà en cours',
    alreadyRunningText: 'Affichage de la progression de l’exécution en cours — aucune deuxième exécution n’a été lancée.',
    started: 'SEO en masse lancé',
    startedText: 'S’exécute en arrière-plan. Vous pouvez quitter cette page — la progression s’affiche sur le bouton.',
    startFailed: 'Impossible de lancer le SEO en masse',
    noJobId: 'Aucun ID de tâche reçu',
    unexpectedError: 'Erreur inattendue',
  },
  setupTransfer: {
    button: 'Copier la configuration',
    menuHelp: (kind) =>
      kind === 'locations'
        ? 'Copiez cette organisation des localisations vers un autre client. Seules les localisations que les deux clients ont sont modifiées — rien n’est ajouté ni supprimé.'
        : 'Copiez cette organisation des types de bien vers un autre client. Seuls les types que les deux clients ont sont modifiés — rien n’est ajouté ni supprimé.',
    export: 'Exporter la configuration',
    import: 'Importer la configuration…',
    exported: 'Configuration exportée',
    exportedText: (n, kind) =>
      `${n} ${kind === 'locations' ? `${loc(n)} ${n === 1 ? 'enregistrée' : 'enregistrées'}` : `${typ(n)} ${n === 1 ? 'enregistré' : 'enregistrés'}`}. Importez le fichier dans le tableau de bord de l’autre client.`,
    exportFailed: 'Impossible d’exporter',
    tryAgain: 'Réessayez.',
    readFailed: 'Impossible de lire le fichier',
    imported: 'Configuration importée',
    importedText: (changed, merged, kind) =>
      `${changed} ${kind === 'locations' ? `${loc(changed)} ${changed === 1 ? 'mise' : 'mises'}` : typ(changed) + ' mis'} à jour${
        merged ? `, ${merged} ${merged === 1 ? 'doublon fusionné' : 'doublons fusionnés'}` : ''
      }. Votre site utilise la nouvelle configuration.`,
    importFailed: 'Impossible d’importer',
    dialogTitle: (kind) =>
      kind === 'locations' ? 'Importer la configuration des localisations' : 'Importer la configuration des types de bien',
    found: (matched, total, changed, kind) =>
      `${matched} de vos ${total} ${kind === 'locations' ? 'localisations' : 'types de bien'} figurent dans le fichier${
        changed > 0 ? ` ; ${changed} vont changer.` : ' et y correspondent déjà.'
      }`,
    untouched: (n, kind) =>
      `${n} de vos ${kind === 'locations' ? 'localisations' : 'types de bien'} ne ${n === 1 ? 'figure' : 'figurent'} pas dans le fichier et ${n === 1 ? 'ne change' : 'ne changent'} pas.`,
    notInAccount: (n, kind) =>
      `${n} ${kind === 'locations' ? loc(n) : typ(n)} du fichier ${n === 1 ? 'n’existe' : 'n’existent'} pas dans ce compte et ne ${n === 1 ? 'sera' : 'seront'} pas ${kind === 'locations' ? (n === 1 ? 'ajoutée' : 'ajoutées') : n === 1 ? 'ajouté' : 'ajoutés'}`,
    example: (list) => `(p. ex. ${list})`,
    rows: {
      moved: 'Déplacés sous un autre parent',
      renamed: 'Renommés',
      reordered: 'Nouvel ordre',
      aliases: 'Autres orthographes copiées',
      coords: 'Points de carte copiés',
      merged: 'Doublons fusionnés en un seul',
      keptInPlace: 'Laissés sous leur parent actuel (le parent du fichier n’existe pas dans ce compte)',
      clashes: 'Non déplacés (même nom déjà présent)',
      ambiguous: 'Ignorés (plusieurs correspondances possibles)',
    },
    cancel: 'Annuler',
    apply: 'Appliquer',
  },
  sortOrder: {
    button: 'Trier',
    help: 'Remplace l’ordre actuel à tous les niveaux. Faites glisser les lignes pour l’ajuster. Votre site utilise cet ordre.',
    options: { name: 'De A à Z', 'name-desc': 'De Z à A', count: 'Plus d’annonces d’abord' },
    sorted: (label) => `Trié : ${label}`,
    sortedText: 'Votre site affiche le nouvel ordre.',
    failed: 'Impossible de trier',
    failedText: 'Rien n’a été modifié. Réessayez.',
  },
  locked: {
    title: (feature) => `${feature} est verrouillé`,
    description: (feature) =>
      `${feature} est disponible en module payant. Contactez votre gestionnaire de compte pour l’activer pour ce client.`,
    viewPlans: 'Voir les offres',
    backToDashboard: 'Retour au tableau de bord',
    checkFailed: 'Impossible de vérifier votre offre.',
    tryAgain: 'Réessayer',
  },
  photo: {
    chooseImage: 'Choisissez une image',
    chooseImageText: 'La photo doit être un fichier JPG, PNG ou WebP.',
    uploadFailed: 'Échec de l’envoi de la photo',
    noAddress: 'L’envoi n’a renvoyé aucune adresse.',
    uploading: 'Envoi…',
    change: 'Changer la photo',
    upload: 'Envoyer une photo',
    remove: 'Retirer la photo',
    formats: 'JPG, PNG ou WebP',
  },
  weeklyReport: {
    title: 'Rapport hebdomadaire',
    description:
      'Chaque lundi matin : les vues de biens, recherches et demandes de la semaine passée, les biens les plus vus, ce que votre flux a importé et tout ce qui demande votre attention sur votre site.',
    enabled: 'Envoyer le rapport hebdomadaire',
    sendTo: 'L’envoyer à',
    remove: (email) => `Retirer ${email}`,
    defaultRecipients: 'Les administrateurs de votre compte (ajoutez des adresses pour choisir vous-même)',
    emailPlaceholder: 'nom@agence.fr',
    add: 'Ajouter',
    save: 'Enregistrer',
    preview: 'Aperçu du rapport de cette semaine',
    sendToMe: 'Me l’envoyer maintenant',
    notEmail: 'Ce n’est pas une adresse e-mail',
    saved: 'Paramètres du rapport hebdomadaire enregistrés',
    saveFailed: 'Impossible d’enregistrer',
    previewFailed: 'Impossible de créer l’aperçu',
    sent: 'Rapport envoyé',
    sentText: (to) => (to ? `Consultez ${to}.` : 'Consultez votre boîte de réception.'),
    sendFailed: 'Impossible d’envoyer',
    to: (list) => `À : ${list}`,
    nobody: 'personne pour l’instant — ajoutez une adresse',
    frameTitle: 'Aperçu du rapport hebdomadaire',
  },
  impersonation: {
    session: 'Session super-admin ·',
    viewingAs: 'Vue en tant que',
    returnToAdmin: 'Retour à l’admin',
    returned: 'Retour à l’admin',
    returnedText: 'Vous êtes de retour dans votre session super-admin.',
  },
};
