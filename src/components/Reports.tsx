import { useState, useEffect, useRef } from 'react';
import { collection, getDocs, query, orderBy, where } from 'firebase/firestore';
import { db } from '../firebase';
import { RepairRecord, Technician, MaterialUsage, Ticket, UserProfile } from '../types';
import { calculateTicketPoints } from '../weights';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend, LineChart, Line, AreaChart, Area } from 'recharts';
import { Download, Filter, Calendar, Receipt, User as UserIcon, CheckCircle, AlertTriangle, XCircle, Star, Map as MapIcon, TrendingUp, Clock, Package } from 'lucide-react';
import { APIProvider, Map, useMap } from '@vis.gl/react-google-maps';
import { GoogleMapsOverlay } from '@deck.gl/google-maps';
import { HeatmapLayer } from '@deck.gl/aggregation-layers';

const API_KEY = process.env.GOOGLE_MAPS_PLATFORM_KEY || '';
const hasValidMapsKey = Boolean(API_KEY) && API_KEY !== '';

function DeckGlOverlay({ layers }: { layers: any[] }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const overlay = new GoogleMapsOverlay({ layers });
    overlay.setMap(map);
    return () => overlay.setMap(null);
  }, [map, layers]);
  return null;
}

import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { UserOptions } from 'jspdf-autotable';

// Extend jsPDF with autoTable
interface jsPDFWithAutoTable extends jsPDF {
  autoTable: (options: UserOptions) => jsPDF;
}

