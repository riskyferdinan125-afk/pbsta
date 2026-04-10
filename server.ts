import express from 'express';
import 'dotenv/config';
import { createServer as createViteServer } from 'vite';
import { initializeApp } from 'firebase/app';
import { initializeFirestore, collection, query, where, getDocs, updateDoc, doc, addDoc, serverTimestamp, runTransaction, Timestamp, setDoc, getDoc } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import TelegramBot from 'node-telegram-bot-api';
import fetch from 'node-fetch';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

function handleFirestoreError(error: any, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: null,
      email: null,
      emailVerified: false,
      isAnonymous: true,
      tenantId: null,
      providerInfo: []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load Firebase Config
let firebaseConfig: any = {};
try {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } else {
    console.warn("⚠️ firebase-applet-config.json not found.");
  }
} catch (e) {
  console.error("❌ Error loading firebase-applet-config.json:", e);
}

let firebaseApp;
let db: any;

try {
  firebaseApp = initializeApp(firebaseConfig);
  db = initializeFirestore(firebaseApp, {
    experimentalForceLongPolling: true,
  }, firebaseConfig.firestoreDatabaseId);
  console.log("✅ Firebase & Firestore initialized successfully");
} catch (error) {
  console.error("❌ Failed to initialize Firebase/Firestore:", error);
  // We still want the server to start even if Firebase fails, 
  // so the health check can pass and we can diagnose the issue.
}

// Telegram Bot Integration
let bot: TelegramBot | null = null;
const projectSessions = new Map<number, { projectId?: string, jobId?: string, stage?: string }>();
const ticketSessions = new Map<number, { category?: string, subCategory?: string, stage?: string }>();
const repairSessions = new Map<number, { 
  command: 'progres' | 'close',
  stage: string,
  customerId?: string,
  repairType?: 'Logic' | 'Physical',
  rootCause?: string,
  repairAction?: string,
  materials?: { id: string, name: string, quantity: number }[],
  photoId?: string
}>();

const TICKET_CATEGORIES: Record<string, string[]> = {
  'PROJECT': ['DISTRIBUSI', 'FEEDER', 'ODC', 'ODP'],
  'REGULER': ['PLATINUM', 'DIAMOND', 'VVIP', 'GOLD', 'REGULER', 'HVC PLATINUM', 'HVC GOLD', 'HVC DIAMOND', 'NON HVC'],
  'PSB': ['MyRep', 'TBG', '5 MENARA BINTANG', 'Hypemet', 'Surge', 'IBU - FTTR', 'PT Anagata Cipta Teknologi', 'Datin', 'Olo', 'Wifi'],
  'SQM': ['WorkHours', 'NonWorkHours'],
  'UNSPEKS': ['Datin', 'HSI', 'Wifi'],
  'EXBIS': ['TIS', 'Lintasarta', 'Mitratel', 'Surge', 'Centratama', 'UMT'],
  'CORRECTIVE': ['CSA', 'MMP', 'TBG', 'TIS', 'Polaris', 'Mitratel', 'Digiserve', 'Cross Connect TDE', 'IBU - FTTR', 'Nutech', 'SNT', 'SPBU', 'Surge', 'MyRep', 'Asianet', 'Centratama', 'Lintasarta', 'UMT'],
  'PREVENTIVE': ['MMP', 'CSA', 'TBG', 'Polaris', 'TIS', 'Fiberisasi', 'Digiserve', 'Cross Connect TDE', 'IBU - FTTR', 'NuTech', 'SNT', 'SPBU', 'Surge', 'Asianet', 'Centratama', 'Lintasarta', 'UMT'],
  'Other': ['Lainnya']
};

const CATEGORY_WEIGHTS: Record<string, number> = {
  'PROJECT': 5, 'REGULER': 2, 'PSB': 3, 'SQM': 3, 'UNSPEKS': 4, 'EXBIS': 4, 'CORRECTIVE': 4, 'PREVENTIVE': 3, 'Other': 1
};

const SUB_CATEGORY_WEIGHTS: Record<string, Record<string, number>> = {
  'REGULER': {
    'UNSPEKS': 1,
    'SQM': 1,
    'PSB': 1,
    'Other': 1
  },
  'PROJECT': {
    'New Installation': 5,
    'Upgrade': 3,
    'Maintenance': 2
  }
};

const EVIDEN_OPTIONS = [
  'KABEL', 'UC', 'TIANG', 'ODP', 'ODC', 'PATCHORE', 'OTB', 'PASSIVE', 
  'GROUNDING', 'PIPA', 'HDPE', 'GALIAN', 'AKSESORIS', 'MAINHOLE', 
  'SAMBUNGAN', 'DROPCORE', 'ADAPTOR', 'PEMBONGKARAN'
];

function calculatePoints(category: string, subCategory?: string): number {
  let points = CATEGORY_WEIGHTS[category] || 1;
  if (subCategory && SUB_CATEGORY_WEIGHTS[category] && SUB_CATEGORY_WEIGHTS[category][subCategory]) {
    points = SUB_CATEGORY_WEIGHTS[category][subCategory];
  }
  return points;
}

