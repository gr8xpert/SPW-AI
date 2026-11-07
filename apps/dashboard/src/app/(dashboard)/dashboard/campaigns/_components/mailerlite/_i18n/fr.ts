import type { MailerLiteText } from './en';

export const fr: MailerLiteText = {
  title: 'MailerLite',
  description: 'Gardez vos contacts et vos étiquettes à jour dans votre propre compte MailerLite.',
  intro: "Connectez votre propre compte MailerLite et nous y copions vos contacts et leurs étiquettes. Vous créez et envoyez vos e-mails dans MailerLite. Si quelqu'un s'y désabonne, rebondit ou signale un spam, cette personne est aussi désabonnée ici.",
  connect: {
    keyLabel: 'Clé API MailerLite',
    keyPlaceholder: 'Collez votre clé API ici',
    whereTitle: 'Où trouver ma clé ?',
    whereSteps: 'Dans MailerLite, ouvrez Integrations, choisissez MailerLite API, puis cliquez sur Generate new token. Copiez le jeton et collez-le ici.',
    button: 'Connecter',
    connecting: 'Vérification de votre clé…',
  },
  errors: {
    BAD_KEY: "MailerLite n'a pas accepté cette clé API. Vérifiez-la et réessayez.",
    MAILERLITE_BUSY: 'MailerLite est occupé. Réessayez dans une minute.',
    generic: "Nous n'avons pas pu joindre MailerLite. Réessayez dans quelques minutes.",
    loadFailed: "Impossible de charger vos réglages MailerLite. Seuls les responsables peuvent les voir.",
    actionFailed: "Cela n'a pas fonctionné. Veuillez réessayer.",
  },
  consent: {
    title: 'Une chose avant la première synchronisation',
    checkbox: "Je confirme que ces contacts ont accepté de recevoir des e-mails marketing",
    help: 'Seules les personnes abonnées ici sont copiées. Les adresses désabonnées ou en rebond sont laissées de côté.',
    button: 'Confirmer et lancer la première synchronisation',
  },
  connected: {
    badge: 'Connecté',
    keyEnding: (last4: string) => `Clé API se terminant par ${last4}`,
    consentBy: (who: string, when: string) => `Consentement confirmé par ${who} le ${when}`,
    lastSync: 'Dernière synchronisation',
    never: 'Pas encore',
    syncing: 'Synchronisation en cours. Une grande liste peut prendre quelques heures, vous pouvez quitter cette page.',
    syncNow: 'Synchroniser maintenant',
    disconnect: 'Déconnecter',
    daily: 'Vos contacts se synchronisent aussi tout seuls une fois par jour.',
    groups: "Tout le monde va dans un groupe appelé \"SPM contacts\", et chaque étiquette a son propre groupe commençant par \"SPM:\". Si vous retirez une étiquette ici, la personne quitte ce groupe dans MailerLite. Vos autres groupes ne sont pas touchés.",
    statsNote: "Les ouvertures, clics et autres résultats des e-mails envoyés depuis MailerLite apparaissent dans MailerLite, pas ici.",
  },
  counts: {
    added: 'Ajoutés',
    updated: 'Mis à jour',
    unchanged: 'Déjà à jour',
    skipped: 'Laissés de côté',
    failed: 'Non transmis',
    skippedHelp: "Laissés de côté : les personnes sans véritable adresse e-mail, et celles désabonnées ou en rebond.",
  },
  notices: {
    bad_key: "MailerLite n'accepte plus votre clé API. Veuillez vous reconnecter avec une nouvelle clé.",
    unreachable: "La dernière synchronisation n'a pas pu se terminer car MailerLite était injoignable. Elle reprendra où elle s'est arrêtée la prochaine fois.",
    some_groups_missing: "Certaines étiquettes n'ont pas de groupe dans MailerLite car il n'a pas pu être créé. Votre compte a peut-être atteint sa limite de groupes.",
  },
  attention: {
    badge: 'À vérifier',
    newKey: 'Connecter avec une nouvelle clé',
  },
  disconnect: {
    title: 'Déconnecter MailerLite ?',
    body: 'La synchronisation s\'arrête et les désabonnements ne reviennent plus de MailerLite. Vos contacts et groupes restent dans votre compte MailerLite.',
    cancel: 'Annuler',
    confirm: 'Déconnecter',
  },
};
