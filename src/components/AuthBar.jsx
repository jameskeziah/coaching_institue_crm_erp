import React, { useEffect, useState } from 'react';
import { changePassword, fetchConfig, login, register, setToken } from '../api';
import { useAuth } from '../AuthContext';

export default function AuthBar() {
  const { user, setUser, logout } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [allowRegistration, setAllowRegistration] = useState(false);

  useEffect(() => {
    fetchConfig()
      .then((config) => setAllowRegistration(Boolean(config.allowRegistration)))
      .catch(() => setAllowRegistration(false));
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');
    try {
      const res = await login(formData.username, formData.password);
      setToken(res.token);
      setUser(res.user);
      setFormData({ username: '', password: '' });
    } catch (err) {
      setError(err.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');
    try {
      await register(formData.username, formData.password);
      setMessage('Registration successful. Please sign in.');
      setFormData({ username: '', password: '' });
      setShowRegister(false);
    } catch (err) {
      setError(err.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');
    try {
      await changePassword(passwordForm.currentPassword, passwordForm.newPassword);
      setPasswordForm({ currentPassword: '', newPassword: '' });
      setShowPasswordForm(false);
      setMessage('Password changed.');
    } catch (err) {
      setError(err.error || 'Password change failed');
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    logout();
    setFormData({ username: '', password: '' });
    setPasswordForm({ currentPassword: '', newPassword: '' });
    setMessage('');
    setError('');
  }

  return (
    <div className="flex max-w-sm flex-col items-end gap-3">
      {message ? <div className="rounded-md bg-emerald-50 px-3 py-2 text-right text-xs text-emerald-800">{message}</div> : null}
      {error ? <div className="rounded-md bg-rose-50 px-3 py-2 text-right text-xs text-rose-800">{error}</div> : null}

      {user ? (
        <>
          <div className="text-right text-sm">
            Signed in: <strong>{user.username}</strong>
            {user.role ? <span className="ml-2 text-slate-500">({user.role})</span> : null}
          </div>
          {showPasswordForm ? (
            <form onSubmit={handleChangePassword} className="flex flex-col gap-2">
              <input
                type="password"
                placeholder="Current password"
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                className="rounded-md border px-3 py-2 text-sm"
              />
              <input
                type="password"
                placeholder="New password"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                className="rounded-md border px-3 py-2 text-sm"
              />
              <div className="flex justify-end gap-2">
                <button type="submit" disabled={loading} className="rounded-md bg-emerald-600 px-3 py-1 text-sm text-white">
                  {loading ? 'Saving...' : 'Save'}
                </button>
                <button type="button" onClick={() => setShowPasswordForm(false)} className="rounded-md border px-3 py-1 text-sm">
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => setShowPasswordForm(true)} className="rounded-md border px-3 py-1 text-sm">
                Change password
              </button>
              <button onClick={handleLogout} className="rounded-md bg-rose-500 px-3 py-1 text-sm text-white">
                Sign out
              </button>
            </div>
          )}
        </>
      ) : showRegister ? (
        <form onSubmit={handleRegister} className="flex flex-col gap-2">
          <input
            type="text"
            placeholder="Username"
            value={formData.username}
            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            className="rounded-md border px-3 py-2 text-sm"
          />
          <input
            type="password"
            placeholder="Password (min 6)"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            className="rounded-md border px-3 py-2 text-sm"
          />
          <div className="flex justify-end gap-2">
            <button type="submit" disabled={loading} className="rounded-md bg-emerald-600 px-3 py-1 text-sm text-white">
              {loading ? 'Creating...' : 'Register'}
            </button>
            <button type="button" onClick={() => setShowRegister(false)} className="rounded-md border px-3 py-1 text-sm">
              Back
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleLogin} className="flex flex-col gap-2">
          <input
            type="text"
            placeholder="Username"
            value={formData.username}
            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            className="rounded-md border px-3 py-2 text-sm"
          />
          <input
            type="password"
            placeholder="Password"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            className="rounded-md border px-3 py-2 text-sm"
          />
          <div className="flex justify-end gap-2">
            <button type="submit" disabled={loading} className="rounded-md bg-emerald-600 px-3 py-1 text-sm text-white">
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
            {allowRegistration ? (
              <button type="button" onClick={() => setShowRegister(true)} className="rounded-md border px-3 py-1 text-sm">
                Register
              </button>
            ) : null}
          </div>
        </form>
      )}
    </div>
  );
}
