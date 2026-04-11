import { useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, Save } from 'lucide-react';

import Loader from '../components/ui/Loader';
import { useToast } from '../hooks/useToast';
import { fetchAdminSettings, updateAdminSettings } from '../lib/adminService';
import { getErrorMessage } from '../lib/errors';
import type { AdminSettings } from '../types';

function ToggleRow({
  checked,
  description,
  label,
  onChange,
}: {
  checked: boolean;
  description: string;
  label: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="admin-toggle-row">
      <div>
        <strong>{label}</strong>
        <p>{description}</p>
      </div>
      <button
        aria-pressed={checked}
        className={`admin-toggle${checked ? ' is-active' : ''}`}
        onClick={() => onChange(!checked)}
        type="button"
      >
        <span />
      </button>
    </label>
  );
}

export default function AdminSettingsPage() {
  const { notify } = useToast();
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadSettings() {
      setLoading(true);
      setError('');
      try {
        const data = await fetchAdminSettings();
        setSettings(data);
      } catch (error: unknown) {
        setError(getErrorMessage(error, 'Unable to load admin settings.'));
      } finally {
        setLoading(false);
      }
    }

    void loadSettings();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings) return;

    setSaving(true);
    try {
      const updated = await updateAdminSettings(settings);
      setSettings(updated);
      notify({ title: 'Settings saved', message: 'Platform controls updated successfully.', tone: 'success' });
    } catch (error: unknown) {
      notify({
        title: 'Settings update failed',
        message: getErrorMessage(error, 'Unknown error'),
        tone: 'error',
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading || !settings) {
    return <Loader label="Loading settings..." />;
  }

  return (
    <div className="admin-page">
      <section className="admin-page__header">
        <div>
          <p className="admin-page__eyebrow">Settings</p>
          <h2>Control plane configuration</h2>
          <p>Manage provider toggles, emergency controls, and rate limiting for the admin boundary.</p>
        </div>
      </section>

      {error ? (
        <div className="admin-alert admin-alert--error">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      <form className="admin-grid admin-grid--two" onSubmit={handleSubmit}>
        <section className="admin-panel">
          <div className="admin-panel__header">
            <div>
              <h3>Feature toggles</h3>
              <p>Enable or disable provider pathways from the admin application.</p>
            </div>
          </div>

          <div className="admin-form">
            <ToggleRow
              checked={settings.enable_openai_module}
              description="Controls OpenAI-backed request handling."
              label="OpenAI module"
              onChange={(value) => setSettings((current) => current ? { ...current, enable_openai_module: value } : current)}
            />
            <ToggleRow
              checked={settings.enable_gemini_module}
              description="Controls Gemini-backed request handling."
              label="Gemini module"
              onChange={(value) => setSettings((current) => current ? { ...current, enable_gemini_module: value } : current)}
            />
            <ToggleRow
              checked={settings.enable_anthropic_module}
              description="Controls Anthropic-backed request handling."
              label="Anthropic module"
              onChange={(value) => setSettings((current) => current ? { ...current, enable_anthropic_module: value } : current)}
            />
            <ToggleRow
              checked={settings.ai_kill_switch_enabled}
              description="Emergency stop for AI processing across the platform."
              label="AI kill switch"
              onChange={(value) => setSettings((current) => current ? { ...current, ai_kill_switch_enabled: value } : current)}
            />
            <ToggleRow
              checked={settings.require_mfa_for_admin}
              description="Prepare the admin plane for stronger authentication policy."
              label="Require MFA for admins"
              onChange={(value) => setSettings((current) => current ? { ...current, require_mfa_for_admin: value } : current)}
            />
          </div>
        </section>

        <section className="admin-panel">
          <div className="admin-panel__header">
            <div>
              <h3>Rate limits</h3>
              <p>Bound traffic to sensitive admin and API surfaces.</p>
            </div>
          </div>

          <div className="admin-form">
            <label className="admin-field">
              <span>Admin requests per minute</span>
              <div className="admin-input-wrap">
                <input
                  min={10}
                  onChange={(event) =>
                    setSettings((current) =>
                      current ? { ...current, admin_rate_limit_per_minute: Number(event.target.value) || 10 } : current,
                    )
                  }
                  type="number"
                  value={settings.admin_rate_limit_per_minute}
                />
              </div>
            </label>

            <label className="admin-field">
              <span>Admin rate window (seconds)</span>
              <div className="admin-input-wrap">
                <input
                  min={10}
                  onChange={(event) =>
                    setSettings((current) =>
                      current ? { ...current, admin_rate_limit_window_seconds: Number(event.target.value) || 10 } : current,
                    )
                  }
                  type="number"
                  value={settings.admin_rate_limit_window_seconds}
                />
              </div>
            </label>

            <label className="admin-field">
              <span>API key requests per minute</span>
              <div className="admin-input-wrap">
                <input
                  min={10}
                  onChange={(event) =>
                    setSettings((current) =>
                      current ? { ...current, api_key_rate_limit_per_minute: Number(event.target.value) || 10 } : current,
                    )
                  }
                  type="number"
                  value={settings.api_key_rate_limit_per_minute}
                />
              </div>
            </label>

            <button className="admin-button admin-button--primary" disabled={saving} type="submit">
              <Save size={16} />
              {saving ? 'Saving...' : 'Save settings'}
            </button>
          </div>
        </section>
      </form>
    </div>
  );
}
