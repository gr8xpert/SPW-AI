'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

export function NavigationProgress() {
  const pathname = usePathname();
  const [isNavigating, setIsNavigating] = useState(false);
  const [progress, setProgress] = useState(0);
  const prevPathname = useRef(pathname);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a');
      if (!anchor) return;

      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('http') || href.startsWith('#') || href === pathname) return;

      setIsNavigating(true);
      setProgress(0);
    };

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [pathname]);

  useEffect(() => {
    if (!isNavigating) return;

    setProgress(15);
    let current = 15;

    timerRef.current = setInterval(() => {
      current += (90 - current) * 0.08;
      setProgress(current);
      if (current > 88) clearInterval(timerRef.current);
    }, 100);

    return () => clearInterval(timerRef.current);
  }, [isNavigating]);

  useEffect(() => {
    if (pathname !== prevPathname.current) {
      prevPathname.current = pathname;

      if (isNavigating) {
        clearInterval(timerRef.current);
        setProgress(100);
        const t = setTimeout(() => {
          setIsNavigating(false);
          setProgress(0);
        }, 300);
        return () => clearTimeout(t);
      }
    }
  }, [pathname, isNavigating]);

  return (
    <AnimatePresence>
      {isNavigating && (
        <motion.div
          className="fixed top-0 left-0 right-0 z-[9999] h-[3px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="h-full bg-primary"
            style={{ width: `${progress}%` }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          />
          <motion.div
            className="absolute right-0 top-0 h-full w-24 -translate-x-full"
            style={{
              background: 'linear-gradient(to right, transparent, hsl(var(--primary) / 0.4))',
              boxShadow: '0 0 10px hsl(var(--primary) / 0.3), 0 0 5px hsl(var(--primary) / 0.2)',
            }}
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
