import React from 'react';
import { motion } from 'motion/react';
import { useAdminStore } from '../../stores/adminStore';
import { DataTable } from '../../components/tables/DataTable';
import { ColumnDef } from '@tanstack/react-table';
import { GlobalApiKey } from '../../types';
import { Key, Trash2, ShieldOff } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AdminApiKeys() {
  const { apiKeys, revokeApiKey } = useAdminStore();

  const columns: ColumnDef<GlobalApiKey>[] = [
    {
      accessorKey: 'id',
      header: 'Key ID',
      cell: ({ row }) => <span className="font-mono text-xs text-slate-400">{row.getValue('id')}</span>,
    },
    {
      accessorKey: 'userEmail',
      header: 'User',
      cell: ({ row }) => <span className="font-medium text-white">{row.getValue('userEmail')}</span>,
    },
    {
      accessorKey: 'prefix',
      header: 'Key Prefix',
      cell: ({ row }) => <span className="font-mono text-xs text-slate-300 bg-white/5 px-2 py-1 rounded border border-white/10">{row.getValue('prefix')}••••••</span>,
    },
    {
      accessorKey: 'usage',
      header: 'Usage',
      cell: ({ row }) => <span className="text-slate-300">{(row.getValue('usage') as number).toLocaleString()}</span>,
    },
    {
      accessorKey: 'lastUsed',
      header: 'Last Used',
      cell: ({ row }) => <span className="text-slate-400 text-sm">{row.getValue('lastUsed')}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = row.getValue('status') as string;
        return (
          <span className={cn(
            "px-2 py-1 rounded text-xs font-bold border",
            status === 'ACTIVE' ? "bg-cyber-green/10 text-cyber-green border-cyber-green/20" :
            status === 'REVOKED' ? "bg-warning-red/10 text-warning-red border-warning-red/20" :
            "bg-amber/10 text-amber border-amber/20"
          )}>
            {status}
          </span>
        );
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const key = row.original;
        return (
          <div className="flex items-center space-x-2">
            <button 
              onClick={() => revokeApiKey(key.id)}
              disabled={key.status === 'REVOKED'}
              className={cn(
                "p-1.5 rounded transition-colors",
                key.status === 'REVOKED' 
                  ? "text-slate-600 cursor-not-allowed" 
                  : "hover:bg-warning-red/20 text-slate-400 hover:text-warning-red"
              )} 
              title="Revoke Key"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">API Key Management</h1>
        <p className="text-slate-400 text-sm mt-1">Monitor and manage all API keys across the platform.</p>
      </div>

      <DataTable columns={columns} data={apiKeys} searchKey="userEmail" />
    </motion.div>
  );
}
