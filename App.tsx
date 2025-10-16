import React, { useState, useCallback, useEffect } from 'react';
import LoginPage from './components/LoginPage';
import Dashboard from './components/Dashboard';
import { User } from './types';
import { getUser } from './services/githubService';
import { LogoIcon } from './components/icons';

type Theme = 'light' | 'dark';

const App: React.FC = () => {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>('dark'); // Default to dark

  // Effect to set the theme on initial load
  useEffect(() => {
    const storedTheme = localStorage.getItem('theme') as Theme | null;
    const initialTheme = storedTheme || 'dark'; // Keep dark as default
    setTheme(initialTheme);
  }, []);
  
  // Effect to apply theme class and save to localStorage
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light');
  };

  const verifyToken = useCallback(async (tokenToCheck: string) => {
    try {
      setError(null);
      const userData = await getUser(tokenToCheck);
      setUser(userData);
      setToken(tokenToCheck);
      sessionStorage.setItem('github_token', tokenToCheck);
    } catch (err) {
      setError('Invalid token or network error. Please try again.');
      sessionStorage.removeItem('github_token');
    }
  }, []);

  useEffect(() => {
    const storedToken = sessionStorage.getItem('github_token');
    if (storedToken) {
      verifyToken(storedToken).finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [verifyToken]);


  const handleLogin = async (newToken: string) => {
    setIsLoading(true);
    await verifyToken(newToken);
    setIsLoading(false);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('github_token');
    setToken(null);
    setUser(null);
  };
  
  if (isLoading) {
      return (
          <div className="min-h-screen flex flex-col items-center justify-center">
              <LogoIcon className="w-20 h-20 text-gray-800 dark:text-gray-200" />
              <p className="text-gray-600 dark:text-gray-400 mt-4 text-lg font-semibold">Launching AutoFlow...</p>
          </div>
      )
  }

  return (
    <>
      {token && user ? (
        <Dashboard 
          user={user} 
          token={token} 
          onLogout={handleLogout} 
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      ) : (
        <LoginPage onLogin={handleLogin} error={error} />
      )}
    </>
  );
};

export default App;