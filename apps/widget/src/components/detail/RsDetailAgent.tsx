import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import type { Agent } from '@/types';

interface Props {
  agent?: Agent;
}

export default function RsDetailAgent({ agent: agentProp }: Props) {
  const property = useSelector(selectors.getSelectedProperty);
  const agent = agentProp ?? property?.agent;

  if (!agent) return null;

  return (
    <div class="rs-detail-agent">
      {agent.photo && (
        <img
          src={agent.photo}
          alt={agent.name}
          class="rs-detail-agent__photo"
        />
      )}
      <div class="rs-detail-agent__info">
        <div class="rs-detail-agent__name">{agent.name}</div>
        {agent.title && (
          <div class="rs-detail-agent__title">{agent.title}</div>
        )}
        {agent.email && (
          <a href={`mailto:${agent.email}`} class="rs-detail-agent__link">
            {agent.email}
          </a>
        )}
        {agent.phone && (
          <a href={`tel:${agent.phone}`} class="rs-detail-agent__link">
            {agent.phone}
          </a>
        )}
      </div>
    </div>
  );
}
