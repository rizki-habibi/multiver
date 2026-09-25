"use client";

export default function HeroSection() {
  return (
    <section className="relative pt-32 pb-20 px-6 min-h-[90vh] flex flex-col items-center justify-center overflow-hidden">
      {/* Glow effect */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-[#1f6feb]/12 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="relative z-10 max-w-4xl w-full text-center flex flex-col items-center gap-8">
        {/* Version badge */}
        <div className="inline-flex items-center gap-2 rounded-full border border-[#30363d] bg-[#161b22]/70 px-3 py-1 text-xs font-medium text-[#58A6FF]">
          <span className="flex h-2 w-2 rounded-full bg-[#58A6FF] animate-pulse"></span>
          v1.0 is now live
        </div>

        {/* Main heading */}
        <h1 className="text-5xl md:text-7xl font-black leading-[1.1] tracking-tight">
          Satu Titik Akhir untuk <br />
          <span className="text-[#58A6FF]">Semua Penyedia AI</span>
        </h1>

        {/* Description */}
        <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto font-light">
          AI endpoint proxy with web dashboard - A JavaScript port of CLIProxyAPI. Works seamlessly with Claude Code, OpenAI Codex, Cline, RooCode, and other CLI tools.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-4 w-full">
          <button className="h-12 px-8 rounded-lg bg-[#1f6feb] hover:bg-[#388bfd] text-white text-base font-bold transition-all shadow-[0_0_15px_rgba(31,111,235,0.4)] flex items-center gap-2">
            <span className="material-symbols-outlined">rocket_launch</span>
            Get Started
          </button>
          <a
            href="https://github.com/decolua/Multiver"
            target="_blank"
            rel="noopener noreferrer"
            className="h-12 px-8 rounded-lg border border-[#30363d] bg-[#161b22] hover:bg-[#21262d] text-white text-base font-bold transition-all flex items-center gap-2"
          >
            <span className="material-symbols-outlined">code</span>
            Lihat di GitHub
          </a>
        </div>
      </div>
    </section>
  );
}

