import { useState, useEffect, useRef, useCallback } from 'preact/hooks';

interface Props {
  value: number;
  format: (n: number) => string;
  duration?: number;
}

export default function AnimatedPrice({ value, format, duration = 1200 }: Props) {
  const [display, setDisplay] = useState(format(0));
  const ref = useRef<HTMLSpanElement>(null);
  const animated = useRef(false);
  const finished = useRef(false);
  // The formatter changes after mount — exchange rates or the site currency
  // arrive a moment after the first render. Frames read the latest one, and a
  // finished price is re-rendered with it, instead of staying in whatever
  // currency was current when the count-up started.
  const formatRef = useRef(format);
  formatRef.current = format;

  const animate = useCallback(() => {
    if (animated.current) return;
    animated.current = true;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 4);
      setDisplay(formatRef.current(Math.round(value * eased)));
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        finished.current = true;
      }
    };
    requestAnimationFrame(step);
  }, [value, duration]);

  useEffect(() => {
    if (finished.current) setDisplay(format(value));
  }, [format, value]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!('IntersectionObserver' in window)) {
      finished.current = true;
      setDisplay(formatRef.current(value));
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          animate();
          observer.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [value, animate]);

  return <span ref={ref}>{display}</span>;
}
