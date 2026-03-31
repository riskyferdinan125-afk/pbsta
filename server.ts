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
  'PROJECT': { 'DISTRIBUSI': 4, 'FEEDER': 10, 'ODC': 18, 'ODP': 3 },
  'REGULER': { 'PLATINUM': 2, 'DIAMOND': 2, 'VVIP': 2, 'GOLD': 2, 'REGULER': 2, 'HVC PLATINUM': 2, 'HVC GOLD': 2, 'HVC DIAMOND': 2, 'NON HVC': 2 },
  'PSB': { 'MyRep': 2, 'TBG': 2, '5 MENARA BINTANG': 2, 'Hypemet': 2, 'Surge': 4, 'IBU - FTTR': 5, 'PT Anagata Cipta Teknologi': 8, 'Datin': 6.4, 'Olo': 6.4, 'Wifi': 5.3 },
  'SQM': { 'WorkHours': 2, 'NonWorkHours': 2 },
  'UNSPEKS': { 'Datin': 2.67, 'HSI': 2, 'Wifi': 2.67 },
  'EXBIS': { 'TIS': 8, 'Lintasarta': 8, 'Mitratel': 8, 'Surge': 8, 'Centratama': 8, 'UMT': 8 },
  'CORRECTIVE': { 'CSA': 4, 'MMP': 4, 'TBG': 4, 'TIS': 4, 'Polaris': 4, 'Mitratel': 4, 'Digiserve': 4, 'Cross Connect TDE': 4, 'IBU - FTTR': 5, 'Nutech': 4, 'SNT': 4, 'SPBU': 4, 'Surge': 4, 'MyRep': 2, 'Asianet': 4, 'Centratama': 4, 'Lintasarta': 4, 'UMT': 4 },
  'PREVENTIVE': { 'MMP': 2, 'CSA': 2, 'TBG': 2, 'Polaris': 2, 'TIS': 2, 'Fiberisasi': 2, 'Digiserve': 4, 'Cross Connect TDE': 4, 'IBU - FTTR': 5, 'NuTech': 4, 'SNT': 4, 'SPBU': 4, 'Surge': 4, 'Asianet': 2, 'Centratama': 8, 'Lintasarta': 2, 'UMT': 2 }
};

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
        help += "`/addprojects` - Buat proyek baru (format teks)\n";
        help += "`/assign` - Assign tiket ke teknisi (format teks)\n";
        help += "`/projects` - List proyek aktif untuk update progres\n\n";
        
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

        // 4. Create Repair Record if action is provided
        if (data.action) {
          try {
            await addDoc(collection(db, 'repairRecords'), {
              ticketId: targetTicket.id,
              technicianId: primaryTechId || 'unknown',
              startTime: serverTimestamp(),
              endTime: isClosure ? serverTimestamp() : null,
              notes: data.action,
              materialsUsed: [], 
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
            { text: '📸 Sebelum', data: 'Sebelum' },
            { text: '⛏️ Penggalian', data: 'Penggalian' },
            { text: '🏗️ Tanam Tiang', data: 'Tanam tiang' },
            { text: '🧱 Pengecoran', data: 'Pengecoran' },
            { text: '🧵 Penarikan Kabel', data: 'Penarikan kabel' },
            { text: '🛠️ Pasang Aksesoris', data: 'Pemasangan aksesoris' },
            { text: '🔌 Sambung Core', data: 'Penyambungan core' },
            { text: '📦 Pasang UC', data: 'Pemasangan UC' },
            { text: '🚀 Naik UC', data: 'Penaikan UC' },
            { text: '✅ Sesudah', data: 'Sesudah' },
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

        // Finish Project Session
        if (data === 'prj_finish') {
          projectSessions.delete(chatId);
          bot?.answerCallbackQuery(query.id, { text: 'Selesai!' });
          bot?.editMessageText('✅ *Selesai!*\n\nSemua eviden telah berhasil diunggah. Terima kasih!', {
            chat_id: chatId,
            message_id: query.message?.message_id,
            parse_mode: 'Markdown'
          });
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
      } catch (e) {
        console.error("Error in callback_query:", e);
      }
    });

    // Handle photos for projects
    bot.on('photo', async (msg) => {
      const chatId = msg.chat.id;
      const session = projectSessions.get(chatId);
      
      if (!session || !session.projectId || !session.stage) {
        // If no project session, it might be a regular /progres or /close (handled elsewhere)
        return;
      }

      try {
        console.log(`[Bot] Processing photo from ${chatId} for project ${session.projectId}, stage ${session.stage}`);
        const photo = msg.photo![msg.photo!.length - 1];
        const photoUrl = `/api/telegram-photo/${photo.file_id}`;
        const caption = msg.caption || '';

        // Verify user
        const userDoc = await getAuthorizedUser(chatId);
        
        if (!userDoc) {
          console.warn(`[Bot] User with telegramId ${chatId} not found in users collection`);
          bot?.sendMessage(chatId, "❌ *Akses Ditolak!*\n\nAkun Telegram Anda belum terhubung. Silakan hubungkan di menu profil.", { parse_mode: 'Markdown' });
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

          console.log(`[Bot] Updating project ${session.projectId} with new evidence item`);
          await updateDoc(projectRef, {
            evidence: [...evidence, newEvidence],
            updatedAt: serverTimestamp()
          });

          bot?.sendMessage(chatId, `✅ *Eviden Terkirim!*\n\nFoto untuk tahap *${session.stage}* pada proyek *${projectData.pid}* telah berhasil disimpan.\n\n_Anda bisa mengirimkan foto lain untuk tahap ini, atau klik tombol di bawah untuk selesai._`, { 
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
          
          // DO NOT clear session immediately to allow multiple uploads
          // projectSessions.delete(chatId);
        } else {
          console.error(`[Bot] Project ${session.projectId} not found in Firestore`);
          bot?.sendMessage(chatId, "❌ *Proyek tidak ditemukan.*");
        }
      } catch (e: any) {
        console.error("[Bot] Error saving project photo:", e);
        const errorMsg = e.message || 'Unknown error';
        bot?.sendMessage(chatId, `❌ *Gagal menyimpan foto eviden proyek.*\n\nDetail: ${errorMsg}`);
      }
    });

    // /progres command
    bot.onText(/^\/progres/i, async (msg) => {
      if (msg.photo) return; // Handled by on('photo')
      processFieldUpdate(msg.chat.id, msg.text || '');
    });

    // /close command
    bot.onText(/^\/close/i, async (msg) => {
      if (msg.photo) return; // Handled by on('photo')
      processFieldUpdate(msg.chat.id, msg.text || '');
    });

    // Handle photos with captions (for /close and /progres)
    bot.on('photo', async (msg) => {
      const chatId = msg.chat.id;
      const caption = (msg.caption || '').trim();
      
      if (!caption.toLowerCase().startsWith('/close') && !caption.toLowerCase().startsWith('/progres')) return;

      const photo = msg.photo![msg.photo!.length - 1];
      processFieldUpdate(chatId, caption, photo.file_id);
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
      
      const parts = text.split('\n');
      if (parts.length < 2) {
        const template = "🏗️ *Format Tambah Proyek Baru* 🏗️\n\n" +
          "Silakan salin dan isi format di bawah ini:\n\n" +
          "`/addprojects`\n" +
          "PID: \n" +
          "Nama: \n" +
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
          
          if (cleanKey.includes('pid')) data.pid = value;
          if (cleanKey.includes('nama')) data.projectName = value;
          if (cleanKey.includes('witel')) data.witel = value;
          if (cleanKey.includes('mitra')) data.partner = value;
          if (cleanKey.includes('lokasi')) data.location = value;
        }
      });

      if (!data.pid || !data.projectName) {
        bot.sendMessage(chatId, "⚠️ *Data tidak lengkap!*\n\nMohon pastikan `PID` dan `Nama` terisi.", { parse_mode: 'Markdown' });
        return;
      }

      try {
        // Verify user
        const userDoc = await getAuthorizedUser(chatId);
        
        if (!userDoc) {
          bot.sendMessage(chatId, "❌ *Akses Ditolak!*\n\nAkun Telegram Anda belum terhubung.", { parse_mode: 'Markdown' });
          return;
        }

        // Save to Firestore
        await addDoc(collection(db, 'projects'), {
          ...data,
          description: data.projectName, // description is required in rules
          status: 'open',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        
        bot.sendMessage(chatId, "✅ *Proyek Berhasil Disimpan!*\n\nProyek baru telah ditambahkan ke sistem.", { parse_mode: 'Markdown' });
      } catch (e: any) {
        console.error("Error saving project:", e);
        bot.sendMessage(chatId, `❌ *Gagal menyimpan data proyek!*\n\nError: ${e.message || 'Unknown error'}`, { parse_mode: 'Markdown' });
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
        successMsg += `Customer: ${customerDoc.data().name}\n`;
        successMsg += `Teknisi: ${techNames.join(', ')}`;
        
        bot.sendMessage(chatId, successMsg, { parse_mode: 'Markdown' });

        // 7. Notify Technicians
        for (const uid of techUids) {
          const techDoc = await getDoc(doc(db, 'users', uid));
          if (techDoc.exists() && techDoc.data().telegramId) {
            const notifyMsg = `🔔 *Tiket Baru Di-Assign!*\n\nAnda telah di-assign ke tiket #${targetTicket.data().ticketNumber} untuk customer *${customerDoc.data().name}*.`;
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

      // Handle active ticket session (waiting for Customer ID)
      const session = ticketSessions.get(chatId);
      if (session && session.stage === 'waiting_customer_id' && !text.startsWith('/')) {
        await handleTicketCreation(chatId, session.category!, session.subCategory!, text.trim());
        ticketSessions.delete(chatId);
        return;
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
    const protocol = req.secure ? 'https' : 'http';
    imageUrl = `${protocol}://${req.headers.host}${imageUrl}`;
  }
  
  console.log(`[Proxy] Fetching image: ${imageUrl}`);
  
  try {
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      },
      redirect: 'follow'
    });
    
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
