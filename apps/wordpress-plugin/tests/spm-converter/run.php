<?php
/**
 * SPM Converter checks: mixed filter values (the sparklinghomes
 * data-rs-location="features=163" case and its relatives), plain values that
 * must not change, idempotency, and the run log. Exit code 1 on any failure.
 *
 *   docker run --rm -v "$PWD":/app -w /app php:8.1-cli php apps/wordpress-plugin/tests/spm-converter/run.php
 *   (or: php apps/wordpress-plugin/tests/spm-converter/run.php, PHP 7.4+)
 */
require __DIR__ . '/bootstrap.php';

// Old ID → SPM ID, as an admin's saved picks (no list lookups needed).
update_option('spmc_id_map', [
    'location' => [72 => 9072, 73 => 9073],
    'type'     => [2 => 1202, 5 => 1205, 6 => 1206],
    'feature'  => [163 => 4065, 200 => 4200],
]);

$failed = 0;
$passed = 0;

/** data-spm-* of the first SPM block in $html (name without prefix => value). */
function spm_attrs($html, $nth = 0) {
    preg_match_all('/<[a-z]+[^>]*class="[^"]*spm-block[^"]*"[^>]*>/i', $html, $tags);
    $tag = $tags[0][$nth] ?? '';
    preg_match_all('/data-spm-([a-z0-9-]+)="([^"]*)"/', $tag, $mm, PREG_SET_ORDER);
    $out = [];
    foreach ($mm as $m) $out[$m[1]] = html_entity_decode($m[2], ENT_QUOTES, 'UTF-8');
    return $out;
}

function ids_set($v) {
    $ids = array_filter(explode(',', (string) $v), 'strlen');
    sort($ids);
    return implode(',', $ids);
}

/**
 * @param array $want  attribute => value (ID lists compared as sets);
 *                     null = must be absent
 * @param string[] $notes substrings at least one note must contain
 */
function check($name, $input, array $want, array $notes = [], $nth = 0) {
    global $failed, $passed;
    $r = new SPMC_Report();
    $out = SPMC_Store::convert_raw($input, $r)[0];
    $got = spm_attrs($out, $nth);
    $errors = [];
    foreach ($want as $k => $v) {
        $have = $got[$k] ?? null;
        if ($v === null) {
            if ($have !== null) $errors[] = "data-spm-$k should be absent, is \"$have\"";
            continue;
        }
        $same = in_array($k, ['location', 'type', 'features'], true) ? ids_set($have) === ids_set($v) : $have === $v;
        if (!$same) $errors[] = "data-spm-$k: want \"$v\", got " . ($have === null ? 'nothing' : "\"$have\"");
    }
    // Clean values: ID lists hold only IDs, and nothing of the old value leaks.
    foreach (['location', 'type', 'features'] as $k) {
        if (isset($got[$k]) && !preg_match('/^\d+(,\d+)*$/', $got[$k])) $errors[] = "data-spm-$k is not an ID list: \"{$got[$k]}\"";
    }
    if (preg_match('/data-spm-[a-z-]+="[^"]*=/', $out)) $errors[] = 'an SPM attribute still holds "name=value"';
    $all = implode("\n", $r->warnings());
    foreach ($notes as $n) {
        if (strpos($all, $n) === false) $errors[] = "no note containing \"$n\" (notes: " . ($all ?: 'none') . ')';
    }
    // Converting the result again changes nothing.
    $again = SPMC_Store::convert_raw($out, new SPMC_Report())[0];
    if ($again !== $out) $errors[] = 'not idempotent: a second conversion changed the output';

    if ($errors) {
        $failed++;
        echo "FAIL  $name\n      in:  $input\n      out: $out\n";
        foreach ($errors as $e) echo "      - $e\n";
    } else {
        $passed++;
        echo "ok    $name\n";
    }
}

echo "SPM Converter " . SPMC_VERSION . "\n\n";

// --- The sparklinghomes case (5 "beachfront ... costa-del-sol" pages, 2026-11-04).
// Markup as the audit recorded it: listing design 08, the feature typed into
// the location attribute. Before 1.0.3 the block came out with no location
// and no feature (villas 1915 instead of 78).
check(
    'sparklinghomes: data-rs-location="features=163"',
    '<div class="rs-listing-template-08" data-rs-location="features=163" data-rs-property-type="5" data-rs-listing-type="resale" data-rs-own-first="1"></div>',
    ['widget' => 'listing-template-14', 'features' => '4065', 'type' => '1205', 'for' => 'sale', 'own-first' => 'yes', 'location' => null],
    ['holds other filters', 'read as features=163', 'sets no location']
);

// --- Relatives: several filters in one value, pasted addresses, odd spellings.
check('location + feature joined by &',
    '<div class="rs-listing-template-08" data-rs-location="72&features=163"></div>',
    ['location' => '9072', 'features' => '4065'], ['read as location=72 + features=163']);
check('location + feature joined by a comma',
    '<div class="rs-listing-template-08" data-rs-location="72,features=163"></div>',
    ['location' => '9072', 'features' => '4065']);
check('raw &amp; in the stored HTML',
    '<div class="rs-listing-template-08" data-rs-location="&amp;features=163"></div>',
    ['features' => '4065', 'location' => null]);
check('own name repeated (location=72)',
    '<div class="rs-listing-template-08" data-rs-location="location=72"></div>',
    ['location' => '9072'], ['read as location=72']);
