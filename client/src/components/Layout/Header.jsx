import { Icon } from '@iconify/react';
import { useTheme } from '../../contexts/ThemeContext';

function Header({ user, onLogout, onSignIn }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="bg-white dark:bg-idegy-navy shadow-sm z-20 border-b border-gray-200 dark:border-idegy-navy-dark">
      <div className="px-3 sm:px-4 py-3 flex items-center justify-between">
        {/* Logo + Title */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="dark:bg-white dark:rounded dark:px-2 dark:py-1">
            <img
              src="/idegy_logo.png"
              alt="idegy"
              className="h-7 sm:h-8 w-auto"
            />
          </div>
          <span className="hidden xs:inline text-sm font-medium text-gray-500 dark:text-white/80">| Vector Fix</span>
        </div>

        {/* User Actions */}
        <div className="flex items-center gap-2">
          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors theme-toggle"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <Icon
              icon={theme === 'dark' ? 'mdi:weather-sunny' : 'mdi:weather-night'}
              className="w-5 h-5 text-gray-600 dark:text-white/90"
            />
          </button>

          {user ? (
            <div className="flex items-center gap-1 sm:gap-2">
              <span className="hidden sm:inline text-sm text-gray-600 dark:text-white/80 max-w-[150px] truncate">
                {user.name || user.email}
              </span>
              <button
                onClick={onLogout}
                className="p-2 rounded hover:bg-gray-100 dark:hover:bg-white/10 transition-colors text-gray-600 dark:text-white/80 hover:text-gray-900 dark:hover:text-white"
                title="Sign out"
              >
                <Icon icon="mdi:logout" className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <button
              onClick={onSignIn}
              className="px-3 sm:px-4 py-2 text-sm bg-idegy-navy dark:bg-white hover:bg-idegy-navy-light dark:hover:bg-gray-100 text-white dark:text-idegy-navy rounded-lg transition-colors font-medium"
            >
              <span className="hidden sm:inline">Sign In</span>
              <Icon icon="mdi:login" className="w-5 h-5 sm:hidden" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;
