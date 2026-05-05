import { type Transition, type Variants } from "framer-motion";

export const springs = {
  gentle: { type: "spring", stiffness: 120, damping: 14 } as Transition,
  snappy: { type: "spring", stiffness: 300, damping: 24 } as Transition,
  bouncy: { type: "spring", stiffness: 400, damping: 10 } as Transition,
  smooth: { type: "spring", stiffness: 200, damping: 20 } as Transition,
};

export const durations = {
  fast: 0.15,
  normal: 0.25,
  slow: 0.4,
  page: 0.5,
} as const;

export const easings = {
  easeOut: [0.16, 1, 0.3, 1],
  easeInOut: [0.45, 0, 0.55, 1],
} as const;

export const fadeInUp: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
};

export const slideInRight: Variants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
};

export const staggerContainer: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
};

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] },
  },
};

export const cardHover: Variants = {
  rest: { y: 0, transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] } },
  hover: { y: -2, transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] } },
};

export const modalOverlay: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export const modalContent: Variants = {
  initial: { opacity: 0, scale: 0.96, y: 8 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.98, y: 4 },
};

export const dropdownContent: Variants = {
  initial: { opacity: 0, scale: 0.95, y: -4 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.95, y: -4 },
};

export const dropdownItem: Variants = {
  initial: { opacity: 0, x: -4 },
  animate: { opacity: 1, x: 0 },
};

export const pageTransition = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] },
};
