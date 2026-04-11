import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Mail } from 'lucide-react';

import { useToast } from '../hooks/useToast';

function validateEmail(email: string) {
  return /\S+@\S+\.\S+/.test(email);
}

export default function AdminForgotPassword() {
  const { notify } = useToast();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!validateEmail(email)) {
      setError('Enter a valid email address.');
      return;
    }

    notify({
      title: 'Reset request recorded',
      message: 'Password reset is not yet exposed by the backend. Send this request to the platform administrator for secure handling.',
      tone: 'info',
    });
  }

  return (
    <div className="admin-auth">
      <div className="admin-auth__hero">
        <span className="admin-auth__badge">Password recovery</span>
        <h1>Recover admin access</h1>
        <p>
          Use the admin email address to begin the secure recovery process. Access resets should be handled carefully for privileged operators.
        </p>
      </div>

      <div className="admin-auth__card">
        <div className="admin-auth__card-head">
          <div className="admin-auth__icon">
            <Mail size={18} />
          </div>
          <div>
            <h2>Forgot password</h2>
            <p>Secure reset workflow for privileged accounts.</p>
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
              <input onChange={(event) => setEmail(event.target.value)} placeholder="admin@sentinel.ai" type="email" value={email} />
            </div>
          </label>

          <button className="admin-button admin-button--primary" type="submit">
            Continue
          </button>
        </form>

        <div className="admin-auth__links">
          <Link to="/admin/login">Back to login</Link>
        </div>
      </div>
    </div>
  );
}
