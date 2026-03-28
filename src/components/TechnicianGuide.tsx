import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle2, Timer, Camera, MapPin, StickyNote, ArrowRight, Play, Square, Info, MessageSquare, Send } from 'lucide-react';

interface TechnicianGuideProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TechnicianGuide({ isOpen, onClose }: TechnicianGuideProps) {
  const steps = [
    {
      title: "1. Start the Timer",
      description: "When you arrive at the location and begin work, click 'Start Work'. This records your arrival time and location.",
      icon: <Timer className="w-6 h-6 text-emerald-500" />,
      action: <div className="flex items-center gap-2 bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold"><Play className="w-3 h-3 fill-current" /> Start Work</div>
    },
    {
      title: "2. Visual Evidence (Before)",
      description: "Take a 'Before' photo of the equipment or site before starting any repairs. This is crucial for documentation.",
      icon: <Camera className="w-6 h-6 text-indigo-500" />,
      action: <div className="flex flex-col items-center gap-1 p-2 border-2 border-dashed border-neutral-200 rounded-lg text-[10px] text-neutral-400 font-bold uppercase"><Camera className="w-4 h-4" /> Upload Before</div>
    },
    {
      title: "3. Follow the Checklist",
      description: "Complete each task in the Progress Checklist. Every check records your location and completion time.",
      icon: <CheckCircle2 className="w-6 h-6 text-emerald-500" />,
      action: <div className="flex items-center gap-2 text-sm text-neutral-700 font-medium"><div className="w-5 h-5 rounded-md border-2 border-emerald-500 bg-emerald-500 flex items-center justify-center text-white"><CheckCircle2 className="w-3.5 h-3.5" /></div> Check Task</div>
    },
    {
      title: "4. Update Status with Comments",
      description: "When changing status (e.g., to 'Resolved'), you MUST provide a comment explaining what was done.",
      icon: <StickyNote className="w-6 h-6 text-amber-500" />,
      action: <div className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-black uppercase">Resolved</div>
    },
    {
      title: "5. Visual Evidence (After)",
      description: "Take an 'After' photo once the work is completed to show the final result.",
      icon: <Camera className="w-6 h-6 text-indigo-500" />,
      action: <div className="flex flex-col items-center gap-1 p-2 border-2 border-dashed border-neutral-200 rounded-lg text-[10px] text-neutral-400 font-bold uppercase"><Camera className="w-4 h-4" /> Upload After</div>
    },
    {
      title: "6. Stop the Timer",
      description: "Click 'Stop Work' when you are finished. This calculates the total duration and logs your departure.",
      icon: <Timer className="w-6 h-6 text-red-500" />,
      action: <div className="flex items-center gap-2 bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold"><Square className="w-3 h-3 fill-current" /> Stop Work</div>
    }
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] border border-black/5"
          >
            {/* Header */}
            <div className="p-8 border-b border-black/5 flex items-center justify-between bg-neutral-50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-600/20">
                  <Info className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-2xl font-black tracking-tighter text-neutral-900">Technician Guide</h3>
                  <p className="text-sm text-neutral-500 font-medium">How to update ticket progress correctly</p>
                </div>
              </div>
              <button onClick={onClose} className="p-3 hover:bg-neutral-200 rounded-2xl transition-all">
                <X className="w-6 h-6 text-neutral-500" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {steps.map((step, idx) => (
                  <div key={idx} className="p-6 bg-neutral-50 rounded-3xl border border-black/5 space-y-4 hover:bg-white hover:shadow-xl hover:shadow-neutral-200/50 transition-all group">
                    <div className="flex items-start justify-between">
                      <div className="p-3 bg-white rounded-2xl shadow-sm group-hover:scale-110 transition-transform">
                        {step.icon}
                      </div>
                      <div className="text-2xl font-black text-neutral-200">0{idx + 1}</div>
                    </div>
                    <div>
                      <h4 className="font-bold text-neutral-900 mb-1">{step.title}</h4>
                      <p className="text-xs text-neutral-500 leading-relaxed font-medium">{step.description}</p>
                    </div>
                    <div className="pt-2">
                      {step.action}
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-6 bg-indigo-50 rounded-3xl border border-indigo-100 flex items-start gap-4">
                <div className="p-2 bg-white rounded-xl shadow-sm">
                  <MapPin className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-indigo-900">Automatic Location Tracking</h4>
                  <p className="text-xs text-indigo-700 leading-relaxed mt-1">
                    The system automatically captures your GPS coordinates during key actions. Please ensure your device's location services are enabled for the application.
                  </p>
                </div>
              </div>

              <div className="p-6 bg-blue-50 rounded-3xl border border-blue-100 flex items-start gap-4">
                <div className="p-2 bg-white rounded-xl shadow-sm">
                  <Send className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-blue-900">Telegram Bot Integration</h4>
                  <p className="text-xs text-blue-700 leading-relaxed mt-1">
                    You can interact with our bot on Telegram! 
                    1. Search for our bot on Telegram.
                    2. Type <code className="bg-white px-1 rounded">/start</code> to get your Chat ID.
                    3. Save the Chat ID in your Profile settings to link your account.
                    4. Type <code className="bg-white px-1 rounded">/help</code> to see available commands.
                    5. Type <code className="bg-white px-1 rounded">/progres</code> with a photo to report field progress.
                    6. Type <code className="bg-white px-1 rounded">/close</code> with a photo to report field closure.
                    7. Type <code className="bg-white px-1 rounded">/pelanggan</code> to add a new customer.
                    8. Type <code className="bg-white px-1 rounded">/addtiket</code> to create a new ticket.
                    9. Type <code className="bg-white px-1 rounded">/assign</code> to assign a ticket to technicians.
                  </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-8 border-t border-black/5 bg-neutral-50">
              <button
                onClick={onClose}
                className="w-full py-4 bg-neutral-900 text-white rounded-2xl font-bold hover:bg-neutral-800 transition-all shadow-xl shadow-neutral-900/10 active:scale-[0.98]"
              >
                Got it, let's work!
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