check('pasted API address with camelCase and []',
    '<div class="rs-listing-template-08" data-rs-location="/properties?locationId=72&propertyTypeIds=5,6&features[]=163"></div>',
    ['location' => '9072', 'type' => '1205,1206', 'features' => '4065']);
check('nested feature adds to data-rs-features',
    '<div class="rs-listing-template-08" data-rs-location="features=163" data-rs-features="200"></div>',
    ['features' => '4065,4200', 'location' => null]);
check('type attribute holding type + listing type',
    '<div class="rs-listing-template-08" data-rs-property-type="type=5&listing-type=resale"></div>',
    ['type' => '1205', 'for' => 'sale']);
check('locked attribute keeps fixed',
    '<div class="rs-listing-template-08" data-rs-lock-location="features=163"></div>',
    ['features' => '4065', 'fixed' => 'yes', 'location' => null]);
check('unknown name inside a value is dropped with a note',
    '<div class="rs-listing-template-08" data-rs-location="foo=1"></div>',
    ['location' => null], ['"foo=1" is not a filter SPM knows']);
check('search form preset moves to the results block',
    '<div class="rs-search-template-01" data-rs-location="features=163"></div><div class="rs-listing-template-08"></div>',
    ['widget' => 'listing-template-14', 'features' => '4065', 'location' => null], ['holds other filters'], 1);

// --- Plain values must come out as before.
check('plain location list unchanged',
    '<div class="rs-listing-template-08" data-rs-location="72,73" data-rs-property-type="5"></div>',
    ['location' => '9072,9073', 'type' => '1205', 'features' => null]);
check('plain feature unchanged',
    '<div class="rs-listing-template-07" data-rs-features="163" data-rs-limit="6" data-rs-standalone></div>',
    ['widget' => 'listing-template-13', 'features' => '4065', 'limit' => '6', 'standalone' => 'yes']);

// --- Inmotech shortcodes, same mistake.
check('Inmotech: location=features=163',
    '[2020marbella filter="location=features=163 type=2"]',
    ['widget' => 'site-listing', 'features' => '4065', 'type' => '1202', 'location' => null], ['holds other filters']);
check('Inmotech: location=72&features=163 next to features=200',
    '[2020marbella filter="location=72&features=163 features=200"]',
    ['location' => '9072', 'features' => '4065,4200']);
check('Inmotech: plain filter unchanged',
    '[2020marbella filter="location=72,73 type=2 listing_type=resale"]',
    ['location' => '9072,9073', 'type' => '1202', 'for' => 'sale']);

// --- Notes say nothing odd about clean input.
(function () {
    global $failed, $passed;
    $r = new SPMC_Report();
    SPMC_Store::convert_raw('<div class="rs-listing-template-08" data-rs-location="72"></div>', $r);
    if (strpos(implode(' ', $r->warnings()), 'holds other filters') !== false) {
        $failed++;
        echo "FAIL  clean input got a mixed-filter note\n";
    } else {
        $passed++;
        echo "ok    clean input gets no mixed-filter note\n";
    }
})();

// --- The run log survives without the history table.
(function () {
    global $failed, $passed;
    $run = gmdate('Ymd-His') . '-abc123';
    $r = new SPMC_Report();
    $before = '<div class="rs-listing-template-08" data-rs-location="features=163"></div>';
    $after = SPMC_Store::convert_raw($before, $r)[0];
    SPMC_Log::item($run, 'post', '42', 'Beachfront villas — page #42', 'done', $before, $after, $r);
    SPMC_Log::write($run, ['type' => 'undo', 'kind' => 'post', 'id' => '42', 'label' => 'x', 'status' => 'undone']);
    $rows = SPMC_Log::rows($run);
    $runs = SPMC_Log::runs();
    $errors = [];
    if (count($rows) !== 3 || $rows[0]['type'] !== 'run' || $rows[1]['status'] !== 'done') $errors[] = 'expected header + item + undo lines';
    if (($rows[1]['before_sha1'] ?? '') !== sha1($before)) $errors[] = 'before checksum missing';
    if (strpos(json_encode($rows[1]['changes'] ?? []), 'data-spm-features') === false) $errors[] = 'change not logged';
    if (!$runs || $runs[0]['run'] !== $run || ($runs[0]['counts']['done'] ?? 0) !== 1) $errors[] = 'runs() does not list the run';
    if (!file_exists(SPMC_Log::dir() . '.htaccess') || !file_exists(SPMC_Log::dir() . 'index.php')) $errors[] = 'folder not protected';
    if (!preg_match('/run-' . preg_quote($run, '/') . '-[a-z0-9]{16}\.jsonl$/', SPMC_Log::file($run))) $errors[] = 'file name lacks the site token';
    if (SPMC_Log::write('../../etc/passwd', ['x' => 1])) $errors[] = 'accepted a bad run id';
    if ($errors) {
        $failed++;
        echo "FAIL  run log\n";
        foreach ($errors as $e) echo "      - $e\n";
    } else {
        $passed++;
        echo "ok    run log written, listed and read back\n";
    }
    foreach ((array) glob(SPMC_Log::dir() . '{,.}*', GLOB_BRACE) as $f) if (is_file($f)) @unlink($f);
    @rmdir(SPMC_Log::dir());
    @rmdir($GLOBALS['__uploads']);
})();

echo "\n$passed passed, $failed failed\n";
exit($failed ? 1 : 0);
