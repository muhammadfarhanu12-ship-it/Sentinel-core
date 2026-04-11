import { useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, LockKeyhole, Mail } from 'lucide-react';

import { useToast } from '../hooks/useToast';
import { isAdminAuthenticated, setAdminToken } from '../lib/auth';
import { loginAdmin } from '../lib/adminService';
import { getErrorMessage } from '../lib/errors';

function validateEmail(email: string) {
  return /\S+@\S+\.\S+/.test(email);
}

export default function AdminLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { notify } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const redirectTarget = useMemo(() => {
    const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
    return from || '/admin/dashboard';
  }, [location.state]);

  if (isAdminAuthenticated()) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!validateEmail(email)) {
      setError('Enter a valid admin email address.');
      return;
    }

    if (password.length < 12) {
      setError('Admin passwords must be at least 12 characters.');
      return;
    }

    setLoading(true);
    try {
      const payload = await loginAdmin({ email, password });
      setAdminToken(payload.access_token);
      notify({ title: 'Login successful', message: 'Admin session established.', tone: 'success' });
      navigate(redirectTarget, { replace: true });
    } catch (error: unknown) {
      setError(getErrorMessage(error, 'Unable to authenticate with the admin backend.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-auth">
      <div className="admin-auth__hero">
        <span className="admin-auth__badge">Sentinel Admin</span>
        <h1>Secure access to the isolated control plane</h1>
        <p>
          Sign in with a dedicated admin account. This application is completely separate from the user-facing Sentinel UI.
        </p>
      </div>

      <div className="admin-auth__card">
        <div className="admin-auth__card-head">
          <div className="admin-auth__icon">
            <LockKeyhole size={18} />
          </div>
          <div>
            <h2>Admin login</h2>
            <p>Authenticate against the FastAPI admin backend.</p>
          </div>
        </div>

        <form className="admin-form" onSubmit={handleSubmit}>
          {error ? (
            <div className="admin-alert admin-alert--error">
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          ) : null}

          <label className="admin-field">
            <span>Email</span>
            <div className="admin-input-wrap">
              <Mail size={16} />
              <input
                autoComplete="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@sentinel.ai"
                type="email"
                value={email}
              />
            </div>
          </label>

          <label className="admin-field">
            <span>Password</span>
            <div className="admin-input-wrap">
              <LockKeyhole size={16} />
              <input
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter secure admin password"
                type="password"
                value={password}
              />
            </div>
          </label>

          <button className="admin-button admin-button--primary" disabled={loading} type="submit">
            {loading ? 'Signing in...' : 'Login'}
          </button>
        </form>

        <div className="admin-auth__links">
          <Link to="/admin/forgot-password">Forgot password?</Link>
          <Link to="/admin/signup">Request admin access</Link>
        </div>
      </div>
    </div>
  );
}
