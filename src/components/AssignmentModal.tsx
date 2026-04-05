import React, { useState, useMemo } from 'react';
import { X, User, Check, Sparkles, Loader2, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Ticket, Technician } from '../types';
import { GoogleGenAI } from "@google/genai";
import { useToast } from './Toast';
import { getTechnicianSuggestions } from '../lib/assignmentUtils';

interface AssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticket: Ticket;
  technicians: Technician[];
  allTickets: Ticket[];
  onUpdateTechnician: (ticketId: string, technicianId: string) => Promise<void>;
}

export default function AssignmentModal({
  isOpen,
  onClose,
  ticket,
  technicians,
  allTickets,
  onUpdateTechnician
}: AssignmentModalProps) {
  const [isAiSuggesting, setIsAiSuggesting] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<{ techId: string; reason: string } | null>(null);
  const [showSmartSuggestions, setShowSmartSuggestions] = useState(true);
  const { showToast } = useToast();

  const smartSuggestions = useMemo(() => {
    if (!ticket || !technicians.length) return [];
    return getTechnicianSuggestions(ticket, technicians, allTickets);
  }, [ticket, technicians, allTickets]);

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
          ${technicians.map(t => {
            const workload = allTickets.filter(tk => tk.technicianIds?.includes(t.id) && (tk.status === 'open' || tk.status === 'in-progress')).length;
            return `- ID: ${t.id}, Name: ${t.name}, Skills: ${t.skills?.join(', ') || 'N/A'}, Status: ${t.availabilityStatus || 'Available'}, Current Workload: ${workload} active tickets`;
          }).join('\n')}
          
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
            className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="p-6 border-b border-black/5 flex items-center justify-between flex-shrink-0">
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
            
            <div className="p-6 overflow-y-auto space-y-3 flex-grow">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Smart Ranking</span>
                <button 
                  onClick={() => setShowSmartSuggestions(!showSmartSuggestions)}
                  className="text-[10px] font-bold text-emerald-600 hover:underline"
                >
                  {showSmartSuggestions ? 'Hide Details' : 'Show Details'}
                </button>
              </div>

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

              {smartSuggestions.map(({ technician: tech, score, reasons, workload }) => {
                const isAssigned = ticket.technicianIds?.includes(tech.id);
                const isSuggested = aiSuggestion?.techId === tech.id;
                const topScore = smartSuggestions[0].score;
                const isTopMatch = score === topScore && score > 0;

                return (
                  <div key={tech.id} className="space-y-1">
                    <button
                      onClick={() => onUpdateTechnician(ticket.id, tech.id)}
                      className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${
                        isAssigned 
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                          : isSuggested
                            ? 'bg-white border-emerald-400 ring-2 ring-emerald-500/20 text-neutral-600'
                            : isTopMatch
                              ? 'bg-white border-emerald-500/30 ring-1 ring-emerald-500/10 text-neutral-600'
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
                          {isTopMatch && !isSuggested && (
                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center border-2 border-white">
                              <Zap className="w-2 h-2 text-white" />
                            </div>
                          )}
                        </div>
                        <div className="text-left">
                          <p className="font-bold text-sm flex items-center gap-2">
                            {tech.name}
                            {isSuggested && <span className="text-[8px] bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded-full uppercase">AI Pick</span>}
                            {isTopMatch && !isSuggested && <span className="text-[8px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full uppercase">Best Match</span>}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider ${
                              tech.availabilityStatus === 'Available' ? 'bg-emerald-100 text-emerald-600' :
                              tech.availabilityStatus === 'Busy' ? 'bg-amber-100 text-amber-600' :
                              'bg-neutral-100 text-neutral-400'
                            }`}>
                              {tech.availabilityStatus || 'Available'}
                            </span>
                            <span className="text-[9px] text-neutral-400 font-medium">
                              {workload} active tickets
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-[10px] font-black text-neutral-900">{score}%</div>
                          <div className="text-[8px] text-neutral-400 uppercase font-bold">Match</div>
                        </div>
                        {isAssigned && (
                          <div className="w-6 h-6 bg-emerald-500 text-white rounded-full flex items-center justify-center">
                            <Check className="w-4 h-4" />
                          </div>
                        )}
                      </div>
                    </button>
                    
                    {showSmartSuggestions && (
                      <div className="px-4 py-2 bg-neutral-50 rounded-xl mx-2 flex flex-wrap gap-x-3 gap-y-1">
                        {reasons.map((reason, idx) => (
                          <div key={idx} className="flex items-center gap-1 text-[8px] font-bold text-neutral-500 uppercase">
                            <div className={`w-1 h-1 rounded-full ${reason.includes('Offline') ? 'bg-rose-400' : 'bg-emerald-400'}`} />
                            {reason}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
            <div className="p-6 bg-neutral-50 border-t border-black/5 flex-shrink-0">
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

function Zap({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>
  );
}
