import { render, h } from 'preact';
import { store } from '@/core/store';
import { actions } from '@/core/actions';

const log = (window as any)._log || console.log;

async function run() {
  try {
    log('Step 1: preact + store loaded OK');
    log('  store.getState().config.apiUrl = ' + store.getState().config.apiUrl);

    actions.setConfig({ apiUrl: 'https://test.com', apiKey: 'test' } as any);
    actions.setLocations([
      { id: 1, name: 'Marbella', slug: 'marbella', level: 'town' as const, propertyCount: 50 },
      { id: 2, name: 'Estepona', slug: 'estepona', level: 'town' as const, propertyCount: 30 },
    ]);
    actions.setLabels({ location: 'Location', all: 'All', select: 'Select...', any: 'Any' } as any);
    actions.setLoading(false);
    log('Step 2: Store primed with test data');

    log('Step 3: Dynamic import of RsLocation...');
    const mod = await import('@/components/search/RsLocation');
    log('Step 3 OK: RsLocation loaded, default=' + typeof mod.default);

    log('Step 4: Rendering...');
    const target = document.getElementById('test-target');
    if (target) {
      render(h(mod.default, { variation: 1 } as any), target);
      log('Step 4 OK: Rendered!');
    }
  } catch (err: any) {
    log('CAUGHT ERROR: ' + (err.stack || err.message || err));
  }
}

run();
