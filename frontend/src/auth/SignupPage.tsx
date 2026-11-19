/**
 * File: src/auth/SignupPage.tsx
 *
 * Create an account: choose member or professional, and a timezone (defaults to this device's).
 */
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api, errorMessage } from '../api/client';
import type { Role } from '../api/types';
import { browserTimezone } from '../lib/time';
import { useAuth } from './AuthContext';
import { TimezoneSelect } from './TimezoneSelect';
import { usePageTitle } from '../lib/usePageTitle';
import { Brand } from '../components/Brand';

const ROLES: { value: Role; title: string; text: string }[] = [
  { value: 'member', title: 'I’m looking for support', text: 'Find a professional and book sessions.' },
  { value: 'professional', title: 'I’m a professional', text: 'Set your working hours and see your schedule.' },
];

export function SignupPage() {
  usePageTitle('Create your account');
  const { signup } = useAuth();
  const [role, setRole] = useState<Role>('member');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [bio, setBio] = useState('');
  const [timezone, setTimezone] = useState(browserTimezone());
  const [timezones, setTimezones] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ timezones: string[] }>('/timezones')
      .then((res) => setTimezones(res.timezones))
      .catch(() => setTimezones([browserTimezone()]));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signup({ name, email, password, role, timezone, bio: role === 'professional' && bio ? bio : undefined });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-card auth-card-wide">
        <div className="auth-brand">
          <Brand />
        </div>
        <h1>Create your account</h1>
        <form onSubmit={submit} className="form">
          <fieldset className="role-picker">
            <legend>How will you use it?</legend>
            {ROLES.map((r) => (
              <label key={r.value} className={role === r.value ? 'role-option selected' : 'role-option'}>
                <input
                  type="radio"
                  name="role"
                  value={r.value}
                  checked={role === r.value}
                  onChange={() => setRole(r.value)}
                />
                <span className="role-title">{r.title}</span>
                <span className="role-text">{r.text}</span>
              </label>
            ))}
          </fieldset>

          <label className="field">
            <span>Name</span>
            <input autoComplete="name" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span>Email</span>
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <small>At least 8 characters.</small>
          </label>
          <TimezoneSelect zones={timezones} value={timezone} onChange={setTimezone} />
          {role === 'professional' && (
            <label className="field">
              <span>About you (optional)</span>
              <textarea
                rows={3}
                maxLength={1000}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="What you help with, and how you work."
              />
            </label>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="button button-primary button-wide" disabled={busy}>
            {busy ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p className="auth-switch">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}
