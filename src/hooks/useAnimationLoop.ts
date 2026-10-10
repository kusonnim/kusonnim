import { useEffect, useRef } from 'react';

/** One clock for the whole scene. Hidden tabs pause both gestures and signals. */
export function useAnimationLoop(update: (now: number, dt: number) => void, pause: () => void) {
  const updateRef = useRef(update);
  const pauseRef = useRef(pause);
  updateRef.current = update;
  pauseRef.current = pause;

  useEffect(() => {
    let frame = 0;
    let previous = 0;
    let elapsed = 0;
    const tick = (timestamp: number) => {
      const dt = previous ? (timestamp - previous) / 1000 : 1 / 60;
      previous = timestamp;
      elapsed += dt * 1000;
      updateRef.current(elapsed, dt);
      frame = requestAnimationFrame(tick);
    };
    const visibility = () => {
      cancelAnimationFrame(frame);
      previous = 0;
      if (document.hidden) pauseRef.current();
      else frame = requestAnimationFrame(tick);
    };
    if (!document.hidden) frame = requestAnimationFrame(tick);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
}
