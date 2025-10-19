import React, { useState, useEffect, useCallback } from 'react';
import JokeCard, { Joke } from './components/JokeCard';

const API_URL = 'https://official-joke-api.appspot.com/random_joke';

const App: React.FC = () => {
  const [joke, setJoke] = useState<Joke | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchJoke = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(API_URL);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setJoke({
        setup: data.setup,
        punchline: data.punchline,
      });
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
      setError(`Failed to fetch joke: ${errorMessage}`);
      setJoke(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJoke();
  }, [fetchJoke]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center font-sans">
      <div className="w-full max-w-lg mx-auto">
        <header className="mb-8">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-800 dark:text-white">
            DevJoke Generator
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Built to demonstrate CI/CD with AutoFlow.
          </p>
        </header>

        <main>
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg mb-4" role="alert">
              <strong className="font-bold">Oops! </strong>
              <span className="block sm:inline">{error}</span>
            </div>
          )}

          <JokeCard joke={joke} isLoading={isLoading} />
          
          <button
            onClick={fetchJoke}
            disabled={isLoading}
            className="mt-8 px-8 py-3 bg-brand-primary text-white font-semibold rounded-lg shadow-md hover:bg-brand-secondary focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-secondary focus:ring-offset-light-bg dark:focus:ring-offset-dark-bg transition-all duration-300 transform hover:-translate-y-1 disabled:bg-gray-400 disabled:cursor-not-allowed disabled:transform-none"
          >
            {isLoading ? 'Loading...' : 'Tell Me Another!'}
          </button>
        </main>
      </div>
    </div>
  );
};

export default App;
