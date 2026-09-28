import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';

interface Props {
  title?: string;
}

export default function RsDetailTitle({ title: titleProp }: Props) {
  const property = useSelector(selectors.getSelectedProperty);
  // "Page Title" from the property's SEO section, when the agent set one.
  const title = titleProp ?? (property?.pageTitle || property?.title);

  if (!title) return null;

  return <h1 class="rs-detail-title">{title}</h1>;
}
