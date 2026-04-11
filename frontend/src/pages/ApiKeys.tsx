import { useEffect, useState } from 'react';
import { useStore } from '../stores/useStore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Key, Plus, Copy, Check, Trash2, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';

const MASKED_API_KEY = `sentinel_sk_${'*'.repeat(24)}`;

export default function ApiKeys() {
  const { apiKeys, fetchApiKeys, generateApiKey, revokeApiKey, isLoading } = useStore();
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [keyToRevoke, setKeyToRevoke] = useState<string | null>(null);

  useEffect(() => {
    fetchApiKeys();
  }, [fetchApiKeys]);

  const handleCopy = (key: string, id: string) => {
    if (!key) return;
    navigator.clipboard.writeText(key);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleShowKey = (id: string) => {
    setShowKey(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    await generateApiKey(`New Key ${apiKeys.length + 1}`);
    setIsGenerating(false);
  };

  const confirmRevoke = async () => {
    if (keyToRevoke) {
      await revokeApiKey(keyToRevoke);
      setKeyToRevoke(null);
    }
  };

  if (isLoading && apiKeys.length === 0) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-slate-800 rounded"></div>
        <div className="h-64 bg-slate-800 rounded-xl"></div>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">API Keys</h1>
          <p className="text-slate-400 mt-1">Manage your gateway access keys and monitor usage.</p>
        </div>
        <Button onClick={handleGenerate} disabled={isGenerating}>
          <Plus className="w-4 h-4 mr-2" />
          {isGenerating ? 'Generating...' : 'Generate New Key'}
        </Button>
      </div>

      <Card className="bg-slate-900/40 border-white/5">
        <CardHeader>
          <CardTitle>Active Keys</CardTitle>
          <CardDescription>Use these keys to authenticate your requests to the Sentinel Gateway.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {apiKeys.map((apiKey) => (
              <div key={apiKey.id} className={`p-4 rounded-lg border ${apiKey.status === 'revoked' ? 'border-red-900/30 bg-red-900/10 opacity-60' : 'border-white/10 bg-slate-950/50'} flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all`}>
                <div className="space-y-1 flex-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-slate-200">{apiKey.name}</span>
                    {apiKey.status === 'revoked' ? (
                      <Badge variant="destructive" className="bg-red-900/50 text-red-400 border-red-800/50">Revoked</Badge>
                    ) : (
                      <Badge variant="clean">Active</Badge>
                    )}
                  </div>
                  <div className="flex items-center space-x-2 text-sm text-slate-400">
                    <span>Created {format(new Date(apiKey.created_at), 'MMM d, yyyy')}</span>
                    <span>•</span>
                    <span>Last used {apiKey.last_used ? format(new Date(apiKey.last_used), 'MMM d, yyyy') : 'Never'}</span>
                  </div>
                </div>

                <div className="flex-1 flex items-center space-x-2">
                  <div className="relative flex-1">
                    <div className="bg-[#0d1117] border border-white/10 rounded-md px-3 py-2 font-mono text-sm text-slate-300 flex items-center justify-between">
                      <span className="truncate mr-2">
                        {apiKey.key
                          ? (showKey[apiKey.id] || apiKey.status === 'revoked' ? apiKey.key : MASKED_API_KEY)
                          : MASKED_API_KEY}
                      </span>
                      <div className="flex items-center space-x-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-slate-400 hover:text-slate-200"
                          onClick={() => toggleShowKey(apiKey.id)}
                          disabled={apiKey.status === 'revoked' || !apiKey.key}
                        >
                          {showKey[apiKey.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-slate-400 hover:text-slate-200"
                          onClick={() => handleCopy(String(apiKey.key || ''), apiKey.id)}
                          disabled={apiKey.status === 'revoked' || !apiKey.key}
                        >
                          {copiedId === apiKey.id ? <Check className="h-3.5 w-3.5 text-clean" /> : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    </div>
                    {!apiKey.key && (
                      <div className="text-[11px] text-slate-500 mt-1">
                        Key value is only shown once when created.
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between md:justify-end space-x-6 w-full md:w-auto">
                  <div className="text-sm">
                    <p className="text-slate-400">Requests</p>
                    <p className="font-medium text-slate-200">{apiKey.usage_count.toLocaleString()}</p>
                  </div>
                  {apiKey.status !== 'revoked' && (
                    <Button variant="destructive" size="sm" onClick={() => setKeyToRevoke(apiKey.id)}>
                      <Trash2 className="w-4 h-4 mr-2" />
                      Revoke
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      
      <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-4 flex items-start space-x-3">
        <AlertTriangle className="w-5 h-5 text-indigo-400 mt-0.5 shrink-0" />
        <div className="text-sm text-indigo-200/80">
          <p className="font-medium text-indigo-300 mb-1">Security Best Practices</p>
          <p>Rotate your API keys every 90 days. Never commit keys to version control. Use environment variables to store them securely in your application.</p>
        </div>
      </div>

      <Modal
        isOpen={!!keyToRevoke}
        onClose={() => setKeyToRevoke(null)}
        title="Revoke API Key"
        description="Are you sure you want to revoke this API key? Any applications using this key will immediately lose access to the Sentinel Gateway."
      >
        <div className="flex justify-end space-x-3 mt-6">
          <Button variant="outline" onClick={() => setKeyToRevoke(null)}>Cancel</Button>
          <Button variant="destructive" onClick={confirmRevoke}>Yes, Revoke Key</Button>
        </div>
      </Modal>
    </motion.div>
  );
}
