"""Builds the location template seed from Odoo location exports.

    python scripts/build-location-template.py docs/locations-*.csv

Input: CSV with Region, Province, Area, Municipality, Town[, Urbanization],
Postcode, Long, Lat. Cells may be Odoo translation dicts ({'en_US': 'Málaga'}).

Output: apps/api/src/modules/location-template/seed/location-template.seed.ts,
consumed by the LocationTemplate migration.

Cleaning:
- Spelling variants that differ only in accents/case are merged; the variant
  with the most accents wins (Costa Calida -> Costa Cálida). A few names the
  export only has without accents are fixed from CANONICAL.
- A municipality listed under several areas goes under the area holding most of
  its towns and is flagged needs_review.
- A town listed under several municipalities of one province stays in each and
  is flagged needs_review, as are municipalities named like an area and towns
  that are also a municipality elsewhere in the province.
- Coordinates 0,0 are dropped.
"""
import ast
import collections
import csv
import json
import os
import re
import sys
import unicodedata

LEVELS = ['region', 'province', 'area', 'municipality', 'town', 'urbanization']
CANONICAL = {
    'andalucia': 'Andalucía',
    'cadiz': 'Cádiz',
    'jaen': 'Jaén',
}
# Entries the export gets wrong in ways no generic rule catches.
KNOWN_ISSUES = {
    ('municipality', 'gran alacant'): 'Gran Alacant is part of the Santa Pola municipality, not a municipality.',
    ('municipality', 'alpujarra'): 'La Alpujarra is a comarca (district), not a municipality.',
}
OUT = os.path.join(os.path.dirname(__file__), '..', 'apps', 'api', 'src', 'modules',
                   'location-template', 'seed', 'location-template.seed.ts')


def cell(v):
    v = (v or '').strip()
    if v.startswith('{'):
        try:
            d = ast.literal_eval(v)
            v = d.get('en_US') or next(iter(d.values()), '') or ''
        except Exception:
            pass
    return re.sub(r'\s+', ' ', str(v)).strip()


def key(s):
    s = unicodedata.normalize('NFD', s.lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


def accents(s):
    return sum(1 for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) == 'Mn')


