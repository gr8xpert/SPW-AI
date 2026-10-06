// Where each slide sits in carousel templates 01–06. The numbers are the V3
// widget's (property-carousel.ts), so the layouts look the same as before.

export type CarouselLayout = 1 | 2 | 3 | 4 | 5 | 6;

export interface Placed {
  index: number;
  // Distance from the centre card: -2..2 in layout 1, the slide's position in
  // the row (0 = first) in layouts 5 and 6.
  level: number;
}

/** Offset of `index` from `active`, wrapped so the ring has no ends. */
export function ringOffset(active: number, index: number, total: number): number {
  let offset = active - index;
  if (offset > total / 2) offset -= total;
  else if (offset < -total / 2) offset += total;
  return offset;
}

/** Which slides are drawn, for the layouts that draw only some of them. */
export function placedSlides(layout: CarouselLayout, active: number, total: number): Placed[] {
  if (total === 0) return [];
  if (layout === 1) {
    // Five cards centred on the active one; fewer listings sit around the middle.
    if (total < 5) return Array.from({ length: total }, (_, i) => ({ index: i, level: i - Math.floor(total / 2) }));
    return [-2, -1, 0, 1, 2].map((level) => ({ index: (active + level + total) % total, level }));
  }
  if (layout === 4) return [{ index: active, level: 0 }];
  if (layout === 5 || layout === 6) {
    return Array.from({ length: Math.min(3, total) }, (_, i) => ({ index: (active + i) % total, level: i }));
  }
  // 2 and 3 draw every slide and move them with transforms.
  return Array.from({ length: total }, (_, i) => ({ index: i, level: ringOffset(active, i, total) }));
}

/** Class for a layout-1 card: --level-2, --level-1, --level0, --level1, --level2. */
export function levelClass(level: number): string {
  return `rs-property-carousel__item--level${level}`;
}

export interface SlideStyle {
  transform: string;
  filter: string;
  pointerEvents: string;
  zIndex: string;
  opacity: string;
  overlayOpacity: string;
}

/** Layout 2, "3D perspective": cards tilt away and blur with distance. */
export function perspectiveStyle(offset: number, screenWidth: number): SlideStyle {
  let x = 120, z = -100, rotate = -15, blurStep = 4;
  if (screenWidth <= 400) { x = 70; z = -60; rotate = -10; blurStep = 3; }
  else if (screenWidth <= 600) { x = 90; z = -80; rotate = -12; blurStep = 3; }
  else if (screenWidth <= 900) { x = 100; z = -90; rotate = -12; }

  const abs = Math.abs(offset);
  const active = offset === 0;
  const scale = active ? 1 : Math.max(0.7, 1 - abs * 0.15);
  const blur = active ? 0 : Math.min(abs * blurStep, 10);
  return {
    transform: `translateX(${offset * x}px) translateZ(${abs * z}px) rotateY(${offset * rotate}deg) scale(${scale})`,
    filter: blur > 0 ? `blur(${blur}px)` : 'none',
    pointerEvents: active ? 'auto' : 'none',
    zIndex: String(10 - abs),
    opacity: abs < 3 ? (active ? '1' : '0.95') : '0',
    overlayOpacity: active ? '1' : '0',
  };
}

/** Layout 3, "coverflow": side cards turn to face the centre and lose colour. */
export function coverflowStyle(offset: number, screenWidth: number): SlideStyle {
  let x = 240, rotate = 45, scaleBase = 0.85, depth = 100;
  if (screenWidth <= 400) { x = 120; rotate = 40; scaleBase = 0.8; depth = 60; }
  else if (screenWidth <= 600) { x = 160; rotate = 42; scaleBase = 0.82; depth = 80; }
  else if (screenWidth <= 900) { x = 200; rotate = 44; scaleBase = 0.83; depth = 90; }

  const abs = Math.abs(offset);
  const active = offset === 0;
  const rotateY = active ? 0 : offset > 0 ? rotate : -rotate;
  const scale = active ? 1 : Math.max(0.7, scaleBase - abs * 0.05);
  const z = active ? 100 : -depth * abs;
  const saturation = Math.max(20, 100 - abs * 35);
  const brightness = Math.max(70, 100 - abs * 12);
  // Phones show the centre card only.
  const shown = screenWidth <= 600 ? active : abs < 3;
  return {
    transform: `translateX(${-offset * x}px) translateZ(${z}px) rotateY(${rotateY}deg) scale(${scale})`,
    filter: active ? 'none' : `saturate(${saturation}%) brightness(${brightness}%)`,
    pointerEvents: active ? 'auto' : 'none',
    zIndex: String(10 - abs),
    opacity: shown ? '1' : '0',
    overlayOpacity: active ? '1' : '0',
  };
}
