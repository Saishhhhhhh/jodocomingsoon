import React from 'react';
import { ArrowUp } from 'lucide-react';

export const FooterSection: React.FC = () => {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer className="relative w-full min-h-[85vh] py-24 px-6 md:px-14 bg-[#FAF6F0] text-[#24211E] flex flex-col justify-between border-t border-[#24211E]/10 select-none">
      {/* Top Bar */}
      <div className="w-full flex justify-between items-center text-[10px] md:text-xs font-mono uppercase tracking-[0.25em] text-[#8E867E]">
        <span>JODO DESIGN STUDIO</span>
        <button
          onClick={scrollToTop}
          className="flex items-center gap-2 text-[#57524C] hover:text-[#C65F45] transition-colors cursor-pointer"
        >
          <span>BACK TO APEX</span>
          <ArrowUp className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Main Calm Centered Statement */}
      <div className="max-w-4xl mx-auto text-center my-auto py-12">
        <h2 className="font-serif text-4xl sm:text-6xl md:text-8xl font-light text-[#24211E] uppercase tracking-tight mb-4">
          SEE YOU SOON.
        </h2>

        <div className="font-serif text-3xl sm:text-5xl font-normal text-[#C65F45] tracking-[0.2em] uppercase mb-4">
          JODO
        </div>

        <p className="font-serif italic text-xl sm:text-2xl md:text-3xl text-[#57524C] font-light">
          Furniture for the spaces between life.
        </p>
      </div>

      {/* Editorial Footer Grid */}
      <div className="w-full pt-10 border-t border-[#24211E]/10 flex flex-col md:flex-row justify-between items-center gap-6 text-[11px] font-mono tracking-wider text-[#8E867E]">
        <div className="flex items-center gap-6">
          <span>NEW DELHI</span>
          <span>·</span>
          <span>AHMEDABAD</span>
          <span>·</span>
          <span>MILAN</span>
        </div>

        <div className="text-center md:text-right">
          © {new Date().getFullYear()} JODO FURNITURE LABS. ALL RIGHTS RESERVED.
        </div>
      </div>
    </footer>
  );
};
