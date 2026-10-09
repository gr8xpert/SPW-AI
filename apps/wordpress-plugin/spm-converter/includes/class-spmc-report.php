<?php
if (!defined('ABSPATH')) exit;

/**
 * What one conversion did: each old code with its new code, and anything
 * that could not be carried over (so nothing is dropped silently).
 */
class SPMC_Report {
    /** @var array<int, array{system:string, before:string, after:string, notes:string[]}> */
    public $changes = [];
    /** Old IDs that have no SPM match yet: kind => [old id => true]. */
    public $unmatched = ['location' => [], 'type' => [], 'feature' => []];
    /** Old IDs this text uses: kind => [old id => true]. */
    public $used = ['location' => [], 'type' => [], 'feature' => []];
    /** Inmotech tags seen (for the per-tag target table). */
    public $tags = [];
    /**
     * Filters a search form had, which SPM puts on the results block instead:
     * [['attrs' => data-spm-* attrs, 'change' => index into $changes]].
     */
    public $carry = [];

    private $notes = [];

    /** Notes collected while one code is being converted. */
    public function note($message) {
        $this->notes[] = $message;
    }

    public function change($system, $before, $after) {
        $this->changes[] = [
            'system' => $system,
            'before' => $before,
            'after'  => $after,
            'notes'  => array_values(array_unique($this->notes)),
        ];
        $this->notes = [];
    }

    /** Notes for a code that was looked at but left as it was. */
    public function discard_notes() {
        $this->notes = [];
    }

    public function has_notes() {
        return (bool) $this->notes;
    }

    public function merge(SPMC_Report $other) {
        $this->changes = array_merge($this->changes, $other->changes);
        foreach (['unmatched', 'used'] as $field) {
            foreach ($other->$field as $kind => $ids) {
                $this->$field[$kind] = ($this->$field[$kind] ?? []) + $ids;
            }
        }
        $this->tags = $this->tags + $other->tags;
        $offset = count($this->changes) - count($other->changes);
        foreach ($other->carry as $c) {
            $c['change'] += $offset;
            $this->carry[] = $c;
        }
    }

    public function systems() {
        return array_values(array_unique(array_column($this->changes, 'system')));
    }

    public function warnings() {
        $all = [];
        foreach ($this->changes as $c) foreach ($c['notes'] as $n) $all[] = $n;
        return array_values(array_unique($all));
    }
}
