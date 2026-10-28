import { p, steps, terms, tip, warn, type GuideTranslation } from '../guide-types';

// The Buyer Match guide in German (Sie). Same sections and blocks as the
// English source (guide-basics.ts, guide-more.ts); labels match buyers/_i18n/de.ts.
export const de: GuideTranslation = {
  what: {
    title: 'Was ist Kontakte?',
    summary: 'Ein kluges Notizbuch für Ihre Käufer und Leads, das die passenden Immobilien für sie findet.',
    blocks: [
      p('Kontakte (das Add-on Buyer Match) ist ein Notizbuch für jede Person, die bei Ihnen eine Immobilie kaufen (oder mieten) möchte, und für Verkäufer, Vermieter und andere Menschen, mit denen Sie arbeiten. Für jede Person notieren Sie, wer sie ist und was sie sucht.'),
      p('Den langweiligen Teil erledigt dann der Computer. Er prüft jede Immobilie auf Ihrer Website und zeigt Ihnen die, die zu jedem Käufer passen. Sie wählen die besten aus und senden sie mit einem Klick per E-Mail.'),
      p('Der Käufer bekommt eine private Webseite mit diesen Immobilien. Dort kann er „Gefällt“, „Nichts für mich“ oder „Ich möchte sie besichtigen“ drücken. Sie sehen jeden Klick und wissen so, wer wirklich Interesse hat.'),
      p('Außerdem behält Ihr Team jeden Lead im Blick: wer wen angerufen hat, wer noch auf einen Anruf wartet und welche Besichtigungen gebucht sind. Der Lead-Bericht zeigt alles in einer Tabelle, wie die Tabelle, die viele Agenturen früher von Hand geführt haben.'),
      tip('Wer auf Ihrer Website oder in einem Facebook-Lead-Formular ein Formular ausfüllt oder in Calendly bucht, landet unter Neue Leads (linkes Menü). Geben Sie dort jeder Person eine Rolle, dann kommt sie zu Ihren Kontakten. Sie müssen nichts abtippen.'),
    ],
  },
  'quick-start': {
    title: 'Schnellstart in 5 Schritten',
    summary: 'Der kürzeste Weg vom neuen Käufer zur gesendeten E-Mail.',
    blocks: [
      steps(
        'Öffnen Sie den Tab Kontakte und drücken Sie „Neuer Kontakt“. Geben Sie einen Namen und eine E-Mail-Adresse ein und drücken Sie dann „Kontakt hinzufügen“.',
        'Öffnen Sie den Käufer und gehen Sie zum Tab Suchprofil. Wählen Sie, was er möchte: mieten oder kaufen, die Orte, die Art der Immobilie und das Budget. Drücken Sie „Suchprofil speichern“.',
        'Öffnen Sie den Tab Treffer. Jetzt sehen Sie jede passende Immobilie, die besten oben.',
        'Haken Sie die Immobilien an, die Ihnen gefallen, und drücken Sie „Auswahl senden“. Prüfen Sie die Vorschau der E-Mail und drücken Sie „E-Mail senden“.',
        'Warten Sie auf die Reaktion des Käufers. „Gefällt“, „Nichts für mich“ und Besichtigungswünsche erscheinen beim Käufer, unter Aktivität und auf „Mein Tag“.',
      ),
      tip('Bitten Sie Ihren Manager vor Ihrer ersten E-Mail, unter Einstellungen → Allgemein → „Immobilien-Links in E-Mails“ auszufüllen. Ohne diese Angabe können die E-Mails nicht auf Ihre Immobilienseiten verlinken.'),
    ],
  },
  words: {
    title: 'Wörter, die Sie sehen werden',
    summary: 'Ein kleines Wörterbuch der Begriffe in Buyer Match.',
    blocks: [
      terms(
        ['Kontakt', 'Jede Person in Ihrer Liste: ein Käufer, Verkäufer, Vermieter, Mieter oder ein anderer Makler. Die „Kontaktart“ sagt, was zutrifft. In dieser Anleitung meint „Käufer“ jeden Kontakt.'],
        ['Lead', 'Ein neuer Kontakt, der noch angerufen werden muss. Der Lead-Bericht verfolgt ihn, bis ihn jemand erreicht.'],
        ['Nachverfolgung', 'Wie weit das Team mit einem Lead ist: nicht kontaktiert, noch nicht erreicht, zurückrufen, falsche Nummer oder erreicht.'],
        ['Überfällig', 'Ein Lead, den niemand rechtzeitig kontaktiert hat (24 Stunden, sofern Ihr Manager das nicht geändert hat). Er wird rot.'],
        ['Makler', 'Die Person in Ihrem Team, die sich um diesen Käufer kümmert. „Weitere Makler“ sind Kollegen, die mithelfen.'],
        ['Phase', 'Wie weit der Käufer ist, etwa „Neu“, „Besichtigung“ oder „Gewonnen“. Die Phasen sind die Spalten des Boards.'],
        ['Suchprofil', 'Was der Käufer sucht.'],
        ['Muss-Kriterien', 'Die vier Dinge, die eine Immobilie erfüllen muss: Angebotsart, Gebiet, Immobilientyp und Budget.'],
        ['Wünsche', 'Schönes Extra wie Schlafzimmer, Größe, Pool oder Meerblick. Sie heben die Punktzahl, verstecken aber nie eine Immobilie.'],
        ['Punktzahl', 'Eine Zahl, die zeigt, wie gut eine Immobilie passt. Höher ist besser.'],
        ['Heißer Käufer', 'Jemand, der zuletzt sehr aktiv war: „Gefällt“, Besichtigungswünsche, Klicks und Anfragen.'],
        ['Käuferseite', 'Eine private Webseite für einen Käufer mit allen Immobilien, die Sie ihm gesendet haben.'],
        ['Benachrichtigung', 'Eine Nachricht, die auf Ihr OK wartet, wenn ein neues Angebot oder eine Preissenkung zu einem Käufer passt.'],
      ),
    ],
  },
  list: {
    title: 'Die Kontaktliste',
    summary: 'Finden Sie jeden Käufer schnell mit Suche, Filtern und Sortierung.',
    linkLabel: 'Kontaktliste öffnen',
    blocks: [
      p('Der Tab Kontakte zeigt alle, die Sie sehen dürfen. Jede Karte zeigt Name, Kontaktart, E-Mail, Makler, Phase, Sterne und wann zuletzt etwas passiert ist.'),
      terms(
        ['Suche', 'Geben Sie einen Teil eines Namens, einer E-Mail-Adresse oder einer Telefonnummer ein.'],
        ['Filter', 'Zeigen Sie nur eine Kontaktart, einen Makler, eine Phase, eine Priorität, eine Quelle oder eine Antwort auf eine Ihrer Fragen. Drücken Sie „Zurücksetzen“, um wieder alle zu sehen.'],
        ['Heiße Käufer', 'Schalten Sie das ein, um nur die aktivsten Käufer zu sehen.'],
        ['Keine aktuelle Aktivität', 'Zeigt Käufer, mit denen schon länger niemand gesprochen hat. So wird niemand vergessen.'],
        ['Sortieren', 'Nach letzter Aktivität, Neueste, Name oder Priorität.'],
        ['Karten / Liste', 'Zwei Ansichten derselben Käufer: große Karten oder eine kompakte Tabelle.'],
        ['CSV exportieren', 'Manager können die Liste (mit Ihren Filtern) herunterladen und in Excel öffnen.'],
      ),
      tip('Die Filter stehen in der Webadresse. Kopieren Sie den Link, dann sieht ein Kollege genau dieselbe Liste.'),
    ],
  },
  'new-buyer': {
    title: 'Einen Kontakt hinzufügen',
    summary: 'Von Hand, über Ihre Website, aus Facebook-Werbung, über Calendly oder aus einer Odoo-Datei.',
    blocks: [
      terms(
        ['Von Hand', 'Drücken Sie „Neuer Kontakt“, geben Sie Name und E-Mail ein und wählen Sie Kontaktart und Makler. Eine E-Mail-Adresse = ein Käufer. So können Sie dieselbe Person nicht zweimal anlegen.'],
        ['Über Ihre Website', 'Anfragen, das Suchprofil-Formular und „Meine Favoriten mailen“ legen einen Käufer von selbst an oder aktualisieren ihn. Neue Personen warten unter Neue Leads.'],
        ['Aus Facebook- und Instagram-Werbung', 'Lead-Formulare Ihrer Werbung kommen alle 15 Minuten herein, sobald ein Manager sie in den Einstellungen verbunden hat. Antworten, die zu einer Ihrer Käuferfragen passen, werden für Sie eingetragen.'],
        ['Über Calendly', 'Bucht jemand im Calendly eines Maklers, kommt er als neuer Lead herein, mit der Besichtigung schon geplant (siehe „Kalender und Calendly“).'],
        ['Aus Odoo', 'Manager können alle bisherigen Käufer über den Tab Import übernehmen.'],
      ),
      p('Neue Käufer von der Website gehen an einen Makler oder abwechselnd an mehrere Makler („Round-Robin“). Ein Manager legt das unter Einstellungen → Allgemein fest.'),
    ],
  },
  'new-leads': {
    title: 'Neue Leads',
    summary: 'Alle, die von selbst gekommen sind, warten hier, bis Sie ihnen eine Rolle geben.',
    linkLabel: 'Neue Leads öffnen',
    blocks: [
      p('Neue Leads (linkes Menü) ist der Posteingang für Personen, die sich von selbst bei Ihnen gemeldet haben: über ein Formular auf der Website, ein Lead-Formular von Facebook oder Instagram oder eine Buchung in Calendly. Die rote Zahl zeigt, wie viele warten.'),
      steps(
        'Öffnen Sie Neue Leads. Jede Zeile zeigt die Person, das ausgefüllte Formular und ihre Nachricht.',
        'Antworten Sie zuerst, wenn Sie möchten: „Antworten“ für eine E-Mail oder der WhatsApp-Knopf.',
        'Wählen Sie eine Rolle (Käufer, Verkäufer, Mieter…) und drücken Sie „Zu Kontakten hinzufügen“. Die Person kommt mit allem, was sie gesendet hat, in Ihre Kontaktliste.',
      ),
      terms(
        ['Löschen', 'Nur für Spam oder Tests. Der Lead und seine Nachrichten sind endgültig weg.'],
        ['Als erledigt markieren', 'Agenturen ohne das Add-on Buyer Match nutzen Neue Leads als einfachen Posteingang: antworten und dann als erledigt markieren.'],
      ),
      tip('Neue Leads erscheinen auch sofort im Lead-Bericht. Ein Lead, den niemand anruft, wird dort rot.'),
      tip("Mehr als eine Website? Geben Sie jeder einen eigenen Website-Schlüssel (Einstellungen → API-Schlüssel). Ihre Anfragen nennen dann die Website und können an deren eigene E-Mail-Adresse gehen."),
    ],
  },
  record: {
    title: 'Die Akte eines Käufers',
    summary: 'Der obere Teil der Seite: Art, Phase, Sterne, Makler, WhatsApp und Datenschutz.',
    blocks: [
      p('Klicken Sie auf einen Käufer, um seine Akte zu öffnen. Der obere Teil ist immer sichtbar, egal in welchem Tab Sie sind.'),
      terms(
        ['Kontaktart', 'Käufer, Verkäufer, Vermieter, Mieter, Fachkontakt und mehr.'],
        ['Phase', 'Wo der Käufer in Ihrem Ablauf steht. Ändern Sie sie hier oder ziehen Sie die Karte auf dem Board.'],
        ['Prioritätssterne', 'Geben Sie den wichtigsten Käufern 1 bis 3 Sterne. Klicken Sie erneut auf den letzten leuchtenden Stern, um einen Stern wegzunehmen.'],
        ['Makler und weitere Makler', 'Wer sich um diesen Käufer kümmert und wer sonst noch hilft.'],
        ['WhatsApp', 'Schreibt eine WhatsApp-Nachricht für Sie und öffnet Ihr eigenes WhatsApp (siehe „WhatsApp-Nachrichten“).'],
        ['Datenschutz', 'Einwilligung, Abmeldung und Löschen. Siehe „Datenschutz und einen Käufer löschen“ weiter unten.'],
        ['Zusammenfassung', 'Mit eingeschalteter KI drei kurze Zeilen, die sagen, wer dieser Käufer ist und was er möchte.'],
      ),
      p('Unter dem oberen Teil liegen die Tabs: Details, Suchprofil, Treffer, Beinahe-Treffer, Vorgeschlagen, Kontakte, Interne Notizen, Reisen & Besichtigungen, Aufgaben, Dateien, Aktivität und Verlauf.'),
    ],
  },
  details: {
    title: 'Tab Details',
    summary: 'Kontaktdaten, Foto, Ihre eigenen Fragen, Ausweis und Angaben zum Geschäft.',
    blocks: [
      terms(
        ['Kontakt', 'Name, E-Mail, Telefonnummern, Sprache, bevorzugter Kontaktweg, Adresse und ein Foto. Die Sprache bestimmt, in welcher Sprache die E-Mails ankommen.'],
        ['Foto', 'Laden Sie ein Foto hoch (JPG, PNG oder WebP) und drücken Sie dann „Speichern“ auf der Karte.'],
        ['Fragen zum Käufer', 'Ihre eigenen Fragen, etwa „Ist das ein Zweitwohnsitz?“. Ihr Manager legt sie unter Einstellungen → Fragen an. Sie können die Liste nach den Antworten filtern.'],
        ['Identität und Rechtliches', 'Ausweisart und -nummer und der Anwalt des Käufers, für den Fall, dass ein Kauf ernst wird.'],
        ['Pipeline', 'Unterstatus, der Geschäftswert, seit wann Sie auf eine Antwort warten und wer den Käufer empfohlen hat (mit Prozentsatz).'],
      ),
      tip('Jede Karte hat ihren eigenen Speichern-Knopf. Ändern Sie, was nötig ist, und drücken Sie dann „Speichern“ auf dieser Karte.'),
    ],
  },
  wishlist: {
    title: 'Suchprofil: was der Käufer möchte',
    summary: 'Muss-Kriterien entscheiden, ob eine Immobilie passt. Wünsche entscheiden, wie gut.',
    blocks: [
      p('Das Suchprofil ist das Herz von Buyer Match. Je besser Sie es ausfüllen, desto besser die Treffer.'),
      terms(
        ['Angebotsart', 'Bestandsimmobilie, Neubauprojekt, Langzeitmiete oder Ferienvermietung.'],
        ['Orte oder Gebiete', 'Wählen Sie ein Gebiet, dann zählt jeder Ort darin mit.'],
        ['Immobilientypen', 'Wählen Sie „Villa“, dann zählt jede Art von Villa mit.'],
        ['Budget', 'Von und bis. Eine Immobilie außerhalb des Budgets wird nie vorgeschlagen.'],
        ['Schlafzimmer, Bäder, Größen', 'Das Minimum, das der Käufer möchte.'],
        ['Merkmale und Wünsche', 'Pool, Meerblick, Garage und so weiter. Sie schieben eine Immobilie nach oben, verstecken sie aber nie.'],
        ['Passende Immobilien senden an', 'Den Käufer, den Makler oder beide.'],
      ),
      warn('Muss-Kriterien sind streng. Wenn Sie nur einen kleinen Ort und ein niedriges Budget wählen, bekommen Sie vielleicht gar keine Treffer. Machen Sie das Gebiet oder das Budget etwas größer.'),
      tip('Kam der Käufer über eine Anfrage auf der Website, ist das Suchprofil vielleicht aus der angefragten Immobilie geschätzt. Prüfen Sie es, ändern Sie es und drücken Sie dann „Speichern“.'),
    ],
  },
  matched: {
    title: 'Treffer und Beinahe-Treffer',
    summary: 'Die passenden Immobilien, die besten zuerst, und die, die fast passen.',
    blocks: [
      p('Treffer zeigt jede Immobilie der Website, die alle Muss-Kriterien erfüllt. Die beste Punktzahl steht oben. Jede Zeile zeigt, welche Wünsche erfüllt sind.'),
      steps(
        'Haken Sie die gewünschten Immobilien an.',
        'Drücken Sie „Auswahl senden“, um sie jetzt zu mailen, oder „Zu Vorgeschlagen hinzufügen“, um sie für später aufzuheben.',
      ),
      p('Immobilien, die Sie schon gesendet haben oder die der Käufer abgelehnt hat, sind ausgeblendet. So geht nichts doppelt hinaus. Drücken Sie „Alle anzeigen“, um sie wieder zu sehen.'),
      p('Beinahe-Treffer sind Immobilien, die nur ein Muss-Kriterium knapp verfehlen: zum Beispiel 5 % über dem Budget oder im Nachbarort. Bei jeder steht, warum sie nicht passt. Ein Manager legt fest, wie viel „knapp“ ist.'),
    ],
  },
  suggested: {
    title: 'Vorgeschlagene Immobilien',
    summary: 'Ihre handverlesene Auswahl für diesen Käufer.',
    blocks: [
      p('Vorgeschlagen ist Ihre Auswahlliste. Fügen Sie Immobilien aus Treffer hinzu oder geben Sie eine Referenz wie R1234567 ein und drücken Sie „Hinzufügen“.'),
      terms(
        ['Status', 'Vorgeschlagen, Gesendet, Besichtigt, Interessiert oder Kein Interesse.'],
        ['Notiz', 'Eine private Notiz. Nur Ihr Team sieht sie.'],
        ['Link zum virtuellen Rundgang', 'Ein Link zu einer Videotour, der mitgeschickt wird.'],
        ['Besichtigungsdatum', 'Wann der Käufer die Immobilie ansieht.'],
        ['PDF herunterladen', 'Ein ordentliches PDF der Auswahl (oder nur der angehakten) zum Drucken oder Anhängen.'],
        ['Zeitleiste', 'Für jede gesendete Immobilie: Gesendet, Geöffnet, Geklickt, Gefällt, Nichts für mich, Besichtigung, Angebot.'],
      ),
      tip('Sie können selbst eintragen, was passiert ist, zum Beispiel „Besichtigung“ oder „Angebot“, wenn der Käufer es Ihnen am Telefon gesagt hat.'),
    ],
  },
  sending: {
    title: 'Immobilien per E-Mail senden',
    summary: 'Eine E-Mail mit Ihrem Branding in der Sprache des Käufers, mit seiner privaten Seite.',
    blocks: [
      steps(
        'Wählen Sie Immobilien in Treffer oder Vorgeschlagen aus und drücken Sie „Auswahl senden“.',
        'Wählen Sie, wer sie bekommt: der Käufer, der Makler oder beide.',
        'Wählen Sie die Sprache und fügen Sie bei Bedarf eine persönliche Nachricht hinzu („Mit KI schreiben“ kann sie für Sie schreiben).',
        'Sehen Sie sich die Vorschau an und drücken Sie dann „E-Mail senden“.',
      ),
      p('Jede E-Mail enthält einen Link zur privaten Seite des Käufers. Dort kann er bei einer Immobilie „Gefällt“ drücken, „Nichts für mich“ sagen (mit Grund) oder eine Besichtigung anfragen. Sie bekommen dann eine E-Mail.'),
      p('Sie können die Seite ausschalten, einen neuen Link erstellen (der alte funktioniert dann nicht mehr) oder den Link auf der Karte „Käuferseite“ kopieren.'),
      warn('„Geöffnet“ stimmt nicht immer: Manche E-Mail-Programme öffnen Bilder von selbst. Ein Klick oder ein „Gefällt“ ist ein viel besseres Zeichen.'),
    ],
  },
  whatsapp: {
    title: 'WhatsApp-Nachrichten',
    summary: 'Eine fertige Nachricht in der Sprache des Käufers, gesendet über Ihr eigenes WhatsApp.',
    blocks: [
      p('Der grüne WhatsApp-Knopf (bei einem Käufer, unter Neue Leads, bei einer Besichtigung, bei einer Aufgabe, im Lead-Bericht) schreibt die Nachricht für Sie in der Sprache des Käufers. Prüfen Sie sie, drücken Sie „WhatsApp öffnen“ und senden Sie sie über Ihr eigenes WhatsApp auf dem Handy oder Computer.'),
      terms(
        ['Immobilien', 'Aus Treffer oder Vorgeschlagen: die Immobilien mit Links zu Ihrer Website und zur Käuferseite. Klicks werden wie bei einer E-Mail verfolgt.'],
        ['Antwort auf eine Anfrage', 'Aus Neue Leads: eine freundliche Antwort zu der Immobilie, nach der er gefragt hat.'],
        ['Besichtigung', 'Aus einer geplanten Besichtigung: Tag, Uhrzeit, Immobilie und Treffpunkt mit einem Link zur Karte.'],
        ['Nachfassen', 'Bei einem Käufer oder einer Aufgabe: eine kurze Nachricht, wie es ihm geht und wie weit er ist.'],
        ['Meinen Buchungslink hinzufügen', 'Wenn Ihre Agentur Calendly nutzt, fügt das Ihre Buchungsseite hinzu. So wählt der Käufer selbst einen Termin.'],
      ),
      p('Jede Nachricht, die Sie öffnen, zählt als Kontakt mit dem Käufer: Sie erscheint unter Aktivität und im Lead-Bericht.'),
      p('Die Nachricht endet mit dem Namen des Maklers, einem WhatsApp-Link und der E-Mail, so erreicht der Käufer den Makler mit einem Tipp. Die Angaben kommen aus Verwaltung → Makler (WhatsApp, sonst Telefon; öffentliche E-Mail, sonst Login-E-Mail). Geben Sie auch beim Makler die Ländervorwahl an.'),
      warn('Die Telefonnummer braucht die Ländervorwahl (+34…, +49…). Ohne sie findet WhatsApp die Person nicht; das Fenster warnt Sie.'),
    ],
  },
  ai: {
    title: 'KI-Helfer',
    summary: 'Lassen Sie die KI Nachrichten lesen, Notizen schreiben und Muster erkennen. Sie prüfen immer zuerst.',
    blocks: [
      p('Die KI-Helfer nutzen den eigenen KI-Schlüssel (OpenRouter oder Anthropic) Ihrer Agentur (Einstellungen → KI). Nichts, was die KI vorschlägt, wird gespeichert, bevor Sie „Speichern“ drücken.'),
      terms(
        ['Nachricht einfügen', 'Fügen Sie eine E-Mail oder WhatsApp-Nachricht des Käufers ein. Die KI liest, was er möchte, und schlägt Änderungen am Suchprofil vor.'],
        ['Sprachnotiz', 'Sprechen Sie nach einem Anruf bis zu 30 Sekunden. Die KI schreibt die Notiz für Sie. Die Aufnahme wird nicht gespeichert.'],
        ['Regeln aus den Notizen', 'Schreiben Sie in Interne Notizen, worauf der Käufer besteht oder was er ablehnt („kein Erdgeschoss“). Die KI macht daraus Regeln. Eine Immobilie, die eine Regel bricht, bekommt weniger Punkte und einen Hinweis. Sie wird nie versteckt.'],
        ['Zusammenfassung', 'Drei kurze Zeilen über den Käufer oben in der Akte.'],
        ['Was das Feedback zeigt', 'Nach einigen „Gefällt“ und Ablehnungen zeigt die KI Muster, etwa „4 Erdgeschosse abgelehnt“, und bietet an, eine Regel hinzuzufügen.'],
        ['Mit KI schreiben', 'Ein kurzer, freundlicher Einstieg für Ihre E-Mail.'],
      ),
      tip('„Muss“-Regeln senken eine Immobilie, die sie bricht, um 40 Punkte, „Bevorzugt“-Regeln um 15.'),
    ],
  },
  'more-tabs': {
    title: 'Notizen, Reisen, Aufgaben, Dateien und Verlauf',
    summary: 'Alles andere, was Sie über einen Käufer festhalten.',
    blocks: [
      terms(
        ['Kontakte', 'Weitere beteiligte Personen: ein Partner, ein Familienmitglied oder eine Assistenz, mit Telefon und E-Mail.'],
        ['Interne Notizen', 'Freie Notizen, die nur Ihr Team sieht. Die KI kann sie lesen und daraus Regeln machen.'],
        ['Reisen & Besichtigungen', 'Legen Sie eine Reise an, wenn der Käufer in die Gegend kommt, und fügen Sie ihr Besichtigungen hinzu. Der Käufer kann einen Reiseplan per E-Mail (mit Kalenderdatei) oder als PDF bekommen, und der Makler bekommt vor jeder Besichtigung eine Erinnerung. Der Kalender-Knopf bei einer Besichtigung trägt sie in Google Kalender ein oder lädt sie für Outlook und iPhone herunter.'],
        ['Aufgaben', 'Dinge, die zu tun sind, etwa „Am Freitag zurückrufen“, mit Frist und zuständiger Person. Überfällige Aufgaben erscheinen rot.'],
        ['Dateien', 'Bilder und PDFs bis 20 MB, etwa eine Passkopie oder ein unterschriebenes Angebot.'],
        ['Aktivität', 'Ein Tagebuch: Anrufe (mit Ergebnis), WhatsApps, E-Mails, Besichtigungen, Website-Besuche und Benachrichtigungen. Mit „Aktivität erfassen“ tragen Sie einen Anruf oder ein Treffen ein.'],
        ['Verlauf', 'Jede Änderung am Käufer: wer was wann geändert hat. Nichts bleibt ein Rätsel.'],
      ),
      tip('Markieren Sie eine Besichtigung danach als „Erledigt“ und notieren Sie das Feedback des Käufers. Das hilft dem nächsten Makler und der KI.'),
    ],
  },
  'my-day': {
    title: 'Mein Tag und Heute zu tun',
    summary: 'Öffnen Sie diese jeden Morgen zuerst.',
    linkLabel: 'Mein Tag öffnen',
    blocks: [
      p('„Mein Tag“ ist Ihre Morgenseite. Sie zeigt Ihre Pipeline, Leads, die niemand rechtzeitig angerufen hat, überfällige Aufgaben, Aufgaben für heute, Besichtigungen der nächsten 7 Tage, Käufer, auf deren Antwort Sie warten, Ihre heißen Käufer und Benachrichtigungen zum Genehmigen.'),
      p('„Heute zu tun“ listet alle heute fälligen Aufgaben (überfällige zuerst) und Käufer, mit denen schon länger niemand gesprochen hat.'),
      tip('Schalten Sie auf Mein Tag „Tägliche E-Mail mit dieser Übersicht“ ein, dann landet dieselbe Liste jeden Morgen in Ihrem Postfach, auch mit den Leads, die Sie noch nicht angerufen haben.'),
    ],
  },
  'lead-report': {
    title: 'Lead-Bericht',
    summary: 'Jeder Lead, wer ihn angerufen hat und wie es lief. Er füllt sich von selbst.',
    linkLabel: 'Lead-Bericht öffnen',
    blocks: [
      p('Der Lead-Bericht ersetzt die Tabelle, in die Makler „einmal angerufen, nicht erreicht“ geschrieben haben. Jeder Lead ist eine Zeile, und die Nachverfolgung ergibt sich aus dem, was das Team wirklich getan hat: Anrufe, WhatsApps, E-Mails und Besichtigungen.'),
      terms(
        ['Nachverfolgung', 'Nicht kontaktiert (rot, wenn überfällig), noch nicht erreicht, zurückrufen, falsche Nummer oder erreicht. Darunter: wie viele Anrufe, WhatsApps und E-Mails, und wie lange es bis zum ersten Kontakt gedauert hat.'],
        ['Anruf erfassen', 'Drücken Sie nach einem Anruf „Anruf erfassen“ und wählen Sie, wie es lief: erreicht, nicht erreicht, später zurückrufen oder falsche Nummer. Fügen Sie bei Bedarf eine Notiz hinzu.'],
        ['Spalten', 'Eingegangen, Telefon und E-Mail, Makler, Phase, erster Kontakt, Termin (die nächste Besichtigung), letzte Notiz, ihre Anfrage, Budget und Objektart. Phase und Makler können Sie direkt in der Zeile ändern.'],
        ['Käuferfragen', 'Manager drücken „Spalten“, um einige Ihrer Käuferfragen (etwa „Wann möchten Sie kaufen?“) als Spalten zu zeigen. Makler füllen sie direkt in der Zeile aus; Antworten aus Facebook-Formularen werden für Sie eingetragen.'],
        ['Pro Makler', 'Oben eine Zeile pro Makler: Leads, nicht kontaktiert, überfällig, kontaktiert, erreicht, Zeit bis zum ersten Kontakt, Anrufe, WhatsApps, E-Mails, Besichtigungen, gewonnen, verloren, gewonnener Wert und Konversion. Klicken Sie auf einen Namen oder eine rote Zahl, um die Tabelle zu filtern.'],
        ['CSV exportieren', 'Manager können die ganze Tabelle herunterladen und in Excel öffnen.'],
      ),
      tip('Makler sehen nur ihre eigenen Leads und ihre eigene Zeile. Ein Lead, den niemand rechtzeitig kontaktiert, erscheint auch auf Mein Tag und in der täglichen E-Mail des Maklers.'),
    ],
  },
  board: {
    title: 'Das Board',
    summary: 'Alle Käufer als Karten in Spalten, eine Spalte pro Phase.',
    linkLabel: 'Board öffnen',
    blocks: [
      p('Das Board ist wie Haftnotizen an einer Wand. Jede Spalte ist eine Phase. Ziehen Sie einen Käufer in die nächste Spalte, wenn er weiterkommt.'),
      p('Die Filter funktionieren auch hier. So sehen Sie zum Beispiel nur Ihre eigenen Käufer oder nur die heißen.'),
    ],
  },
  alerts: {
    title: 'Benachrichtigungen: neue Angebote und Preissenkungen',
    summary: 'Das System findet neue Treffer für Sie. Sie sagen Ja oder Nein.',
    linkLabel: 'Benachrichtigungen öffnen',
    blocks: [
      p('Wenn eine neue Immobilie hereinkommt oder ein Preis sinkt, prüft das System jeden Käufer. Passt sie zu jemandem, wartet eine Benachrichtigung im Tab Benachrichtigungen auf Sie. Die rote Zahl am Tab zeigt, wie viele.'),
      steps(
        'Öffnen Sie Benachrichtigungen. Jede Zeile zeigt den Käufer, die Immobilie und die Punktzahl.',
        'Drücken Sie „Genehmigen“ für die guten und „Ablehnen“ für den Rest. „Alle genehmigen“ erledigt alle auf einmal.',
        'Genehmigte Benachrichtigungen werden gesendet, entweder sofort oder in einer täglichen E-Mail pro Käufer (das entscheidet Ihr Manager).',
      ),
      warn('Ohne Ihr OK wird nichts gesendet. Wenn Sie nie genehmigen, bekommen Käufer nie Benachrichtigungen.'),
    ],
  },
  calendar: {
    title: 'Kalender und Calendly',
    summary: 'Ihre Besichtigungen in Google Kalender, und Käufer, die selbst einen Termin buchen.',
    linkLabel: 'Kalender-Einstellungen öffnen',
    blocks: [
      p('Unter Einstellungen → Kalender hat jeder Nutzer einen privaten Kalenderlink. Fügen Sie ihn einmal in Google Kalender (Weitere Kalender → + → Per URL), Outlook oder Ihrem iPhone hinzu, dann erscheinen Ihre Besichtigungen dort. Der Link eines Maklers enthält seine eigenen Besichtigungen; der Link eines Managers die des ganzen Teams, mit dem Namen des Maklers in jedem Titel.'),
      warn('Google entscheidet, wann es den Link neu liest: meist innerhalb weniger Stunden, manchmal erst nach einem Tag. Brauchen Sie eine Besichtigung sofort? Nutzen Sie dann den Kalender-Knopf bei der Besichtigung.'),
      p('Calendly ist eine Buchungsseite, auf der der Käufer einen freien Termin im Kalender des Maklers wählt. Ein Manager verbindet Ihr Calendly-Konto einmal unter Einstellungen → Kalender.'),
      terms(
        ['Ein Käufer bucht', 'Beim richtigen Kontakt erscheint eine Besichtigung mit Makler und Uhrzeit, und der Lead zählt im Lead-Bericht als erreicht.'],
        ['Jemand Neues bucht', 'Die Person kommt unter Neue Leads herein, schon dem Makler zugewiesen, bei dem sie gebucht hat. Ihre Antworten in Calendly füllen Ihre Käuferfragen aus.'],
        ['Verschieben oder absagen', 'Die Besichtigung wandert zum neuen Termin oder wird als abgesagt markiert, mit dem Grund.'],
        ['Den Link senden', 'Haken Sie in einer WhatsApp-Nachricht „Meinen Buchungslink hinzufügen“ an oder kopieren Sie ihn mit dem Kalender-Knopf im Lead-Bericht. Name und E-Mail des Käufers sind schon ausgefüllt.'],
      ),
      tip('Buchungen kommen nur mit einem bezahlten Calendly-Tarif (Standard oder höher) automatisch an. Im kostenlosen Tarif funktionieren die Buchungslinks trotzdem, aber Sie tragen die Besichtigung selbst ein. Makler werden per E-Mail zugeordnet: Nutzen Sie in Calendly dieselbe E-Mail wie hier.'),
    ],
  },
  reverse: {
    title: 'Käufer für diese Immobilie',
    summary: 'Gehen Sie von einer Immobilie aus und finden Sie jeden Käufer, dem sie gefallen könnte.',
    blocks: [
      p('Öffnen Sie eine Immobilie unter Immobilien. Die Karte „Käufer für diese Immobilie“ zählt jeden Käufer, dessen Suchprofil passt.'),
      p('Drücken Sie „Käufer ansehen“, um zu sehen, wer das ist, und dann „An alle senden“ oder senden Sie an die angehakten. Käufer, die sie schon bekommen oder abgelehnt haben, werden übersprungen.'),
      tip('Ideal für ein neues Angebot oder eine Preissenkung, die Sie schnell bekannt machen wollen.'),
    ],
  },
  reports: {
    title: 'Pipeline & Umsatz',
    summary: 'Wie es der Agentur geht, in Zahlen und Diagrammen.',
    linkLabel: 'Pipeline & Umsatz öffnen',
    blocks: [
      terms(
        ['Neue Käufer', 'Wie viele hereinkamen, pro Monat und pro Quelle (Website, Telefon, Facebook…).'],
        ['Gewonnen und verloren', 'Wie viele Käufer gekauft haben und wie viele Sie verloren haben.'],
        ['Wert der offenen Pipeline', 'Der gesamte Geschäftswert der Käufer, die noch laufen.'],
        ['Erwarteter Umsatz', 'Geschäftswerte mal die Chance jeder Phase. Eine faire Schätzung dessen, was kommt.'],
        ['Pipeline-Trichter', 'Wie viele neue Käufer jede Phase erreicht haben.'],
        ['Pro Makler', 'Leads, Nachverfolgung, Abschlüsse, gewonnener Wert und Konversion pro Makler stehen im Lead-Bericht.'],
      ),
    ],
  },
  settings: {
    title: 'Einstellungen',
    summary: 'Wie Buyer Match für Ihre ganze Agentur funktioniert.',
    linkLabel: 'Einstellungen öffnen',
    blocks: [
      p('Nur der Inhaber der Agentur oder ein Manager kann diese ändern. Makler können sie ansehen.'),
      terms(
        ['Allgemein', 'Dürfen Makler die Käufer der anderen sehen? Wer bekommt neue Käufer von der Website? Nach wie vielen Tagen gilt ein Käufer als „vergessen“? Erinnerungen an Besichtigungen, die Uhrzeit der täglichen E-Mail, die Punktzahl für heiße Käufer, nach wie vielen Stunden ein nicht angerufener Lead rot wird, die Adresse der Immobilien-Links und die Adresse der Käuferseite.'],
        ['Phasen', 'Die Spalten Ihres Boards. Hinzufügen, umbenennen, einfärben, neu ordnen und die Chance in % für jede festlegen. Beim Löschen einer Phase werden Sie gefragt, wohin ihre Käufer sollen.'],
        ['Fragen', 'Ihre eigenen Fragen zu Käufern. Sie können sie im Suchprofil-Formular der Website und als Spalten im Lead-Bericht zeigen und übersetzen. Formulieren Sie die Optionen wie in Ihrem Facebook-Formular, dann werden dessen Antworten von selbst eingetragen.'],
        ['Gewichtung', 'Wie stark jeder Wunsch in der Punktzahl zählt, von 0 (gar nicht) bis 10 (sehr stark). Einem Merkmal, etwa Meerblick, können Sie ein eigenes Gewicht geben.'],
        ['Benachrichtigungen & Beinahe-Treffer', 'Benachrichtigungen einschalten, „sofort“ oder „tägliche Zusammenfassung“ wählen und festlegen, wie groß eine Preissenkung sein muss. Legen Sie fest, wie weit ein Beinahe-Treffer über dem Budget oder entfernt liegen darf.'],
        ['Datenpflege', 'Mögliche Duplikate finden (gleiche Telefonnummer oder gleicher Name) und zusammenführen. Beim Zusammenführen bleibt alles erhalten, nichts geht verloren.'],
        ['Facebook & Instagram', 'Verbinden Sie die Lead-Formulare Ihrer Werbung, dann kommen neue Leads alle 15 Minuten herein.'],
        ['Kalender', 'Der eigene Kalenderlink jedes Nutzers und (für Manager) die Verbindung zu Calendly.'],
      ),
      warn('Füllen Sie zuerst „Immobilien-Links in E-Mails“ aus. Ohne diese Angabe können E-Mails nicht auf Ihre Immobilienseiten verlinken.'),
    ],
  },
  import: {
    title: 'Aus Odoo importieren',
    summary: 'Übernehmen Sie Ihre bisherigen Käufer aus einer Odoo-Exportdatei.',
    linkLabel: 'Import öffnen',
    blocks: [
      steps(
        'Exportieren Sie Ihre Käufer in Odoo als .xlsx-Datei.',
        'Wählen Sie im Tab Import die Datei und drücken Sie „Datei prüfen“. Noch wird nichts gespeichert.',
        'Sehen Sie sich „Was passieren wird“ an: neue Käufer, aktualisierte Käufer und Werte, die nicht zugeordnet werden konnten.',
        'Wählen Sie für jeden nicht zugeordneten Wert (einen Makler, einen Ort…), was er in SPM bedeutet, oder lassen Sie „Als Notiz behalten“ stehen.',
        'Drücken Sie „Importieren“. Wenn Sie dieselbe Datei noch einmal importieren, werden dieselben Käufer aktualisiert. Es entstehen nie Kopien.',
      ),
    ],
  },
  privacy: {
    title: 'Datenschutz und einen Käufer löschen',
    summary: 'Einwilligung, Abmeldung und Löschen personenbezogener Daten (DSGVO).',
    blocks: [
      p('Jeder Käufer hat oben in seiner Akte einen Knopf „Datenschutz“.'),
      terms(
        ['Einwilligung erfassen', 'Halten Sie fest, dass der Käufer einer Kontaktaufnahme zugestimmt hat, und wie (Website, Telefon, persönlich…).'],
        ['Von Immobilien-E-Mails abmelden', 'Der Käufer bekommt keine Immobilien-E-Mails und Benachrichtigungen mehr. Sein Makler kann ihm weiterhin schreiben. Der Käufer kann das auch selbst über den Link in jeder E-Mail tun.'],
        ['Personenbezogene Daten löschen', 'Für Manager. Entfernt Name, E-Mail, Telefonnummern, Adresse, Ausweis, Notizen, Dateien und Antworten endgültig, und der Käufer verschwindet aus Ihren Listen. Nur anonyme Zahlen bleiben für Pipeline & Umsatz.'],
      ),
      steps(
        'Öffnen Sie den Käufer und drücken Sie „Datenschutz“.',
        'Wählen Sie „Personenbezogene Daten löschen…“.',
        'Geben Sie ERASE in Großbuchstaben ein und drücken Sie „Endgültig löschen“.',
      ),
      warn('Löschen kann nicht rückgängig gemacht werden. Ist der Käufer nur ein Duplikat, führen Sie ihn stattdessen unter Einstellungen → Datenpflege zusammen.'),
    ],
  },
  'who-sees': {
    title: 'Wer was sehen und tun darf',
    summary: 'Makler, Manager und Inhaber.',
    blocks: [
      terms(
        ['Makler', 'Sehen ihre eigenen Käufer (oder alle, wenn der Manager es erlaubt). Können Käufer anlegen, Suchprofile ausfüllen, E-Mails senden, Benachrichtigungen genehmigen und Aufgaben anlegen.'],
        ['Manager und Inhaber', 'Sehen jeden Käufer und haben außerdem Pipeline & Umsatz, Import, CSV-Export, Zusammenführen, Löschen und die Einstellungen.'],
      ),
      p('Personen, die nur auf der Website oder in Buyer Match erscheinen und keinen Login haben, verwalten Sie unter Makler (linkes Menü).'),
    ],
  },
  faq: {
    title: 'Häufige Fragen',
    summary: 'Schnelle Antworten auf die Fragen, die wir am häufigsten hören.',
    blocks: [
      terms(
        ['Warum zeigt Treffer nichts an?', 'Die Muss-Kriterien sind zu eng. Wählen Sie ein größeres Gebiet, mehr Immobilientypen oder ein größeres Budget.'],
        ['Warum fehlt eine gesendete Immobilie unter Treffer?', 'Gesendete und abgelehnte Immobilien sind ausgeblendet, damit niemand sie doppelt bekommt. Drücken Sie „Alle anzeigen“.'],
        ['Die E-Mail hat keine Links zu meiner Website.', 'Ein Manager muss Einstellungen → Allgemein → „Immobilien-Links in E-Mails“ ausfüllen.'],
        ['Die KI-Knöpfe sagen, dass ich einen Schlüssel brauche.', 'Tragen Sie Ihren KI-Schlüssel (OpenRouter oder Anthropic) unter Einstellungen → KI ein (Inhaber oder Manager).'],
        ['Ich habe dieselbe Person zweimal angelegt.', 'Nutzen Sie Einstellungen → Datenpflege → Mögliche Duplikate und führen Sie sie zusammen.'],
        ['Wie entferne ich einen Käufer?', 'Datenschutz → Personenbezogene Daten löschen (Manager). Der Käufer verschwindet endgültig aus Ihren Listen.'],
        ['Ein Käufer sagt, er bekommt zu viele E-Mails.', 'Datenschutz → Von Immobilien-E-Mails abmelden.'],
        ['Mein Kalenderlink zeigt keine Besichtigungen.', 'Der Link eines Maklers enthält nur Besichtigungen, bei denen er der Makler ist (siehe „Makler:“ unter der Besichtigung). Google kann bis zu einem Tag brauchen, um den Link neu zu lesen.'],
        ['Eine Calendly-Buchung ist nicht angekommen.', 'Unter Einstellungen → Kalender muss „Buchungen kommen automatisch an“ stehen (ein bezahlter Calendly-Tarif), und die Calendly-E-Mail des Maklers muss seine E-Mail hier sein.'],
        ['Warum ist ein Lead im Lead-Bericht rot?', 'Niemand hat ihn rechtzeitig angerufen, per WhatsApp angeschrieben oder gemailt. Erfassen Sie einen Anruf (auch „nicht erreicht“), dann ändert es sich.'],
      ),
      tip('Kommen Sie nicht weiter? Öffnen Sie ein Ticket unter Support-Tickets und nennen Sie uns die Nummer des Käufers aus der Webadresse.'),
    ],
  },
};
