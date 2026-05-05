import { useState, useRef, useEffect, useCallback } from 'preact/hooks';

interface Option {
  value: string;
  label: string;
}

interface Props {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  class?: string;
}

export default function RsCustomSelect({ options, value, onChange, placeholder, disabled, class: className }: Props) {
  const [open, setOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedOption = options.find(o => o.value === value);
  const displayText = selectedOption ? selectedOption.label : (placeholder ?? '');

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open || focusIndex < 0 || !listRef.current) return;
    const items = listRef.current.children;
    if (items[focusIndex]) {
      (items[focusIndex] as HTMLElement).scrollIntoView({ block: 'nearest' });
    }
  }, [focusIndex, open]);

  const toggle = useCallback(() => {
    if (disabled) return;
    setOpen(prev => {
      if (!prev) {
        const idx = options.findIndex(o => o.value === value);
        setFocusIndex(idx >= 0 ? idx : 0);
      }
      return !prev;
    });
  }, [disabled, options, value]);

  const select = useCallback((val: string) => {
    onChange(val);
    setOpen(false);
  }, [onChange]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        toggle();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusIndex(i => Math.min(i + 1, options.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (focusIndex >= 0 && focusIndex < options.length) {
          select(options[focusIndex].value);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        break;
    }
  }, [open, focusIndex, options, toggle, select]);

  return (
    <div
      ref={containerRef}
      class={`rs-custom-select${open ? ' rs-custom-select--open' : ''}${disabled ? ' rs-custom-select--disabled' : ''}${className ? ` ${className}` : ''}`}
      onKeyDown={handleKeyDown}
    >
      <button
        type="button"
        class="rs-custom-select__trigger"
        onClick={toggle}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span class={`rs-custom-select__value${!selectedOption ? ' rs-custom-select__value--placeholder' : ''}`}>
          {displayText}
        </span>
        <svg class="rs-custom-select__chevron" width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      {open && (
        <ul
          ref={listRef}
          class="rs-custom-select__dropdown"
          role="listbox"
        >
          {options.map((opt, i) => (
            <li
              key={opt.value}
              role="option"
              class={`rs-custom-select__option${opt.value === value ? ' rs-custom-select__option--selected' : ''}${i === focusIndex ? ' rs-custom-select__option--focused' : ''}`}
              aria-selected={opt.value === value}
              onClick={() => select(opt.value)}
              onMouseEnter={() => setFocusIndex(i)}
            >
              {opt.label}
              {opt.value === value && (
                <svg class="rs-custom-select__check" width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 7L6 10L11 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
