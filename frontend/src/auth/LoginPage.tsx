/**
 * File: src/auth/LoginPage.tsx
 *
 * Log in with email and password.
 */
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { errorMessage } from '../api/client';
import { useAuth } from './AuthContext';
import { usePageTitle } from '../lib/usePageTitle';
import { Brand } from '../components/Brand';

export function LoginPage() {
  usePageTitle('Log in');
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="auth-brand">
          <Brand />
        </div>
        <h1>Log in</h1>
        <p className="muted">Book and manage your sessions.</p>
        <form onSubmit={submit} className="form">
          <label className="field">
            <span>Email</span>
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="button button-primary button-wide" disabled={busy}>
            {busy ? 'Logging in…' : 'Log in'}
          </button>
        </form>
        <p className="auth-switch">
          New here? <Link to="/signup">Create an account</Link>
        </p>
      </div>
    </div>
  );
}
