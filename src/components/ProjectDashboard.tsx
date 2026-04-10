import React from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area
} from 'recharts';
import { Project } from '../types';
import { 
  Activity, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  TrendingUp, 
  DollarSign,
  Briefcase
} from 'lucide-react';
import { motion } from 'motion/react';

interface ProjectDashboardProps {
  projects: Project[];
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function ProjectDashboard({ projects }: ProjectDashboardProps) {
  const stats = {
    total: projects.length,
    open: projects.filter(p => p.status === 'open').length,
    inProgress: projects.filter(p => p.status === 'in-progress').length,
    completed: projects.filter(p => p.status === 'completed').length,
    totalValue: projects.reduce((acc, p) => acc + (p.totalCost || 0), 0),
    avgDuration: projects.filter(p => p.status === 'completed').length > 0
      ? projects.filter(p => p.status === 'completed').reduce((acc, p) => acc + (p.estimatedDuration || 0), 0) / projects.filter(p => p.status === 'completed').length
      : 0
  };

  const statusData = [
    { name: 'Open', value: stats.open },
    { name: 'In Progress', value: stats.inProgress },
    { name: 'Completed', value: stats.completed }
  ];

  const witelData = projects.reduce((acc: any[], p) => {
    const witel = p.witel || 'Unknown';
    const existing = acc.find(a => a.name === witel);
    if (existing) {
      existing.value += 1;
    } else {
      acc.push({ name: witel, value: 1 });
    }
    return acc;
  }, []);

  const costData = projects.slice(0, 10).map(p => ({
    name: p.pid,
    cost: p.totalCost || 0,
    material: p.totalMaterialCost || 0,
    job: p.totalJobCost || 0
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-6 rounded-3xl border border-black/5 shadow-sm"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 text-blue-600 rounded-2xl">
              <Briefcase className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Total Proyek</p>
              <h3 className="text-2xl font-bold text-neutral-900">{stats.total}</h3>
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white p-6 rounded-3xl border border-black/5 shadow-sm"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-100 text-emerald-600 rounded-2xl">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Total Nilai</p>
              <h3 className="text-2xl font-bold text-neutral-900">Rp {stats.totalValue.toLocaleString()}</h3>
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white p-6 rounded-3xl border border-black/5 shadow-sm"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-100 text-amber-600 rounded-2xl">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Rata-rata Durasi</p>
              <h3 className="text-2xl font-bold text-neutral-900">{Math.round(stats.avgDuration)} Hari</h3>
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white p-6 rounded-3xl border border-black/5 shadow-sm"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-100 text-indigo-600 rounded-2xl">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Penyelesaian</p>
              <h3 className="text-2xl font-bold text-neutral-900">
                {stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}%
              </h3>
            </div>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-black/5 shadow-sm">
          <h4 className="text-sm font-bold text-neutral-900 mb-6 flex items-center gap-2">
            <Activity className="w-4 h-4 text-indigo-600" />
            Status Proyek
          </h4>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-6 mt-4">
            {statusData.map((entry, index) => (
              <div key={entry.name} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                <span className="text-xs font-medium text-neutral-600">{entry.name} ({entry.value})</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-black/5 shadow-sm">
          <h4 className="text-sm font-bold text-neutral-900 mb-6 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-600" />
            Analisis Biaya (Top 10 Proyek)
          </h4>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={costData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="material" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Material" />
                <Bar dataKey="job" fill="#10b981" radius={[4, 4, 0, 0]} name="Jasa" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
