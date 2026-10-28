import { p, steps, terms, tip, warn, type GuideTranslation } from '../guide-types';

// The Buyer Match guide in French ("vous"). Same sections and blocks as the
// English source (guide-basics.ts + guide-more.ts); labels match buyers/_i18n/fr.ts.
export const fr: GuideTranslation = {
  what: {
    title: 'Qu’est-ce que Contacts ?',
    summary: 'Un carnet intelligent pour vos acheteurs et vos leads, qui trouve les bons biens pour eux.',
    blocks: [
      p('Contacts (le module Buyer Match) est un carnet pour chaque personne qui veut acheter (ou louer) un bien chez vous, et pour les vendeurs, propriétaires bailleurs et autres personnes avec qui vous travaillez. Pour chacune, vous notez qui elle est et ce qu’elle cherche.'),
      p('Ensuite, l’ordinateur fait la partie ennuyeuse. Il regarde chaque bien de votre site et vous montre ceux qui conviennent à chaque acheteur. Vous choisissez les meilleurs et vous les envoyez par e-mail en un clic.'),
      p('L’acheteur reçoit une page web privée avec ces biens. Il peut cliquer sur « j’aime », « pas pour moi » ou « je veux le visiter ». Vous voyez chaque clic, donc vous savez qui est vraiment intéressé.'),
      p('Il aide aussi votre équipe à suivre chaque lead : qui a appelé qui, qui attend encore un appel et quelles visites sont réservées. Le Rapport des leads montre tout dans un seul tableau, comme le tableur que beaucoup d’agences tenaient à la main.'),
      tip('Les personnes qui remplissent un formulaire sur votre site ou un formulaire de leads Facebook, ou qui réservent dans Calendly, arrivent dans Nouveaux leads (menu de gauche). Donnez-leur un rôle et elles rejoignent vos Contacts. Inutile de les saisir vous-même.'),
    ],
  },
  'quick-start': {
    title: 'Démarrage rapide en 5 étapes',
    summary: 'Le chemin le plus court entre un nouvel acheteur et un e-mail envoyé.',
    blocks: [
      steps(
        'Allez dans l’onglet Contacts et cliquez sur « Nouveau contact ». Saisissez un nom et une adresse e-mail, puis cliquez sur « Ajouter le contact ».',
        'Ouvrez l’acheteur et allez dans l’onglet Souhaits. Choisissez ce qu’il veut : louer ou acheter, les villes, le type de bien et le budget. Cliquez sur « Enregistrer les souhaits ».',
        'Ouvrez l’onglet Correspondances. Vous voyez maintenant tous les biens qui conviennent, les meilleurs en haut.',
        'Cochez les biens qui vous plaisent et cliquez sur « Envoyer la sélection ». Vérifiez l’aperçu de l’e-mail et cliquez sur « Envoyer l’e-mail ».',
        'Attendez la réaction de l’acheteur. Les « j’aime », les refus et les demandes de visite apparaissent sur l’acheteur, dans Activité et dans « Ma journée ».',
      ),
      tip('Avant votre premier e-mail, demandez à votre responsable de remplir Paramètres → Général → « Liens vers les biens dans les e-mails ». Sans cela, les e-mails ne peuvent pas renvoyer vers les pages de vos biens.'),
    ],
  },
  words: {
    title: 'Les mots que vous verrez',
    summary: 'Un petit dictionnaire des mots utilisés dans Buyer Match.',
    blocks: [
      terms(
        ['Contact', 'Toute personne de votre liste : un acheteur, un vendeur, un propriétaire bailleur, un locataire ou un autre agent. Le « Type de contact » le précise. Dans ce guide, « acheteur » veut dire n’importe quel contact.'],
        ['Lead', 'Un nouveau contact qu’il faut encore appeler. Le Rapport des leads le suit jusqu’à ce que quelqu’un le joigne.'],
        ['Suivi', 'Où en est l’équipe avec un lead : pas contacté, pas encore de réponse, à rappeler, mauvais numéro ou joint.'],
        ['En retard', 'Un lead que personne n’a contacté à temps (24 heures, sauf si votre responsable l’a changé). Il passe en rouge.'],
        ['Agent', 'La personne de votre équipe qui s’occupe de cet acheteur. Les « Agents associés » sont des collègues qui aident.'],
        ['Étape', 'Où en est l’acheteur, par exemple « Nouveau », « Visite » ou « Gagné ». Les étapes sont les colonnes du Tableau.'],
        ['Souhaits', 'Ce que l’acheteur recherche.'],
        ['Critères obligatoires', 'Les quatre points qu’un bien doit respecter : type d’annonce, zone, type de bien et budget.'],
        ['Souhaits secondaires', 'Les petits plus comme les chambres, la surface, une piscine ou la vue mer. Ils augmentent le score mais ne cachent jamais un bien.'],
        ['Score', 'Un nombre qui montre à quel point un bien convient. Plus il est élevé, mieux c’est.'],
        ['Acheteur chaud', 'Quelqu’un de très actif ces derniers temps : « j’aime », demandes de visite, clics et demandes d’information.'],
        ['Page acheteur', 'Une page web privée pour un acheteur, avec tous les biens que vous lui avez envoyés.'],
        ['Alerte', 'Un message qui attend votre accord quand une nouvelle annonce ou une baisse de prix convient à un acheteur.'],
      ),
    ],
  },
  list: {
    title: 'La liste Contacts',
    summary: 'Trouvez vite n’importe quel acheteur avec la recherche, les filtres et le tri.',
    linkLabel: 'Ouvrir la liste Contacts',
    blocks: [
      p('L’onglet Contacts montre toutes les personnes que vous pouvez voir. Chaque carte affiche le nom, le type de contact, l’e-mail, l’agent, l’étape, les étoiles et la date de la dernière activité.'),
      terms(
        ['Recherche', 'Tapez une partie d’un nom, d’un e-mail ou d’un numéro de téléphone.'],
        ['Filtres', 'N’affichez qu’un type de contact, un agent, une étape, une priorité, une source ou une réponse à l’une de vos questions. Cliquez sur « Effacer » pour revoir tout le monde.'],
        ['Acheteurs chauds', 'Activez ce filtre pour ne voir que les acheteurs les plus actifs.'],
        ['Sans activité récente', 'Montre les acheteurs à qui personne n’a parlé depuis un moment, pour que personne ne soit oublié.'],
        ['Tri', 'Triez par dernière activité, plus récents, nom ou priorité.'],
        ['Cartes / Liste', 'Deux façons de voir les mêmes acheteurs : de grandes cartes ou un tableau compact.'],
        ['Exporter en CSV', 'Les responsables peuvent télécharger la liste (avec vos filtres) pour l’ouvrir dans Excel.'],
      ),
      tip('Les filtres restent dans l’adresse web. Copiez le lien et un collègue verra exactement la même liste.'),
    ],
  },
  'new-buyer': {
    title: 'Ajouter un contact',
    summary: 'À la main, depuis votre site, depuis les publicités Facebook, depuis Calendly ou depuis un fichier Odoo.',
    blocks: [
      terms(
        ['À la main', 'Cliquez sur « Nouveau contact », saisissez le nom et l’e-mail, choisissez le type de contact et l’agent. Une adresse e-mail = un acheteur, vous ne pouvez donc pas ajouter deux fois la même personne.'],
        ['Depuis votre site', 'Les demandes d’information, le formulaire de souhaits et « m’envoyer mes favoris par e-mail » créent ou mettent à jour un acheteur tout seuls. Les nouvelles personnes attendent dans Nouveaux leads.'],
        ['Depuis les publicités Facebook et Instagram', 'Les formulaires de leads de vos publicités arrivent toutes les 15 minutes, une fois qu’un responsable les a connectés dans les Paramètres. Les réponses qui correspondent à l’une de vos questions acheteur sont remplies pour vous.'],
        ['Depuis Calendly', 'Quand quelqu’un réserve dans le Calendly d’un agent, il arrive comme nouveau lead avec la visite déjà prévue (voir « Agenda et Calendly »).'],
        ['Depuis Odoo', 'Les responsables peuvent reprendre tous leurs anciens acheteurs avec l’onglet Importer.'],
      ),
      p('Les nouveaux acheteurs venus du site vont à un seul agent, ou à tour de rôle entre plusieurs agents (« round-robin »). Un responsable le choisit dans Paramètres → Général.'),
    ],
  },
  'new-leads': {
    title: 'Nouveaux leads',
    summary: 'Tous ceux qui sont venus d’eux-mêmes attendent ici jusqu’à ce que vous leur donniez un rôle.',
    linkLabel: 'Ouvrir Nouveaux leads',
    blocks: [
      p('Nouveaux leads (menu de gauche) est la boîte de réception des personnes qui vous ont contacté d’elles-mêmes : un formulaire du site, un formulaire de leads Facebook ou Instagram, ou une réservation Calendly. Le nombre en rouge indique combien attendent.'),
      steps(
        'Ouvrez Nouveaux leads. Chaque ligne montre la personne, le formulaire qu’elle a rempli et son message.',
        'Répondez-lui d’abord si vous voulez : « Répondre » pour un e-mail, ou le bouton WhatsApp.',
        'Choisissez un rôle (acheteur, vendeur, locataire…) et cliquez sur « Ajouter aux Contacts ». La personne passe dans votre liste Contacts avec tout ce qu’elle a envoyé.',
      ),
      terms(
        ['Supprimer', 'Seulement pour le spam ou les tests. Le lead et ses messages disparaissent définitivement.'],
        ['Marquer comme traitée', 'Les agences sans le module Buyer Match utilisent Nouveaux leads comme une simple boîte de réception : répondez, puis marquez la demande comme traitée.'],
      ),
      tip('Les nouveaux leads apparaissent aussi tout de suite dans le Rapport des leads : un lead que personne n’appelle y passe en rouge.'),
      tip("Plusieurs sites ? Donnez à chacun sa propre clé de site (Paramètres → Clés API). Ses demandes indiquent alors de quel site elles viennent et peuvent aller à l’adresse email de ce site."),
    ],
  },
  record: {
    title: 'La fiche d’un acheteur',
    summary: 'Le haut de la page : type, étape, étoiles, agent, WhatsApp et Confidentialité.',
    blocks: [
      p('Cliquez sur un acheteur pour ouvrir sa fiche. La partie du haut reste toujours visible, quel que soit l’onglet.'),
      terms(
        ['Type de contact', 'Acheteur, vendeur, propriétaire bailleur, locataire, professionnel, etc.'],
        ['Étape', 'Où en est l’acheteur dans votre processus. Changez-la ici ou faites glisser la carte sur le Tableau.'],
        ['Étoiles de priorité', 'Donnez 1 à 3 étoiles aux acheteurs les plus importants. Cliquez à nouveau sur la dernière étoile allumée pour en retirer une.'],
        ['Agent et agents associés', 'Qui s’occupe de cet acheteur, et qui d’autre aide.'],
        ['WhatsApp', 'Écrit un message WhatsApp pour vous et ouvre votre propre WhatsApp (voir « Messages WhatsApp »).'],
        ['Confidentialité', 'Consentement, désabonnement et effacement. Voir « Confidentialité et suppression d’un acheteur » plus bas.'],
        ['Résumé', 'Si l’IA est activée, trois lignes courtes qui vous disent qui est cet acheteur et ce qu’il veut.'],
      ),
      p('Sous la partie du haut se trouvent les onglets : Détails, Souhaits, Correspondances, Presque, Suggérés, Contacts, Notes internes, Séjours et visites, Tâches, Fichiers, Activité et Historique.'),
    ],
  },
  details: {
    title: 'Onglet Détails',
    summary: 'Coordonnées, photo, vos propres questions, pièce d’identité et informations sur l’affaire.',
    blocks: [
      terms(
        ['Contact', 'Nom, e-mail, téléphones, langue, moyen de contact préféré, adresse et photo. La langue détermine la langue des e-mails qu’il reçoit.'],
        ['Photo', 'Cliquez sur « Envoyer une photo » (JPG, PNG ou WebP), puis sur « Enregistrer » sur la carte.'],
        ['Questions sur l’acheteur', 'Vos propres questions, comme « Est-ce une résidence secondaire ? ». Votre responsable les crée dans Paramètres → Questions. Vous pouvez filtrer la liste selon les réponses.'],
        ['Identité et juridique', 'Type et numéro de pièce d’identité et avocat de l’acheteur, pour quand une vente devient sérieuse.'],
        ['Pipeline', 'Sous-statut, valeur de l’affaire, depuis quand vous attendez une réponse, et qui a recommandé l’acheteur (avec son %).'],
      ),
      tip('Chaque carte a son propre bouton Enregistrer. Modifiez ce qu’il faut, puis cliquez sur Enregistrer sur cette carte.'),
    ],
  },
  wishlist: {
    title: 'Souhaits : ce que veut l’acheteur',
    summary: 'Les critères obligatoires décident si un bien convient. Les souhaits décident à quel point.',
    blocks: [
      p('Les souhaits sont le cœur de Buyer Match. Mieux vous les remplissez, meilleures sont les correspondances.'),
      terms(
        ['Type d’annonce', 'Revente, programme neuf, location longue durée ou location saisonnière.'],
        ['Villes ou zones', 'Choisissez une zone et toutes les villes qu’elle contient comptent aussi.'],
        ['Types de bien', 'Choisissez « Villa » et toutes les sortes de villas comptent aussi.'],
        ['Budget', 'De et à. Un bien hors budget ne correspond jamais.'],
        ['Chambres, salles de bain, surfaces', 'Le minimum que veut l’acheteur.'],
        ['Caractéristiques et souhaits', 'Piscine, vue mer, garage, etc. Ils font monter un bien dans la liste ; ils ne le cachent jamais.'],
        ['Envoyer les biens correspondants à', 'L’acheteur, l’agent ou les deux.'],
      ),
      warn('Les critères obligatoires sont stricts. Si vous choisissez une seule petite ville et un budget bas, vous n’aurez peut-être aucune correspondance. Élargissez un peu la zone ou le budget.'),
      tip('Si l’acheteur vient d’une demande sur le site, ses souhaits ont peut-être été devinés à partir du bien demandé. Vérifiez-les, modifiez-les, puis cliquez sur Enregistrer.'),
    ],
  },
  matched: {
    title: 'Correspondances et Presque',
    summary: 'Les biens qui conviennent, les meilleurs d’abord, et ceux qui conviennent presque.',
    blocks: [
      p('Correspondances montre chaque bien du site qui respecte tous les critères obligatoires. Le meilleur score est en haut. Chaque ligne indique quels souhaits sont respectés.'),
      steps(
        'Cochez les biens que vous voulez.',
        'Cliquez sur « Envoyer la sélection » pour les envoyer maintenant, ou sur « Ajouter aux suggérés » pour les garder pour plus tard.',
      ),
      p('Les biens déjà envoyés, ou refusés par l’acheteur, sont masqués pour que rien ne parte deux fois. Cliquez sur « Tout afficher » pour les revoir.'),
      p('Presque montre les biens qui ratent un seul critère obligatoire, de peu : par exemple 5 % au-dessus du budget, ou dans la ville voisine. Chacun indique pourquoi il ne correspond pas. Un responsable règle ce que veut dire « de peu ».'),
    ],
  },
  suggested: {
    title: 'Biens suggérés',
    summary: 'Votre sélection faite à la main pour cet acheteur.',
    blocks: [
      p('Suggérés est votre sélection. Ajoutez des biens depuis Correspondances, ou tapez une référence comme R1234567 et cliquez sur « Ajouter ».'),
      terms(
        ['Statut', 'Suggéré, envoyé, visité, intéressé ou pas intéressé.'],
        ['Note', 'Une note privée. Seule votre équipe la voit.'],
        ['Lien de visite virtuelle', 'Un lien vers une visite vidéo à joindre.'],
        ['Date de visite', 'Quand l’acheteur va le visiter.'],
        ['Télécharger le PDF', 'Un PDF soigné de la sélection (ou seulement des biens cochés) à imprimer ou à joindre.'],
        ['Chronologie', 'Pour chaque bien envoyé : envoyé, ouvert, cliqué, aimé, pas pour moi, visite, offre.'],
      ),
      tip('Vous pouvez noter vous-même ce qui s’est passé, par exemple « Visite » ou « Offre », quand l’acheteur vous l’a dit par téléphone.'),
    ],
  },
  sending: {
    title: 'Envoyer des biens par e-mail',
    summary: 'Un e-mail à vos couleurs, dans la langue de l’acheteur, avec sa page privée.',
    blocks: [
      steps(
        'Sélectionnez des biens dans Correspondances ou Suggérés et cliquez sur « Envoyer la sélection ».',
        'Choisissez le destinataire : l’acheteur, l’agent ou les deux.',
        'Choisissez la langue et ajoutez un message personnel si vous le souhaitez (« Rédiger avec l’IA » peut l’écrire pour vous).',
        'Regardez l’aperçu, puis cliquez sur « Envoyer l’e-mail ».',
      ),
      p('Chaque e-mail contient un lien vers la page privée de l’acheteur. Sur cette page, il peut aimer un bien, dire « pas pour moi » (avec une raison) ou demander une visite. Vous recevez un e-mail quand il le fait.'),
      p('Vous pouvez désactiver la page, créer un nouveau lien (l’ancien ne marche plus) ou copier le lien depuis la carte « Page acheteur ».'),
      warn('« Ouvert » n’est pas toujours vrai : certaines messageries ouvrent les images toutes seules. Un clic ou un « j’aime » est un bien meilleur signe.'),
    ],
  },
  whatsapp: {
    title: 'Messages WhatsApp',
    summary: 'Un message tout prêt dans la langue de l’acheteur, envoyé depuis votre propre WhatsApp.',
    blocks: [
      p('Le bouton vert WhatsApp (sur un acheteur, dans Nouveaux leads, sur une visite, sur une tâche, dans le Rapport des leads) écrit le message pour vous dans la langue de l’acheteur. Vérifiez-le, cliquez sur « Ouvrir WhatsApp » et envoyez-le depuis votre propre WhatsApp, sur votre téléphone ou votre ordinateur.'),
      terms(
        ['Biens', 'Depuis Correspondances ou Suggérés : les biens avec des liens vers votre site et vers la page acheteur. Les clics sont suivis comme dans un e-mail.'],
        ['Répondre à une demande', 'Depuis Nouveaux leads : une réponse aimable sur le bien qui l’intéresse.'],
        ['Visite', 'Depuis une visite prévue : le jour, l’heure, le bien et le lieu de rendez-vous avec un lien vers la carte.'],
        ['Relance', 'Depuis un acheteur ou une tâche : un court message pour prendre des nouvelles.'],
        ['Ajouter mon lien de réservation', 'Si votre agence utilise Calendly, ajoute votre page de réservation pour que l’acheteur choisisse lui-même un créneau.'],
      ),
      p('Chaque message que vous ouvrez compte comme un contact avec l’acheteur : il apparaît dans Activité et dans le Rapport des leads.'),
      warn('Le numéro doit avoir l’indicatif pays (+34…, +31…). Sans lui, WhatsApp ne trouve pas la personne ; la fenêtre vous prévient.'),
    ],
  },
  ai: {
    title: 'Les aides IA',
    summary: 'Laissez l’IA lire les messages, écrire des notes et repérer des tendances. Vous vérifiez toujours d’abord.',
    blocks: [
      p('Les aides IA utilisent la clé d’IA (OpenRouter ou Anthropic) de votre agence (Paramètres → IA). Rien de ce que propose l’IA n’est enregistré avant que vous cliquiez sur Enregistrer.'),
      terms(
        ['Coller un message', 'Collez un e-mail ou un message WhatsApp de l’acheteur. L’IA lit ce qu’il veut et propose des changements dans ses souhaits.'],
        ['Note vocale', 'Parlez jusqu’à 30 secondes après un appel. L’IA écrit la note pour vous. L’enregistrement n’est pas conservé.'],
        ['Règles tirées des notes', 'Écrivez dans Notes internes ce que l’acheteur exige ou refuse (« pas de rez-de-chaussée »). L’IA en fait des règles. Un bien qui enfreint une règle a un score plus bas et un avertissement ; il n’est jamais caché.'],
        ['Résumé', 'Trois lignes courtes sur l’acheteur, en haut de la fiche.'],
        ['Ce que disent les avis', 'Après quelques « j’aime » et refus, l’IA montre des tendances, comme « 4 rez-de-chaussée refusés », et propose d’ajouter une règle.'],
        ['Rédiger avec l’IA', 'Une phrase d’accroche courte et aimable pour votre e-mail.'],
      ),
      tip('Les règles « Exige » baissent un bien qui les enfreint de 40 points, les règles « Préfère » de 15.'),
    ],
  },
  'more-tabs': {
    title: 'Notes, séjours, tâches, fichiers et historique',
    summary: 'Tout le reste que vous gardez sur un acheteur.',
    blocks: [
      terms(
        ['Contacts', 'Les autres personnes concernées : conjoint, membre de la famille ou assistant, avec leur téléphone et leur e-mail.'],
        ['Notes internes', 'Des notes libres que seule votre équipe voit. L’IA peut les lire pour créer des règles.'],
        ['Séjours et visites', 'Ajoutez un séjour quand l’acheteur vient dans la région, puis ajoutez-y des visites. L’acheteur peut recevoir un programme par e-mail (avec un fichier d’agenda) ou en PDF, et l’agent reçoit un rappel avant chaque visite. Le bouton agenda d’une visite l’ajoute à Google Agenda ou la télécharge pour Outlook et l’iPhone.'],
        ['Tâches', 'Les choses à faire, comme « Rappeler vendredi », avec une échéance et une personne. Les tâches en retard s’affichent en rouge.'],
        ['Fichiers', 'Images et PDF jusqu’à 20 Mo, comme une copie de passeport ou une offre signée.'],
        ['Activité', 'Un journal : appels (avec leur résultat), WhatsApp, e-mails, visites, passages sur le site et alertes. Utilisez « Noter une activité » pour ajouter un appel ou un rendez-vous.'],
        ['Historique', 'Chaque modification de l’acheteur : qui a changé quoi, et quand. Aucun mystère.'],
      ),
      tip('Après une visite, marquez-la comme « Effectuée » et notez l’avis de l’acheteur. Cela aide le prochain agent et l’IA.'),
    ],
  },
  'my-day': {
    title: 'Ma journée et À faire aujourd’hui',
    summary: 'À ouvrir en premier chaque matin.',
    linkLabel: 'Ouvrir Ma journée',
    blocks: [
      p('« Ma journée » est votre page du matin. Elle montre votre pipeline, les leads que personne n’a appelés à temps, les tâches en retard, les tâches du jour, les visites des 7 prochains jours, les acheteurs dont vous attendez une réponse, vos acheteurs chauds et les alertes à approuver.'),
      p('« À faire aujourd’hui » liste toutes les tâches du jour (les retards d’abord) et les acheteurs à qui personne n’a parlé depuis un moment.'),
      tip('Activez « E-mail quotidien avec ce résumé » dans Ma journée et la même liste arrive dans votre boîte chaque matin, avec les leads que vous n’avez pas encore appelés.'),
    ],
  },
  'lead-report': {
    title: 'Rapport des leads',
    summary: 'Chaque lead, qui l’a appelé et comment ça s’est passé. Il se remplit tout seul.',
    linkLabel: 'Ouvrir le Rapport des leads',
    blocks: [
      p('Le Rapport des leads remplace le tableur où les agents notaient « appelé une fois, pas de réponse ». Chaque lead est une ligne, et le suivi est calculé à partir de ce que l’équipe a vraiment fait : appels, WhatsApp, e-mails et visites.'),
      terms(
        ['Suivi', 'Pas contacté (en rouge s’il est en retard), pas encore de réponse, à rappeler, mauvais numéro ou joint. En dessous : le nombre d’appels, de WhatsApp et d’e-mails, et le délai du premier contact.'],
        ['Noter un appel', 'Après un appel, cliquez sur « Noter un appel » et choisissez comment ça s’est passé : a répondu, pas de réponse, rappeler plus tard ou mauvais numéro. Ajoutez une note si vous voulez.'],
        ['Colonnes', 'Arrivé le, téléphone et e-mail, agent, étape, premier contact, rendez-vous (la prochaine visite), dernière note, leur demande, budget et type de bien. L’étape et l’agent se changent directement dans la ligne.'],
        ['Questions acheteur', 'Les responsables cliquent sur « Colonnes » pour afficher certaines de vos questions acheteur (comme « Quand voulez-vous acheter ? ») en colonnes. Les agents les remplissent directement dans la ligne ; les réponses des formulaires Facebook sont remplies pour vous.'],
        ['Par agent', 'En haut, une ligne par agent : leads, pas contactés, en retard, contactés, joints, délai du premier contact, appels, WhatsApp, e-mails, visites, gagnés, perdus, valeur gagnée et conversion. Cliquez sur un nom ou un chiffre rouge pour filtrer le tableau.'],
        ['Exporter en CSV', 'Les responsables peuvent télécharger tout le tableau pour l’ouvrir dans Excel.'],
      ),
      tip('Les agents ne voient que leurs propres leads et leur propre ligne. Un lead que personne ne contacte à temps apparaît aussi dans Ma journée et dans l’e-mail quotidien de l’agent.'),
    ],
  },
  board: {
    title: 'Le Tableau',
    summary: 'Voyez tous les acheteurs sous forme de cartes en colonnes, une colonne par étape.',
    linkLabel: 'Ouvrir le Tableau',
    blocks: [
      p('Le Tableau, c’est comme des post-it sur un mur. Chaque colonne est une étape. Faites glisser un acheteur vers la colonne suivante quand il avance.'),
      p('Les filtres marchent ici aussi : vous pouvez ne regarder que vos propres acheteurs, ou seulement les acheteurs chauds.'),
    ],
  },
  alerts: {
    title: 'Alertes : nouvelles annonces et baisses de prix',
    summary: 'Le système repère les nouvelles correspondances pour vous. Vous dites oui ou non.',
    linkLabel: 'Ouvrir Alertes',
    blocks: [
      p('Quand un nouveau bien arrive, ou qu’un prix baisse, le système vérifie chaque acheteur. Si le bien convient à quelqu’un, une alerte vous attend dans l’onglet Alertes. Le nombre en rouge sur l’onglet indique combien.'),
      steps(
        'Ouvrez Alertes. Chaque ligne montre l’acheteur, le bien et le score.',
        'Cliquez sur « Approuver » pour les bonnes et sur « Rejeter » pour les autres. « Tout approuver » les traite toutes d’un coup.',
        'Les alertes approuvées sont envoyées, soit tout de suite, soit dans un e-mail quotidien par acheteur (votre responsable choisit).',
      ),
      warn('Rien n’est envoyé sans votre accord. Si vous n’approuvez jamais, les acheteurs ne reçoivent jamais d’alertes.'),
    ],
  },
  calendar: {
    title: 'Agenda et Calendly',
    summary: 'Vos visites dans Google Agenda, et des acheteurs qui réservent eux-mêmes un créneau.',
    linkLabel: 'Ouvrir les paramètres Agenda',
    blocks: [
      p('Dans Paramètres → Agenda, chaque utilisateur a un lien d’agenda privé. Ajoutez-le une fois à Google Agenda (Autres agendas → + → À partir de l’URL), à Outlook ou à votre iPhone, et vos visites y apparaissent. Le lien d’un agent contient ses propres visites ; celui d’un responsable contient celles de toute l’équipe, avec le nom de l’agent dans chaque titre.'),
      warn('C’est Google qui décide quand il relit le lien : en général en quelques heures, parfois en un jour. Besoin d’une visite tout de suite ? Utilisez plutôt le bouton agenda de la visite.'),
      p('Calendly est une page de réservation où l’acheteur choisit un créneau libre dans l’agenda de l’agent. Un responsable connecte votre compte Calendly une seule fois dans Paramètres → Agenda.'),
      terms(
        ['Un acheteur réserve', 'Une visite apparaît sur le bon contact avec l’agent et l’heure, et le lead compte comme joint dans le Rapport des leads.'],
        ['Une nouvelle personne réserve', 'Elle arrive dans Nouveaux leads, déjà attribuée à l’agent chez qui elle a réservé. Ses réponses Calendly remplissent vos questions acheteur.'],
        ['Report ou annulation', 'La visite passe au nouvel horaire, ou est marquée annulée avec la raison.'],
        ['Envoyer le lien', 'Cochez « Ajouter mon lien de réservation » dans un message WhatsApp, ou copiez-le avec le bouton agenda du Rapport des leads. Le nom et l’e-mail de l’acheteur sont déjà remplis.'],
      ),
      tip('Les réservations n’arrivent toutes seules qu’avec un abonnement Calendly payant (Standard ou plus). Avec l’offre gratuite, les liens de réservation marchent toujours, mais vous ajoutez la visite vous-même. Les agents sont associés par e-mail : utilisez le même e-mail dans Calendly et ici.'),
    ],
  },
  reverse: {
    title: 'Acheteurs pour ce bien',
    summary: 'Partez d’un bien et trouvez tous les acheteurs à qui il plairait.',
    blocks: [
      p('Ouvrez un bien dans Biens. La carte « Acheteurs pour ce bien » compte tous les acheteurs dont les souhaits lui correspondent.'),
      p('Cliquez sur « Voir les acheteurs » pour savoir qui ils sont, puis sur « Envoyer à tous » ou envoyez-le à ceux que vous cochez. Les acheteurs qui l’ont déjà reçu, ou refusé, sont ignorés.'),
      tip('Idéal pour une nouvelle annonce ou une baisse de prix que vous voulez pousser vite.'),
    ],
  },
  reports: {
    title: 'Pipeline et chiffre d’affaires',
    summary: 'Comment va l’agence, en chiffres et en graphiques.',
    linkLabel: 'Ouvrir Pipeline et chiffre d’affaires',
    blocks: [
      terms(
        ['Nouveaux acheteurs', 'Combien sont arrivés, par mois et par source (site, téléphone, Facebook…).'],
        ['Gagnés et perdus', 'Combien d’acheteurs ont acheté, et combien vous en avez perdu.'],
        ['Valeur du pipeline en cours', 'La valeur totale des affaires des acheteurs encore en cours.'],
        ['Chiffre d’affaires attendu', 'Les valeurs des affaires multipliées par la chance de chaque étape. Une estimation honnête de ce qui arrive.'],
        ['Entonnoir du pipeline', 'Combien de nouveaux acheteurs ont atteint chaque étape.'],
        ['Par agent', 'Leads, suivi, ventes, valeur gagnée et conversion par agent sont dans le Rapport des leads.'],
      ),
    ],
  },
  settings: {
    title: 'Paramètres',
    summary: 'Comment Buyer Match fonctionne pour toute votre agence.',
    linkLabel: 'Ouvrir les Paramètres',
    blocks: [
      p('Seul le propriétaire de l’agence ou un responsable peut les modifier. Les agents peuvent les consulter.'),
      terms(
        ['Général', 'Les agents voient-ils les acheteurs des autres ? Qui reçoit les nouveaux acheteurs du site ? Après combien de jours un acheteur est-il « oublié » ? Rappels de visite, heure de l’e-mail quotidien, score « chaud », nombre d’heures après lequel un lead non appelé passe en rouge, adresse des liens vers les biens et adresse de la page acheteur.'],
        ['Étapes', 'Les colonnes de votre Tableau. Ajoutez, renommez, colorez, réordonnez et fixez la chance en % de chacune. Supprimer une étape demande où envoyer ses acheteurs.'],
        ['Questions', 'Vos propres questions sur les acheteurs. Vous pouvez les afficher sur le formulaire de souhaits du site et en colonnes dans le Rapport des leads, et les traduire. Formulez les options comme dans votre formulaire Facebook pour que ses réponses se remplissent toutes seules.'],
        ['Pondérations', 'Le poids de chaque souhait dans le score, de 0 (pas du tout) à 10 (beaucoup). Vous pouvez donner un poids propre à une caractéristique, comme la vue mer.'],
        ['Alertes et quasi-correspondances', 'Activez les alertes, choisissez « tout de suite » ou « résumé quotidien », et la taille minimale d’une baisse de prix. Réglez de combien un bien « presque » peut dépasser le budget ou être éloigné.'],
        ['Entretien', 'Trouvez les doublons possibles (même téléphone ou même nom) et fusionnez-les. La fusion garde tout ; rien n’est perdu.'],
        ['Facebook et Instagram', 'Connectez les formulaires de leads de vos publicités pour que les nouveaux leads arrivent toutes les 15 minutes.'],
        ['Agenda', 'Le lien d’agenda de chacun et (responsables) la connexion Calendly.'],
      ),
      warn('Remplissez d’abord « Liens vers les biens dans les e-mails ». Sans cela, les e-mails ne peuvent pas renvoyer vers les pages de vos biens.'),
    ],
  },
  import: {
    title: 'Importer depuis Odoo',
    summary: 'Reprenez vos anciens acheteurs depuis un fichier d’export Odoo.',
    linkLabel: 'Ouvrir Importer',
    blocks: [
      steps(
        'Dans Odoo, exportez vos acheteurs en fichier .xlsx.',
        'Dans l’onglet Importer, choisissez le fichier et cliquez sur « Vérifier le fichier ». Rien n’est encore enregistré.',
        'Regardez « Ce qui va se passer » : nouveaux acheteurs, acheteurs mis à jour et valeurs non reconnues.',
        'Pour chaque valeur non reconnue (un agent, une ville…), choisissez ce qu’elle signifie dans SPM, ou laissez « Garder en note ».',
        'Cliquez sur « Importer ». Importer à nouveau le même fichier met à jour les mêmes acheteurs ; cela ne crée jamais de copies.',
      ),
    ],
  },
  privacy: {
    title: 'Confidentialité et suppression d’un acheteur',
    summary: 'Consentement, désabonnement et effacement des données personnelles (RGPD).',
    blocks: [
      p('Chaque acheteur a un bouton Confidentialité en haut de sa fiche.'),
      terms(
        ['Enregistrer le consentement', 'Notez que l’acheteur a accepté d’être contacté, et comment (site, téléphone, en personne…).'],
        ['Désabonner des e-mails de biens', 'L’acheteur ne reçoit plus d’e-mails de biens ni d’alertes. Son agent peut toujours lui écrire. L’acheteur peut aussi le faire avec le lien présent dans chaque e-mail.'],
        ['Effacer les données personnelles', 'Pour les responsables. Supprime définitivement le nom, l’e-mail, les téléphones, l’adresse, la pièce d’identité, les notes, les fichiers et les réponses, et l’acheteur disparaît de vos listes. Seuls des chiffres anonymes restent pour Pipeline et chiffre d’affaires.'],
      ),
      steps(
        'Ouvrez l’acheteur et cliquez sur « Confidentialité ».',
        'Choisissez « Effacer les données personnelles… ».',
        'Tapez ERASE en majuscules et cliquez sur « Effacer définitivement ».',
      ),
      warn('L’effacement est irréversible. Si l’acheteur n’est qu’un doublon, fusionnez-le plutôt dans Paramètres → Entretien.'),
    ],
  },
  'who-sees': {
    title: 'Qui peut voir et faire quoi',
    summary: 'Agents, responsables et propriétaires.',
    blocks: [
      terms(
        ['Agents', 'Voient leurs propres acheteurs (ou tout le monde, si le responsable l’autorise). Peuvent ajouter des acheteurs, remplir les souhaits, envoyer des e-mails, approuver des alertes et ajouter des tâches.'],
        ['Responsables et propriétaires', 'Voient tous les acheteurs, et ont aussi Pipeline et chiffre d’affaires, Importer, Exporter en CSV, la fusion, l’effacement et les Paramètres.'],
      ),
      p('Les personnes qui apparaissent seulement sur le site ou dans Buyer Match, sans identifiant de connexion, se gèrent dans Agents (menu de gauche).'),
    ],
  },
  faq: {
    title: 'Questions fréquentes',
    summary: 'Des réponses rapides aux questions qu’on nous pose le plus.',
    blocks: [
      terms(
        ['Pourquoi Correspondances n’affiche-t-il rien ?', 'Les critères obligatoires sont trop stricts. Choisissez une zone plus grande, plus de types de bien ou un budget plus large.'],
        ['Pourquoi un bien que j’ai envoyé n’est-il plus dans Correspondances ?', 'Les biens envoyés et refusés sont masqués pour que personne ne les reçoive deux fois. Cliquez sur « Tout afficher ».'],
        ['L’e-mail n’a pas de liens vers mon site.', 'Un responsable doit remplir Paramètres → Général → « Liens vers les biens dans les e-mails ».'],
        ['Les boutons IA disent qu’il me faut une clé.', 'Ajoutez votre clé d’IA (OpenRouter ou Anthropic) dans Paramètres → IA (propriétaire ou responsable).'],
        ['J’ai ajouté la même personne deux fois.', 'Utilisez Paramètres → Entretien → Doublons possibles et fusionnez-les.'],
        ['Comment supprimer un acheteur ?', 'Confidentialité → Effacer les données personnelles (responsables). L’acheteur quitte vos listes pour de bon.'],
        ['Un acheteur dit qu’il reçoit trop d’e-mails.', 'Confidentialité → Désabonner des e-mails de biens.'],
        ['Mon lien d’agenda ne montre aucune visite.', 'Le lien d’un agent ne contient que les visites dont il est l’agent (voir « Agent : » sous la visite). Google peut mettre jusqu’à un jour pour relire le lien.'],
        ['Une réservation Calendly n’est pas arrivée.', 'Paramètres → Agenda doit indiquer « Les réservations arrivent toutes seules » (un abonnement Calendly payant), et l’e-mail Calendly de l’agent doit être son e-mail ici.'],
        ['Pourquoi un lead est-il en rouge dans le Rapport des leads ?', 'Personne ne l’a appelé, ni contacté par WhatsApp ou par e-mail à temps. Notez un appel (même « Pas de réponse ») et cela change.'],
      ),
      tip('Toujours bloqué ? Ouvrez un ticket depuis Tickets de support et donnez-nous le numéro de l’acheteur qui figure dans l’adresse web.'),
    ],
  },
};
