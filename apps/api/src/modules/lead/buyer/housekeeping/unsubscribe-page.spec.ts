import { unsubscribePage } from './unsubscribe-page';

describe('unsubscribePage', () => {
  it('asks first, with a POST button, in the buyer\'s language', () => {
    const html = unsubscribePage({ agency: 'Costa <Homes>', color: '#123456', lang: 'es', state: 'ask' });
    expect(html).toContain('¿Dejar de recibir emails de propiedades de Costa &lt;Homes&gt;?');
    expect(html).toContain('<form method="post"><input type="hidden" name="action" value="unsubscribe">');
    expect(html).toContain('noindex');
  });

  it('after unsubscribing offers to subscribe again', () => {
    const html = unsubscribePage({ agency: 'A', color: 'red;}', lang: 'xx', state: 'unsubscribed' });
    expect(html).toContain('You won&#39;t receive property emails from A any more.');
    expect(html).toContain('value="subscribe"');
    expect(html).toContain('#1e293b');
    expect(html).not.toContain('red;}');
  });
});
