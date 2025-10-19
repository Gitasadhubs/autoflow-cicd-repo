import React, { useState, useEffect, useCallback } from 'react';
import LoginPage from './components/LoginPage';
import Dashboard from './components/Dashboard';
import { getUser } from './services/githubService';
import { User } from './types';

// Custom hook to manage theme persistence in localStorage
const useTheme = (): ['light' | 'dark', () => void] => {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const storedTheme = localStorage.getItem('autoflow-theme');
    if (storedTheme) {
      return storedTheme as 'light' | 'dark';
    }
    // Fallback to user's system preference
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('autoflow-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  return [theme, toggleTheme];
};

const App: React.FC = () => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('github_token'));
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [theme, toggleTheme] = useTheme();

  const verifyToken = useCallback(async (currentToken: string) => {
    try {
      setError(null);
      const userData = await getUser(currentToken);
      setUser(userData);
    } catch (e) {
      console.error("Token verification failed", e);
      setUser(null);
      setToken(null);
      localStorage.removeItem('github_token');
      if (e instanceof Error && e.message.includes('401')) {
        setError("Invalid token. Please log in again.");
      } else {
        setError("Failed to connect to GitHub. Please check your network and try again.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) {
      verifyToken(token);
    } else {
      setLoading(false);
    }
  }, [token, verifyToken]);

  const handleLogin = (newToken: string) => {
    setLoading(true);
    localStorage.setItem('github_token', newToken);
    setToken(newToken);
  };

  const handleLogout = () => {
    localStorage.removeItem('github_token');
    setToken(null);
    setUser(null);
    setError(null);
  };

  if (loading) {
    return (
        <div className="min-h-screen bg-light-bg dark:bg-dark-bg flex items-center justify-center">
            <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
    );
  }

  return (
    <>
      {user && token ? (
        <Dashboard user={user} token={token} onLogout={handleLogout} theme={theme} onToggleTheme={toggleTheme} />
      ) : (
        <LoginPage onLogin={handleLogin} error={error} />
      )}
    </>
  );
};

export default App;
