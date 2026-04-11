import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, LockKeyhole, Mail, ShieldPlus } from 'lucide-react';

import { useToast } from '../hooks/useToast';

function validateEmail(email: string) {
  return /\S+@\S+\.\S+/.test(email);
}

export default function AdminSignup() {
  const { notify } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!validateEmail(email)) {
      setError('Enter a valid email address.');
      return;
    }

    if (password.length < 12) {
      setError('Use at least 12 characters for the admin password.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    notify({
      title: 'Signup request captured',
      message: 'Admin signup is invite-only. Share this request with the platform owner to provision the account securely.',
      tone: 'info',
    });
  }

  return (
    <div className="admin-auth">
      <div className="admin-auth__hero">
        <span className="admin-auth__badge">Invite-only access</span>
        <h1>Request admin access</h1>
        <p>
          Admin accounts should be provisioned intentionally. This page collects the request details and guides the operator to the secure process.
        </p>
      </div>

      <div className="admin-auth__card">
        <div className="admin-auth__card-head">
          <div className="admin-auth__icon">
            <ShieldPlus size={18} />
          </div>
          <div>
            <h2>Admin signup</h2>
            <p>Invite-only workflow for cybersecurity operations staff.</p>
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
              <input onChange={(event) => setEmail(event.target.value)} placeholder="security-lead@company.com" type="email" value={email} />
            </div>
          </label>

          <label className="admin-field">
            <span>Password</span>
            <div className="admin-input-wrap">
              <LockKeyhole size={16} />
              <input onChange={(event) => setPassword(event.target.value)} placeholder="Create a long passphrase" type="password" value={password} />
            </div>
          </label>

          <label className="admin-field">
            <span>Confirm password</span>
            <div className="admin-input-wrap">
              <LockKeyhole size={16} />
              <input onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Re-enter the password" type="password" value={confirmPassword} />
            </div>
          </label>

          <button className="admin-button admin-button--primary" type="submit">
            Submit request
          </button>
        </form>

        <div className="admin-auth__links">
          <Link to="/admin/login">Back to login</Link>
        </div>
      </div>
    </div>
  );
}
