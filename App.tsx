import React, { useState, useCallback, useEffect } from 'react';
import LoginPage from './components/LoginPage';
import Dashboard from './components/Dashboard';
import { User } from './types';
import { getUser } from './services/githubService';

const App: React.FC = () => {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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
          <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
              <p className="text-gray-500 dark:text-gray-400">Loading application...</p>
          </div>
      )
  }

  return (
    <>
      {token && user ? (
        <Dashboard user={user} token={token} onLogout={handleLogout} />
      ) : (
        <LoginPage onLogin={handleLogin} error={error} />
      )}
    </>
  );
};

export default App;
