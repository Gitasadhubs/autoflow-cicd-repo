import React from 'react';

export interface Joke {
  setup: string;
  punchline: string;
}

interface JokeCardProps {
  joke: Joke | null;
  isLoading: boolean;
}

const LoadingSkeleton: React.FC = () => (
  <div className="space-y-4">
    <div className="h-6 bg-gray-300 dark:bg-gray-600 rounded w-3/4 animate-pulse"></div>
    <div className="h-8 bg-gray-300 dark:bg-gray-700 rounded w-1/2 animate-pulse [animation-delay:0.2s]"></div>
  </div>
);

const JokeCard: React.FC<JokeCardProps> = ({ joke, isLoading }) => {
  return (
    <div className="bg-white dark:bg-gray-800/50 p-6 rounded-xl shadow-lg min-h-[150px] flex flex-col justify-center animate-fade-in border border-gray-200 dark:border-gray-700">
      {isLoading ? (
        <LoadingSkeleton />
      ) : joke ? (
        <div className="space-y-4 text-left">
          <p className="text-lg text-gray-700 dark:text-gray-300">
            {joke.setup}
          </p>
          <p className="text-xl font-bold text-gray-900 dark:text-white">
            {joke.punchline}
          </p>
        </div>
      ) : (
        <p className="text-gray-500">No joke loaded. Try fetching one!</p>
      )}
    </div>
  );
};

export default JokeCard;
