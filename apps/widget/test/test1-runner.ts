import { render } from 'preact';
import { h } from 'preact';
import { store } from '@/core/store';
import { actions } from '@/core/actions';

function log(msg: string) {
  const el = document.getElementById('log');
  if (el) {
    el.textContent += msg + '\n';
    el.scrollTop = el.scrollHeight;
  }
  console.log(msg);
}

async function run() {
  log('Step 1: store + actions imported OK');

  log('Step 2: hydrate store with inline data...');
  actions.setLocations([
    { id: 1, name: 'Spain', slug: 'spain', level: 'country', propertyCount: 50 },
    { id: 2, name: 'Marbella', slug: 'marbella', level: 'town', parentId: 1, propertyCount: 30 },
    { id: 3, name: 'Estepona', slug: 'estepona', level: 'town', parentId: 1, propertyCount: 20 },
  ] as any);
  actions.setLabels({ location_placeholder: 'Search location...', location_all: 'All Locations' } as any);
  log('  OK — locations: ' + store.getState().locations.length);

  log('Step 3: dynamic import RsLocation...');
  const t0 = performance.now();
  const mod = await import('@/components/search/RsLocation');
  const RsLocation = mod.default;
  log('  OK in ' + Math.round(performance.now() - t0) + 'ms');

  log('Step 4: render with Preact...');
  const target = document.getElementById('mount');
  if (!target) { log('  FAIL — #mount not found'); return; }
  render(h(RsLocation, { variation: 1 }), target);
  log('  OK — rendered!');

  log('DONE');
}

run().catch(err => log('FATAL: ' + err.message + '\n' + err.stack));