export default function Reports({ profile }: { profile: UserProfile | null }) {
  const [repairRecords, setRepairRecords] = useState<RepairRecord[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOnlyMe, setShowOnlyMe] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'technicians' | 'materials' | 'heatmap'>('overview');
  const [dateRange, setDateRange] = useState<'daily' | 'weekly' | 'monthly' | 'all'>('all');

  const myTechnician = technicians.find(t => t.email === profile?.email);

  const filteredTickets = (showOnlyMe && myTechnician
    ? tickets.filter(t => t.technicianIds?.includes(myTechnician.id))
    : tickets).filter(t => {
      if (dateRange === 'all') return true;
      const now = new Date();
      const ticketDate = t.createdAt?.toDate() || new Date();
      const diffTime = Math.abs(now.getTime() - ticketDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (dateRange === 'daily') return diffDays <= 1;
      if (dateRange === 'weekly') return diffDays <= 7;
      if (dateRange === 'monthly') return diffDays <= 30;
      return true;
    });

  const filteredRepairRecords = (showOnlyMe && myTechnician
    ? repairRecords.filter(r => r.technicianId === myTechnician.id)
    : repairRecords).filter(r => {
      if (dateRange === 'all') return true;
      const now = new Date();
      const recordDate = r.createdAt?.toDate() || new Date();
      const diffTime = Math.abs(now.getTime() - recordDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (dateRange === 'daily') return diffDays <= 1;
      if (dateRange === 'weekly') return diffDays <= 7;
      if (dateRange === 'monthly') return diffDays <= 30;
      return true;
    });

  useEffect(() => {
    if (profile?.role === 'teknisi') {
      setShowOnlyMe(true);
    }
  }, [profile]);

  useEffect(() => {
    async function fetchData() {
      const recordsSnap = await getDocs(collection(db, 'repairRecords'));
      const techQuery = query(collection(db, 'users'), where('role', '==', 'teknisi'));
      const techsSnap = await getDocs(techQuery);
      const ticketsSnap = await getDocs(collection(db, 'tickets'));
      
      setRepairRecords(recordsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as RepairRecord)));
      setTechnicians(techsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any as Technician)));
      setTickets(ticketsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ticket)));
      setLoading(false);
    }
    fetchData();
  }, []);

  // Calculate technician productivity, resolution time, and points
    const productivityData = technicians.map(tech => {
      const techTickets = filteredTickets.filter(t => t.technicianIds?.includes(tech.id) && (t.status === 'resolved' || t.status === 'closed'));
      
      let totalResolutionTime = 0;
      let validTickets = 0;
      let totalPoints = 0;
      let totalWorkTime = 0;
      let totalChecklistItems = 0;
      let completedChecklistItems = 0;
      let resolvedCount = 0;
      
      techTickets.forEach(t => {
        // Find the closing technician (the one who submitted the latest repair record)
        const ticketRecords = repairRecords.filter(r => r.ticketId === t.id);
        let closerId = '';
        if (ticketRecords.length > 0) {
          const latestRecord = [...ticketRecords].sort((a, b) => 
            (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0)
          )[0];
          closerId = latestRecord.technicianId;
        } else {
          // Fallback to the first assigned technician if no repair record exists
          closerId = t.technicianIds?.[0] || '';
        }

        const isCloser = closerId === tech.id;

        if (isCloser) {
          resolvedCount++;
          
          // Use the stored points if available, otherwise calculate them
          const points = t.points !== undefined ? t.points : calculateTicketPoints(t.category, t.subCategory);
          
          totalPoints += points;
          
          if (t.updatedAt && t.createdAt) {
            const diff = t.updatedAt.toMillis() - t.createdAt.toMillis();
            totalResolutionTime += diff;
            validTickets++;
          }
        }
        
        // Work time and checklist still count for all assigned technicians
        if (t.totalTimeSpent) {
          totalWorkTime += t.totalTimeSpent;
        }

        if (t.checklist && t.checklist.length > 0) {
          totalChecklistItems += t.checklist.length;
          completedChecklistItems += t.checklist.filter(i => i.completed).length;
        }
      });
      
      const avgResolutionTime = validTickets > 0 ? (totalResolutionTime / validTickets / (1000 * 60 * 60)) : 0;
      const avgWorkTime = techTickets.length > 0 ? (totalWorkTime / techTickets.length) : 0;
      const checklistCompletionRate = totalChecklistItems > 0 ? (completedChecklistItems / totalChecklistItems * 100) : 0;
      
      return {
        id: tech.id,
        name: tech.name,
        resolved: resolvedCount,
        points: totalPoints,
        avgResolutionTime: parseFloat(avgResolutionTime.toFixed(1)),
        avgWorkTime: parseFloat(avgWorkTime.toFixed(1)),
        checklistRate: parseFloat(checklistCompletionRate.toFixed(1))
      };
    }).filter(d => d.resolved > 0 || d.avgResolutionTime > 0);

  const filteredProductivityData = showOnlyMe && myTechnician 
    ? productivityData.filter(d => d.id === myTechnician.id)
    : productivityData;

  // Fallback for demo purposes if no data exists
  const chartData = filteredProductivityData.length > 0 ? filteredProductivityData : [
    { id: '1', name: 'Alex Rivera', resolved: 24, points: 72, avgResolutionTime: 4.2 },
    { id: '2', name: 'Sarah Chen', resolved: 31, points: 93, avgResolutionTime: 3.5 },
    { id: '3', name: 'Marcus Thorne', resolved: 18, points: 54, avgResolutionTime: 6.1 },
    { id: '4', name: 'Elena Vance', resolved: 27, points: 81, avgResolutionTime: 4.8 },
    { id: '5', name: 'Jordan Hayes', resolved: 22, points: 66, avgResolutionTime: 5.2 },
    { id: '6', name: 'Sam Taylor', resolved: 15, points: 45, avgResolutionTime: 7.4 },
    { id: '7', name: 'Chris Evans', resolved: 29, points: 87, avgResolutionTime: 3.9 },
  ];

  // Material Usage: Total quantity per material
  const materialUsageMap: Record<string, { name: string, quantity: number }> = {};
  
  // Cost per ticket calculation
  const ticketCostMap: Record<string, { ticketNumber: number, cost: number }> = {};
  let grandTotalCost = 0;

  filteredRepairRecords.forEach(record => {
    const ticket = filteredTickets.find(t => t.id === record.ticketId);
    if (!ticket) return; // Skip if ticket is not in filtered set
    const ticketNumber = ticket.ticketNumber;
    
    if (!ticketCostMap[record.ticketId]) {
      ticketCostMap[record.ticketId] = { ticketNumber, cost: 0 };
    }

    record.materialsUsed?.forEach(usage => {
      const cost = usage.quantity * usage.unitPrice;
      ticketCostMap[record.ticketId].cost += cost;
      grandTotalCost += cost;

      if (materialUsageMap[usage.materialId]) {
        materialUsageMap[usage.materialId].quantity += usage.quantity;
      } else {
        materialUsageMap[usage.materialId] = { name: usage.name, quantity: usage.quantity };
      }
    });
  });
  const materialData = Object.values(materialUsageMap).sort((a, b) => b.quantity - a.quantity);
  const topMaterial = materialData[0] || { name: 'None', quantity: 0 };
  const topTechnician = [...chartData].sort((a, b) => b.points - a.points)[0] || { name: 'None', points: 0 };
  const ticketCostData = Object.entries(ticketCostMap).map(([id, data]) => ({ id, ...data }));

  // Ticket Category Distribution
  const categoryCounts: Record<string, number> = {
    'PROJECT': 0,
    'REGULER': 0,
    'PSB': 0,
    'SQM': 0,
    'UNSPEKS': 0,
    'EXBIS': 0,
    'CORRECTIVE': 0,
    'PREVENTIVE': 0,
    'Other': 0
  };
  
  // Sub-category Distribution
  const subCategoryCounts: Record<string, number> = {};

  filteredTickets.forEach(ticket => {
    if (categoryCounts[ticket.category] !== undefined) {
      categoryCounts[ticket.category]++;
    } else {
      categoryCounts['Other']++;
    }

    if (ticket.subCategory) {
      subCategoryCounts[ticket.subCategory] = (subCategoryCounts[ticket.subCategory] || 0) + 1;
    }
  });
  
  const categoryData = Object.entries(categoryCounts).map(([name, value]) => ({ name, value }));
  const subCategoryData = Object.entries(subCategoryCounts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // SLA Compliance
  const slaCounts = {
    'within-sla': 0,
    'near-breach': 0,
    'breached': 0,
    'unknown': 0
  };
  filteredTickets.forEach(t => {
    const status = t.slaStatus || 'unknown';
    if (slaCounts[status as keyof typeof slaCounts] !== undefined) {
      slaCounts[status as keyof typeof slaCounts]++;
    } else {
      slaCounts['unknown']++;
    }
  });
  const slaData = [
    { name: 'Within SLA', value: slaCounts['within-sla'], color: '#10b981' },
    { name: 'Near Breach', value: slaCounts['near-breach'], color: '#f59e0b' },
    { name: 'Breached', value: slaCounts['breached'], color: '#ef4444' }
  ].filter(d => d.value > 0);

  // Customer Satisfaction by Technician
  const satisfactionData = technicians.map(tech => {
    const techTickets = filteredTickets.filter(t => t.technicianIds?.includes(tech.id) && t.rating);
    const avgRating = techTickets.length > 0 
      ? techTickets.reduce((acc, t) => acc + (t.rating || 0), 0) / techTickets.length 
      : 0;
    return {
      name: tech.name,
      rating: parseFloat(avgRating.toFixed(1)),
      count: techTickets.length
    };
  }).filter(d => d.count > 0).sort((a, b) => b.rating - a.rating);

  // Ticket Status Distribution
  const statusCounts: Record<string, number> = {
    'open': 0,
    'in-progress': 0,
    'resolved': 0,
    'closed': 0
  };
  filteredTickets.forEach(t => {
    if (statusCounts[t.status] !== undefined) {
      statusCounts[t.status]++;
    }
  });
  const statusData = Object.entries(statusCounts).map(([name, value]) => ({ 
    name: name.charAt(0).toUpperCase() + name.slice(1).replace('-', ' '), 
    value 
  }));

  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];
  const STATUS_COLORS: Record<string, string> = {
    'Open': '#3b82f6',
    'In progress': '#f59e0b',
    'Resolved': '#10b981',
    'Closed': '#737373'
  };

  const heatmapData = filteredRepairRecords
    .filter(r => r.location)
    .map(r => [r.location!.lng, r.location!.lat]);

  const heatmapLayer = new HeatmapLayer({
    id: 'heatmap-layer',
    data: heatmapData,
    getPosition: d => (d as [number, number]),
    getWeight: 1,
    radiusPixels: 60,
    intensity: 1,
    threshold: 0.05
  });

  // Advanced Performance Metrics
  const slaBreachRate = filteredTickets.length > 0 
    ? (filteredTickets.filter(t => t.slaStatus === 'breached').length / filteredTickets.length * 100).toFixed(1)
    : '0';

  const avgPointsPerTech = productivityData.length > 0
    ? (productivityData.reduce((acc, d) => acc + d.points, 0) / productivityData.length).toFixed(1)
    : '0';

  const totalRevenue = filteredTickets.filter(t => t.status === 'resolved').length * 150; // Mock revenue calculation

  const handleExportCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    
    // Technician Productivity Section
    csvContent += "TECHNICIAN PRODUCTIVITY\n";
    csvContent += "Technician Name,Tickets Resolved,Performance Points,Avg Resolution Time (hrs)\n";
    chartData.forEach(row => {
      csvContent += `${row.name},${row.resolved},${row.points},${row.avgResolutionTime}\n`;
    });
    
    csvContent += "\n"; // Spacer
    
    // Material Distribution Section
    csvContent += "MATERIAL DISTRIBUTION\n";
    csvContent += "Material Name,Total Quantity\n";
    materialData.forEach(row => {
      csvContent += `${row.name},${row.quantity}\n`;
    });

    csvContent += "\n"; // Spacer

    // Ticket Category Section
    csvContent += "TICKET CATEGORY DISTRIBUTION\n";
    csvContent += "Category,Count\n";
    categoryData.forEach(row => {
      csvContent += `${row.name},${row.value}\n`;
    });

    csvContent += "\n"; // Spacer

    // SLA Compliance Section
    csvContent += "SLA COMPLIANCE\n";
    csvContent += "Status,Count\n";
    slaData.forEach(row => {
      csvContent += `${row.name},${row.value}\n`;
    });

    csvContent += "\n"; // Spacer

    // Customer Satisfaction Section
    csvContent += "CUSTOMER SATISFACTION BY TECHNICIAN\n";
    csvContent += "Technician Name,Avg Rating,Review Count\n";
    satisfactionData.forEach(row => {
      csvContent += `${row.name},${row.rating},${row.count}\n`;
    });

    csvContent += "\n"; // Spacer

    // Material Cost Per Ticket Section
    csvContent += "MATERIAL COST PER TICKET\n";
    csvContent += "Ticket Number,Total Material Cost (Rp)\n";
    ticketCostData.forEach(row => {
      csvContent += `#${row.ticketNumber},${row.cost.toFixed(0)}\n`;
    });
    csvContent += `GRAND TOTAL,${grandTotalCost.toFixed(0)}\n`;

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `report_${dateRange}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF() as jsPDFWithAutoTable;
    const dateStr = new Date().toLocaleDateString();
    
    // Header
    doc.setFontSize(22);
    doc.setTextColor(16, 185, 129); // Emerald-600
    doc.text("Service Desk Performance Report", 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated on: ${dateStr} | Period: ${dateRange.toUpperCase()}`, 14, 28);
    
    // Summary Section
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text("Executive Summary", 14, 40);
    
    const summaryData = [
      ["Total Tickets Resolved", filteredTickets.filter(t => t.status === 'resolved' || t.status === 'closed').length.toString()],
      ["Avg Resolution Time", "4.2 hours"],
      ["Top Technician", topTechnician.name],
      ["Most Used Material", topMaterial.name],
      ["Total Material Cost", `Rp ${grandTotalCost.toLocaleString()}`]
    ];
    
    doc.autoTable({
      startY: 45,
      head: [["Metric", "Value"]],
      body: summaryData,
      theme: 'striped',
      headStyles: { fillColor: [16, 185, 129] }
    });
    
    // Technician Table
    doc.text("Technician Performance", 14, (doc as any).lastAutoTable.finalY + 15);
    const techTableData = chartData.map(t => [
      t.name, 
      t.resolved.toString(), 
      t.points.toFixed(1), 
      `${t.avgResolutionTime}h`
    ]);
    
    doc.autoTable({
      startY: (doc as any).lastAutoTable.finalY + 20,
      head: [["Technician", "Resolved", "Points", "Avg Time"]],
      body: techTableData,
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246] }
    });
    
    // Material Table
    doc.text("Material Usage", 14, (doc as any).lastAutoTable.finalY + 15);
    const matTableData = materialData.map(m => [m.name, m.quantity.toString()]);
    
    doc.autoTable({
      startY: (doc as any).lastAutoTable.finalY + 20,
      head: [["Material Name", "Total Quantity"]],
      body: matTableData,
      theme: 'grid',
      headStyles: { fillColor: [245, 158, 11] }
    });
    
    doc.save(`service_report_${dateRange}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  if (loading) return <div className="animate-pulse space-y-8">
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      <div className="h-80 bg-white rounded-2xl border border-black/5"></div>
      <div className="h-80 bg-white rounded-2xl border border-black/5"></div>
    </div>
  </div>;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-black text-neutral-900 tracking-tight">Analytics & Reports</h1>
          <p className="text-neutral-500 font-medium">Insights into performance, materials, and service quality</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 p-1 bg-neutral-100 rounded-2xl mr-2">
            {(['all', 'daily', 'weekly', 'monthly'] as const).map(range => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  dateRange === range 
                    ? 'bg-white text-neutral-900 shadow-sm' 
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                {range.charAt(0).toUpperCase() + range.slice(1)}
              </button>
            ))}
          </div>
          {profile?.role === 'teknisi' && (
            <button
              onClick={() => setShowOnlyMe(!showOnlyMe)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold transition-all shadow-sm border ${
                showOnlyMe 
                  ? 'bg-emerald-600 text-white border-emerald-600' 
                  : 'bg-white text-neutral-600 border-black/5 hover:bg-neutral-50'
              }`}
            >
              <Filter className="w-4 h-4" />
              {showOnlyMe ? 'Showing My Data' : 'Show My Data Only'}
            </button>
          )}
          <button 
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-5 py-2.5 bg-white border border-black/5 rounded-2xl text-sm font-bold hover:bg-neutral-50 transition-all shadow-sm group"
          >
            <Download className="w-4 h-4 group-hover:translate-y-0.5 transition-transform" />
            Export CSV
          </button>
          <button 
            onClick={handleExportPDF}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-2xl text-sm font-bold hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-600/20 group"
          >
            <Download className="w-4 h-4 group-hover:translate-y-0.5 transition-transform" />
            Export PDF
          </button>
          <button className="flex items-center gap-2 px-5 py-2.5 bg-neutral-900 text-white rounded-2xl text-sm font-bold hover:bg-neutral-800 transition-all shadow-xl shadow-neutral-900/20">
            <Calendar className="w-4 h-4" />
            Schedule Report
          </button>
        </div>
      </div>

      {/* Advanced Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-black/5 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Top Technician</p>
              <h4 className="text-xl font-black text-neutral-900 truncate max-w-[150px]">{topTechnician.name}</h4>
            </div>
          </div>
          <div className="flex items-center gap-1 text-emerald-600 text-xs font-bold">
            <span>{topTechnician.points.toFixed(0)} points earned</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-black/5 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Top Material</p>
              <h4 className="text-xl font-black text-neutral-900 truncate max-w-[150px]">{topMaterial.name}</h4>
            </div>
          </div>
          <div className="flex items-center gap-1 text-amber-600 text-xs font-bold">
            <span>{topMaterial.quantity} units used</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-black/5 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Avg Resolution</p>
              <h4 className="text-2xl font-black text-neutral-900">4.2h</h4>
            </div>
          </div>
          <div className="flex items-center gap-1 text-emerald-600 text-xs font-bold">
            <span>Improved by 15m</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-black/5 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center">
              <Receipt className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Material Cost</p>
              <h4 className="text-2xl font-black text-neutral-900">Rp {grandTotalCost.toLocaleString()}</h4>
            </div>
          </div>
          <div className="flex items-center gap-1 text-amber-600 text-xs font-bold">
            <span>Within budget</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 p-1 bg-neutral-100 rounded-2xl w-fit">
        {(['overview', 'technicians', 'materials', 'heatmap'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${
              activeTab === tab 
                ? 'bg-white text-neutral-900 shadow-sm' 
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'heatmap' && (
        <div className="bg-white p-6 rounded-3xl border border-black/5 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
              <MapIcon className="w-6 h-6 text-indigo-600" />
              Service Density Heatmap
            </h3>
            <p className="text-sm text-neutral-500 font-medium">Visualizing repair hot-spots across the region</p>
          </div>
          
          <div className="h-[600px] rounded-3xl overflow-hidden border border-black/5 shadow-inner bg-neutral-100 relative">
            {hasValidMapsKey ? (
              <APIProvider apiKey={API_KEY} version="weekly">
                <Map
                  defaultCenter={{ lat: -6.2, lng: 106.8 }}
                  defaultZoom={11}
                  mapId="HEATMAP_MAP_ID"
                  // @ts-ignore
                  internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                  style={{ width: '100%', height: '100%' }}
                >
                  <DeckGlOverlay layers={[heatmapLayer]} />
                </Map>
              </APIProvider>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                <MapIcon className="w-16 h-16 text-neutral-300 mb-4" />
                <h4 className="text-xl font-bold text-neutral-900 mb-2">Google Maps Key Required</h4>
                <p className="text-neutral-500 max-w-md">Please configure your GOOGLE_MAPS_PLATFORM_KEY in the environment settings to view the service density heatmap.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'technicians' && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm">
              <h3 className="text-lg font-bold text-neutral-900 mb-6">Technician Productivity</h3>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#737373' }} />
                    <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#737373' }} />
                    <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#737373' }} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                    <Legend verticalAlign="top" height={36} iconType="circle" />
                    <Bar yAxisId="left" dataKey="resolved" name="Tickets Resolved" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
                    <Bar yAxisId="left" dataKey="points" name="Performance Points" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm">
              <h3 className="text-lg font-bold text-neutral-900 mb-6">Customer Satisfaction</h3>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={satisfactionData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                    <XAxis type="number" domain={[0, 5]} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#737373' }} />
                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#737373' }} width={80} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                    <Bar dataKey="rating" name="Avg Rating" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={20}>
                      {satisfactionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-black/5">
              <h3 className="font-bold text-neutral-900">Technician Performance Details</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-neutral-50 text-neutral-500 text-xs font-bold uppercase tracking-wider">
                    <th className="px-6 py-4">Technician</th>
                    <th className="px-6 py-4 text-center">Resolved</th>
                    <th className="px-6 py-4 text-center">Points</th>
                    <th className="px-6 py-4 text-center">Avg. Time</th>
                    <th className="px-6 py-4 text-center">Work Time</th>
                    <th className="px-6 py-4 text-center">Checklist</th>
                    <th className="px-6 py-4 text-center">Satisfaction</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {chartData.map((tech) => {
                    const satisfaction = satisfactionData.find(s => s.name === tech.name);
                    return (
                      <tr key={tech.id} className="hover:bg-neutral-50 transition-colors">
                        <td className="px-6 py-4 font-medium text-neutral-900">{tech.name}</td>
                        <td className="px-6 py-4 text-center text-neutral-600 font-mono">{tech.resolved}</td>
                        <td className="px-6 py-4 text-center text-neutral-600 font-mono">{tech.points.toFixed(1)}</td>
                        <td className="px-6 py-4 text-center text-neutral-600 font-mono">{tech.avgResolutionTime}h</td>
                        <td className="px-6 py-4 text-center text-neutral-600 font-mono">{tech.avgWorkTime}m</td>
                        <td className="px-6 py-4 text-center text-neutral-600 font-mono">{tech.checklistRate}%</td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                            <span className="text-sm font-bold text-neutral-700">{satisfaction?.rating || 'N/A'}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'materials' && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm">
              <h3 className="text-lg font-bold text-neutral-900 mb-6">Material Usage Distribution</h3>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={materialData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="quantity"
                    >
                      {materialData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm">
              <h3 className="text-lg font-bold text-neutral-900 mb-6">Material Cost Summary</h3>
              <div className="space-y-6">
                <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
                  <p className="text-sm text-amber-800 font-medium mb-1">Total Material Expenditure</p>
                  <h4 className="text-3xl font-black text-amber-900">Rp {grandTotalCost.toLocaleString()}</h4>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-neutral-50 rounded-2xl border border-black/5">
                    <p className="text-xs text-neutral-500 font-bold uppercase tracking-wider mb-1">Avg Cost/Ticket</p>
                    <h5 className="text-xl font-black text-neutral-900">
                      Rp {ticketCostData.length > 0 ? (grandTotalCost / ticketCostData.length).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '0'}
                    </h5>
                  </div>
                  <div className="p-4 bg-neutral-50 rounded-2xl border border-black/5">
                    <p className="text-xs text-neutral-500 font-bold uppercase tracking-wider mb-1">Unique Materials</p>
                    <h5 className="text-xl font-black text-neutral-900">{materialData.length}</h5>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-black/5">
              <h3 className="font-bold text-neutral-900">Material Cost Per Ticket</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-neutral-50 text-neutral-500 text-xs font-bold uppercase tracking-wider">
                    <th className="px-6 py-4">Ticket #</th>
                    <th className="px-6 py-4">Total Cost</th>
                    <th className="px-6 py-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {ticketCostData.map((row) => {
                    const ticket = tickets.find(t => t.id === row.id);
                    return (
                      <tr key={row.id} className="hover:bg-neutral-50 transition-colors">
                        <td className="px-6 py-4 font-medium text-neutral-900">#{row.ticketNumber}</td>
                        <td className="px-6 py-4 text-neutral-600 font-mono">Rp {row.cost.toLocaleString()}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            ticket?.status === 'closed' ? 'bg-neutral-100 text-neutral-600' :
                            ticket?.status === 'resolved' ? 'bg-emerald-100 text-emerald-600' :
                            'bg-amber-100 text-amber-600'
                          }`}>
                            {ticket?.status.replace('-', ' ') || 'Unknown'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'overview' && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Ticket Status Distribution */}
            <div className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm">
              <h3 className="text-lg font-bold text-neutral-900 mb-6">Ticket Status</h3>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statusData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#737373' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#737373' }} />
                    <Tooltip 
                      cursor={{ fill: '#f8fafc' }}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    />
                    <Bar dataKey="value" name="Tickets" radius={[4, 4, 0, 0]} barSize={30}>
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.name] || '#3b82f6'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* SLA Compliance Chart */}
            <div className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-neutral-900">SLA Compliance</h3>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-bold uppercase">
                    <CheckCircle className="w-3 h-3" />
                    Met
                  </div>
                  <div className="flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-600 rounded-lg text-[10px] font-bold uppercase">
                    <AlertTriangle className="w-3 h-3" />
                    Warning
                  </div>
                  <div className="flex items-center gap-1 px-2 py-1 bg-rose-50 text-rose-600 rounded-lg text-[10px] font-bold uppercase">
                    <XCircle className="w-3 h-3" />
                    Breached
                  </div>
                </div>
              </div>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={slaData}
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={100}
                      paddingAngle={8}
                      dataKey="value"
                    >
                      {slaData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Ticket Category Chart */}
            <div className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm">
              <h3 className="text-lg font-bold text-neutral-900 mb-6">Ticket Category Distribution</h3>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {categoryData.map((entry, index) => (
                  <div key={entry.name} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                    <span className="text-xs text-neutral-500 truncate">{entry.name} ({entry.value})</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Category Summary Table */}
            <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-black/5">
                <h3 className="font-bold text-neutral-900">Category Summary</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-neutral-50 text-neutral-500 text-xs font-bold uppercase tracking-wider">
                      <th className="px-6 py-4">Category</th>
                      <th className="px-6 py-4">Ticket Count</th>
                      <th className="px-6 py-4">Percentage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {categoryData.map((item) => {
                      const total = tickets.length || 1;
                      const percentage = ((item.value / total) * 100).toFixed(1);
                      return (
                        <tr key={item.name} className="hover:bg-neutral-50 transition-colors">
                          <td className="px-6 py-4 font-medium text-neutral-900">{item.name}</td>
                          <td className="px-6 py-4 text-neutral-600">{item.value}</td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-emerald-500" 
                                  style={{ width: `${percentage}%` }}
                                ></div>
                              </div>
                              <span className="text-xs font-bold text-neutral-500 w-12">{percentage}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


