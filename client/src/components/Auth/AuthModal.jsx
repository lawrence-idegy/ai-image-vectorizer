import { useState } from 'react';
import { Icon } from '@iconify/react';
import { useAuth } from '../../hooks/useAuth.jsx';

function AuthModal({ isOpen, onClose, embedded = false }) {
  const [mode, setMode] = useState('login'); // 'login' or 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { login, register } = useAuth();

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let result;
      if (mode === 'login') {
        result = await login(email, password);
      } else {
        result = await register(email, password, name);
      }

      if (result.success) {
        if (!embedded) onClose();
        // If embedded, the parent component will re-render when auth state changes
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    setError('');
    // Clear fields when switching modes
    setEmail('');
    setPassword('');
  };

  // Form content (shared between modal and embedded)
  const formContent = (
    <>
      {!embedded && (
        <div className="text-center mb-6">
          <Icon icon="mdi:vector-square" className="w-12 h-12 mx-auto mb-3 text-idegy-blue" />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {mode === 'login' ? 'Welcome Back' : 'Create Account'}
          </h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
            {mode === 'login'
              ? 'Sign in to access your account'
              : 'Join idegy to save your work'}
          </p>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === 'register' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-idegy-blue focus:border-transparent transition-all"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-idegy-blue focus:border-transparent transition-all"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'}
            required
            minLength={mode === 'register' ? 8 : undefined}
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-idegy-blue focus:border-transparent transition-all"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-idegy-navy dark:bg-white text-white dark:text-idegy-navy font-semibold rounded-xl hover:bg-idegy-navy-light dark:hover:bg-gray-100 hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {loading ? (
            <Icon icon="mdi:loading" className="w-5 h-5 animate-spin mx-auto" />
          ) : mode === 'login' ? (
            'Sign In'
          ) : (
            'Create Account'
          )}
        </button>
      </form>


    </>
  );

  // Embedded mode - render form directly without modal wrapper
  if (embedded) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl dark:shadow-black/30 w-full p-6 sm:p-8">
        {formContent}
      </div>
    );
  }

  // Modal mode - render with overlay
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl dark:shadow-black/30 w-full max-w-md p-6 sm:p-8 relative animate-fade-in max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-500 dark:text-gray-400"
        >
          <Icon icon="mdi:close" className="w-5 h-5" />
        </button>
        {formContent}
      </div>
    </div>
  );
}

export default AuthModal;
