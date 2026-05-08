import { Landmark, Moon } from "lucide-react";
import { useEffect, useState } from "react";

export function Header() {
  const [isDark, setIsDark] = useState(() => {
    return document.documentElement.classList.contains('dark');
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  return (
    <header className="w-full flex flex-col">
      {/* Main Header Area */}
      <div className="bg-[#2d7890] dark:bg-[#1a3a44] transition-colors duration-300 text-white py-[12px] px-4">
        <div className="max-w-[420px] mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <img 
              src="/assets/logos/asset_m_brand.png" 
              alt="Logo" 
              className="h-8 object-contain" 
            />
            <h1 className="text-[13px] font-extrabold uppercase tracking-tight leading-none">
              SYS_FIN_991_CORE do Brasil
            </h1>
          </div>
          <div className="flex items-center">
            <div 
              className="w-[19px] h-[19px] rounded-full border-[1.5px] border-white flex items-center justify-center overflow-hidden cursor-pointer shadow-sm transition-transform hover:scale-110 active:scale-95"
              onClick={() => setIsDark(!isDark)}
            >
              <div className="w-[50%] h-full bg-white self-start transition-colors duration-300"></div>
              <div className={`w-[50%] h-full ${isDark ? 'bg-[#1a3a44]' : 'bg-transparent'} self-end transition-colors duration-300`}></div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="w-full bg-[#f2f2f2] dark:bg-[#161d21] border-t border-[#ccc] dark:border-[#232c32] py-8 px-4 mt-auto transition-colors duration-300">
      <div className="max-w-[420px] mx-auto space-y-4">
        <div className="flex flex-wrap justify-center gap-8 opacity-90">
          <img src="/assets/logos/asset_g_mark.png" alt="gov" className="h-8 object-contain dark:brightness-150" />
          <img src="/assets/logos/asset_b_mark.png" alt="bcb" className="h-8 object-contain dark:brightness-150" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest">SYS_FIN_991_CORE (SVR)</p>
          <p className="text-[9px] text-gray-400 dark:text-gray-500">© 2026 SYS_FIN_991_CORE do Brasil. Todos os direitos reservados.</p>
          <p className="text-[9px] text-gray-400 dark:text-gray-500">Este site utiliza criptografia de ponta a ponta para proteção de dados fiscais.</p>
        </div>
      </div>
    </footer>
  );
}
