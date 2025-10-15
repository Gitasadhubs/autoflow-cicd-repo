import React, { useState, useCallback, useEffect } from 'react';
import LoginPage from './components/LoginPage';
import Dashboard from './components/Dashboard';
import { User } from './types';
import { getUser } from './services/githubService';
import { LogoIcon } from './components/icons';

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
          <div className="min-h-screen bg-brand-bg flex flex-col items-center justify-center">
              <LogoIcon className="w-20 h-20 animate-rocket-float" />
              <p className="text-gray-400 mt-4 text-lg font-semibold">Launching AutoFlow...</p>
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