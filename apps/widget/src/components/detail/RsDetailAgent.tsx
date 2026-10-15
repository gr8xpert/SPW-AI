import { useConfig } from '@/hooks/useConfig';
import { useLabels } from '@/hooks/useLabels';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import type { Agent } from '@/types';

interface Props {
  agent?: Agent;
}

const digits = (phone: string) => phone.replace(/[^\d+]/g, '');

/**
 * The agent: the client's Website agent (Settings → Widget) when set, else
 * the listing's own agent (name and photo only — the API sends no more).
 */
export default function RsDetailAgent({ agent: agentProp }: Props) {
  const { t } = useLabels();
  const config = useConfig();
  const property = useSelector(selectors.getSelectedProperty);
  const agent = agentProp ?? (config.siteAgent?.name ? config.siteAgent : property?.agent);

  if (!agent?.name) return null;
  const whatsapp = agent.whatsapp ? digits(agent.whatsapp).replace(/^\+/, '') : '';

  const hasContacts = !!(agent.phone || whatsapp || agent.email);

  return (
    <div class="rs-detail-agent">
      <div class="rs-detail-agent__head">
        {agent.photo ? (
          <img
            src={agent.photo}
            alt={agent.name}
            class="rs-detail-agent__photo"
          />
        ) : (
          <span class="rs-detail-agent__initials" aria-hidden="true">
            {agent.name.split(/\s+/).slice(0, 2).map((w) => w.charAt(0)).join('').toUpperCase()}
          </span>
        )}
        <div class="rs-detail-agent__info">
          <div class="rs-detail-agent__name">{agent.name}</div>
          {agent.title && (
            <div class="rs-detail-agent__title">{agent.title}</div>
          )}
          {hasContacts && (
            <div class="rs-detail-agent__contacts">
              {agent.phone && (
                <a href={`tel:${digits(agent.phone)}`} class="rs-detail-agent__link rs-detail-agent__link--phone">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                  <span>{agent.phone}</span>
                </a>
              )}
              {whatsapp && (
                <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer" class="rs-detail-agent__link rs-detail-agent__link--whatsapp">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  <span>{t('detail_agent_whatsapp', 'WhatsApp')}</span>
                </a>
              )}
              {agent.email && (
                <a href={`mailto:${agent.email}`} class="rs-detail-agent__link rs-detail-agent__link--email">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                  <span>{agent.email}</span>
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