def coord(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if f == 0 else round(f, 7)


rows = []
for path in sys.argv[1:]:
    with open(path, encoding='utf-8') as f:
        for r in csv.DictReader(f):
            rows.append({
                'region': cell(r.get('Region')), 'province': cell(r.get('Province')), 'area': cell(r.get('Area')),
                'municipality': cell(r.get('Municipality')), 'town': cell(r.get('Town')),
                'urbanization': cell(r.get('Urbanization')), 'postcode': (r.get('Postcode') or '').strip() or None,
                'lat': coord(r.get('Lat')), 'lng': coord(r.get('Long')),
            })

# Best spelling per (level, key): most accents, then most frequent.
spellings = collections.defaultdict(collections.Counter)
for r in rows:
    for lvl in LEVELS:
        if r[lvl]:
            spellings[(lvl, key(r[lvl]))][r[lvl]] += 1


# Areas whose words are the same in a different order are one area
# ("Medio Vinalopó" / "Vinalopó Medio"); the more frequent wording wins.
area_words = collections.defaultdict(collections.Counter)
for r in rows:
    if r['area']:
        area_words[' '.join(sorted(key(r['area']).split()))][r['area']] += 1
area_alias = {}
for variants in area_words.values():
    winner = sorted(variants, key=lambda s: (-variants[s], -accents(s), s))[0]
    for v in variants:
        area_alias[v] = winner
for r in rows:
    if r['area']:
        r['area'] = area_alias[r['area']]


def best(lvl, name):
    k = key(name)
    if k in CANONICAL and lvl in ('region', 'province'):
        return CANONICAL[k]
    options = spellings[(lvl, k)]
    return sorted(options, key=lambda s: (-accents(s), -options[s], s))[0]


for r in rows:
    for lvl in LEVELS:
        if r[lvl]:
            r[lvl] = best(lvl, r[lvl])

# Municipality -> area: the area holding most of its rows; the rest are noted.
mun_areas = collections.defaultdict(collections.Counter)
for r in rows:
    mun_areas[(key(r['province']), key(r['municipality']))][r['area']] += 1
mun_home = {}
review = collections.defaultdict(list)
for mk, areas in mun_areas.items():
    ranked = sorted(areas, key=lambda a: (-areas[a], a))
    mun_home[mk] = ranked[0]
    if len(ranked) > 1:
        review[('municipality',) + mk].append('Also listed under area: ' + ', '.join(ranked[1:]) + '.')

nodes = {}   # path tuple of keys -> node
order = []


def node(path_names, lvl, extra=None):
    path = tuple(key(n) for n in path_names)
    if path not in nodes:
        nodes[path] = {
            'path': path, 'parent': path[:-1] or None, 'level': lvl, 'name': path_names[-1],
            'postcode': None, 'lat': None, 'lng': None, 'notes': [],
        }
        order.append(path)
    n = nodes[path]
    if extra:
        for f in ('postcode', 'lat', 'lng'):
            if n[f] is None and extra.get(f) is not None:
                n[f] = extra[f]
    return n


for r in rows:
    if not (r['region'] and r['province'] and r['municipality'] and r['town']):
        continue
    area = mun_home[(key(r['province']), key(r['municipality']))] or r['area']
    base = [r['region'], r['province']] + ([area] if area else [])
    node(base[:1], 'region')
    node(base[:2], 'province')
    if area:
        node(base, 'area')
    node(base + [r['municipality']], 'municipality')
    geo = {'postcode': r['postcode'], 'lat': r['lat'], 'lng': r['lng']}
    node(base + [r['municipality'], r['town']], 'town', None if r['urbanization'] else geo)
    if r['urbanization']:
        node(base + [r['municipality'], r['town'], r['urbanization']], 'urbanization', geo)

# Flags.
by_level_prov = collections.defaultdict(list)   # (level, province key, name key) -> nodes
area_keys = set()
for n in nodes.values():
    prov = n['path'][1] if len(n['path']) > 1 else ''
    by_level_prov[(n['level'], prov, n['path'][-1])].append(n)
    if n['level'] == 'area':
        area_keys.add(n['path'][-1])

for n in nodes.values():
    lvl, prov, k = n['level'], (n['path'][1] if len(n['path']) > 1 else ''), n['path'][-1]
    if lvl == 'municipality':
        n['notes'] += review.get(('municipality', prov, k), [])
        has_own_town = (n['path'] + (k,)) in nodes
        if k in area_keys and not has_own_town:
            n['notes'].append('Named like an area and has no town of that name - check it is a real municipality.')
        if (lvl, k) in KNOWN_ISSUES:
            n['notes'].append(KNOWN_ISSUES[(lvl, k)])
    if lvl == 'town':
        homes = by_level_prov[('town', prov, k)]
        if len(homes) > 1:
            names = sorted({nodes[h['parent']]['name'] for h in homes if h is not n})
            n['notes'].append('Same town also listed under municipality: ' + ', '.join(names) + '.')
        muns = by_level_prov[('municipality', prov, k)]
        if muns and all(m['path'] != n['parent'] for m in muns):
            n['notes'].append('Also a municipality of its own in this province.')

# Parents before children, siblings alphabetical.
order.sort(key=lambda p: tuple(nodes[p[:i + 1]]['name'].lower() for i in range(len(p))))
order.sort(key=len)
index = {p: i for i, p in enumerate(order)}

lines = []
for p in order:
    n = nodes[p]
    parent = index[n['parent']] if n['parent'] else -1
    note = ' '.join(n['notes']) or None
    lines.append(json.dumps([
        parent, LEVELS.index(n['level']), n['name'], n['postcode'], n['lat'], n['lng'], note,
    ], ensure_ascii=False))

counts = collections.Counter(nodes[p]['level'] for p in order)
flagged = sum(1 for p in order if nodes[p]['notes'])
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
    f.write('// Generated by scripts/build-location-template.py from Odoo location exports\n')
    f.write('// (docs/locations-*.csv). Regenerate rather than edit by hand; after the\n')
    f.write('// first migration the template lives in the database and is edited from\n')
    f.write('// Super Admin -> Location Template.\n//\n')
    f.write('// Row: [parentIndex (-1 = root), level (0 region .. 5 urbanization), name,\n')
    f.write('//       postcode, lat, lng, reviewNote (set = needs review)]\n')
    f.write('export type LocationTemplateSeedRow = [number, number, string, string | null, number | null, number | null, string | null];\n\n')
    f.write('export const LOCATION_TEMPLATE_SEED: LocationTemplateSeedRow[] = [\n')
    for line in lines:
        f.write('  ' + line + ',\n')
    f.write('];\n')

print('nodes:', len(order), dict(counts), 'needs review:', flagged, '->', os.path.relpath(OUT))
