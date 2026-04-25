import { useCallback } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useConfig } from '@/hooks/useConfig';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import { actions } from '@/core/actions';

export default function RsChatBubble() {
  const { t } = useLabels();
  const config = useConfig();
  const ui = useSelector(selectors.getUI);

  const handleToggle = useCallback(() => {
    actions.mergeUI({ chatOpen: !ui.chatOpen });
  }, [ui.chatOpen]);

  if (!config.enableAiChat) return null;

  return (
    <button
      type="button"
      class={`rs-chat-bubble${ui.chatOpen ? ' rs-chat-bubble--active' : ''}`}
      onClick={handleToggle}
      aria-label={t('chat_toggle', 'Chat with AI')}
    >
      {ui.chatOpen ? (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      ) : (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      )}
    </button>
  );
}
