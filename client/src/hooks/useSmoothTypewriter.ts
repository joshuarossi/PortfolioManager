import { useEffect, useRef, useState } from "react";

/**
 * Reveals incoming WebSocket text at a steady rate so chunks don't pop in.
 */
export function useSmoothTypewriter(source: string, streaming: boolean) {
  const indexRef = useRef(streaming ? 0 : source.length);
  const [displayed, setDisplayed] = useState(streaming ? "" : source);

  useEffect(() => {
    if (!streaming && source.length === 0) {
      indexRef.current = 0;
      setDisplayed("");
      return;
    }

    if (source.length < indexRef.current) {
      indexRef.current = 0;
    }

    if (!streaming && indexRef.current >= source.length) {
      setDisplayed(source);
      return;
    }

    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(now - last, 48);
      last = now;

      const target = source.length;
      const cps = streaming ? 64 : 800;
      const step = Math.max(1, Math.round((dt / 1000) * cps));

      if (indexRef.current < target) {
        indexRef.current = Math.min(target, indexRef.current + step);
        setDisplayed(source.slice(0, indexRef.current));
      }

      if (indexRef.current < target || streaming) {
        raf = requestAnimationFrame(tick);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [source, streaming]);

  return {
    displayed,
    isCaughtUp: displayed.length >= source.length,
  };
}
