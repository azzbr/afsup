import React, { useState, useEffect } from 'react';
import { User, Mail, Lock } from 'lucide-react'; // Add icons for better UX
import { signInWithCredentials, createUserAccount } from '../auth';

function LoginModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('login'); // 'login' or 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const result = await signInWithCredentials(email, password);
      if (result.success) {
        onClose();
        alert('Login successful!');
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError('Login failed: ' + err.message);
    }
    setLoading(false);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      setLoading(false);
      return;
    }

    // Validate name fields
    if (!firstName.trim() || !lastName.trim()) {
      setError("First and Last Name are required.");
      setLoading(false);
      return;
    }

    try {
      const nameData = { firstName: firstName.trim(), middleName: middleName.trim(), lastName: lastName.trim() };
      // Pass nameData to the updated function
      const result = await createUserAccount(email, password, nameData);

      if (result.success) {
        setError('');
        // Close modal to let App.jsx handle auto-login and verification
        onClose();
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError('Registration failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setFirstName('');
      setMiddleName('');
      setLastName('');
      setError('');
      setActiveTab('login');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-auto p-6">
        <div className="flex border border-slate-200 rounded-lg mb-6 p-1">
          <button
            onClick={() => setActiveTab('login')}
            className={`flex-1 py-2.5 px-3 rounded-md text-sm font-medium transition-all ${
              activeTab === 'login'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            Login
          </button>
          <button
            onClick={() => setActiveTab('register')}
            className={`flex-1 py-2.5 px-3 rounded-md text-sm font-medium transition-all ${
              activeTab === 'register'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            Register
          </button>
        </div>

        <h2 className="text-xl font-semibold text-slate-900 mb-4">
          {activeTab === 'login' ? 'Staff Login' : 'Account Registration'}
        </h2>

        {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm border border-red-200">{error}</div>}

        {activeTab === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <input
                type="password"
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={loading}
                className={`flex-1 py-2.5 px-4 rounded-lg font-medium transition-all ${
                  loading
                    ? 'bg-indigo-400 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                } flex items-center justify-center`}
              >
                {loading ? 'Logging in...' : 'Login'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">

            {/* --- NEW NAME SECTION --- */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">First Name *</label>
                  <input
                    type="text"
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    placeholder="As per Passport"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Last Name *</label>
                  <input
                    type="text"
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    placeholder="Surname/Family"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Middle Name (Optional)</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  placeholder="Father's name etc."
                  value={middleName}
                  onChange={(e) => setMiddleName(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your work email"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <input
                type="password"
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create password (min 6 chars)"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Confirm Password</label>
              <input
                type="password"
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={loading}
                className={`flex-1 py-2.5 px-4 rounded-lg font-medium transition-all ${
                  loading
                    ? 'bg-indigo-400 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                } flex items-center justify-center`}
              >
                {loading ? 'Creating...' : 'Register'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default LoginModal;
