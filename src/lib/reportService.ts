import { collection, getDocs, query, where, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Ticket, RepairRecord, Report, MaterialUsage } from '../types';

export async function generateReport(type: 'weekly' | 'monthly', startDate: Date, endDate: Date): Promise<string> {
  // 1. Fetch tickets resolved/closed within the period
  const ticketsQuery = query(
    collection(db, 'tickets'),
    where('status', 'in', ['resolved', 'closed']),
    where('updatedAt', '>=', Timestamp.fromDate(startDate)),
    where('updatedAt', '<=', Timestamp.fromDate(endDate))
  );
  const ticketsSnap = await getDocs(ticketsQuery);
  const tickets = ticketsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ticket));

  // 2. Fetch repair records within the period to get material usage
  const repairRecordsQuery = query(
    collection(db, 'repairRecords'),
    where('createdAt', '>=', Timestamp.fromDate(startDate)),
    where('createdAt', '<=', Timestamp.fromDate(endDate))
  );
  const recordsSnap = await getDocs(repairRecordsQuery);
  const repairRecords = recordsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as RepairRecord));

  // 3. Calculate metrics
  const completedTickets = tickets.length;
  
  let totalResolutionTime = 0;
  let ticketsWithTime = 0;
  tickets.forEach(t => {
    if (t.createdAt && t.updatedAt) {
      const diff = t.updatedAt.toMillis() - t.createdAt.toMillis();
      totalResolutionTime += diff;
      ticketsWithTime++;
    }
  });
  const avgResolutionTime = ticketsWithTime > 0 ? (totalResolutionTime / ticketsWithTime / (1000 * 60)) : 0;

  // 4. Aggregate material usage
  const materialUsageMap: Record<string, { name: string, totalQuantity: number, totalCost: number }> = {};
  let totalMaterialCost = 0;

  repairRecords.forEach(record => {
    record.materialsUsed?.forEach(usage => {
      const cost = usage.quantity * usage.unitPrice;
      totalMaterialCost += cost;

      if (materialUsageMap[usage.materialId]) {
        materialUsageMap[usage.materialId].totalQuantity += usage.quantity;
        materialUsageMap[usage.materialId].totalCost += cost;
      } else {
        materialUsageMap[usage.materialId] = {
          name: usage.name,
          totalQuantity: usage.quantity,
          totalCost: cost
        };
      }
    });
  });

  const materialUsage = Object.entries(materialUsageMap).map(([id, data]) => ({
    materialId: id,
    ...data
  }));

  // 5. Save report to Firestore
  const reportData: Omit<Report, 'id'> = {
    type,
    startDate: Timestamp.fromDate(startDate),
    endDate: Timestamp.fromDate(endDate),
    completedTickets,
    avgResolutionTime,
    totalMaterialCost,
    materialUsage,
    createdAt: Timestamp.now()
  };

  const docRef = await addDoc(collection(db, 'reports'), reportData);
  return docRef.id;
}

export function getPeriodDates(type: 'weekly' | 'monthly', offset: number = 0) {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  if (type === 'weekly') {
    // Start of current week (Sunday)
    const day = now.getDay();
    start.setDate(now.getDate() - day - (offset * 7));
    start.setHours(0, 0, 0, 0);
    
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
  } else {
    // Start of current month
    start.setMonth(now.getMonth() - offset, 1);
    start.setHours(0, 0, 0, 0);
    
    end.setMonth(start.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
  }

  return { start, end };
}
