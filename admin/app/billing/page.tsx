import React from 'react';
import { motion } from 'motion/react';
import { useAdminStore } from '../../stores/adminStore';
import { CreditCard, ArrowUpRight, Users, CheckCircle2 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

export default function AdminBilling() {
  const { metrics, users } = useAdminStore();

  const planDistribution = [
    { name: 'Free', value: users.filter(u => u.plan === 'FREE').length, color: '#94a3b8' },
    { name: 'Pro', value: users.filter(u => u.plan === 'PRO').length, color: '#32FF7E' },
    { name: 'Business', value: users.filter(u => u.plan === 'BUSINESS').length, color: '#3b82f6' },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Billing Management</h1>
        <p className="text-slate-400 text-sm mt-1">View revenue, active subscriptions, and plan distribution.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white/5 border border-white/10 rounded-xl p-6 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-lg bg-cyber-green/10 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-cyber-green" />
            </div>
            <div className="flex items-center text-xs font-medium text-cyber-green">
              <ArrowUpRight className="w-3 h-3 mr-1" />
              +18.2%
            </div>
          </div>
          <div className="text-3xl font-bold text-white mb-1">${(metrics.mrr / 1000).toFixed(1)}k</div>
          <div className="text-sm text-slate-400">Total MRR</div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-xl p-6 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-400" />
            </div>
            <div className="flex items-center text-xs font-medium text-cyber-green">
              <ArrowUpRight className="w-3 h-3 mr-1" />
              +5.4%
            </div>
          </div>
          <div className="text-3xl font-bold text-white mb-1">{planDistribution[1].value + planDistribution[2].value}</div>
          <div className="text-sm text-slate-400">Active Subscriptions</div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-xl p-6 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-lg bg-amber/10 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-amber" />
            </div>
            <div className="flex items-center text-xs font-medium text-slate-400">
              Stable
            </div>
          </div>
          <div className="text-3xl font-bold text-white mb-1">
            {((planDistribution[1].value + planDistribution[2].value) / users.length * 100).toFixed(1)}%
          </div>
          <div className="text-sm text-slate-400">Conversion Rate</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white/5 border border-white/10 rounded-xl p-6 backdrop-blur-sm">
          <h3 className="text-sm font-medium text-slate-400 mb-6">Plan Distribution</h3>
          <div className="h-64 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={planDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {planDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#ffffff10', borderRadius: '8px' }}
                  itemStyle={{ color: '#e2e8f0' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col space-y-2 ml-4">
              {planDistribution.map((plan, i) => (
                <div key={i} className="flex items-center text-sm">
                  <div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: plan.color }}></div>
                  <span className="text-slate-300 w-20">{plan.name}</span>
                  <span className="font-bold text-white">{plan.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-xl p-6 backdrop-blur-sm">
          <h3 className="text-sm font-medium text-slate-400 mb-6">Recent Transactions</h3>
          <div className="space-y-4">
            {[
              { email: 'admin@acme.com', plan: 'Business', amount: '$49.00', status: 'Paid', date: 'Today' },
              { email: 'dev@startup.io', plan: 'Pro', amount: '$19.00', status: 'Paid', date: 'Yesterday' },
              { email: 'cto@globaltech.com', plan: 'Business', amount: '$49.00', status: 'Paid', date: '2 days ago' },
            ].map((tx, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5">
                <div>
                  <div className="font-medium text-sm text-white">{tx.email}</div>
                  <div className="text-xs text-slate-400">{tx.plan} Plan • {tx.date}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-sm text-white">{tx.amount}</div>
                  <div className="text-xs text-cyber-green">{tx.status}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
