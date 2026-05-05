import { useRef, useCallback } from 'preact/hooks';

export function useDragScroll() {
  const ref = useRef<HTMLDivElement>(null);
  const state = useRef({ isDown: false, startX: 0, scrollLeft: 0, dragged: false });

  const onMouseDown = useCallback((e: MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    state.current.isDown = true;
    state.current.dragged = false;
    state.current.startX = e.pageX - el.offsetLeft;
    state.current.scrollLeft = el.scrollLeft;
    el.style.cursor = 'grabbing';
    el.style.userSelect = 'none';
  }, []);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!state.current.isDown) return;
    const el = ref.current;
    if (!el) return;
    e.preventDefault();
    const x = e.pageX - el.offsetLeft;
    const walk = x - state.current.startX;
    if (Math.abs(walk) > 3) state.current.dragged = true;
    el.scrollLeft = state.current.scrollLeft - walk;
  }, []);

  const onMouseUp = useCallback(() => {
    const el = ref.current;
    if (el) {
      el.style.cursor = '';
      el.style.userSelect = '';
    }
    state.current.isDown = false;
  }, []);

  const onClickCapture = useCallback((e: MouseEvent) => {
    if (state.current.dragged) {
      e.stopPropagation();
      e.preventDefault();
      state.current.dragged = false;
    }
  }, []);

  const handlers = {
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onMouseLeave: onMouseUp,
    onClickCapture,
  };

  return { ref, handlers };
}
