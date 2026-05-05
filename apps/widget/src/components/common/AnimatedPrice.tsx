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

  const animate = useCallback(() => {
    if (animated.current) return;
    animated.current = true;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 4);
      setDisplay(format(Math.round(value * eased)));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [value, format, duration]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!('IntersectionObserver' in window)) {
      setDisplay(format(value));
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
  }, [value, format, animate]);

  return <span ref={ref}>{display}</span>;
}
