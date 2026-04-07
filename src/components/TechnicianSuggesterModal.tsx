import React, { useMemo } from 'react';
import { X, Star, Check, User, Briefcase, Clock, AlertCircle, TrendingUp, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Ticket, Technician } from '../types';

interface TechnicianSuggesterModalProps {
  ticket: Ticket;
  technicians: Technician[];
  onClose: () => void;
  onAssign: (techId: string) => void;
}

const categoryKeywords: Record<string, string[]> = {
  'PROJECT': ['project', 'infrastructure', 'planning', 'pembangunan'],
  'REGULER': ['fiber', 'internet', 'residential', 'home'],
  'PSB': ['installation', 'new connection', 'ont', 'pasang baru'],
  'SQM': ['quality', 'measurement', 'signal', 'redaman'],
  'UNSPEKS': ['troubleshooting', 'repair', 'maintenance', 'gangguan'],
  'EXBIS': ['business', 'enterprise', 'dedicated', 'korporat'],
  'CORRECTIVE': ['repair', 'fix', 'emergency', 'perbaikan'],
  'PREVENTIVE': ['maintenance', 'checkup', 'audit', 'perawatan']
};

export default function TechnicianSuggesterModal({ ticket, technicians, onClose, onAssign }: TechnicianSuggesterModalProps) {
  const suggestions = useMemo(() => {
    return technicians
      .filter(tech => !ticket.technicianIds?.includes(tech.id))
      .map(tech => {
        let score = 0;
        const reasons: string[] = [];

        // 1. Availability Score
        if (tech.availabilityStatus === 'Available') {
          score += 50;
          reasons.push('Technician is currently available');
        } else if (tech.availabilityStatus === 'Busy') {
          score += 10;
          reasons.push('Technician is busy but can be assigned');
        } else {
          score -= 50;
        }

        // 2. Skills Match
        const keywords = categoryKeywords[ticket.category] || [];
        const techSkills = tech.skills || [];
        const matchingSkills = techSkills.filter(skill => 
          keywords.some(kw => skill.toLowerCase().includes(kw.toLowerCase())) ||
          ticket.description.toLowerCase().includes(skill.toLowerCase()) ||
          (ticket.subCategory && ticket.subCategory.toLowerCase().includes(skill.toLowerCase()))
        );

        if (matchingSkills.length > 0) {
          score += matchingSkills.length * 20;
          reasons.push(`Matches ${matchingSkills.length} relevant skills: ${matchingSkills.join(', ')}`);
        }

        // 3. Specialization Match
        if (tech.specialization && (
          ticket.category.toLowerCase().includes(tech.specialization.toLowerCase()) ||
          tech.specialization.toLowerCase().includes(ticket.category.toLowerCase())
        )) {
          score += 30;
          reasons.push(`Specialization matches category: ${tech.specialization}`);
        }

        // 4. Workload (Penalty for too many tickets)
        // Note: In a real app, we'd fetch current active tickets for each tech.
        // For now, we'll assume a random workload or skip if data isn't available.
        
        return {
          ...tech,
          score,
          reasons
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5); // Top 5 suggestions
  }, [ticket, technicians]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-black/5"
      >
        <div className="p-6 border-b border-black/5 flex items-center justify-between bg-neutral-50">
          <div>
            <h3 className="text-xl font-black text-neutral-900 flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-emerald-600" />
              Smart Technician Suggestions
            </h3>
            <p className="text-xs text-neutral-500 font-bold uppercase tracking-wider mt-1">
              Based on skills, availability, and ticket requirements
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-neutral-200 rounded-full transition-colors"
          >
            <X className="w-6 h-6 text-neutral-400" />
          </button>
        </div>

        <div className="p-6 max-h-[70vh] overflow-y-auto space-y-4">
          {suggestions.length > 0 ? (
            suggestions.map((tech, idx) => (
              <motion.div
                key={tech.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="group relative p-5 bg-white rounded-2xl border border-black/5 hover:border-emerald-200 hover:shadow-lg transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <div className="w-14 h-14 bg-neutral-100 rounded-2xl flex items-center justify-center text-2xl font-black text-neutral-400 border border-black/5 shadow-sm overflow-hidden">
                        {tech.photoURL ? (
                          <img src={tech.photoURL} alt={tech.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <User className="w-8 h-8" />
                        )}
                      </div>
                      <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${
                        tech.availabilityStatus === 'Available' ? 'bg-emerald-500' :
                        tech.availabilityStatus === 'Busy' ? 'bg-yellow-400' : 
                        tech.availabilityStatus === 'On Leave' ? 'bg-red-500' : 'bg-neutral-400'
                      }`} />
                    </div>
                    <div>
                      <h4 className="font-bold text-neutral-900 text-lg">{tech.name}</h4>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs font-bold text-neutral-400 flex items-center gap-1">
                          <Briefcase className="w-3 h-3" /> {tech.specialization || 'General Technician'}
                        </span>
                        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${
                          tech.availabilityStatus === 'Available' ? 'bg-emerald-50 text-emerald-600' :
                          tech.availabilityStatus === 'Busy' ? 'bg-yellow-50 text-yellow-600' : 
                          'bg-neutral-50 text-neutral-500'
                        }`}>
                          {tech.availabilityStatus}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-sm font-black">
                      <Star className="w-4 h-4 fill-current" />
                      {tech.score} pts
                    </div>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {tech.reasons.map((reason, rIdx) => (
                    <div key={rIdx} className="flex items-center gap-2 text-xs text-neutral-600 bg-neutral-50 p-2 rounded-lg border border-black/5">
                      <Check className="w-3 h-3 text-emerald-500" />
                      {reason}
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex items-center justify-end">
                  <button
                    onClick={() => onAssign(tech.id)}
                    className="px-6 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 flex items-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Assign Technician
                  </button>
                </div>
              </motion.div>
            ))
          ) : (
            <div className="py-12 text-center">
              <AlertCircle className="w-12 h-12 text-neutral-200 mx-auto mb-4" />
              <p className="text-neutral-500 font-medium">No suitable technicians found for this ticket.</p>
            </div>
          )}
        </div>

        <div className="p-6 bg-neutral-50 border-t border-black/5 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 text-neutral-500 font-bold hover:text-neutral-700 transition-colors"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
}
