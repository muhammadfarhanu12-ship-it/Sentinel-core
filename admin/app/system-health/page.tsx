import React from 'react';
import { motion } from 'motion/react';
import { Activity, Server, Zap, AlertTriangle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const mockLatencyData = [
  { time: '10:00', latency: 12 },
  { time: '10:05', latency: 15 },
  { time: '10:10', latency: 11 },
  { time: '10:15', latency: 14 },
  { time: '10:20', latency: 18 },
  { time: '10:25', latency: 13 },
  { time: '10:30', latency: 12 },
];

export default function AdminSystemHealth() {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">System Health</h1>
        <p className="text-slate-400 text-sm mt-1">Monitor real-time infrastructure performance and latency.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white/5 border border-white/10 rounded-xl p-6 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-lg bg-cyber-green/10 flex items-center justify-center">
              <Zap className="w-5 h-5 text-cyber-green" />
            </div>
          </div>
          <div className="text-3xl font-bold text-white mb-1">12ms</div>
          <div className="text-sm text-slate-400">Global Avg Latency</div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-xl p-6 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Server className="w-5 h-5 text-blue-400" />
            </div>
          </div>
          <div className="text-3xl font-bold text-white mb-1">99.99%</div>
          <div className="text-sm text-slate-400">Uptime (30d)</div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-xl p-6 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-lg bg-warning-red/10 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-warning-red" />
            </div>
          </div>
          <div className="text-3xl font-bold text-white mb-1">0.01%</div>
          <div className="text-sm text-slate-400">Error Rate</div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-xl p-6 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-lg bg-amber/10 flex items-center justify-center">
              <Activity className="w-5 h-5 text-amber" />
            </div>
          </div>
          <div className="text-3xl font-bold text-white mb-1">14.2k</div>
          <div className="text-sm text-slate-400">Req/sec (Peak)</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white/5 border border-white/10 rounded-xl p-6 backdrop-blur-sm">
          <h3 className="text-sm font-medium text-slate-400 mb-6">API Latency (ms)</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mockLatencyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis dataKey="time" stroke="#ffffff50" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#ffffff50" fontSize={12} tickLine={false} axisLine={false} domain={[0, 30]} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#ffffff10', borderRadius: '8px' }}
                  itemStyle={{ color: '#e2e8f0' }}
                />
                <Line type="monotone" dataKey="latency" stroke="#32FF7E" strokeWidth={2} dot={{ r: 4, fill: '#32FF7E', strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-xl p-6 backdrop-blur-sm">
          <h3 className="text-sm font-medium text-slate-400 mb-6">Edge Nodes Status</h3>
          <div className="space-y-4">
            {[
              { region: 'us-east-1', status: 'Operational', latency: '11ms', load: '45%' },
              { region: 'eu-central-1', status: 'Operational', latency: '14ms', load: '62%' },
              { region: 'ap-northeast-1', status: 'Operational', latency: '18ms', load: '38%' },
              { region: 'sa-east-1', status: 'Operational', latency: '22ms', load: '21%' },
            ].map((node, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5">
                <div className="flex items-center">
                  <div className="w-2 h-2 rounded-full bg-cyber-green mr-3"></div>
                  <div>
                    <div className="font-mono text-sm text-white">{node.region}</div>
                    <div className="text-xs text-slate-400">{node.status}</div>
                  </div>
                </div>
                <div className="text-right flex space-x-6">
                  <div>
                    <div className="text-xs text-slate-400">Latency</div>
                    <div className="font-mono text-sm text-white">{node.latency}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Load</div>
                    <div className="font-mono text-sm text-white">{node.load}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
