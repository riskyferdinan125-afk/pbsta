import React, { useState, useEffect } from 'react';
import { Send, Shield, Users, CheckCircle2, XCircle, AlertCircle, RefreshCw, ExternalLink, Plus, Trash2, Edit2, Save, X } from 'lucide-react';
import { collection, getDocs, query, where, doc, updateDoc, addDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface TelegramCommand {
  id?: string;
  command: string;
  description: string;
  response: string;
  isActive: boolean;
  isSystem?: boolean;
  updatedAt?: any;
}

const SYSTEM_COMMANDS = [
  { command: 'start', description: 'Pesan selamat datang dan Chat ID', response: 'Welcome to Service Desk Bot! 🤖\n\nPlease link your Telegram account in the app profile settings using this ID: `{chatId}`\n\nKetik `/help` untuk panduan.', isActive: true, isSystem: true },
  { command: 'help', description: 'Panduan format perintah', response: '📑 *Panduan Bot Telegram* 📑\n\nBot ini digunakan untuk membantu operasional Service Desk.\n\nSilakan hubungi admin untuk daftar perintah yang tersedia atau gunakan menu bot jika tersedia.', isActive: true, isSystem: true },
  { command: 'pelanggan', description: 'Tambah pelanggan baru', response: '👤 *Format Tambah Pelanggan Baru* 👤\n\nSilakan salin dan isi format di bawah ini:\n\n`/pelanggan`\nCustomer ID : \nNama: \nPhone Number: \nAlamat: ', isActive: true, isSystem: true },
  { command: 'addtiket', description: 'Buat tiket baru', response: '🎫 *Format Buat Tiket Baru* 🎫\n\nSilakan salin dan isi format di bawah ini:\n\n`/addtiket`\nCustomer ID:\nKategory:\nSub Kategory:', isActive: true, isSystem: true },
  { command: 'progres', description: 'Update progres lapangan (dengan foto)', response: '📑 *Format Update Progres Lapangan* 📑\n\nSilakan kirim *FOTO EVIDEN* dengan caption format di bawah ini:\n\n`/progres`\nCustomer ID:\nNo Tiket :\nPenyebab GGN:\nPerbaikan GGN:\nLetak Perbaikan:\nMaterial:\nTeknisi (NIK):\nNohp Pelanggan:', isActive: true, isSystem: true },
  { command: 'assign', description: 'Assign tiket ke teknisi', response: '📋 *Format Assign Tiket* 📋\n\nSilakan salin dan isi format di bawah ini:\n\n`/assign`\nCustomer ID : \nNIK : ', isActive: true, isSystem: true },
  { command: 'projects', description: 'List proyek aktif untuk update progres', response: '🏗️ *Daftar Proyek Aktif*\n\nSilakan pilih proyek untuk update progres:', isActive: true, isSystem: true },
  { 
    command: 'addprojects', 
    description: 'Tambah proyek baru (Flow Interaktif)', 
    response: '🏗️ *Tambah Proyek Baru* 🏗️\n\nBot akan memandu Anda langkah demi langkah:\n1. BOQ REKON\n2. TIKET GAMAS\n3. EVIDEN PRA (Multi-select)\n4. PROSES (Multi-select)\n5. EVIDEN PASCA (Multi-select)\n6. HASIL UKUR (Foto)\n7. MATERIAL TIBA (Foto)\n8. ABD (Foto)\n9. BA PENDUKUNG (Dokumen PDF)\n\nKetik `/addprojects` untuk memulai.', 
    isActive: true, 
    isSystem: true 
  },
];

export default function TelegramSettings() {
  const [technicians, setTechnicians] = useState<UserProfile[]>([]);
  const [commands, setCommands] = useState<TelegramCommand[]>([]);
  const [loading, setLoading] = useState(true);
  const [commandsLoading, setCommandsLoading] = useState(true);
  const [configLoading, setConfigLoading] = useState(false);
  const [botStatus, setBotStatus] = useState<'online' | 'offline' | 'checking'>('checking');
  const [editingTechId, setEditingTechId] = useState<string | null>(null);
  const [techTelegramId, setTechTelegramId] = useState('');
  const [commandSearch, setCommandSearch] = useState('');
  const [techSearch, setTechSearch] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [recentActivity, setRecentActivity] = useState<{ type: string, detail: string, time: string }[]>([]);

  // System Config State
  const [systemConfig, setSystemConfig] = useState<{
    botToken: string;
    welcomeMessage: string;
    helpMessage: string;
    allowedStatuses: string[];
    allowedPriorities: string[];
  }>({
    botToken: '',
    welcomeMessage: 'Welcome to Service Desk Bot! 🤖\n\nPlease link your Telegram account in the app profile settings using this ID: `{chatId}`\n\nKetik `/help` untuk panduan.',
    helpMessage: '📑 *Panduan Bot Telegram* 📑\n\nBot ini digunakan untuk membantu operasional Service Desk.\n\nSilakan hubungi admin untuk daftar perintah yang tersedia atau gunakan menu bot jika tersedia.',
    allowedStatuses: ['open', 'in-progress', 'resolved', 'closed'],
    allowedPriorities: ['low', 'medium', 'high', 'urgent']
  });

  // Command Form State
  const [isAddingCommand, setIsAddingCommand] = useState(false);
  const [editingCommandId, setEditingCommandId] = useState<string | null>(null);
  const [commandForm, setCommandForm] = useState<TelegramCommand>({
    command: '',
    description: '',
    response: '',
    isActive: true
  });

  const fetchTechnicians = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'users'), where('role', '==', 'teknisi'));
      const snap = await getDocs(q);
      setTechnicians(snap.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile)));
      
      // Simulate checking bot status
      setTimeout(() => setBotStatus(systemConfig.botToken ? 'online' : 'offline'), 1000);
    } catch (error) {
      console.error("Error fetching technicians:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCommands = async () => {
    setCommandsLoading(true);
    try {
      const snap = await getDocs(collection(db, 'telegramCommands'));
      const dbCommands = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TelegramCommand));
      
      // Merge with system commands
      const merged: TelegramCommand[] = [...SYSTEM_COMMANDS];
      dbCommands.forEach(dbCmd => {
        const index = merged.findIndex(s => s.command === dbCmd.command);
        if (index !== -1) {
          merged[index] = { ...merged[index], ...dbCmd, id: dbCmd.id };
        } else {
          merged.push(dbCmd);
        }
      });
      
      setCommands(merged);
      
      // Update recent activity based on updated commands
      const sorted = [...dbCommands].sort((a: any, b: any) => 
        (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0)
      ).slice(0, 3);
      
      setRecentActivity(sorted.map(cmd => ({
        type: 'Command Updated',
        detail: `/${cmd.command}`,
        time: cmd.updatedAt ? new Date(cmd.updatedAt.seconds * 1000).toLocaleTimeString() : 'Just now'
      })));
    } catch (error) {
      console.error("Error fetching commands:", error);
    } finally {
      setCommandsLoading(false);
    }
  };

  const fetchConfig = async () => {
    setConfigLoading(true);
    try {
      const snap = await getDocs(collection(db, 'telegramConfig'));
      if (!snap.empty) {
        const data = snap.docs[0].data();
        setSystemConfig(prev => ({
          ...prev,
          ...data
        }));
      }
    } catch (error) {
      console.error("Error fetching config:", error);
    } finally {
      setConfigLoading(false);
    }
  };

  useEffect(() => {
    fetchTechnicians();
    fetchCommands();
    fetchConfig();
  }, []);

  const saveConfig = async () => {
    setConfigLoading(true);
    try {
      const snap = await getDocs(collection(db, 'telegramConfig'));
      const data = {
        ...systemConfig,
        updatedAt: serverTimestamp()
      };
      if (!snap.empty) {
        await updateDoc(doc(db, 'telegramConfig', snap.docs[0].id), data);
      } else {
        await addDoc(collection(db, 'telegramConfig'), data);
      }

      // Also update the system commands for start and help if they exist in DB
      const startCmdQuery = query(collection(db, 'telegramCommands'), where('command', '==', 'start'));
      const startSnap = await getDocs(startCmdQuery);
      if (!startSnap.empty) {
        await updateDoc(doc(db, 'telegramCommands', startSnap.docs[0].id), {
          response: systemConfig.welcomeMessage,
          updatedAt: serverTimestamp()
        });
      }

      const helpCmdQuery = query(collection(db, 'telegramCommands'), where('command', '==', 'help'));
      const helpSnap = await getDocs(helpCmdQuery);
      if (!helpSnap.empty) {
        await updateDoc(doc(db, 'telegramCommands', helpSnap.docs[0].id), {
          response: systemConfig.helpMessage,
          updatedAt: serverTimestamp()
        });
      }

      alert("System configuration saved successfully!");
      fetchCommands(); // Refresh commands to show updated responses
    } catch (error) {
      console.error("Error saving config:", error);
    } finally {
      setConfigLoading(false);
    }
  };

  const unlinkTelegram = async (techId: string) => {
    try {
      await updateDoc(doc(db, 'users', techId), {
        telegramId: null
      });
      fetchTechnicians();
    } catch (error) {
      console.error("Error unlinking telegram:", error);
    }
  };

  const updateTelegramId = async (techId: string) => {
    try {
      await updateDoc(doc(db, 'users', techId), {
        telegramId: techTelegramId || null
      });
      setEditingTechId(null);
      fetchTechnicians();
    } catch (error) {
      console.error("Error updating telegram ID:", error);
    }
  };

  const handleSaveCommand = async () => {
    if (!commandForm.command || !commandForm.response) return;

    try {
      const cleanCommand = commandForm.command.replace(/^\//, '').toLowerCase();
      const data = {
        command: cleanCommand,
        description: commandForm.description,
        response: commandForm.response,
        isActive: commandForm.isActive,
        updatedAt: serverTimestamp()
      };

      // If it's a system command being edited for the first time, it might not have an ID
      const actualId = editingCommandId?.startsWith('system-') ? null : editingCommandId;

      if (actualId) {
        await updateDoc(doc(db, 'telegramCommands', actualId), data as any);
      } else {
        // Check if this command already exists in DB (especially for system overrides)
        const q = query(collection(db, 'telegramCommands'), where('command', '==', cleanCommand));
        const snap = await getDocs(q);
        if (!snap.empty) {
          await updateDoc(doc(db, 'telegramCommands', snap.docs[0].id), data as any);
        } else {
          await addDoc(collection(db, 'telegramCommands'), data);
        }
      }

      setIsAddingCommand(false);
      setEditingCommandId(null);
      setCommandForm({ command: '', description: '', response: '', isActive: true });
      fetchCommands();
    } catch (error) {
      console.error("Error saving command:", error);
    }
  };

  const handleDeleteCommand = async (id: string) => {
    if (!confirm("Are you sure you want to delete this command?")) return;
    try {
      await deleteDoc(doc(db, 'telegramCommands', id));
      fetchCommands();
    } catch (error) {
      console.error("Error deleting command:", error);
    }
  };

  const startEdit = (cmd: TelegramCommand) => {
    const id = cmd.id || (cmd.isSystem ? 'system-' + cmd.command : null);
    if (!id) return;
    setEditingCommandId(id);
    setCommandForm({ ...cmd });
    setIsAddingCommand(true);
  };

  const toggleCommandStatus = async (cmd: TelegramCommand) => {
    if (cmd.isSystem && !cmd.id) {
      // For system commands not yet in DB, we need to create them to toggle status
      try {
        const data = {
          command: cmd.command,
          description: cmd.description,
          response: cmd.response,
          isActive: !cmd.isActive,
          updatedAt: serverTimestamp()
        };
        await addDoc(collection(db, 'telegramCommands'), data);
        fetchCommands();
      } catch (error) {
        console.error("Error toggling system command status:", error);
      }
      return;
    }

    if (!cmd.id) return;

    try {
      await updateDoc(doc(db, 'telegramCommands', cmd.id), {
        isActive: !cmd.isActive,
        updatedAt: serverTimestamp()
      });
      fetchCommands();
    } catch (error) {
      console.error("Error toggling command status:", error);
    }
  };

  const filteredCommands = commands.filter(cmd => 
    cmd.command.toLowerCase().includes(commandSearch.toLowerCase()) ||
    cmd.description.toLowerCase().includes(commandSearch.toLowerCase())
  );

  const filteredTechnicians = technicians.filter(tech => 
    tech.name.toLowerCase().includes(techSearch.toLowerCase()) ||
    tech.email.toLowerCase().includes(techSearch.toLowerCase()) ||
    (tech.telegramId && tech.telegramId.includes(techSearch))
  );

  const renderPreview = (text: string) => {
    // Basic Markdown to HTML simulation for preview
    return text
      .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
      .replace(/_(.*?)_/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code class="bg-black/10 px-1 rounded">$1</code>')
      .replace(/\n/g, '<br/>')
      .replace(/\{chatId\}/g, '<code>123456789</code>')
      .replace(/\{ticketNumber\}/g, '<code>TKT-001</code>')
      .replace(/\{customerName\}/g, '<code>John Doe</code>');
  };

  const variables = [
    { name: '{chatId}', desc: 'User Telegram ID' },
    { name: '{ticketNumber}', desc: 'Ticket ID' },
    { name: '{customerName}', desc: 'Customer Name' },
    { name: '{status}', desc: 'Ticket Status' },
    { name: '{priority}', desc: 'Ticket Priority' },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Telegram Integration</h1>
          <p className="text-neutral-500">Manage bot status and technician account linking.</p>
        </div>
        <div className="p-3 bg-blue-100 text-blue-600 rounded-2xl">
          <Send className="w-6 h-6" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {/* Top Section: Bot Status & Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-3xl border border-black/5 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-2xl ${
                botStatus === 'online' ? 'bg-emerald-50 text-emerald-600' : 
                botStatus === 'offline' ? 'bg-red-50 text-red-600' : 'bg-neutral-50 text-neutral-400'
              }`}>
                <Shield className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-neutral-900">Bot Status</h3>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    botStatus === 'online' ? 'bg-emerald-500 animate-pulse' : 
                    botStatus === 'offline' ? 'bg-red-500' : 'bg-neutral-300'
                  }`} />
                  <span className="text-xs font-bold capitalize text-neutral-600">{botStatus}</span>
                </div>
              </div>
            </div>
            <button 
              onClick={() => {
                setBotStatus('checking');
                setTimeout(() => setBotStatus(systemConfig.botToken ? 'online' : 'offline'), 1500);
              }}
              className="p-2 hover:bg-neutral-100 rounded-xl transition-colors"
            >
              <RefreshCw className={`w-4 h-4 text-neutral-400 ${botStatus === 'checking' ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-black/5 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                <Send className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-neutral-900">Total Commands</h3>
                <p className="text-xs text-neutral-500 font-medium">{commands.length} Active Commands</p>
              </div>
            </div>
            <button 
              onClick={() => {
                setIsAddingCommand(true);
                setEditingCommandId(null);
                setCommandForm({ command: '', description: '', response: '', isActive: true });
              }}
              className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors shadow-sm"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          <div className="bg-amber-50 border border-amber-100 p-6 rounded-3xl flex items-center gap-4">
            <div className="p-3 bg-white text-amber-600 rounded-2xl border border-amber-100">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-amber-900">Config Note</h3>
              <p className="text-[10px] text-amber-700 leading-tight">Custom commands active immediately after saving. Use `{"{chatId}"}` in `/start`.</p>
            </div>
          </div>
        </div>

        {/* System Parameters Section */}
        <div className="bg-white rounded-3xl border border-black/5 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-black/5 flex items-center justify-between bg-neutral-50/50">
            <h3 className="font-bold text-neutral-900 flex items-center gap-2">
              <Shield className="w-5 h-5 text-amber-600" />
              System Parameters (Data Perintah)
            </h3>
            <button 
              onClick={saveConfig}
              disabled={configLoading}
              className="px-4 py-2 bg-amber-600 text-white rounded-xl text-xs font-bold hover:bg-amber-700 transition-colors shadow-sm disabled:opacity-50"
            >
              {configLoading ? 'Saving...' : 'Save Parameters'}
            </button>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="md:col-span-2 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider">Telegram Bot Token</label>
                  <div className="relative">
                    <input 
                      type="password"
                      value={systemConfig.botToken}
                      onChange={(e) => setSystemConfig({ ...systemConfig, botToken: e.target.value })}
                      placeholder="123456789:ABCDefGhIJKlmNoPQRstUVwxyZ"
                      className="w-full px-4 py-2 bg-neutral-50 border border-black/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 font-mono"
                    />
                    <Shield className="w-4 h-4 text-neutral-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  </div>
                  <p className="text-[10px] text-neutral-400 italic">Get this from @BotFather on Telegram.</p>
                </div>
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider">Bot Username</label>
                  <div className="relative">
                    <input 
                      type="text"
                      placeholder="@YourBotName"
                      className="w-full px-4 py-2 bg-neutral-50 border border-black/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                    <Send className="w-4 h-4 text-neutral-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  </div>
                  <p className="text-[10px] text-neutral-400 italic">For display purposes only.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider">Default Welcome Message (/start)</label>
                  <textarea 
                    value={systemConfig.welcomeMessage}
                    onChange={(e) => setSystemConfig({ ...systemConfig, welcomeMessage: e.target.value })}
                    rows={4}
                    className="w-full px-4 py-2 bg-neutral-50 border border-black/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 resize-none font-mono"
                    placeholder="Welcome message..."
                  />
                  <p className="text-[10px] text-neutral-400 italic">Supports {`{chatId}`} variable.</p>
                </div>
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider">Default Help Message (/help)</label>
                  <textarea 
                    value={systemConfig.helpMessage}
                    onChange={(e) => setSystemConfig({ ...systemConfig, helpMessage: e.target.value })}
                    rows={4}
                    className="w-full px-4 py-2 bg-neutral-50 border border-black/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 resize-none font-mono"
                    placeholder="Help guide..."
                  />
                  <p className="text-[10px] text-neutral-400 italic">Supports Markdown formatting.</p>
                </div>
              </div>

              <div className="h-px bg-black/5" />
            </div>

            <div className="space-y-4">
              <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider">Allowed Ticket Statuses</label>
              <div className="flex flex-wrap gap-2">
                {systemConfig.allowedStatuses.map((status, index) => (
                  <div key={index} className="flex items-center gap-2 bg-neutral-100 px-3 py-1.5 rounded-xl border border-black/5">
                    <span className="text-xs font-medium text-neutral-700">{status}</span>
                    <button 
                      onClick={() => setSystemConfig({
                        ...systemConfig,
                        allowedStatuses: systemConfig.allowedStatuses.filter((_, i) => i !== index)
                      })}
                      className="text-neutral-400 hover:text-red-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <button 
                  onClick={() => {
                    const newStatus = prompt("Enter new status:");
                    if (newStatus) setSystemConfig({
                      ...systemConfig,
                      allowedStatuses: [...systemConfig.allowedStatuses, newStatus.toLowerCase()]
                    });
                  }}
                  className="px-3 py-1.5 bg-neutral-50 border border-dashed border-neutral-300 rounded-xl text-xs text-neutral-500 hover:bg-neutral-100 transition-colors"
                >
                  + Add Status
                </button>
              </div>
              <p className="text-[10px] text-neutral-400 italic">These statuses are used for ticket management.</p>
            </div>

            <div className="space-y-4">
              <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider">Allowed Ticket Priorities</label>
              <div className="flex flex-wrap gap-2">
                {systemConfig.allowedPriorities.map((priority, index) => (
                  <div key={index} className="flex items-center gap-2 bg-neutral-100 px-3 py-1.5 rounded-xl border border-black/5">
                    <span className="text-xs font-medium text-neutral-700">{priority}</span>
                    <button 
                      onClick={() => setSystemConfig({
                        ...systemConfig,
                        allowedPriorities: systemConfig.allowedPriorities.filter((_, i) => i !== index)
                      })}
                      className="text-neutral-400 hover:text-red-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <button 
                  onClick={() => {
                    const newPriority = prompt("Enter new priority:");
                    if (newPriority) setSystemConfig({
                      ...systemConfig,
                      allowedPriorities: [...systemConfig.allowedPriorities, newPriority.toLowerCase()]
                    });
                  }}
                  className="px-3 py-1.5 bg-neutral-50 border border-dashed border-neutral-300 rounded-xl text-xs text-neutral-500 hover:bg-neutral-100 transition-colors"
                >
                  + Add Priority
                </button>
              </div>
              <p className="text-[10px] text-neutral-400 italic">These priorities are used for ticket creation.</p>
            </div>
          </div>
        </div>

        {/* Commands Row-based Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-3 bg-white rounded-3xl border border-black/5 shadow-sm overflow-hidden h-fit">
            <div className="p-6 border-b border-black/5 flex flex-col md:flex-row md:items-center justify-between bg-neutral-50/50 gap-4">
            <h3 className="font-bold text-neutral-900 flex items-center gap-2">
              <Send className="w-5 h-5 text-indigo-600" />
              Bot Command Management
            </h3>
            <div className="flex items-center gap-3">
              <div className="relative">
                <input 
                  type="text"
                  placeholder="Search commands..."
                  value={commandSearch}
                  onChange={(e) => setCommandSearch(e.target.value)}
                  className="pl-9 pr-4 py-2 bg-white border border-black/5 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 w-full md:w-64"
                />
                <RefreshCw className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              </div>
              <a 
                href="https://t.me/ServiceDeskBot" 
                target="_blank" 
                rel="noreferrer"
                className="text-xs flex items-center gap-1.5 px-3 py-2 bg-white border border-black/5 rounded-xl text-neutral-600 hover:bg-neutral-50 transition-colors font-medium"
              >
                Test Bot
                <ExternalLink className="w-3 h-3" />
              </a>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText('https://t.me/ServiceDeskBot');
                  alert('Bot link copied to clipboard!');
                }}
                className="text-xs flex items-center gap-1.5 px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-600 hover:bg-indigo-100 transition-colors font-bold"
              >
                Copy Link
              </button>
            </div>
          </div>

          <AnimatePresence>
            {/* Form is now integrated into the table rows */}
          </AnimatePresence>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-neutral-50 text-neutral-500 text-[10px] uppercase tracking-widest font-bold border-b border-black/5">
                <tr>
                  <th className="px-6 py-4">Command</th>
                  <th className="px-6 py-4">Description</th>
                  <th className="px-6 py-4">Response Message</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {/* Add New Command Row */}
                {isAddingCommand && !editingCommandId && (
                  <tr className="bg-indigo-50/30 animate-in fade-in slide-in-from-top-1 duration-200">
                    <td className="px-6 py-4 align-top">
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400 text-xs">/</span>
                        <input 
                          type="text"
                          autoFocus
                          value={commandForm.command}
                          onChange={(e) => setCommandForm({ ...commandForm, command: e.target.value })}
                          placeholder="cmd"
                          className="w-full pl-5 pr-2 py-1.5 bg-white border border-black/10 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-medium"
                        />
                      </div>
                    </td>
                    <td className="px-6 py-4 align-top">
                      <input 
                        type="text"
                        value={commandForm.description}
                        onChange={(e) => setCommandForm({ ...commandForm, description: e.target.value })}
                        placeholder="Description..."
                        className="w-full px-3 py-1.5 bg-white border border-black/10 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </td>
                    <td className="px-6 py-4 align-top">
                      <textarea 
                        value={commandForm.response}
                        onChange={(e) => setCommandForm({ ...commandForm, response: e.target.value })}
                        placeholder="Bot reply..."
                        rows={2}
                        className="w-full px-3 py-1.5 bg-white border border-black/10 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none font-mono"
                      />
                    </td>
                    <td className="px-6 py-4 align-top">
                      <div className="flex items-center h-8">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input 
                            type="checkbox"
                            checked={commandForm.isActive}
                            onChange={(e) => setCommandForm({ ...commandForm, isActive: e.target.checked })}
                            className="w-3.5 h-3.5 rounded border-black/10 text-indigo-600 focus:ring-indigo-500/20"
                          />
                          <span className="text-[10px] font-bold text-neutral-500 uppercase">Active</span>
                        </label>
                      </div>
                    </td>
                    <td className="px-6 py-4 align-top text-right">
                      <div className="flex items-center justify-end gap-2 h-8">
                        <button 
                          onClick={() => setIsAddingCommand(false)}
                          className="p-1.5 text-neutral-400 hover:text-neutral-600 transition-colors"
                          title="Cancel"
                        >
                          <X className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={handleSaveCommand}
                          className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                          title="Save Command"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )}

                {commandsLoading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center">
                      <RefreshCw className="w-6 h-6 animate-spin text-indigo-600 mx-auto" />
                    </td>
                  </tr>
                ) : filteredCommands.length > 0 ? filteredCommands.map((cmd) => (
                  editingCommandId === cmd.id || (editingCommandId === 'system-' + cmd.command && cmd.isSystem) ? (
                    <tr key={cmd.command} className="bg-indigo-50/30">
                      <td className="px-6 py-4 align-top">
                        <div className="flex items-center gap-2">
                          <code className="text-sm font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg">/{cmd.command}</code>
                          {cmd.isSystem && (
                            <span className="text-[8px] px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded-full font-bold uppercase tracking-tighter">System</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 align-top">
                        <input 
                          type="text"
                          autoFocus
                          value={commandForm.description}
                          onChange={(e) => setCommandForm({ ...commandForm, description: e.target.value })}
                          className="w-full px-3 py-1.5 bg-white border border-black/10 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                      </td>
                      <td className="px-6 py-4 align-top">
                      <div className="space-y-3">
                        <textarea 
                          value={commandForm.response}
                          onChange={(e) => setCommandForm({ ...commandForm, response: e.target.value })}
                          rows={3}
                          className="w-full px-3 py-1.5 bg-white border border-black/10 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none font-mono"
                        />
                        <div className="flex items-center justify-between">
                          <div className="flex flex-wrap gap-1">
                            {variables.map(v => (
                              <button 
                                key={v.name}
                                onClick={() => setCommandForm({ ...commandForm, response: commandForm.response + v.name })}
                                className="text-[8px] px-1.5 py-0.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 rounded border border-black/5 transition-colors"
                                title={v.desc}
                              >
                                {v.name}
                              </button>
                            ))}
                          </div>
                          <button 
                            onClick={() => setShowPreview(!showPreview)}
                            className="text-[9px] font-bold text-indigo-600 hover:underline"
                          >
                            {showPreview ? 'Hide Preview' : 'Show Preview'}
                          </button>
                        </div>
                        {showPreview && (
                          <div className="mt-3 p-4 bg-[#f4f4f4] rounded-2xl border border-black/5 shadow-inner relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500/20" />
                            <div className="flex items-start gap-3">
                              <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                                Bot
                              </div>
                              <div className="bg-white p-3 rounded-2xl rounded-tl-none shadow-sm text-[11px] text-neutral-800 leading-relaxed max-w-[200px]" 
                                   dangerouslySetInnerHTML={{ __html: renderPreview(commandForm.response || 'Type something to see preview...') }} 
                              />
                            </div>
                          </div>
                        )}
                      </div>
                      </td>
                      <td className="px-6 py-4 align-top">
                        <div className="flex items-center h-8">
                          <button 
                            onClick={() => setCommandForm({ ...commandForm, isActive: !commandForm.isActive })}
                            className="flex items-center gap-1.5"
                          >
                            <div className={`w-7 h-3.5 rounded-full p-0.5 transition-colors ${commandForm.isActive ? 'bg-emerald-500' : 'bg-neutral-300'}`}>
                              <div className={`w-2.5 h-2.5 rounded-full bg-white transition-transform ${commandForm.isActive ? 'translate-x-3.5' : 'translate-x-0'}`} />
                            </div>
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4 align-top text-right">
                        <div className="flex items-center justify-end gap-2 h-8">
                          <button 
                            onClick={() => {
                              setEditingCommandId(null);
                              setIsAddingCommand(false);
                            }}
                            className="p-1.5 text-neutral-400 hover:text-neutral-600 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={handleSaveCommand}
                            className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                          >
                            <Save className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={cmd.command} className={`hover:bg-neutral-50/50 transition-colors group ${cmd.isSystem ? 'bg-blue-50/10' : ''}`}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <code className="text-sm font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg">/{cmd.command}</code>
                          {cmd.isSystem && (
                            <span className="text-[8px] px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded-full font-bold uppercase tracking-tighter">System</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-xs text-neutral-600 max-w-[150px] truncate">{cmd.description}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-[10px] text-neutral-400 italic max-w-[250px] truncate">"{cmd.response}"</p>
                      </td>
                      <td className="px-6 py-4">
                        <button 
                          onClick={() => toggleCommandStatus(cmd)}
                          className="flex items-center gap-1.5 group/status"
                        >
                          <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${cmd.isActive ? 'bg-emerald-500' : 'bg-neutral-300'}`}>
                            <div className={`w-3 h-3 rounded-full bg-white transition-transform ${cmd.isActive ? 'translate-x-4' : 'translate-x-0'}`} />
                          </div>
                          <span className={`text-[10px] font-bold uppercase transition-colors ${cmd.isActive ? 'text-emerald-600' : 'text-neutral-400'}`}>
                            {cmd.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </button>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => startEdit(cmd)}
                            className="p-2 hover:bg-white rounded-xl text-neutral-400 hover:text-indigo-600 transition-all border border-transparent hover:border-black/5 shadow-none hover:shadow-sm"
                            title="Edit Command"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          {!cmd.isSystem && (
                            <button 
                              onClick={() => handleDeleteCommand(cmd.id!)}
                              className="p-2 hover:bg-white rounded-xl text-neutral-400 hover:text-red-600 transition-all border border-transparent hover:border-black/5 shadow-none hover:shadow-sm"
                              title="Delete Command"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                )) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-neutral-400 italic text-sm">
                      No commands found. Click the (+) button to add one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Activity Log Sidebar */}
        <div className="lg:col-span-1 bg-white rounded-3xl border border-black/5 shadow-sm overflow-hidden flex flex-col h-fit">
          <div className="p-6 border-b border-black/5 bg-neutral-50/50">
            <h3 className="font-bold text-neutral-900 flex items-center gap-2 text-sm">
              <RefreshCw className="w-4 h-4 text-amber-600" />
              Recent Activity
            </h3>
          </div>
          <div className="p-6 space-y-6 flex-1">
            {recentActivity.length > 0 ? recentActivity.map((activity, i) => (
              <div key={i} className="flex gap-3 relative">
                {i !== recentActivity.length - 1 && (
                  <div className="absolute left-1.5 top-6 bottom-[-1.5rem] w-px bg-neutral-100" />
                )}
                <div className="w-3 h-3 rounded-full bg-amber-500 mt-1 shrink-0 border-2 border-white shadow-sm" />
                <div>
                  <p className="text-[10px] font-bold text-neutral-900">{activity.type}</p>
                  <p className="text-[11px] text-neutral-500">{activity.detail}</p>
                  <p className="text-[9px] text-neutral-400 mt-1">{activity.time}</p>
                </div>
              </div>
            )) : (
              <p className="text-xs text-neutral-400 italic text-center py-8">No recent activity</p>
            )}
          </div>
          <div className="p-6 bg-neutral-50 border-t border-black/5">
            <p className="text-[10px] text-neutral-500 leading-relaxed">
              Activity is tracked when you save changes to commands or system parameters.
            </p>
          </div>
        </div>
      </div>

        {/* Technicians List Section */}
        <div className="bg-white rounded-3xl border border-black/5 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-black/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h3 className="font-bold text-neutral-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-600" />
              Technician Linking Status
            </h3>
            <div className="flex items-center gap-3">
              <div className="relative">
                <input 
                  type="text"
                  placeholder="Search technicians..."
                  value={techSearch}
                  onChange={(e) => setTechSearch(e.target.value)}
                  className="pl-9 pr-4 py-2 bg-neutral-50 border border-black/5 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 w-full md:w-64"
                />
                <Users className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              </div>
              <button 
                onClick={fetchTechnicians}
                className="p-2 hover:bg-neutral-100 rounded-xl transition-colors"
                title="Refresh List"
              >
                <RefreshCw className={`w-4 h-4 text-neutral-400 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-neutral-50 text-neutral-500 text-[10px] uppercase tracking-widest font-bold border-b border-black/5">
                <tr>
                  <th className="px-6 py-4">Technician</th>
                  <th className="px-6 py-4">Telegram ID</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-neutral-500">
                      <div className="flex justify-center">
                        <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
                      </div>
                    </td>
                  </tr>
                ) : filteredTechnicians.length > 0 ? filteredTechnicians.map((tech) => (
                  <tr key={tech.uid} className="hover:bg-neutral-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <img 
                          src={tech.photoURL || `https://ui-avatars.com/api/?name=${tech.name}`} 
                          alt={tech.name}
                          className="w-8 h-8 rounded-full border border-black/5"
                        />
                        <div>
                          <p className="text-sm font-bold text-neutral-900">{tech.name}</p>
                          <p className="text-xs text-neutral-500">{tech.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {editingTechId === tech.uid ? (
                        <div className="flex items-center gap-2">
                          <input 
                            type="text"
                            value={techTelegramId}
                            onChange={(e) => setTechTelegramId(e.target.value)}
                            placeholder="Chat ID"
                            className="w-32 px-2 py-1 bg-white border border-black/10 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          />
                          <button 
                            onClick={() => updateTelegramId(tech.uid)}
                            className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => setEditingTechId(null)}
                            className="p-1 text-red-600 hover:bg-red-50 rounded"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : tech.telegramId ? (
                        <code className="text-xs bg-neutral-100 px-2 py-1 rounded text-neutral-700">
                          {tech.telegramId}
                        </code>
                      ) : (
                        <span className="text-xs text-neutral-400 italic">Not linked</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {tech.telegramId ? (
                        <div className="flex items-center gap-1.5 text-emerald-600">
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="text-xs font-bold">Linked</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-neutral-400">
                          <XCircle className="w-4 h-4" />
                          <span className="text-xs font-bold">Unlinked</span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => {
                            setEditingTechId(tech.uid);
                            setTechTelegramId(tech.telegramId || '');
                          }}
                          className="text-xs text-indigo-600 font-bold hover:underline"
                        >
                          Edit
                        </button>
                        {tech.telegramId && (
                          <button 
                            onClick={() => unlinkTelegram(tech.uid)}
                            className="text-xs text-red-600 font-bold hover:underline"
                          >
                            Unlink
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-neutral-500">
                      No technicians found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
