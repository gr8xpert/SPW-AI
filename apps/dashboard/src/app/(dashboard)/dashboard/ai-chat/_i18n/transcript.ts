'use client';

import { useText } from '@/i18n/i18n-provider';
import type { Dictionaries } from '@/i18n/languages';

// The conversation viewer and the "chat is off" notice on the AI Chat page.
const en = {
  colChat: 'Chat',
  title: (id: number) => `Conversation #${id}`,
  visitor: 'Visitor',
  assistant: 'Assistant',
  usedTool: (name: string) => `Looked up: ${name}`,
  viewing: (ref: string) => `Visitor was viewing ${ref}`,
  loading: 'Loading conversation…',
  loadFailed: 'The conversation could not be loaded.',
  open: 'Read',
  widgetOff: 'The chat is not shown on your website: switch on AI Chat in Settings.',
  widgetOffAdmin: 'The chat is not shown on your website: AI Chatbot is switched off for this client (Super Admin).',
  settingsLink: 'AI Chat settings',
};

export type AiChatTranscriptText = typeof en;

const texts: Dictionaries<AiChatTranscriptText> = {
  en,
  nl: {
    colChat: 'Chat',
    title: (id) => `Gesprek #${id}`,
    visitor: 'Bezoeker',
    assistant: 'Assistent',
    usedTool: (name) => `Opgezocht: ${name}`,
    viewing: (ref) => `Bezoeker bekeek ${ref}`,
    loading: 'Gesprek laden…',
    loadFailed: 'Het gesprek kon niet worden geladen.',
    open: 'Lezen',
    widgetOff: 'De chat staat niet op uw website: zet AI-chat aan in Instellingen.',
    widgetOffAdmin: 'De chat staat niet op uw website: AI Chatbot staat uit voor deze klant (Super Admin).',
    settingsLink: 'AI-chatinstellingen',
  },
  es: {
    colChat: 'Chat',
    title: (id) => `Conversación #${id}`,
    visitor: 'Visitante',
    assistant: 'Asistente',
    usedTool: (name) => `Consultado: ${name}`,
    viewing: (ref) => `El visitante veía ${ref}`,
    loading: 'Cargando conversación…',
    loadFailed: 'No se pudo cargar la conversación.',
    open: 'Leer',
    widgetOff: 'El chat no se muestra en su web: active el chat IA en Ajustes.',
    widgetOffAdmin: 'El chat no se muestra en su web: AI Chatbot está desactivado para este cliente (Super Admin).',
    settingsLink: 'Ajustes del chat IA',
  },
  fr: {
    colChat: 'Chat',
    title: (id) => `Conversation n° ${id}`,
    visitor: 'Visiteur',
    assistant: 'Assistant',
    usedTool: (name) => `Recherche : ${name}`,
    viewing: (ref) => `Le visiteur consultait ${ref}`,
    loading: 'Chargement de la conversation…',
    loadFailed: "La conversation n'a pas pu être chargée.",
    open: 'Lire',
    widgetOff: "Le chat n'apparaît pas sur votre site : activez le chat IA dans les Paramètres.",
    widgetOffAdmin: "Le chat n'apparaît pas sur votre site : AI Chatbot est désactivé pour ce client (Super Admin).",
    settingsLink: 'Paramètres du chat IA',
  },
  de: {
    colChat: 'Chat',
    title: (id) => `Gespräch #${id}`,
    visitor: 'Besucher',
    assistant: 'Assistent',
    usedTool: (name) => `Nachgeschlagen: ${name}`,
    viewing: (ref) => `Besucher sah ${ref} an`,
    loading: 'Gespräch wird geladen…',
    loadFailed: 'Das Gespräch konnte nicht geladen werden.',
    open: 'Lesen',
    widgetOff: 'Der Chat erscheint nicht auf Ihrer Website: Schalten Sie den KI-Chat in den Einstellungen ein.',
    widgetOffAdmin: 'Der Chat erscheint nicht auf Ihrer Website: AI Chatbot ist für diesen Kunden aus (Super Admin).',
    settingsLink: 'KI-Chat-Einstellungen',
  },
  fi: {
    colChat: 'Chat',
    title: (id) => `Keskustelu #${id}`,
    visitor: 'Kävijä',
    assistant: 'Avustaja',
    usedTool: (name) => `Haettu: ${name}`,
    viewing: (ref) => `Kävijä katsoi kohdetta ${ref}`,
    loading: 'Ladataan keskustelua…',
    loadFailed: 'Keskustelua ei voitu ladata.',
    open: 'Lue',
    widgetOff: 'Chat ei näy sivustollasi: ota AI-chat käyttöön asetuksista.',
    widgetOffAdmin: 'Chat ei näy sivustollasi: AI Chatbot on pois päältä tällä asiakkaalla (Super Admin).',
    settingsLink: 'AI-chatin asetukset',
  },
  sv: {
    colChat: 'Chatt',
    title: (id) => `Konversation #${id}`,
    visitor: 'Besökare',
    assistant: 'Assistent',
    usedTool: (name) => `Slog upp: ${name}`,
    viewing: (ref) => `Besökaren tittade på ${ref}`,
    loading: 'Laddar konversation…',
    loadFailed: 'Konversationen kunde inte laddas.',
    open: 'Läs',
    widgetOff: 'Chatten visas inte på din webbplats: slå på AI-chatt i Inställningar.',
    widgetOffAdmin: 'Chatten visas inte på din webbplats: AI Chatbot är avstängd för den här kunden (Super Admin).',
    settingsLink: 'AI-chattinställningar',
  },
};

export function useAiChatTranscriptText(): AiChatTranscriptText {
  return useText(texts);
}
