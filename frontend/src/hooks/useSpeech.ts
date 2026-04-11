import { useEffect, useRef } from 'react';

export function useSpeech(text: string | null, threatLevel: string | null) {
  const lastSpokenText = useRef<string | null>(null);

  useEffect(() => {
    if (!text || !threatLevel) return;

    // Only speak if the threat level is Critical or Warning, and we haven't spoken this exact text yet
    if ((threatLevel === 'Critical' || threatLevel === 'Warning') && text !== lastSpokenText.current) {
      if (!('speechSynthesis' in window)) {
        console.warn('Web Speech API is not supported in this browser.');
        return;
      }

      const synth = window.speechSynthesis;

      // Cancel any ongoing speech
      if (synth.speaking) {
        synth.cancel();
      }

      const utterance = new SpeechSynthesisUtterance(text);
      
      const speak = () => {
        const voices = synth.getVoices();
        // Try to find a calm, professional voice
        const preferredVoice = voices.find(v => 
          v.name.includes('Google UK English Male') || 
          v.name.includes('Samantha') ||
          v.name.includes('Daniel') ||
          v.name.includes('Fiona') ||
          v.name.includes('Victoria')
        );
        
        if (preferredVoice) {
          utterance.voice = preferredVoice;
        }
        
        // Configure for a "Mission Control" feel
        utterance.rate = 0.95; // Slightly slower
        utterance.pitch = 0.9; // Slightly lower pitch
        
        synth.speak(utterance);
        lastSpokenText.current = text;
      };

      if (synth.getVoices().length === 0) {
        synth.onvoiceschanged = () => {
          speak();
          synth.onvoiceschanged = null;
        };
      } else {
        speak();
      }
    }
  }, [text, threatLevel]);
}
