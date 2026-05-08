import React, { useState, useEffect } from 'react';
import { Volume2, VolumeX, Play, Pause } from 'lucide-react';

export function TalkSystem() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [synth, setSynth] = useState<SpeechSynthesis | null>(null);
  const [utterance, setUtterance] = useState<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      setSynth(window.speechSynthesis);
    }
  }, []);

  const stopSpeaking = () => {
    if (synth) {
      synth.cancel();
      setIsPlaying(false);
    }
  };

  const startSpeaking = () => {
    if (!synth) return;

    stopSpeaking();

    // Get all text content from the main container
    const mainContent = document.querySelector('main')?.innerText || '';
    const newUtterance = new SpeechSynthesisUtterance(mainContent);
    newUtterance.lang = 'pt-BR';
    newUtterance.rate = 0.9;
    
    newUtterance.onend = () => setIsPlaying(false);
    newUtterance.onerror = () => setIsPlaying(false);

    setUtterance(newUtterance);
    synth.speak(newUtterance);
    setIsPlaying(true);
  };

  const toggleSpeech = () => {
    if (isPlaying) {
      stopSpeaking();
    } else {
      startSpeaking();
    }
  };

  return (
    <button
      onClick={toggleSpeech}
      className={`fixed bottom-24 right-6 z-50 p-4 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 group ${
        isPlaying ? 'bg-red-500 scale-110' : 'bg-[#1b668d] hover:scale-105'
      }`}
      title={isPlaying ? "Parar leitura" : "Ouvir conteúdo do site"}
      aria-label={isPlaying ? "Parar leitura" : "Ouvir conteúdo do site"}
    >
      <div className="absolute -top-12 right-0 bg-white text-[#1b668d] px-3 py-1 rounded-lg text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity shadow-sm border border-gray-100 whitespace-nowrap">
        {isPlaying ? "Parar Leitura" : "Acessibilidade: Ouvir Site"}
      </div>
      {isPlaying ? (
        <VolumeX className="text-white animate-pulse" size={24} />
      ) : (
        <Volume2 className="text-white" size={24} />
      )}
    </button>
  );
}