async function handleTicketCreation(chatId: number, category: string, subCategory: string, customerId: string) {
  try {
    const userDoc = await getAuthorizedUser(chatId);
    if (!userDoc) return;

    const custQuery = query(collection(db, 'customers'), where('customerId', '==', customerId));
    const custSnap = await getDocs(custQuery);
    
    if (custSnap.empty) {
      bot?.sendMessage(chatId, `❌ *Customer Tidak Ditemukan!*\n\nCustomer ID \`${customerId}\` tidak terdaftar.`, { parse_mode: 'Markdown' });
      return;
    }

    const existingCust = custSnap.docs[0];
    const customerData = existingCust.data();
    const points = calculatePoints(category, subCategory);

    const ticketNumber = await runTransaction(db, async (transaction) => {
      const counterRef = doc(db, 'counters', 'tickets');
      const counterSnap = await transaction.get(counterRef);
      let nextNumber = (counterSnap.exists() ? counterSnap.data().current : 1000) + 1;
      transaction.set(counterRef, { current: nextNumber }, { merge: true });
      return nextNumber;
    });

    await addDoc(collection(db, 'tickets'), {
      customerId: existingCust.id,
      customerName: customerData.name,
      customerExternalId: customerId,
      description: `Created via Telegram by ${userDoc.data().name || 'Technician'}`,
      status: 'open',
      priority: 'medium',
      category,
      subCategory,
      points,
      ticketNumber,
      technicianIds: [],
      isTimerRunning: false,
      timerStartedAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    let successMsg = `✅ *Tiket Berhasil Dibuat!*\n\n`;
    successMsg += `No Tiket: #${ticketNumber}\n`;
    successMsg += `Customer: ${customerData.name}\n`;
    successMsg += `Kategori: ${category}\n`;
    successMsg += `Sub Kategori: ${subCategory}\n`;
    successMsg += `Poin: ${points}`;
    
    bot?.sendMessage(chatId, successMsg, { parse_mode: 'Markdown' });
  } catch (e: any) {
    console.error("Error creating ticket:", e);
    bot?.sendMessage(chatId, `❌ *Gagal membuat tiket!*`);
  }
}

async function getSystemConfig() {
  try {
    const snap = await getDocs(collection(db, 'telegramConfig'));
    if (!snap.empty) return snap.docs[0].data();
  } catch (e) {
    console.error("Error fetching system config:", e);
  }
  return {
    allowedStatuses: ['open', 'in-progress', 'resolved', 'closed'],
    allowedPriorities: ['low', 'medium', 'high', 'urgent']
  };
}

async function getCommandOverride(command: string) {
  try {
    const q = query(collection(db, 'telegramCommands'), where('command', '==', command), where('isActive', '==', true));
    const snap = await getDocs(q);
    if (!snap.empty) return snap.docs[0].data();
  } catch (e) {
    console.error(`Error fetching ${command} override:`, e);
  }
  return null;
}

/**
 * Helper to find or create a technician record for a user.
 * Implements "automatic technician data from assign ticket" logic.
 */
async function getOrCreateTechnician(userDoc: any, chatId: number, targetTicket?: any) {
  try {
    // 1. Try finding by email (most reliable)
    const email = userDoc.data().email;
    if (email) {
      const q = query(collection(db, 'users'), where('email', '==', email), where('role', '==', 'teknisi'));
      const snap = await getDocs(q);
      if (!snap.empty) return snap.docs[0];
    }

    // 2. Try by ID (consistency)
    const userRef = doc(db, 'users', userDoc.id);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists() && userSnap.data().role === 'teknisi') return userSnap;

    // 3. AUTO-UPGRADE: If user exists but not a technician, upgrade them?
    // Or just ensure the user record has technician fields.
    const techData = {
      nik: userDoc.data().nik || userDoc.data().email?.split('@')[0] || `TECH-${userDoc.id.slice(0, 5)}`,
      role: 'teknisi',
      availabilityStatus: 'Available',
      updatedAt: serverTimestamp()
    };
    
    await updateDoc(userRef, techData);
    const newSnap = await getDoc(userRef);
    
    bot?.sendMessage(chatId, `✅ *Data Teknisi Diaktifkan*\n\nAkun Anda telah didaftarkan sebagai teknisi dengan NIK: \`${techData.nik}\`.`, { parse_mode: 'Markdown' });
    return newSnap;
  } catch (e: any) {
    if (e.message?.includes('insufficient permissions')) {
      handleFirestoreError(e, OperationType.WRITE, 'users');
    }
    console.error("Error in getOrCreateTechnician:", e);
    return null;
  }
}

/**
 * Helper to get authorized user from Telegram chatId.
 * Includes bootstrap logic for superadmin.
 */
async function getAuthorizedUser(chatId: number) {
  try {
    const chatIdStr = chatId.toString();
    
    // 1. Try finding by telegramId (string or number for robustness)
    let userQuery = query(collection(db, 'users'), where('telegramId', '==', chatIdStr));
    let userSnap = await getDocs(userQuery);
    
    if (userSnap.empty) {
      // Try as number just in case
      userQuery = query(collection(db, 'users'), where('telegramId', '==', chatId));
      userSnap = await getDocs(userQuery);
    }

    // 2. Bootstrap logic for specific ID
    if (chatIdStr === '92612546') {
      if (userSnap.empty) {
        // Try finding by email first to avoid duplicates
        const emailQuery = query(collection(db, 'users'), where('email', '==', 'rafandanetid@gmail.com'));
        const emailSnap = await getDocs(emailQuery);
        
        if (!emailSnap.empty) {
          const userDoc = emailSnap.docs[0];
          await updateDoc(userDoc.ref, {
            telegramId: chatIdStr,
            role: 'superadmin',
            updatedAt: serverTimestamp()
          });
          return await getDoc(userDoc.ref);
        } else {
          // Create new bootstrap user
          const newDocRef = await addDoc(collection(db, 'users'), {
            uid: 'bootstrap_92612546',
            name: 'Super Admin (Bot)',
            email: 'rafandanetid@gmail.com',
            role: 'superadmin',
            telegramId: chatIdStr,
            createdAt: serverTimestamp()
          });
          bot?.sendMessage(chatId, "👑 *Superadmin Bootstrapped!*\n\nAkun Anda telah didaftarkan sebagai Superadmin sistem.", { parse_mode: 'Markdown' });
          return await getDoc(newDocRef);
        }
      } else {
        // Ensure existing user has superadmin role
        const userDoc = userSnap.docs[0];
        if (userDoc.data().role !== 'superadmin') {
          await updateDoc(userDoc.ref, {
            role: 'superadmin',
            updatedAt: serverTimestamp()
          });
          bot?.sendMessage(chatId, "🚀 *Role Updated!*\n\nAkun Anda telah ditingkatkan menjadi Superadmin.", { parse_mode: 'Markdown' });
          return await getDoc(userDoc.ref);
        }
      }
    }

    // 3. Auto-register for other users if not found
    if (userSnap.empty) {
      const newDocRef = await addDoc(collection(db, 'users'), {
        uid: `telegram_${chatIdStr}`,
        name: `User ${chatIdStr}`,
        email: `tg_${chatIdStr}@telegram.bot`,
        role: 'teknisi', // Default role
        telegramId: chatIdStr,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      bot?.sendMessage(chatId, "✅ *Akun Terdaftar Otomatis!*\n\nAnda sekarang dapat menggunakan bot ini. Role default Anda adalah `teknisi`.", { parse_mode: 'Markdown' });
      return await getDoc(newDocRef);
    }

    return userSnap.docs[0];
  } catch (e: any) {
    if (e.message?.includes('insufficient permissions')) {
      handleFirestoreError(e, OperationType.LIST, 'users');
    }
    console.error("Error in getAuthorizedUser:", e);
    return null;
  }
}

async function initTelegramBot() {
  console.log("Initializing Telegram Bot...");
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken || !botToken.includes(':')) {
    console.warn("TELEGRAM_BOT_TOKEN not found or invalid.");
    return;
  }

  if (bot) return;

  console.log("🤖 Initializing Telegram Bot...");
  
  // Add a small delay to avoid 409 Conflict during rapid restarts
  await new Promise(resolve => setTimeout(resolve, 2000));

  try {
    bot = new TelegramBot(botToken, { polling: true });

    bot.on('polling_error', (error) => {
      if (error.message.includes('409 Conflict')) {
        // Suppress noisy 409 errors during restarts
        return;
      }
      console.error("❌ Telegram Bot Polling Error:", error.message);
    });

    bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;
      
      try {
        // Bootstrap/Get user
        const userDoc = await getAuthorizedUser(chatId);

        const cmdSnap = await getDocs(query(collection(db, 'telegramCommands'), where('command', '==', 'start'), where('isActive', '==', true)));
        if (!cmdSnap.empty) {
          const cmd = cmdSnap.docs[0].data();
          const response = cmd.response.replace('{chatId}', chatId.toString());
          bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
          return;
        }

        let welcome = "Welcome to Service Desk Bot! 🤖\n\n";
        welcome += "Akun Anda telah terhubung secara otomatis.\n\n";
        welcome += "Ketik `/help` untuk melihat panduan.";
        bot.sendMessage(chatId, welcome, { parse_mode: 'Markdown' });
      } catch (e: any) {
        console.error("Error in /start handler:", e);
        bot.sendMessage(chatId, "❌ *Gagal memulai bot!*\n\nSilakan coba lagi nanti.");
      }
    });

    bot.onText(/\/help/, async (msg) => {
      const chatId = msg.chat.id;

      try {
        const cmdSnap = await getDocs(query(collection(db, 'telegramCommands'), where('command', '==', 'help'), where('isActive', '==', true)));
        if (!cmdSnap.empty) {
          const cmd = cmdSnap.docs[0].data();
          bot.sendMessage(chatId, cmd.response, { parse_mode: 'Markdown' });
          return;
        }

        let help = "📑 *Panduan Bot Telegram* 📑\n\n";
        help += "Bot ini digunakan untuk membantu operasional Service Desk.\n\n";
        help += "*Perintah Utama:*\n";
        help += "`/start` - Mulai interaksi dan dapatkan Chat ID\n";
        help += "`/help` - Tampilkan panduan ini\n";
        help += "`/progres` - Update progres lapangan (format teks + foto)\n";
        help += "`/close` - Update close order lapangan (format teks + foto)\n";
        help += "`/pelanggan` - Tambah pelanggan baru (format teks)\n";
        help += "`/addtiket` - Buat tiket baru (format teks)\n";
        help += "`/addprojects` - Buat proyek baru (PID, Nama, Insera, Witel, Mitra, Lokasi)\n";
        help += "`/boq` - Update material/designator proyek\n";
        help += "`/assign` - Assign tiket ke teknisi (format teks)\n";
        help += "`/projects` - List proyek aktif untuk update progres\n";
        help += "`/finish_proyek` - Selesaikan proyek dan generate laporan\n\n";
        
        const commandsRef = collection(db, 'telegramCommands');
        const q = query(commandsRef, where('isActive', '==', true));
        const snap = await getDocs(q);
        if (!snap.empty) {
          help += "*Daftar Perintah:*\n";
          snap.docs.forEach(doc => {
            const cmd = doc.data();
            if (cmd.command !== 'help' && cmd.command !== 'start') {
              help += `\`/${cmd.command}\` - ${cmd.description || 'Tanpa deskripsi'}\n`;
            }
          });
        } else {
          help += "Belum ada perintah tambahan yang dikonfigurasi.";
        }
        
        bot.sendMessage(chatId, help, { parse_mode: 'Markdown' });
      } catch (e: any) {
        console.error("Error in /help handler:", e);
        bot.sendMessage(chatId, "❌ *Gagal menampilkan panduan!*");
      }
    });

    // Helper for processing field updates (progres/close)
    async function finalizeRepair(chatId: number, session: any, photoId: string) {
      try {
        const isClosure = session.command === 'close';
        const photoUrl = `/api/telegram-photo/${photoId}`;
        
        // 1. Find Customer & Ticket
        const custQuery = query(collection(db, 'customers'), where('customerId', '==', session.customerId));
        const custSnap = await getDocs(custQuery);
        if (custSnap.empty) throw new Error("Customer not found");
        const customerDoc = custSnap.docs[0];
        
        const ticketQuery = query(collection(db, 'tickets'), where('customerId', '==', customerDoc.id), where('status', '!=', 'closed'));
        const ticketSnap = await getDocs(ticketQuery);
        if (ticketSnap.empty) throw new Error("Active ticket not found");
        const targetTicket = ticketSnap.docs[0];

        // 2. Verify User
        const userDoc = await getAuthorizedUser(chatId);
        if (!userDoc) throw new Error("User not authorized");

        // 3. Deduct Materials
        const materialsUsed = [];
        if (session.materials) {
          for (const mat of session.materials) {
            const matRef = doc(db, 'materials', mat.id);
            const matSnap = await getDoc(matRef);
            if (matSnap.exists()) {
              const matData = matSnap.data();
              const newQty = (matData.quantity || 0) - mat.quantity;
              await updateDoc(matRef, {
                quantity: newQty,
                lastUsedAt: serverTimestamp(),
                updatedAt: serverTimestamp()
              });
              
              materialsUsed.push({
                materialId: mat.id,
                name: mat.name,
                quantity: mat.quantity,
                unit: matData.unit
              });

              if (newQty <= 5) {
                await addDoc(collection(db, 'notifications'), {
                  userId: 'superadmin',
                  title: 'Low Stock Alert',
                  message: `Material ${matData.name} is low on stock (${newQty} ${matData.unit} left).`,
                  type: 'low_stock',
                  read: false,
                  createdAt: serverTimestamp()
                });
              }
            }
          }
        }

        // 4. Create Repair Record
        const techIds = targetTicket.data().technicianIds || [];
        const primaryTechId = techIds[0] || userDoc.id;

        await addDoc(collection(db, 'repairRecords'), {
          ticketId: targetTicket.id,
          technicianId: primaryTechId,
          startTime: serverTimestamp(),
          endTime: isClosure ? serverTimestamp() : null,
          type: session.repairType,
          rootCause: session.rootCause,
          repairAction: session.repairAction,
          evidencePhoto: photoUrl,
          materialsUsed: materialsUsed,
          createdAt: serverTimestamp()
        });

        // 5. Update Ticket
        const ticketUpdates: any = { updatedAt: serverTimestamp() };
        if (isClosure) {
          ticketUpdates.status = 'closed';
          ticketUpdates.afterPhoto = photoUrl;
        } else {
          ticketUpdates.beforePhoto = photoUrl;
        }
        await updateDoc(targetTicket.ref, ticketUpdates);

        // 6. Create Field Entry
        const collectionName = isClosure ? 'fieldClosures' : 'fieldProgress';
        await addDoc(collection(db, collectionName), {
          customerId: session.customerId,
          ticketNumber: targetTicket.data().ticketNumber,
          cause: session.rootCause,
          action: session.repairAction,
          photoUrl: photoUrl,
          chatId,
          reportedBy: userDoc.id,
          createdAt: serverTimestamp()
        });

        bot?.sendMessage(chatId, `✅ *Berhasil!*\n\n${isClosure ? 'Tiket telah ditutup.' : 'Progres telah diperbarui.'}\n\nCustomer: ${customerDoc.data().name}\nNo Tiket: #${targetTicket.data().ticketNumber}`, { parse_mode: 'Markdown' });
        repairSessions.delete(chatId);
      } catch (e: any) {
        console.error("Error finalizing repair:", e);
        bot?.sendMessage(chatId, `❌ *Gagal memproses perbaikan!*\n\nError: ${e.message}`);
      }
    }

    // Helper for processing field updates (progres/close)
    async function processFieldUpdate(chatId: number, text: string, photoId?: string) {
      const isClosure = text.toLowerCase().startsWith('/close');
      const commandType = isClosure ? 'close' : 'progres';
      
      console.log(`[${commandType}] Processing update from ${chatId}${photoId ? ' with photo' : ''}`);
      
      const parts = text.split('\n').map(p => p.trim()).filter(p => p.length > 0);
      
      // If it's just the command, send template
      if (parts.length < 2) {
        const template = isClosure ? 
          "🏁 *Format Close Order Lapangan* 🏁\n\n" +
          "Silakan kirim *FOTO EVIDEN* dengan caption format di bawah ini:\n\n" +
          "`/close`\n" +
          "Customer ID:\n" +
          "No Tiket:\n" +
          "Penyebab GGN:\n" +
          "Perbaikan GGN:\n" +
          "Letak Perbaikan:\n" +
          "Material:\n" +
          "Teknisi:\n" +
          "Phone Number:" :
          "📑 *Format Update Progres Lapangan* 📑\n\n" +
          "Silakan kirim *FOTO PROGRES* dengan caption format di bawah ini:\n\n" +
          "`/progres`\n" +
          "Customer ID:\n" +
          "No Tiket:\n" +
          "Penyebab GGN:\n" +
          "Perbaikan GGN:\n" +
          "Letak Perbaikan:\n" +
          "Material:\n" +
          "Teknisi:\n" +
          "Phone Number:";
        
        bot?.sendMessage(chatId, template, { parse_mode: 'Markdown' });
        return;
      }

      // Parsing logic
      const data: any = {};
      parts.forEach(line => {
        if (line.includes(':')) {
          const [key, ...val] = line.split(':');
          const value = val.join(':').trim();
          const cleanKey = key.trim().toLowerCase();
          
          if (cleanKey.includes('customer id')) data.customerId = value;
          if (cleanKey.includes('inet')) data.internetNumber = value;
          if (cleanKey.includes('tiket')) data.ticketNumber = value;
          if (cleanKey.includes('penyebab')) data.cause = value;
          if (cleanKey.includes('perbaikan ggn')) data.action = value;
          if (cleanKey.includes('letak')) data.location = value;
          if (cleanKey.includes('material')) data.materials = value;
          if (cleanKey.includes('nohp') || cleanKey.includes('phone number')) data.customerPhone = value;
          if (cleanKey.includes('teknisi')) data.manualTechnician = value;
        }
      });

      if (!data.customerId && !data.ticketNumber) {
        bot?.sendMessage(chatId, "⚠️ *Data tidak lengkap!*\n\nMohon pastikan `Customer ID` atau `No Tiket` terisi.", { parse_mode: 'Markdown' });
        return;
      }

      try {
        // 1. Verify sender
        const userDoc = await getAuthorizedUser(chatId);
        
        if (!userDoc) {
          bot?.sendMessage(chatId, "❌ *Akses Ditolak!*\n\nAkun Telegram Anda belum terhubung. Silakan hubungkan di menu profil.", { parse_mode: 'Markdown' });
          return;
        }

        // 2. Find Ticket
        let targetTicket;
        if (data.ticketNumber) {
          const tNum = parseInt(data.ticketNumber);
          if (!isNaN(tNum)) {
            const tQuery = query(collection(db, 'tickets'), where('ticketNumber', '==', tNum));
            const tSnap = await getDocs(tQuery);
            if (!tSnap.empty) targetTicket = tSnap.docs[0];
          }
        }

        if (!targetTicket && data.customerId) {
          // Find customer first
          const custQuery = query(collection(db, 'customers'), where('customerId', '==', data.customerId));
          const custSnap = await getDocs(custQuery);
          if (!custSnap.empty) {
            const customerDoc = custSnap.docs[0];
            const ticketQuery = query(collection(db, 'tickets'), where('customerId', '==', customerDoc.id));
            const ticketSnap = await getDocs(ticketQuery);
            const activeTickets = ticketSnap.docs
              .filter(doc => doc.data().status !== 'closed')
              .sort((a, b) => (b.data().createdAt?.seconds || 0) - (a.data().createdAt?.seconds || 0));
            
            if (activeTickets.length > 0) {
              targetTicket = activeTickets[0];
              data.ticketNumber = targetTicket.data().ticketNumber.toString();
            }
          }
        }

        if (!targetTicket) {
          bot?.sendMessage(chatId, `❌ *Tiket Tidak Ditemukan!*\n\nPastikan Customer ID atau No Tiket benar dan memiliki tiket aktif.`, { parse_mode: 'Markdown' });
          return;
        }

        // 3. Automatic Technician Data from Ticket Assignment
        const techIds = targetTicket.data().technicianIds || [];
        let techNames = [];
        let techNiks = [];
        let primaryTechId = techIds[0] || null;
        
        if (techIds.length > 0) {
          for (const tid of techIds) {
            const tDoc = await getDoc(doc(db, 'users', tid));
            if (tDoc.exists()) {
              techNames.push(tDoc.data().name);
              techNiks.push(tDoc.data().nik);
            }
          }
        } else {
          // Fallback to sender if no one is assigned? 
          // Or just use sender's info as requested "otomatis sesuaikan dengan assign"
          // If unassigned, we might want to know who is reporting.
          const senderTech = await getOrCreateTechnician(userDoc, chatId, targetTicket);
          if (senderTech) {
            techNames.push(senderTech.data().name);
            techNiks.push(senderTech.data().nik);
            primaryTechId = senderTech.id;
          }
        }

        data.technician = data.manualTechnician || techNames.join(', ') || 'Unassigned';
        data.technicianNik = techNiks.join(', ') || '-';
        if (photoId) {
          const photoUrl = `/api/telegram-photo/${photoId}`;
          data.photoUrl = photoUrl;
          
          // Update ticket visual progress
          const ticketUpdates: any = { updatedAt: serverTimestamp() };
          if (isClosure) {
            ticketUpdates.afterPhoto = photoUrl;
          } else {
            // For /progres, update beforePhoto if it's empty, otherwise just update it?
            // Let's just update beforePhoto for /progres as it's the most common use case for "Progress" in this context
            ticketUpdates.beforePhoto = photoUrl;
          }
          await updateDoc(targetTicket.ref, ticketUpdates);
        }

        // Save to Firestore
        const collectionName = isClosure ? 'fieldClosures' : 'fieldProgress';
        await addDoc(collection(db, collectionName), {
          ...data,
          chatId,
          reportedBy: userDoc.id,
          createdAt: serverTimestamp()
        });

        // If it's a closure, update the ticket status to 'closed'
        if (isClosure) {
          await updateDoc(targetTicket.ref, {
            status: 'closed',
            updatedAt: serverTimestamp()
          });
        }

        // 4. Create Repair Record and Update Material Stock
        if (data.action) {
          try {
            const materialsUsed: any[] = [];
            
            // Basic material parsing from text
            if (data.materials) {
              const materialParts = data.materials.split(',').map((p: string) => p.trim()).filter((p: string) => p.length > 0);
              const allMaterialsSnap = await getDocs(collection(db, 'materials'));
              const allMaterials = allMaterialsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
              
              for (const part of materialParts) {
                // Try to find material name and quantity in string like "Kabel 10m" or "Connector 2"
                const match = part.match(/(.*?)\s*(\d+)\s*(\w+)?/);
                if (match) {
                  const name = match[1].trim().toLowerCase();
                  const qty = parseInt(match[2]);
                  
                  const found = allMaterials.find(m => m.name.toLowerCase().includes(name) || name.includes(m.name.toLowerCase()));
                  if (found && !isNaN(qty)) {
                    materialsUsed.push({
                      materialId: found.id,
                      name: found.name,
                      quantity: qty,
                      unit: found.unit
                    });
                    
                    // Deduct stock
                    const newQty = (found.quantity || 0) - qty;
                    await updateDoc(doc(db, 'materials', found.id), {
                      quantity: newQty,
                      lastUsedAt: serverTimestamp(),
                      updatedAt: serverTimestamp()
                    });
                    
                    // Create notification for low stock
                    if (newQty <= 5) {
                      await addDoc(collection(db, 'notifications'), {
                        userId: 'superadmin', // Or notify all admins
                        title: 'Low Stock Alert',
                        message: `Material ${found.name} is low on stock (${newQty} ${found.unit} left).`,
                        type: 'low_stock',
                        read: false,
                        createdAt: serverTimestamp()
                      });
                    }
                  }
                }
              }
            }

            await addDoc(collection(db, 'repairRecords'), {
              ticketId: targetTicket.id,
              technicianId: primaryTechId || 'unknown',
              startTime: serverTimestamp(),
              endTime: isClosure ? serverTimestamp() : null,
              notes: data.action,
              materialsUsed: materialsUsed, 
              beforePhoto: (!isClosure && data.photoUrl) ? data.photoUrl : null,
              afterPhoto: (isClosure && data.photoUrl) ? data.photoUrl : null,
              createdAt: serverTimestamp()
            });
          } catch (repairErr) {
            console.error("Error creating repair record:", repairErr);
          }
        }
        
        const successMsg = isClosure ? 
          "✅ *Data Berhasil Disimpan!*\n\nOrder Berhasil Di-Close." : 
          "✅ *Data Berhasil Disimpan!*\n\nProgres Lapangan telah tersimpan.";
        
        bot?.sendMessage(chatId, successMsg, { parse_mode: 'Markdown' });
      } catch (e: any) {
        console.error(`Error in ${commandType}:`, e);
        bot?.sendMessage(chatId, `❌ *Gagal menyimpan data!*\n\nError: ${e.message || 'Unknown error'}`, { parse_mode: 'Markdown' });
      }
    }

    bot.onText(/^\/projects/i, async (msg) => {
      const chatId = msg.chat.id;
      
      try {
        // Verify user
        const userDoc = await getAuthorizedUser(chatId);
        
        if (!userDoc) {
          bot?.sendMessage(chatId, "❌ *Akses Ditolak!*\n\nAkun Telegram Anda belum terhubung. Silakan hubungkan di menu profil.", { parse_mode: 'Markdown' });
          return;
        }

        const userId = userDoc.id;

        // Find all active projects
        // Using in-memory filtering for status to avoid index requirements for inequality queries
        const snap = await getDocs(collection(db, 'projects'));
        const activeProjects = snap.docs.filter(doc => {
          const data = doc.data();
          return data.status !== 'completed';
        });

        if (activeProjects.length === 0) {
          bot?.sendMessage(chatId, "📭 *Tidak ada proyek aktif* saat ini.");
          return;
        }

        const keyboard = activeProjects.map(doc => ([{
          text: `🏗️ ${doc.data().pid} - ${doc.data().description.slice(0, 20)}...`,
          callback_data: `prj_sel_${doc.id}`
        }]));

        bot?.sendMessage(chatId, "🏗️ *Daftar Proyek Aktif*\n\nSilakan pilih proyek untuk update progres:", {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: keyboard }
        });
      } catch (e: any) {
        console.error("Error in /projects command:", e);
        bot?.sendMessage(chatId, `❌ *Terjadi kesalahan!*\n\nDetail: ${e.message || 'Unknown error'}`);
      }
    });

    // Handle Callback Queries
    bot.on('callback_query', async (query) => {
      const chatId = query.message?.chat.id;
      const data = query.data;
      if (!chatId || !data) return;

      try {
        // Project Selection
        if (data.startsWith('prj_sel_')) {
          const projectId = data.replace('prj_sel_', '');
          projectSessions.set(chatId, { projectId });
          
          const projectSnap = await getDoc(doc(db, 'projects', projectId));
          if (!projectSnap.exists()) return;
          const projectData = projectSnap.data();

          const stages = [
            { text: '📸 Eviden Pra (Sebelum)', data: 'Sebelum' },
            { text: '⛏️ Penggalian', data: 'Penggalian' },
            { text: '🏗️ Tanam Tiang', data: 'Tanam tiang' },
            { text: '🧱 Pengecoran', data: 'Pengecoran' },
            { text: '🧵 Penarikan Kabel', data: 'Penarikan kabel' },
            { text: '🛠️ Pasang Aksesoris', data: 'Pemasangan aksesoris' },
            { text: '🔌 Sambung Core', data: 'Penyambungan core' },
            { text: '📦 Pasang UC', data: 'Pemasangan UC' },
            { text: '🚀 Naik UC', data: 'Penaikan UC' },
            { text: '✅ Eviden Pasca (Sesudah)', data: 'Sesudah' },
            { text: '📏 Hasil Ukur', data: 'Hasil ukur' },
            { text: '📐 As Built Drawing', data: 'As built drawing' },
            { text: '📄 Berita Acara', data: 'Berita acara' },
            { text: '🎫 Tiket Insera', data: 'Tiket Insera' }
          ];

          const keyboard = [];
          for (let i = 0; i < stages.length; i += 2) {
            const row = [
              { text: stages[i].text, callback_data: `prj_stg_${stages[i].data}` }
            ];
            if (stages[i+1]) {
              row.push({ text: stages[i+1].text, callback_data: `prj_stg_${stages[i+1].data}` });
            }
            keyboard.push(row);
          }

          try {
            await bot?.editMessageText(`🏗️ *Proyek: ${projectData.pid}*\n\nSilakan pilih tahap pekerjaan yang ingin di-update:`, {
              chat_id: chatId,
              message_id: query.message?.message_id,
              parse_mode: 'Markdown',
              reply_markup: { inline_keyboard: keyboard }
            });
          } catch (editError: any) {
            if (!editError.message.includes('message is not modified')) {
              throw editError;
            }
          }
        }

        // Stage Selection
        if (data.startsWith('prj_stg_')) {
          const stage = data.replace('prj_stg_', '');
          const session = projectSessions.get(chatId);
          if (!session) return;
          
          projectSessions.set(chatId, { ...session, stage });
          
          bot?.sendMessage(chatId, `📸 *Tahap: ${stage}*\n\nSilakan kirimkan *FOTO EVIDEN* untuk tahap ini.\n\n_Anda juga bisa menambahkan caption pada foto tersebut._`, { parse_mode: 'Markdown' });
        }

        // Project BOQ Selection
        if (data.startsWith('prj_boq_')) {
          const projectId = data.replace('prj_boq_', '');
          projectSessions.set(chatId, { projectId, stage: 'waiting_boq_material' });
          
          const jobSnap = await getDocs(collection(db, 'jobs'));
          const jobs = jobSnap.docs.map(doc => ({ id: doc.id, name: doc.data().name, designator: doc.data().designator }));
          
          const keyboard = [];
          for (let i = 0; i < jobs.length; i += 2) {
            const row = [{ text: `[${jobs[i].designator}] ${jobs[i].name}`, callback_data: `prj_job_${jobs[i].id}` }];
            if (jobs[i+1]) row.push({ text: `[${jobs[i+1].designator}] ${jobs[i+1].name}`, callback_data: `prj_job_${jobs[i+1].id}` });
            keyboard.push(row);
          }

          bot?.editMessageText("📦 *Pilih Designator (BOQ Rekon)*:", {
            chat_id: chatId,
            message_id: query.message?.message_id,
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard }
          });
        }

        if (data.startsWith('prj_job_')) {
          const jobId = data.replace('prj_job_', '');
          const session = projectSessions.get(chatId);
          if (!session) return;
          
          projectSessions.set(chatId, { ...session, jobId: jobId, stage: 'waiting_boq_quantity' });
          bot?.sendMessage(chatId, "🔢 *Masukkan Jumlah (Quantity)*:");
        }

        // Project Finish
        if (data.startsWith('prj_fin_')) {
          const projectId = data.replace('prj_fin_', '');
          const projectRef = doc(db, 'projects', projectId);
          const projectSnap = await getDoc(projectRef);
          
          if (projectSnap.exists()) {
            await updateDoc(projectRef, {
              status: 'completed',
              updatedAt: serverTimestamp()
            });
            
            const projectData = projectSnap.data();
            let msg = `✅ *Proyek Selesai!*\n\nProyek *${projectData.pid}* telah ditandai sebagai selesai.\n\n`;
            msg += `📄 *Laporan PDF:* [Klik di sini untuk melihat](https://ais-dev-wql5xilj5h75lf6g33ins7-546624711957.asia-east1.run.app/report/${projectId})\n`;
            msg += `✍️ *Tanda Tangan:* Silakan buka aplikasi untuk melengkapi tanda tangan digital.`;
            
            bot?.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
          }
        }

        // Ticket Creation Flow
        if (data.startsWith('tkt_cat_')) {
          const category = data.replace('tkt_cat_', '');
          ticketSessions.set(chatId, { category, stage: 'waiting_sub_category' });
          
          const subCats = TICKET_CATEGORIES[category] || [];
          const keyboard = [];
          for (let i = 0; i < subCats.length; i += 2) {
            const row = [{ text: subCats[i], callback_data: `tkt_sub_${subCats[i]}` }];
            if (subCats[i+1]) row.push({ text: subCats[i+1], callback_data: `tkt_sub_${subCats[i+1]}` });
            keyboard.push(row);
          }
          keyboard.push([{ text: '⬅️ Kembali', callback_data: 'tkt_back_cat' }]);

          bot?.editMessageText(`🎫 *Kategori: ${category}*\n\nSilakan pilih *Sub Kategori*:`, {
            chat_id: chatId,
            message_id: query.message?.message_id,
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard }
          });
        }

        if (data === 'tkt_back_cat') {
          ticketSessions.delete(chatId);
          const categories = Object.keys(TICKET_CATEGORIES);
          const keyboard = [];
          for (let i = 0; i < categories.length; i += 2) {
            const row = [{ text: categories[i], callback_data: `tkt_cat_${categories[i]}` }];
            if (categories[i+1]) row.push({ text: categories[i+1], callback_data: `tkt_cat_${categories[i+1]}` });
            keyboard.push(row);
          }

          bot?.editMessageText("🎫 *Buat Tiket Baru* 🎫\n\nSilakan pilih *Kategori* tiket:", {
            chat_id: chatId,
            message_id: query.message?.message_id,
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard }
          });
        }

        if (data.startsWith('tkt_sub_')) {
          const subCategory = data.replace('tkt_sub_', '');
          const session = ticketSessions.get(chatId);
          if (!session) return;
          
          ticketSessions.set(chatId, { ...session, subCategory, stage: 'waiting_customer_id' });
          
          bot?.editMessageText(`🎫 *Kategori: ${session.category}*\n🎫 *Sub Kategori: ${subCategory}*\n\nSilakan masukkan *Customer ID* (contoh: \`CUST001\`):`, {
            chat_id: chatId,
            message_id: query.message?.message_id,
            parse_mode: 'Markdown'
          });
        }

        // Repair Session Callbacks
        if (data.startsWith('rep_type_')) {
          bot.answerCallbackQuery(query.id);
          const type = data.replace('rep_type_', '') as 'Logic' | 'Physical';
          const session = repairSessions.get(chatId);
          if (!session) return;
          
          if (type === 'Logic') {
            repairSessions.set(chatId, { ...session, repairType: type, stage: 'waiting_cause' });
            const messageText = "⚙️ *Tipe: Logic*\n\n🔍 *Penyebab Gangguan (Root Cause)*:\n\nApa penyebab gangguannya?";
            const messageId = query.message?.message_id;

            if (messageId) {
              bot.editMessageText(messageText, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown'
              }).catch(err => {
                console.error("Error editing message for Logic type:", err);
                bot.sendMessage(chatId, messageText, { parse_mode: 'Markdown' });
              });
            } else {
              bot.sendMessage(chatId, messageText, { parse_mode: 'Markdown' });
            }
          } else {
            console.log(`[Bot] Fetching materials for Physical repair session from ${chatId}`);
            if (!db) {
              bot.sendMessage(chatId, "❌ *Database Error*\n\nKoneksi ke database belum siap. Silakan coba lagi nanti.");
              return;
            }
            
            try {
              const matSnap = await getDocs(collection(db, 'materials'));
              const materials = matSnap.docs
                .map(doc => ({ 
                  id: doc.id, 
                  name: String(doc.data().name || 'Unnamed Material') 
                }))
                .filter(m => m.name !== 'Unnamed Material' || m.id); // Keep even if unnamed but has ID, but usually we want names
              
              if (materials.length === 0) {
                bot.sendMessage(chatId, "⚠️ *Material Kosong*\n\nTidak ada data material yang ditemukan di sistem. Silakan hubungi admin.");
                repairSessions.set(chatId, { ...session, repairType: type, stage: 'waiting_cause' });
                bot.editMessageText("🛠️ *Tipe: Fisik*\n\n(Tidak ada material ditemukan)\n\n🔍 *Penyebab Gangguan (Root Cause)*:\n\nApa penyebab gangguannya?", {
                  chat_id: chatId,
                  message_id: query.message?.message_id,
                  parse_mode: 'Markdown'
                });
                return;
              }

              repairSessions.set(chatId, { ...session, repairType: type, stage: 'waiting_materials' });
              const keyboard = [];
              for (let i = 0; i < materials.length; i += 2) {
                const row = [{ text: String(materials[i].name), callback_data: `rep_mat_${materials[i].id}` }];
                if (materials[i+1]) {
                  row.push({ text: String(materials[i+1].name), callback_data: `rep_mat_${materials[i+1].id}` });
                }
                keyboard.push(row);
              }
              keyboard.push([{ text: '➡️ Lanjut ke Penyebab', callback_data: 'rep_next_to_cause' }]);

              console.log(`[Bot] Sending material keyboard to ${chatId}:`, JSON.stringify(keyboard));

              const messageText = "🛠️ *Tipe: Fisik*\n\n📦 *Pilih Material*:";
              const messageId = query.message?.message_id;

              if (messageId) {
                try {
                  await bot.editMessageText(messageText, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: keyboard }
                  });
                } catch (editError: any) {
                  console.error("[Bot] editMessageText failed:", editError.message);
                  if (!editError.message.includes('message is not modified')) {
                    bot.sendMessage(chatId, messageText, {
                      parse_mode: 'Markdown',
                      reply_markup: { inline_keyboard: keyboard }
                    }).catch(sendErr => console.error("[Bot] Fallback sendMessage failed:", sendErr.message));
                  }
                }
              } else {
                bot.sendMessage(chatId, messageText, {
                  parse_mode: 'Markdown',
                  reply_markup: { inline_keyboard: keyboard }
                }).catch(sendErr => console.error("[Bot] Direct sendMessage failed:", sendErr.message));
              }
            } catch (matErr: any) {
              console.error("Error fetching materials:", matErr);
              bot.sendMessage(chatId, `❌ *Gagal mengambil data material*\n\nError: ${matErr.message}`);
            }
          }
        }

        if (data.startsWith('rep_mat_')) {
          bot.answerCallbackQuery(query.id);
          const matId = data.replace('rep_mat_', '');
          const session = repairSessions.get(chatId);
          if (!session) return;

          const matDoc = await getDoc(doc(db, 'materials', matId));
          if (!matDoc.exists()) {
            bot.sendMessage(chatId, "❌ *Material tidak ditemukan.*");
            return;
          }

          const matName = String(matDoc.data().name || 'Unnamed Material');
          const materials = session.materials || [];
          // Avoid duplicate selection
          if (materials.some(m => m.id === matId)) {
            bot.sendMessage(chatId, `⚠️ *Material ${matName} sudah dipilih.*`);
            return;
          }

          materials.push({ id: matId, name: matName, quantity: 0 });
          
          repairSessions.set(chatId, { ...session, materials, stage: 'waiting_material_quantity' });
          const messageText = `📦 *Material: ${matName}*\n\nSilakan masukkan *Jumlah (Quantity)*:`;
          const messageId = query.message?.message_id;

          if (messageId) {
            try {
              await bot.editMessageText(messageText, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown'
              });
            } catch (editError: any) {
              console.error("[Bot] editMessageText failed for quantity:", editError.message);
              if (!editError.message.includes('message is not modified')) {
                bot.sendMessage(chatId, messageText, { parse_mode: 'Markdown' });
              }
            }
          } else {
            bot.sendMessage(chatId, messageText, { parse_mode: 'Markdown' });
          }
        }

        if (data === 'rep_add_more_mat') {
          console.log(`[Bot] Add more material requested by ${chatId}`);
          bot.answerCallbackQuery(query.id);
          const session = repairSessions.get(chatId);
          if (!session) return;

          if (!db) {
            bot.sendMessage(chatId, "❌ *Database Error*\n\nKoneksi ke database belum siap.");
            return;
          }

          try {
            const matSnap = await getDocs(collection(db, 'materials'));
            const selectedIds = session.materials?.map((m: any) => m.id) || [];
            const materials = matSnap.docs
              .map(doc => ({ 
                id: doc.id, 
                name: String(doc.data().name || 'Unnamed Material') 
              }))
              .filter(m => !selectedIds.includes(m.id));

            if (materials.length === 0) {
              bot.sendMessage(chatId, "⚠️ *Semua material sudah dipilih* atau tidak ada material lain.");
              repairSessions.set(chatId, { ...session, stage: 'waiting_cause' });
              bot.sendMessage(chatId, "🔍 *Penyebab Gangguan (Root Cause)*:\n\nApa penyebab gangguannya?", { parse_mode: 'Markdown' });
              return;
            }

            repairSessions.set(chatId, { ...session, stage: 'waiting_materials' });
            const keyboard = [];
          for (let i = 0; i < materials.length; i += 2) {
            const row = [{ text: materials[i].name, callback_data: `rep_mat_${materials[i].id}` }];
            if (materials[i+1]) row.push({ text: materials[i+1].name, callback_data: `rep_mat_${materials[i+1].id}` });
            keyboard.push(row);
          }
          keyboard.push([{ text: '➡️ Lanjut ke Penyebab', callback_data: 'rep_next_to_cause' }]);

            const messageText = "📦 *Pilih Material Tambahan*:";
            const messageId = query.message?.message_id;

            if (messageId) {
              try {
                await bot.editMessageText(messageText, {
                  chat_id: chatId,
                  message_id: messageId,
                  parse_mode: 'Markdown',
                  reply_markup: { inline_keyboard: keyboard }
                });
              } catch (editError: any) {
                console.error("[Bot] editMessageText failed for add more:", editError.message);
                if (!editError.message.includes('message is not modified')) {
                  bot.sendMessage(chatId, messageText, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: keyboard }
                  });
                }
              }
            } else {
              bot.sendMessage(chatId, messageText, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
              });
            }
          } catch (e: any) {
            console.error("Error in rep_add_more_mat:", e);
            bot.sendMessage(chatId, "❌ *Gagal mengambil data material*");
          }
        }

        if (data === 'rep_next_to_cause') {
          bot.answerCallbackQuery(query.id);
          const session = repairSessions.get(chatId);
          if (!session) return;

          repairSessions.set(chatId, { ...session, stage: 'waiting_cause' });
          const messageText = "🔍 *Penyebab Gangguan (Root Cause)*:\n\nApa penyebab gangguannya?";
          const messageId = query.message?.message_id;

          if (messageId) {
            try {
              await bot.editMessageText(messageText, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown'
              });
            } catch (editError: any) {
              console.error("[Bot] editMessageText failed for next to cause:", editError.message);
              if (!editError.message.includes('message is not modified')) {
                bot.sendMessage(chatId, messageText, { parse_mode: 'Markdown' });
              }
            }
          } else {
            bot.sendMessage(chatId, messageText, { parse_mode: 'Markdown' });
          }
        }
      } catch (e) {
        console.error("Error in callback_query:", e);
      }
    });

    // Consolidated photo handler for all interactive flows
    bot.on('photo', async (msg) => {
      const chatId = msg.chat.id;
      const photo = msg.photo![msg.photo!.length - 1];
      const photoUrl = `/api/telegram-photo/${photo.file_id}`;
      const caption = (msg.caption || '').trim();

      console.log(`[Bot] Received photo from ${chatId}, caption: "${caption}"`);

      // 2. Check for repair session (interactive flow)
      const repairSession = repairSessions.get(chatId);
      if (repairSession && repairSession.stage === 'waiting_evidence') {
        console.log(`[Bot] Active repairSession for ${chatId}, stage: ${repairSession.stage}`);
        await finalizeRepair(chatId, repairSession, photo.file_id);
        repairSessions.delete(chatId);
        return;
      }

      // 3. Check for project evidence session (existing projects)
      const session = projectSessions.get(chatId);
      if (session && session.projectId && session.stage) {
        console.log(`[Bot] Active projectSession for ${chatId}, project: ${session.projectId}, stage: ${session.stage}`);

        try {
          // Verify user
          const userDoc = await getAuthorizedUser(chatId);
          if (!userDoc) {
            bot?.sendMessage(chatId, "❌ *Akses Ditolak!*\n\nAkun Telegram Anda belum terhubung.", { parse_mode: 'Markdown' });
            return;
          }
        const userName = userDoc.data().name || 'Technician';

        const projectRef = doc(db, 'projects', session.projectId);
        const projectSnap = await getDoc(projectRef);
        
          if (projectSnap.exists()) {
            const projectData = projectSnap.data();
            const evidence = projectData.evidence || [];
          
            const newEvidence = {
              stage: session.stage,
              photoUrl: photoUrl,
              caption: caption,
              timestamp: Timestamp.now(),
              reportedBy: userName
            };

            await updateDoc(projectRef, {
              evidence: [...evidence, newEvidence],
              updatedAt: serverTimestamp()
            });

            bot?.sendMessage(chatId, `✅ *Eviden Terkirim!*\n\nFoto untuk tahap *${session.stage}* pada proyek *${projectData.pid}* telah berhasil disimpan.`, { 
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '🔄 Ganti Tahap', callback_data: `prj_sel_${session.projectId}` },
                    { text: '✅ Selesai', callback_data: 'prj_finish' }
                  ]
                ]
              }
            });
          }
          return;
        } catch (e) {
          console.error("Error processing project photo:", e);
        }
      }

      // 4. Handle legacy /close or /progres with photo caption
      if (caption.toLowerCase().startsWith('/close') || caption.toLowerCase().startsWith('/progres')) {
        console.log(`[Bot] Handling legacy command with photo from ${chatId}`);
        processFieldUpdate(chatId, caption, photo.file_id);
      }
    });

    // /material command
    bot.onText(/^\/material/i, async (msg) => {
      const chatId = msg.chat.id;
      try {
        const matSnap = await getDocs(collection(db, 'materials'));
        if (matSnap.empty) {
          bot.sendMessage(chatId, "📭 *Tidak ada data material* di sistem.", { parse_mode: 'Markdown' });
          return;
        }

        let response = "📦 *Daftar Stok Material* 📦\n\n";
        matSnap.docs.forEach(doc => {
          const data = doc.data();
          const status = (data.quantity || 0) <= (data.minQuantity || 5) ? "⚠️" : "✅";
          response += `${status} *${data.name}*\n`;
          response += `   Stok: \`${data.quantity || 0} ${data.unit || ''}\`\n`;
          response += `   Min: \`${data.minQuantity || 0}\` | Harga: \`Rp ${data.price?.toLocaleString() || 0}\`\n\n`;
        });

        bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
      } catch (e: any) {
        console.error("Error in /material command:", e);
        bot.sendMessage(chatId, `❌ *Gagal mengambil data material!*\n\nError: ${e.message}`);
      }
    });

    // /boq command
    bot.onText(/^\/boq/i, async (msg) => {
      const chatId = msg.chat.id;
      try {
        const userDoc = await getAuthorizedUser(chatId);
        if (!userDoc) return;

        const snap = await getDocs(collection(db, 'projects'));
        const activeProjects = snap.docs.filter(doc => doc.data().status !== 'completed');

        if (activeProjects.length === 0) {
          bot.sendMessage(chatId, "📭 *Tidak ada proyek aktif* untuk update BOQ.");
          return;
        }

        const keyboard = activeProjects.map(doc => ([{
          text: `📦 ${doc.data().pid} - ${doc.data().description.slice(0, 20)}...`,
          callback_data: `prj_boq_${doc.id}`
        }]));

        bot.sendMessage(chatId, "📦 *Update BOQ Proyek*\n\nSilakan pilih proyek:", {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: keyboard }
        });
      } catch (e: any) {
        bot.sendMessage(chatId, `❌ *Gagal:* ${e.message}`);
      }
    });

    // /finish_proyek command
    bot.onText(/^\/finish_proyek/i, async (msg) => {
      const chatId = msg.chat.id;
      try {
        const userDoc = await getAuthorizedUser(chatId);
        if (!userDoc) return;

        const snap = await getDocs(collection(db, 'projects'));
        const activeProjects = snap.docs.filter(doc => doc.data().status !== 'completed');

        if (activeProjects.length === 0) {
          bot.sendMessage(chatId, "📭 *Tidak ada proyek aktif* untuk diselesaikan.");
          return;
        }

        const keyboard = activeProjects.map(doc => ([{
          text: `🏁 ${doc.data().pid} - ${doc.data().description.slice(0, 20)}...`,
          callback_data: `prj_fin_${doc.id}`
        }]));

        bot.sendMessage(chatId, "🏁 *Selesaikan Proyek*\n\nSilakan pilih proyek yang telah selesai:", {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: keyboard }
        });
      } catch (e: any) {
        bot.sendMessage(chatId, `❌ *Gagal:* ${e.message}`);
      }
    });

    // /progres command
    bot.onText(/^\/progres/i, async (msg) => {
      const chatId = msg.chat.id;
      repairSessions.set(chatId, { command: 'progres', stage: 'waiting_customer_id' });
      bot.sendMessage(chatId, "🛠️ *Progres Tiket* 🛠️\n\nSilakan masukkan *Customer ID*:", { parse_mode: 'Markdown' });
    });

    // /report command
    bot.onText(/^\/report/i, async (msg) => {
      const chatId = msg.chat.id;
      const userDoc = await getAuthorizedUser(chatId);
      if (!userDoc || !['superadmin', 'admin'].includes(userDoc.data().role)) {
        bot.sendMessage(chatId, "❌ *Akses Ditolak!*\n\nPerintah ini hanya untuk Admin/Superadmin.", { parse_mode: 'Markdown' });
        return;
      }

      const text = msg.text || '';
      const period = text.toLowerCase().includes('monthly') ? 'monthly' : 'weekly';
      
      bot.sendMessage(chatId, `📊 *Sedang membuat laporan ${period}...*`, { parse_mode: 'Markdown' });
      
      try {
        const report = await generateTicketReport(period as 'weekly' | 'monthly');
        bot.sendMessage(chatId, report, { parse_mode: 'Markdown' });
      } catch (e: any) {
        console.error("Error generating report:", e);
        bot.sendMessage(chatId, `❌ *Gagal membuat laporan!*\n\nError: ${e.message}`);
      }
    });

    // Automated Report Scheduler (Check every hour)
    setInterval(async () => {
      const now = new Date();
      const hours = now.getHours();
      const day = now.getDay(); // 0 = Sunday, 1 = Monday
      const date = now.getDate();

      // Weekly Report: Monday at 8 AM
      if (day === 1 && hours === 8) {
        console.log("[Scheduler] Sending weekly report...");
        await sendAutomatedReport('weekly');
      }

      // Monthly Report: 1st of the month at 8 AM
      if (date === 1 && hours === 8) {
        console.log("[Scheduler] Sending monthly report...");
        await sendAutomatedReport('monthly');
      }
    }, 60 * 60 * 1000);

    async function sendAutomatedReport(period: 'weekly' | 'monthly') {
      try {
        const report = await generateTicketReport(period);
        // Send to all admins/superadmins
        const adminsQuery = query(collection(db, 'users'), where('role', 'in', ['admin', 'superadmin']));
        const adminsSnap = await getDocs(adminsQuery);
        
        for (const adminDoc of adminsSnap.docs) {
          const telegramId = adminDoc.data().telegramId;
          if (telegramId) {
            bot?.sendMessage(telegramId, report, { parse_mode: 'Markdown' });
          }
        }
      } catch (e) {
        console.error(`Error in automated ${period} report:`, e);
      }
    }

    async function generateTicketReport(period: 'weekly' | 'monthly') {
      const now = new Date();
      let startTime: Date;
      
      if (period === 'weekly') {
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else {
        startTime = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      }

      const startTimestamp = Timestamp.fromDate(startTime);

      // 1. Tickets Summary
      const ticketsQuery = query(
        collection(db, 'tickets'),
        where('status', 'in', ['resolved', 'closed']),
        where('updatedAt', '>=', startTimestamp)
      );
      
      const ticketsSnap = await getDocs(ticketsQuery);
      const tickets = ticketsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const totalResolved = tickets.length;

      // 2. Average Resolution Time
      let totalResolutionTime = 0;
      let resolvedCount = 0;

      tickets.forEach((t: any) => {
        if (t.createdAt && t.updatedAt) {
          const created = t.createdAt.toDate ? t.createdAt.toDate() : new Date(t.createdAt);
          const updated = t.updatedAt.toDate ? t.updatedAt.toDate() : new Date(t.updatedAt);
          const diff = (updated.getTime() - created.getTime()) / (1000 * 60); // minutes
          if (diff > 0) {
            totalResolutionTime += diff;
            resolvedCount++;
          }
        }
      });

      const avgResolutionTime = resolvedCount > 0 ? (totalResolutionTime / resolvedCount).toFixed(1) : '0';

      // 3. Material Usage
      const repairQuery = query(
        collection(db, 'repairRecords'),
        where('createdAt', '>=', startTimestamp)
      );
      const repairSnap = await getDocs(repairQuery);
      const repairs = repairSnap.docs.map(doc => doc.data());

      const materialUsage: Record<string, { quantity: number, unit: string }> = {};
      repairs.forEach((r: any) => {
        if (r.materialsUsed && Array.isArray(r.materialsUsed)) {
          r.materialsUsed.forEach((m: any) => {
            if (!materialUsage[m.name]) {
              materialUsage[m.name] = { quantity: 0, unit: m.unit || '' };
            }
            materialUsage[m.name].quantity += m.quantity || 0;
          });
        }
      });

      // Format Report
      let report = `📊 *LAPORAN TIKET ${period.toUpperCase()}* 📊\n`;
      report += `📅 Periode: ${startTime.toLocaleDateString()} - ${now.toLocaleDateString()}\n\n`;
      
      report += `✅ *Ringkasan Tiket*\n`;
      report += `• Tiket Selesai: \`${totalResolved}\`\n`;
      report += `• Rata-rata Waktu Resolusi: \`${avgResolutionTime} menit\`\n\n`;

      report += `📦 *Rincian Material Terpakai*\n`;
      const materialList = Object.entries(materialUsage);
      if (materialList.length > 0) {
        materialList.forEach(([name, data]) => {
          report += `• ${name}: \`${data.quantity} ${data.unit}\`\n`;
        });
      } else {
        report += `• Tidak ada penggunaan material.\n`;
      }

      report += `\n_Laporan ini dibuat otomatis oleh sistem._`;
      return report;
    }

    // /close command
    bot.onText(/^\/close/i, async (msg) => {
      const chatId = msg.chat.id;
      repairSessions.set(chatId, { command: 'close', stage: 'waiting_customer_id' });
      bot.sendMessage(chatId, "✅ *Tutup Tiket* ✅\n\nSilakan masukkan *Customer ID*:", { parse_mode: 'Markdown' });
    });

    // /pelanggan command
    bot.onText(/^\/pelanggan/, async (msg) => {
      const chatId = msg.chat.id;
      const text = msg.text || '';
      
      const parts = text.split('\n');
      if (parts.length < 2) {
        const template = "👤 *Format Tambah Pelanggan Baru* 👤\n\n" +
          "Silakan salin dan isi format di bawah ini:\n\n" +
          "`/pelanggan`\n" +
          "Customer ID : \n" +
          "Nama: \n" +
          "Phone Number: \n" +
          "Alamat: ";
        bot.sendMessage(chatId, template, { parse_mode: 'Markdown' });
        return;
      }

      // Parsing logic
      const data: any = {};
      parts.forEach(line => {
        if (line.includes(':')) {
          const [key, ...val] = line.split(':');
          const value = val.join(':').trim();
          const cleanKey = key.trim().toLowerCase();
          
          if (cleanKey.includes('customer id')) data.customerId = value;
          if (cleanKey.includes('nama')) data.name = value;
          if (cleanKey.includes('phone number')) data.phone = value;
          if (cleanKey.includes('alamat')) data.address = value;
        }
      });

      if (!data.name || !data.address) {
        bot.sendMessage(chatId, "⚠️ *Data tidak lengkap!*\n\nMohon pastikan setidaknya `Nama` dan `Alamat` terisi.", { parse_mode: 'Markdown' });
        return;
      }

      try {
        // Verify technician/admin
        const userDoc = await getAuthorizedUser(chatId);
        
        if (!userDoc) {
          bot.sendMessage(chatId, "❌ *Akses Ditolak!*\n\nAkun Telegram Anda belum terhubung.", { parse_mode: 'Markdown' });
          return;
        }

        // Save to Firestore
        await addDoc(collection(db, 'customers'), {
          ...data,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        
        bot.sendMessage(chatId, "✅ *Data Berhasil Disimpan!*\n\nPelanggan baru telah ditambahkan ke sistem.", { parse_mode: 'Markdown' });
      } catch (e: any) {
        console.error("Error saving customer:", e);
        bot.sendMessage(chatId, `❌ *Gagal menyimpan data pelanggan!*\n\nError: ${e.message || 'Unknown error'}`, { parse_mode: 'Markdown' });
      }
    });

    // /addtiket command
    bot.onText(/^\/addtiket/, async (msg) => {
      const chatId = msg.chat.id;
      const text = msg.text || '';
      
      const parts = text.split('\n').filter(p => p.trim());
      
      // If just the command, start interactive flow
      if (parts.length < 2) {
        const categories = Object.keys(TICKET_CATEGORIES);
        const keyboard = [];
        for (let i = 0; i < categories.length; i += 2) {
          const row = [{ text: categories[i], callback_data: `tkt_cat_${categories[i]}` }];
          if (categories[i+1]) row.push({ text: categories[i+1], callback_data: `tkt_cat_${categories[i+1]}` });
          keyboard.push(row);
        }

        bot.sendMessage(chatId, "🎫 *Buat Tiket Baru* 🎫\n\nSilakan pilih *Kategori* tiket:", {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: keyboard }
        });
        return;
      }

      // Parsing logic for legacy multi-line format
      const data: any = {};
      parts.forEach(line => {
        if (line.includes(':')) {
          const [key, ...val] = line.split(':');
          const value = val.join(':').trim();
          const cleanKey = key.trim().toLowerCase();
          
          if (cleanKey.includes('customer id')) data.customerId = value;
          if (cleanKey.includes('kategory')) data.category = value;
          if (cleanKey.includes('sub kategory')) data.subCategory = value;
        }
      });

      if (!data.customerId || !data.category || !data.subCategory) {
        bot.sendMessage(chatId, "⚠️ *Format Salah!*\n\nGunakan format:\n`/addtiket`\nKategory: ...\nSub Kategory: ...\nCustomer ID: ...", { parse_mode: 'Markdown' });
        return;
      }

      await handleTicketCreation(chatId, data.category, data.subCategory, data.customerId);
    });

    // /addprojects command
    bot.onText(/^\/addprojects/, async (msg) => {
      const chatId = msg.chat.id;
      const text = msg.text || '';
      
      const parts = text.split('\n').map(p => p.trim()).filter(p => p.length > 0);
      
      if (parts.length < 2) {
        const template = "🏗️ *Format Tambah Proyek* 🏗️\n\n" +
          "Silakan salin dan isi format di bawah ini:\n\n" +
          "`/addprojects`\n" +
          "PID: \n" +
          "Nama: \n" +
          "Tiket Insera: \n" +
          "Witel: \n" +
          "Mitra: \n" +
          "Lokasi: ";
        bot.sendMessage(chatId, template, { parse_mode: 'Markdown' });
        return;
      }

      // Parsing logic
      const data: any = {};
      parts.forEach(line => {
        if (line.includes(':')) {
          const [key, ...val] = line.split(':');
          const value = val.join(':').trim();
          const cleanKey = key.trim().toLowerCase();
          
          if (cleanKey === 'pid') data.pid = value;
          if (cleanKey === 'nama') data.projectName = value;
          if (cleanKey.includes('insera')) data.tiketGamas = value;
          if (cleanKey === 'witel') data.witel = value;
          if (cleanKey === 'mitra') data.partner = value;
          if (cleanKey === 'lokasi') data.location = value;
        }
      });

      if (!data.pid || !data.projectName) {
        bot.sendMessage(chatId, "⚠️ *Data tidak lengkap!*\n\nMohon pastikan `PID` dan `Nama` terisi.", { parse_mode: 'Markdown' });
        return;
      }

      try {
        const userDoc = await getAuthorizedUser(chatId);
        if (!userDoc) return;

        // Check if project already exists
        const q = query(collection(db, 'projects'), where('pid', '==', data.pid));
        const snap = await getDocs(q);
        if (!snap.empty) {
          bot.sendMessage(chatId, `⚠️ *Proyek Sudah Ada!*\n\nPID \`${data.pid}\` sudah terdaftar di sistem.`, { parse_mode: 'Markdown' });
          return;
        }

        await addDoc(collection(db, 'projects'), {
          ...data,
          description: data.projectName,
          status: 'open',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          reportedBy: userDoc.id
        });

        let successMsg = `✅ *Proyek Berhasil Dibuat!*\n\n`;
        successMsg += `PID: ${data.pid}\n`;
        successMsg += `Nama: ${data.projectName}\n`;
        successMsg += `Witel: ${data.witel || '-'}\n`;
        successMsg += `Mitra: ${data.partner || '-'}\n`;
        successMsg += `Lokasi: ${data.location || '-'}`;
        
        bot.sendMessage(chatId, successMsg, { parse_mode: 'Markdown' });
      } catch (e: any) {
        console.error("Error creating project:", e);
        bot.sendMessage(chatId, `❌ *Gagal membuat proyek!*`);
      }
    });

    // /assign command
    bot.onText(/^\/assign/, async (msg) => {
      const chatId = msg.chat.id;
      const text = msg.text || '';
      
      const parts = text.split('\n');
      if (parts.length < 2) {
        const template = "📋 *Format Assign Tiket* 📋\n\n" +
          "Silakan salin dan isi format di bawah ini:\n\n" +
          "`/assign`\n" +
          "Customer ID : \n" +
          "NIK : ";
        bot.sendMessage(chatId, template, { parse_mode: 'Markdown' });
        return;
      }

      // Parsing logic
      const data: any = {};
      parts.forEach(line => {
        if (line.includes(':')) {
          const [key, ...val] = line.split(':');
          const value = val.join(':').trim();
          const cleanKey = key.trim().toLowerCase();
          
          if (cleanKey.includes('customer id')) data.customerId = value;
          if (cleanKey.includes('nik')) {
            // Split by comma, space, or semicolon
            data.niks = value.split(/[,;\s]+/).map(id => id.trim()).filter(id => id);
          }
        }
      });

      if (!data.customerId || !data.niks || data.niks.length === 0) {
        bot.sendMessage(chatId, "⚠️ *Data tidak lengkap!*\n\nMohon pastikan `Customer ID` dan `NIK` terisi.", { parse_mode: 'Markdown' });
        return;
      }

      try {
        // 1. Verify sender
        const senderDoc = await getAuthorizedUser(chatId);
        
        if (!senderDoc) {
          bot.sendMessage(chatId, "❌ *Akses Ditolak!*\n\nAkun Telegram Anda belum terhubung.", { parse_mode: 'Markdown' });
          return;
        }

        // 2. Find Customer
        const custSnap = await getDocs(collection(db, 'customers'));
        const customerDoc = custSnap.docs.find(doc => doc.data().customerId === data.customerId);
        
        if (!customerDoc) {
          bot.sendMessage(chatId, `❌ *Customer Tidak Ditemukan!*\n\nCustomer ID \`${data.customerId}\` tidak terdaftar di sistem.`, { parse_mode: 'Markdown' });
          return;
        }

        // 3. Find Active Ticket for this customer
        const ticketSnap = await getDocs(collection(db, 'tickets'));
        const activeTickets = ticketSnap.docs
          .filter(doc => doc.data().customerId === customerDoc.id && doc.data().status !== 'closed')
          .sort((a, b) => (b.data().createdAt?.seconds || 0) - (a.data().createdAt?.seconds || 0));

        if (activeTickets.length === 0) {
          bot.sendMessage(chatId, `⚠️ *Tidak Ada Tiket Aktif!*\n\nCustomer \`${customerDoc.data().name}\` tidak memiliki tiket yang sedang terbuka.`, { parse_mode: 'Markdown' });
          return;
        }

        const targetTicket = activeTickets[0];

        // 4. Find Technicians by NIK (Check users collection with role teknisi)
        const techQuery = query(collection(db, 'users'), where('role', '==', 'teknisi'));
        const techSnap = await getDocs(techQuery);
        const techUids: string[] = [];
        const techNames: string[] = [];
        
        data.niks.forEach((nik: string) => {
          const techDoc = techSnap.docs.find(doc => doc.data().nik === nik);
          if (techDoc) {
            techUids.push(techDoc.id);
            techNames.push(techDoc.data().name || nik);
          }
        });

        if (techUids.length === 0) {
          bot.sendMessage(chatId, "❌ *Teknisi Tidak Ditemukan!*\n\nTidak ada NIK yang cocok dengan data teknisi di sistem.", { parse_mode: 'Markdown' });
          return;
        }

        // 5. Update Ticket
        await updateDoc(doc(db, 'tickets', targetTicket.id), {
          technicianIds: techUids,
          updatedAt: serverTimestamp()
        });

        // 6. Add to History
        await addDoc(collection(db, 'ticketHistory'), {
          ticketId: targetTicket.id,
          type: 'assignment_change',
          fromValue: targetTicket.data().technicianIds?.join(', ') || 'none',
          toValue: techUids.join(', '),
          changedBy: senderDoc.id,
          timestamp: serverTimestamp()
        });

        let successMsg = `✅ *Tiket Berhasil Di-Assign!*\n\n`;
        successMsg += `Tiket: #${targetTicket.data().ticketNumber}\n`;
        successMsg += `Customer: ${customerDoc.data().name} (${customerDoc.data().customerId})\n`;
        successMsg += `Teknisi: ${techNames.join(', ')}`;
        
        bot.sendMessage(chatId, successMsg, { parse_mode: 'Markdown' });

        // 7. Notify Technicians
        for (const uid of techUids) {
          const techDoc = await getDoc(doc(db, 'users', uid));
          if (techDoc.exists() && techDoc.data().telegramId) {
            const notifyMsg = `🔔 *Tiket Baru Di-Assign!*\n\nAnda telah di-assign ke tiket #${targetTicket.data().ticketNumber} untuk customer *${customerDoc.data().name}* (${customerDoc.data().customerId}).`;
            bot.sendMessage(techDoc.data().telegramId, notifyMsg, { parse_mode: 'Markdown' });
          }
        }

      } catch (e: any) {
        console.error("Error assigning ticket:", e);
        bot.sendMessage(chatId, `❌ *Gagal assign tiket!*\n\nError: ${e.message || 'Unknown error'}`, { parse_mode: 'Markdown' });
      }
    });

    // Dynamic Commands from Firestore
    bot.on('message', async (msg) => {
      const chatId = msg.chat.id;
      const text = msg.text;
      if (!text) return;

      // Handle project BOQ quantity
      const projectSession = projectSessions.get(chatId);
      if (projectSession && projectSession.stage === 'waiting_boq_quantity' && !text.startsWith('/')) {
        const qty = parseInt(text.trim());
        if (isNaN(qty) || qty <= 0) {
          bot.sendMessage(chatId, "⚠️ *Jumlah tidak valid!* Masukkan angka positif:");
          return;
        }

        try {
          const projectRef = doc(db, 'projects', projectSession.projectId!);
          const projectSnap = await getDoc(projectRef);
          const jobRef = doc(db, 'jobs', projectSession.jobId!);
          const jobSnap = await getDoc(jobRef);
          
          if (projectSnap.exists() && jobSnap.exists()) {
            const projectData = projectSnap.data();
            const jobData = jobSnap.data();
            const jobs = projectData.jobs || [];
            
            // Check if job already in BOQ
            const existingIndex = jobs.findIndex((item: any) => item.jobId === projectSession.jobId);
            if (existingIndex > -1) {
              const newQty = (jobs[existingIndex].quantity || 0) + qty;
              jobs[existingIndex].quantity = newQty;
              jobs[existingIndex].materialSubtotal = newQty * (jobData.materialPrice || 0);
              jobs[existingIndex].serviceSubtotal = newQty * (jobData.servicePrice || 0);
              jobs[existingIndex].subtotal = newQty * (jobData.price || 0);
            } else {
              jobs.push({
                jobId: projectSession.jobId,
                designator: jobData.designator,
                name: jobData.name,
                quantity: qty,
                materialPrice: jobData.materialPrice || 0,
                servicePrice: jobData.servicePrice || 0,
                price: jobData.price || 0,
                materialSubtotal: qty * (jobData.materialPrice || 0),
                serviceSubtotal: qty * (jobData.servicePrice || 0),
                subtotal: qty * (jobData.price || 0)
              });
            }

            const totalJobCost = jobs.reduce((sum: number, j: any) => sum + (j.subtotal || 0), 0);
            const totalCost = (projectData.activityCost || 0) + totalJobCost;

            await updateDoc(projectRef, {
              jobs: jobs,
              totalJobCost,
              totalCost,
              updatedAt: serverTimestamp()
            });

            bot.sendMessage(chatId, `✅ *BOQ Rekon Diperbarui!*\n\nDesignator: [${jobData.designator}] ${jobData.name}\nJumlah: ${qty}\nSubtotal: Rp ${(qty * jobData.price).toLocaleString()}`, {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '➕ Tambah Designator Lagi', callback_data: `prj_boq_${projectSession.projectId}` }],
                  [{ text: '✅ Selesai', callback_data: 'prj_finish' }]
                ]
              }
            });
            projectSessions.delete(chatId);
          }
        } catch (e) {
          console.error("Error updating project BOQ:", e);
        }
        return;
      }

      // Handle repair session (interactive flow)
      const repairSession = repairSessions.get(chatId);
      if (repairSession && !text.startsWith('/')) {
        try {
          if (repairSession.stage === 'waiting_customer_id') {
            const customerId = text.trim();
            // Verify customer and ticket
            const custQuery = query(collection(db, 'customers'), where('customerId', '==', customerId));
            const custSnap = await getDocs(custQuery);
            if (custSnap.empty) {
              bot.sendMessage(chatId, `❌ *Customer Tidak Ditemukan!*\n\nCustomer ID \`${customerId}\` tidak terdaftar. Silakan masukkan ID yang benar:`, { parse_mode: 'Markdown' });
              return;
            }
            
            const customerDoc = custSnap.docs[0];
            const ticketQuery = query(collection(db, 'tickets'), where('customerId', '==', customerDoc.id), where('status', '!=', 'closed'));
            const ticketSnap = await getDocs(ticketQuery);
            
            if (ticketSnap.empty) {
              bot.sendMessage(chatId, `⚠️ *Tidak Ada Tiket Aktif!*\n\nCustomer \`${customerDoc.data().name}\` tidak memiliki tiket yang sedang terbuka. Silakan masukkan ID lain:`, { parse_mode: 'Markdown' });
              return;
            }

            repairSessions.set(chatId, { ...repairSession, customerId, stage: 'waiting_repair_type' });
            bot.sendMessage(chatId, `✅ *Customer: ${customerDoc.data().name}*\n\nSilakan pilih *Tipe Perbaikan*:`, {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '⚙️ Logic', callback_data: 'rep_type_Logic' },
                    { text: '🛠️ Fisik', callback_data: 'rep_type_Physical' }
                  ]
                ]
              }
            });
            return;
          }

          if (repairSession.stage === 'waiting_material_quantity') {
            const qty = parseInt(text.trim());
            if (isNaN(qty) || qty <= 0) {
              bot.sendMessage(chatId, "⚠️ *Jumlah tidak valid!*\n\nMasukkan angka positif:");
              return;
            }
            
            const materials = repairSession.materials || [];
            const lastMaterial = materials[materials.length - 1];
            
            if (lastMaterial) {
              // Stock validation
              const matDoc = await getDoc(doc(db, 'materials', lastMaterial.id));
              if (matDoc.exists()) {
                const currentStock = matDoc.data().quantity || 0;
                if (qty > currentStock) {
                  bot.sendMessage(chatId, `⚠️ *Stok tidak mencukupi!*\n\nStok saat ini: \`${currentStock} ${matDoc.data().unit}\`.\n\nSilakan masukkan jumlah yang valid:`, { parse_mode: 'Markdown' });
                  return;
                }
                lastMaterial.quantity = qty;
              }
            }
            
            repairSessions.set(chatId, { ...repairSession, materials, stage: 'waiting_materials' });
            
            // Ask if more materials or continue
            bot.sendMessage(chatId, `✅ *Material ditambahkan.*\n\nApakah ada material lain?`, {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '➕ Tambah Lagi', callback_data: 'rep_add_more_mat' },
                    { text: '➡️ Lanjut ke Penyebab', callback_data: 'rep_next_to_cause' }
                  ]
                ]
              }
            });
            return;
          }

          if (repairSession.stage === 'waiting_cause') {
            repairSessions.set(chatId, { ...repairSession, rootCause: text.trim(), stage: 'waiting_action' });
            bot.sendMessage(chatId, "🔧 *Perbaikan Gangguan (Repair Action)*:\n\nApa tindakan perbaikan yang dilakukan?");
            return;
          }

          if (repairSession.stage === 'waiting_action') {
            repairSessions.set(chatId, { ...repairSession, repairAction: text.trim(), stage: 'waiting_evidence' });
            bot.sendMessage(chatId, "📸 *Eviden Perbaikan*:\n\nSilakan kirim *FOTO EVIDEN* perbaikan:");
            return;
          }
        } catch (e) {
          console.error("Error in repair session message handler:", e);
        }
      }

      if (!text.startsWith('/')) return;

      // Extract command name correctly (handle newlines/spaces)
      const commandName = text.split(/\s+/)[0].substring(1).toLowerCase();
      
      // Skip hardcoded commands to avoid double responses
      const hardcoded = ['start', 'help', 'progres', 'close', 'pelanggan', 'addtiket', 'addprojects', 'assign'];
      if (hardcoded.includes(commandName)) return;

      try {
        const commandsRef = collection(db, 'telegramCommands');
        const q = query(commandsRef, where('command', '==', commandName), where('isActive', '==', true));
        const snap = await getDocs(q);

        if (!snap.empty) {
          const cmd = snap.docs[0].data();
          bot.sendMessage(msg.chat.id, cmd.response, { parse_mode: 'Markdown' });
        }
      } catch (error) {
        console.error("Dynamic Command Error:", error);
      }
    });

    // Graceful shutdown
    process.once('SIGINT', () => bot?.stopPolling());
    process.once('SIGTERM', () => bot?.stopPolling());

  } catch (err) {
    console.error("Failed to initialize Telegram Bot:", err);
  }
}

