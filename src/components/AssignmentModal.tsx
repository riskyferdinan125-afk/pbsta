import React, { useState } from 'react';
import { X, User, Check, Sparkles, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Ticket, Technician } from '../types';
import { GoogleGenAI } from "@google/genai";
import { useToast } from './Toast';

interface AssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticket: Ticket;
  technicians: Technician[];
  onUpdateTechnician: (ticketId: string, technicianId: string) => Promise<void>;
}

export default function AssignmentModal({
  isOpen,
  onClose,
  ticket,
  technicians,
  onUpdateTechnician
}: AssignmentModalProps) {
  const [isAiSuggesting, setIsAiSuggesting] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<{ techId: string; reason: string } | null>(null);
  const { showToast } = useToast();

  const handleAiSuggest = async () => {
    setIsAiSuggesting(true);
    setAiSuggestion(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      const model = ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `
          Analyze this ticket and suggest the best technician from the list.
          
          Ticket:
          - Description: ${ticket.description}
          - Category: ${ticket.category}
          - Priority: ${ticket.priority}
          
          Technicians:
          ${technicians.map(t => `- ID: ${t.id}, Name: ${t.name}, Skills: ${t.skills?.join(', ') || 'N/A'}, Status: ${t.availabilityStatus || 'Available'}`).join('\n')}
          
          Return JSON format: { "techId": "ID", "reason": "Short reason why" }
        `,
        config: { responseMimeType: "application/json" }
      });

      const result = await model;
      const suggestion = JSON.parse(result.text);
      setAiSuggestion(suggestion);
      showToast('AI Suggestion ready');
    } catch (error) {
      console.error('AI Suggestion error:', error);
      showToast('AI failed to suggest', 'error');
    } finally {
      setIsAiSuggesting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
          >
            <div className="p-6 border-b border-black/5 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-neutral-900">Assign Technicians</h3>
                <p className="text-xs text-neutral-500 mt-1">Ticket #{ticket.ticketNumber}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleAiSuggest}
                  disabled={isAiSuggesting}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-bold uppercase tracking-wider hover:bg-emerald-100 transition-all disabled:opacity-50"
                >
                  {isAiSuggesting ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3" />
                  )}
                  AI Suggest
                </button>
                <button onClick={() => {
                  onClose();
                  setAiSuggestion(null);
                }} className="p-2 hover:bg-neutral-100 rounded-xl">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="p-6 max-h-[60vh] overflow-y-auto space-y-3">
              {aiSuggestion && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl mb-4">
                  <div className="flex items-center gap-2 text-emerald-700 mb-1">
                    <Sparkles className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">AI Recommendation</span>
                  </div>
                  <p className="text-sm text-emerald-600 leading-relaxed italic">
                    "{aiSuggestion.reason}"
                  </p>
                </div>
              )}
              {technicians.map(tech => {
                const isAssigned = ticket.technicianIds?.includes(tech.id);
                const isSuggested = aiSuggestion?.techId === tech.id;
                return (
                  <button
                    key={tech.id}
                    onClick={() => onUpdateTechnician(ticket.id, tech.id)}
                    className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${
                      isAssigned 
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                        : isSuggested
                          ? 'bg-white border-emerald-400 ring-2 ring-emerald-500/20 text-neutral-600'
                          : 'bg-white border-black/5 text-neutral-600 hover:border-emerald-500/30'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-400 border border-black/5 overflow-hidden">
                          {tech.photoURL ? (
                            <img src={tech.photoURL} alt={tech.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <User className="w-5 h-5" />
                          )}
                        </div>
                        {isSuggested && (
                          <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center border-2 border-white">
                            <Sparkles className="w-2 h-2 text-white" />
                          </div>
                        )}
                      </div>
                      <div className="text-left">
                        <p className="font-bold text-sm flex items-center gap-2">
                          {tech.name}
                          {isSuggested && <span className="text-[8px] bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded-full uppercase">Suggested</span>}
                        </p>
                        <p className="text-[10px] uppercase tracking-wider opacity-60">{tech.availabilityStatus || 'Available'}</p>
                      </div>
                    </div>
                    {isAssigned && (
                      <div className="w-6 h-6 bg-emerald-500 text-white rounded-full flex items-center justify-center">
                        <Check className="w-4 h-4" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            
            <div className="p-6 bg-neutral-50 border-t border-black/5">
              <button
                onClick={() => {
                  onClose();
                  setAiSuggestion(null);
                }}
                className="w-full py-3 bg-neutral-900 text-white rounded-2xl font-bold hover:bg-neutral-800 transition-all shadow-xl shadow-neutral-900/20"
              >
                Done
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
