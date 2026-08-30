'use client';

import { Input } from './input';
import { decimalToHM, hmToDecimal } from '@/lib/time';

interface Props {
  // Decimal hours (matches wire/storage format). 0 renders as empty inputs.
  value: number;
  onChange: (decimalHours: number) => void;
  disabled?: boolean;
  // Minutes granularity — default 5min. Set to 1 for exact per-minute entry.
  minutesStep?: number;
  className?: string;
}

export function HoursMinutesInput({
  value,
  onChange,
  disabled,
  minutesStep = 5,
  className,
}: Props) {
  const { h, m } = decimalToHM(value);

  const emit = (newH: number, newM: number) => {
    const clampedH = Math.max(0, Math.floor(Number.isFinite(newH) ? newH : 0));
    // Wrap minutes >= 60 into hours so 1h 75m becomes 2h 15m.
    const rawM = Math.max(0, Math.floor(Number.isFinite(newM) ? newM : 0));
    const extraH = Math.floor(rawM / 60);
    const finalM = rawM % 60;
    onChange(hmToDecimal(clampedH + extraH, finalM));
  };

  return (
    <div className={`flex items-center gap-1 ${className || ''}`}>
      <Input
        type="number"
        min={0}
        step={1}
        value={h === 0 && m === 0 ? '' : h}
        placeholder="0"
        disabled={disabled}
        onChange={(e) => emit(Number(e.target.value), m)}
        className="w-16 text-center"
        aria-label="Hours"
      />
      <span className="text-xs text-muted-foreground pr-1">h</span>
      <Input
        type="number"
        min={0}
        max={59}
        step={minutesStep}
        value={h === 0 && m === 0 ? '' : m}
        placeholder="0"
        disabled={disabled}
        onChange={(e) => emit(h, Number(e.target.value))}
        className="w-16 text-center"
        aria-label="Minutes"
      />
      <span className="text-xs text-muted-foreground">m</span>
    </div>
  );
}
