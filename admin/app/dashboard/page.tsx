import React from 'react';
import { motion } from 'motion/react';
import { Users, Activity, ShieldAlert, CreditCard, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { useAdminStore } from '../../stores/adminStore';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

const mockChartData = [
  { name: 'Mon', requests: 4000, threats: 240 },
  { name: 'Tue', requests: 3000, threats: 139 },
  { name: 'Wed', requests: 2000, threats: 980 },
  { name: 'Thu', requests: 2780, threats: 390 },
  { name: 'Fri', requests: 1890, threats: 480 },
  { name: 'Sat', requests: 2390, threats: 380 },
  { name: 'Sun', requests: 3490, threats: 430 },
];

export default function AdminDashboard() {
  const { metrics } = useAdminStore();

  const statCards = [
    { title: 'Total Users', value: metrics.totalUsers.toLocaleString(), icon: Users, change: '+12%', positive: true },
    { title: 'Total API Requests', value: (metrics.totalRequests / 1000000).toFixed(1) + 'M', icon: Activity, change: '+24%', positive: true },
    { title: 'Threats Blocked', value: metrics.threatsBlocked.toLocaleString(), icon: ShieldAlert, change: '-5%', positive: false },
    { title: 'Monthly Revenue', value: '$' + (metrics.mrr / 1000).toFixed(1) + 'k', icon: CreditCard, change: '+18%', positive: true },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Platform Overview</h1>
        <p className="text-slate-400 text-sm mt-1">Monitor global platform health and usage metrics.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, i) => (
          <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">
                <stat.icon className="w-5 h-5 text-slate-300" />
              </div>
              <div className={`flex items-center text-xs font-medium ${stat.positive ? 'text-cyber-green' : 'text-warning-red'}`}>
                {stat.positive ? <ArrowUpRight className="w-3 h-3 mr-1" /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
                {stat.change}
              </div>
            </div>
            <div className="text-3xl font-bold text-white mb-1">{stat.value}</div>
            <div className="text-sm text-slate-400">{stat.title}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white/5 border border-white/10 rounded-xl p-6 backdrop-blur-sm">
          <h3 className="text-sm font-medium text-slate-400 mb-6">Global Request Volume</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mockChartData}>
                <defs>
                  <linearGradient id="colorReq" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis dataKey="name" stroke="#ffffff50" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#ffffff50" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value / 1000}k`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#ffffff10', borderRadius: '8px' }}
                  itemStyle={{ color: '#e2e8f0' }}
                />
                <Area type="monotone" dataKey="requests" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorReq)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-xl p-6 backdrop-blur-sm">
          <h3 className="text-sm font-medium text-slate-400 mb-6">Threat Detection Rate</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mockChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis dataKey="name" stroke="#ffffff50" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#ffffff50" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#ffffff10', borderRadius: '8px' }}
                  cursor={{ fill: '#ffffff05' }}
                />
                <Bar dataKey="threats" fill="#FF4D4D" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
