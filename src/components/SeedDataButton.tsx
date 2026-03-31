import React, { useState } from 'react';
import { collection, addDoc, serverTimestamp, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Database, Loader2, CheckCircle } from 'lucide-react';
import { useToast } from './Toast';

export default function SeedDataButton() {
  const [isSeeding, setIsSeeding] = useState(false);
  const { showToast } = useToast();

  const seedData = async () => {
    setIsSeeding(true);
    try {
      // 1. Seed Customers
      const customers = [
        {
          customerId: 'CUST001',
          name: 'Budi Santoso',
          phone: '081234567890',
          address: 'Jl. Merdeka No. 10, Jakarta',
          odp: 'ODP-JKT-01',
          email: 'budi@example.com'
        },
        {
          customerId: 'CUST002',
          name: 'Siti Aminah',
          phone: '081298765432',
          address: 'Jl. Sudirman No. 5, Bandung',
          odp: 'ODP-BDG-05',
          email: 'siti@example.com'
        },
        {
          customerId: 'CUST003',
          name: 'Andi Wijaya',
          phone: '085612345678',
          address: 'Jl. Diponegoro No. 22, Surabaya',
          odp: 'ODP-SBY-22',
          email: 'andi@example.com'
        }
      ];

      for (const customer of customers) {
        const q = query(collection(db, 'customers'), where('customerId', '==', customer.customerId));
        const snap = await getDocs(q);
        if (snap.empty) {
          await addDoc(collection(db, 'customers'), {
            ...customer,
            createdAt: serverTimestamp()
          });
        }
      }

      // 2. Seed Technicians
      const technicians = [
        {
          name: 'Rian Hidayat',
          nik: '3201010101010001',
          email: 'rian.tech@example.com',
          phone: '081122334455',
          role: 'Field Technician',
          availabilityStatus: 'Available',
          workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
          workingHours: '08:00 - 17:00'
        },
        {
          name: 'Dewi Lestari',
          nik: '3201010101010002',
          email: 'dewi.tech@example.com',
          phone: '081199887766',
          role: 'Senior Technician',
          availabilityStatus: 'Busy',
          workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
          workingHours: '09:00 - 18:00'
        },
        {
          name: 'Eko Prasetyo',
          nik: '3201010101010003',
          email: 'eko.tech@example.com',
          phone: '081155667788',
          role: 'Support Specialist',
          availabilityStatus: 'Available',
          workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
          workingHours: '08:00 - 16:00'
        },
        {
          name: 'Technician Test',
          nik: '20900325',
          email: 'test.tech@example.com',
          phone: '081234567890',
          role: 'Field Support',
          availabilityStatus: 'Available',
          workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
          workingHours: '08:00 - 17:00'
        }
      ];

      for (const tech of technicians) {
        const q = query(collection(db, 'users'), where('email', '==', tech.email));
        const snap = await getDocs(q);
        if (snap.empty) {
          await addDoc(collection(db, 'users'), {
            ...tech,
            uid: `demo_${tech.nik}`,
            role: 'teknisi',
            createdAt: serverTimestamp()
          });
        }
      }

      // 3. Seed Materials
      const materials = [
        {
          name: 'Patchcord Fiber Optic 3M',
          unit: 'Pcs',
          price: 25000,
          quantity: 100,
          minQuantity: 20
        },
        {
          name: 'Connector RJ45 Cat6',
          unit: 'Box',
          price: 150000,
          quantity: 10,
          minQuantity: 2
        },
        {
          name: 'ONT Huawei HG8245H',
          unit: 'Unit',
          price: 450000,
          quantity: 15,
          minQuantity: 5
        },
        {
          name: 'Dropcore 1 Core 100M',
          unit: 'Roll',
          price: 120000,
          quantity: 20,
          minQuantity: 5
        }
      ];

      for (const material of materials) {
        const q = query(collection(db, 'materials'), where('name', '==', material.name));
        const snap = await getDocs(q);
        if (snap.empty) {
          await addDoc(collection(db, 'materials'), {
            ...material,
            createdAt: serverTimestamp()
          });
        }
      }

      // 4. Seed Ticket Categories
      const ticketCategories = [
        {
          name: 'Internet',
          subCategories: ['Lambat', 'Putus-putus', 'Mati Total', 'Lainnya']
        },
        {
          name: 'Hardware',
          subCategories: ['ONT Rusak', 'Adaptor Mati', 'Kabel Putus', 'Lainnya']
        },
        {
          name: 'Software',
          subCategories: ['Gagal Login', 'Konfigurasi', 'Lainnya']
        }
      ];

      for (const cat of ticketCategories) {
        const q = query(collection(db, 'ticketCategories'), where('name', '==', cat.name));
        const snap = await getDocs(q);
        if (snap.empty) {
          await addDoc(collection(db, 'ticketCategories'), {
            ...cat,
            createdAt: serverTimestamp()
          });
        }
      }

      showToast('Example data seeded successfully!', 'success');
    } catch (error) {
      console.error('Error seeding data:', error);
      showToast('Failed to seed example data', 'error');
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <button
      onClick={seedData}
      disabled={isSeeding}
      className="w-full p-3 text-left bg-neutral-50 hover:bg-neutral-100 rounded-xl transition-colors flex items-center gap-3 disabled:opacity-50"
    >
      <div className="w-8 h-8 bg-amber-100 text-amber-600 rounded-lg flex items-center justify-center">
        {isSeeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-medium">Seed Example Data</span>
        <span className="text-[10px] text-neutral-400">Add customers, techs, & materials</span>
      </div>
    </button>
  );
}
