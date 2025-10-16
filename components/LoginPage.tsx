import React, { useState } from 'react';
import { GitHubIcon, LogoIcon } from './icons';

interface LoginPageProps {
  onLogin: (token: string) => void;
  error: string | null;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin, error }) => {
  const [token, setToken] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (token.trim()) {
      onLogin(token.trim());
    }
  };

  return (
    <div className="min-h-screen login-page-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md mx-auto bg-light-surface dark:bg-brand-surface shadow-2xl rounded-2xl p-8 text-center border border-gray-200 dark:border-gray-700">
        <div className="w-20 h-20 bg-brand-primary/10 text-brand-primary rounded-xl flex items-center justify-center mx-auto ring-1 ring-brand-primary/30">
          <LogoIcon className="w-10 h-10" />
        </div>
        
        <h1 className="text-4xl font-extrabold text-gray-900 dark:text-gray-100 mt-6">AutoFlow</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-2">Simplify Your Deployments. Automate Your Success.</p>

        <form onSubmit={handleSubmit} className="mt-8 text-left">
          <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
            Provide a GitHub Personal Access Token to access your repositories and create workflow files.
          </p>
          <div>
            <label htmlFor="github-token" className="block text-sm font-medium text-gray-800 dark:text-gray-200">
              Personal Access Token
            </label>
            <div className="mt-1">
              <input
                id="github-token"
                name="token"
                type="password"
                autoComplete="off"
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="appearance-none block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-brand-primary focus:border-brand-primary sm:text-sm bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-200"
              />
            </div>
          </div>
          
          {error && <p className="mt-2 text-sm text-red-500 dark:text-red-400">{error}</p>}

          <a href="https://github.com/settings/tokens/new?scopes=repo,read:user&description=AutoFlow" target="_blank" rel="noopener noreferrer" className="mt-2 text-xs text-brand-secondary hover:underline">
            How to generate a token? (Requires 'repo' and 'read:user' scopes)
          </a>

          <button
            type="submit"
            className="mt-6 w-full inline-flex justify-center items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-brand-primary hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-light-surface dark:focus:ring-offset-brand-surface focus:ring-brand-secondary transition-transform transform hover:translate-y-[-2px] disabled:opacity-50"
            disabled={!token.trim()}
          >
            <GitHubIcon className="w-6 h-6 mr-3" />
            Connect with GitHub
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;