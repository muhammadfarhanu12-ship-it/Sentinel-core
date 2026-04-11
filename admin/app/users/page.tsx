import React from 'react';
import { motion } from 'motion/react';
import { useAdminStore } from '../../stores/adminStore';
import { DataTable } from '../../components/tables/DataTable';
import { ColumnDef } from '@tanstack/react-table';
import { AdminUser } from '../../types';
import { MoreHorizontal, Shield, Ban, Eye, CheckCircle, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AdminUsers() {
  const { users, toggleUserStatus, deleteUser } = useAdminStore();

  const columns: ColumnDef<AdminUser>[] = [
    {
      accessorKey: 'id',
      header: 'User ID',
      cell: ({ row }) => <span className="font-mono text-xs text-slate-400">{row.getValue('id')}</span>,
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) => <span className="font-medium text-white">{row.getValue('email')}</span>,
    },
    {
      accessorKey: 'plan',
      header: 'Plan',
      cell: ({ row }) => {
        const plan = row.getValue('plan') as string;
        return (
          <span className={cn(
            "px-2 py-1 rounded text-xs font-bold border",
            plan === 'BUSINESS' ? "bg-amber/10 text-amber border-amber/20" :
            plan === 'PRO' ? "bg-cyber-green/10 text-cyber-green border-cyber-green/20" :
            "bg-white/5 text-slate-300 border-white/10"
          )}>
            {plan}
          </span>
        );
      },
    },
    {
      accessorKey: 'apiUsage',
      header: 'API Usage',
      cell: ({ row }) => <span className="text-slate-300">{(row.getValue('apiUsage') as number).toLocaleString()}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = row.getValue('status') as string;
        return (
          <div className="flex items-center">
            <div className={cn(
              "w-2 h-2 rounded-full mr-2",
              status === 'ACTIVE' ? "bg-cyber-green" : "bg-warning-red"
            )} />
            <span className="text-slate-300 text-sm">{status}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'createdAt',
      header: 'Created Date',
      cell: ({ row }) => <span className="text-slate-400 text-sm">{row.getValue('createdAt')}</span>,
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const user = row.original;
        return (
          <div className="flex items-center space-x-2">
            <button 
              onClick={() => toggleUserStatus(user.id)}
              title={user.status === 'ACTIVE' ? 'Suspend User' : 'Activate User'}
              className={cn(
                "p-1.5 rounded transition-colors",
                user.status === 'ACTIVE' 
                  ? "hover:bg-warning-red/20 text-slate-400 hover:text-warning-red" 
                  : "hover:bg-cyber-green/20 text-slate-400 hover:text-cyber-green"
              )}
            >
              {user.status === 'ACTIVE' ? <Ban className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
            </button>
            <button 
              onClick={() => {
                if (window.confirm(`Are you sure you want to delete user ${user.email}?`)) {
                  deleteUser(user.id);
                }
              }}
              title="Delete User"
              className="p-1.5 hover:bg-warning-red/20 rounded text-slate-400 hover:text-warning-red transition-colors"
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
        <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
        <p className="text-slate-400 text-sm mt-1">Manage platform users, plans, and access.</p>
      </div>

      <DataTable columns={columns} data={users} searchKey="email" />
    </motion.div>
  );
}
