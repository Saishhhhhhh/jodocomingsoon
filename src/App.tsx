import { useEffect } from 'react';
import Lenis from 'lenis';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ChairScene } from './components/ChairScene';

export function App() {
  useEffect(() => {
    let lenis: Lenis | null = null;
    let rafId: number;

    try {
      lenis = new Lenis({
        duration: 1.2,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        orientation: 'vertical',
        smoothWheel: true,
        touchMultiplier: 1.8,
      });

      lenis.on('scroll', ScrollTrigger.update);

      function raf(time: number) {
        lenis?.raf(time);
        rafId = requestAnimationFrame(raf);
      }

      rafId = requestAnimationFrame(raf);
    } catch (e) {
      console.warn('Lenis smooth scroll initialization warning:', e);
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      lenis?.destroy();
    };
  }, []);

  return (
    <div className="relative w-full min-h-screen bg-[#F4EBDD] text-[#24211E] overflow-x-hidden">
      {/* Subtle Cinematic Film Grain Overlay */}
      <div className="grain-overlay" aria-hidden="true" />

      {/* Main Single Scroll Assembly & Coming Soon Experience */}
      <main className="relative w-full">
        <ChairScene />
      </main>
    </div>
  );
}

export default App;