// Initialize bot
initTelegramBot();

const app = express();
const PORT = 3000;

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Proxy route for Telegram photos
app.get('/api/telegram-photo/:fileId', async (req, res) => {
  try {
    const fileId = req.params.fileId;
    if (!bot) {
      return res.status(500).send('Bot not initialized');
    }
    const fileLink = await bot.getFileLink(fileId);
    res.redirect(fileLink);
  } catch (e) {
    console.error("Error fetching telegram photo:", e);
    res.status(404).send('Photo not found');
  }
});

// General image proxy to bypass CORS for PDF generation
app.get('/api/proxy-image', async (req, res) => {
  let imageUrl = req.query.url as string;
  if (!imageUrl) return res.status(400).send('URL is required');
  
  // Handle relative URLs (e.g. from /api/telegram-photo)
  if (imageUrl.startsWith('/')) {
    imageUrl = `http://localhost:3000${imageUrl}`;
  }
  
  console.log(`[Proxy] Fetching image: ${imageUrl}`);
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000); // 60 second timeout

    const fetchOptions: any = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      },
      redirect: 'follow',
      signal: controller.signal
    };

    // Only add Referer if it's an absolute external URL
    if (imageUrl.startsWith('http') && !imageUrl.includes('localhost')) {
      try {
        fetchOptions.headers['Referer'] = new URL(imageUrl).origin;
      } catch (e) {
        // Ignore URL parsing errors
      }
    }

    const response = await fetch(imageUrl, fetchOptions);
    
    clearTimeout(timeout);
    if (!response.ok) {
      console.error(`[Proxy] Failed to fetch image: ${response.status} ${response.statusText} for URL: ${imageUrl}`);
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }
    
    const contentType = response.headers.get('content-type');
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    } else {
      res.setHeader('Content-Type', 'image/jpeg'); // Fallback
    }
    
    // Cache for 1 hour
    res.setHeader('Cache-Control', 'public, max-age=3600');
    
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (e) {
    console.error(`[Proxy] Error proxying image ${imageUrl}:`, e);
    res.status(500).send('Error fetching image');
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || PORT;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${port}`);
  });
}

startServer();
