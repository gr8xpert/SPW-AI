"use client";

import { useReducedMotion } from "framer-motion";
import { useSession } from "next-auth/react";
import { useMemo } from "react";

type InterfaceSpeed = "client" | "admin" | "webmaster";

const speedMultipliers: Record<InterfaceSpeed, number> = {
  client: 1,
  admin: 1.2,
  webmaster: 0.7,
};

export function useAnimationConfig() {
  const prefersReduced = useReducedMotion();
  const { data: session } = useSession();

  const role = session?.user?.role as string | undefined;
  const speed: InterfaceSpeed =
    role === "super_admin" ? "admin" : role === "webmaster" ? "webmaster" : "client";

  return useMemo(() => {
    const multiplier = speedMultipliers[speed];

    if (prefersReduced) {
      return {
        disabled: true,
        duration: (base: number) => 0,
        stagger: 0,
        spring: { type: "tween" as const, duration: 0 },
        variants: {
          initial: { opacity: 0 },
          animate: { opacity: 1 },
          exit: { opacity: 0 },
        },
      };
    }

    return {
      disabled: false,
      duration: (base: number) => base * multiplier,
      stagger: 0.05 * multiplier,
      spring: {
        type: "spring" as const,
        stiffness: speed === "admin" ? 200 : speed === "webmaster" ? 400 : 300,
        damping: speed === "admin" ? 28 : speed === "webmaster" ? 28 : 24,
      },
      variants: {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -4 },
      },
    };
  }, [prefersReduced, speed]);
}

export function useStaggerDelay(index: number, baseDelay = 0.05) {
  const { duration } = useAnimationConfig();
  return duration(baseDelay) * index;
}
