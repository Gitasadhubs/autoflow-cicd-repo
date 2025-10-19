import React, { useState, useEffect, useRef } from 'react';
import { Deployment, Repository, DeploymentStatus } from '../types';
import { getWorkflowRunLogs } from '../services/githubService';
import { LogoIcon, ArrowPathIcon, CodeBracketIcon } from './icons';

interface LogViewerProps {
  deployment: Deployment;
  repo: Repository;
  token: string;
  onClose: () => void;
}

const API_ENDPOINT_DEBUG_FAILURE = '/api/debug-failure';

const MarkdownContent: React.FC<{ content: string }> = ({ content }) => {
    // A simple parser to handle newlines, code blocks, and bold text.
    // A full markdown library would be better for a production app.
    const html = content
        .replace(/```([\s\S]*?)```/g, (_match, code) => `<pre class="bg-gray-200 dark:bg-gray-800 p-2 rounded-md my-2"><code class="text-sm">${code.trim()}</code></pre>`)
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br />');

    return <div className="prose prose-sm dark:prose-invert max-w-none text-gray-800 dark:text-gray-200" dangerouslySetInnerHTML={{ __html: html }} />;
};


const LogViewer: React.FC<LogViewerProps> = ({ deployment, repo, token, onClose }) => {
  const [logs, setLogs] = useState<string>('');
  const [isLoadingLogs, setIsLoadingLogs] = useState(true);
  const [logError, setLogError] = useState<string | null>(null);
  
  const [isDebugging, setIsDebugging] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [debugError, setDebugError] = useState<string | null>(null);

  const logContainerRef = useRef<HTMLDivElement>(null);
  const pollingIntervalRef = useRef<number | null>(null);

  const fetchAndSetLogs = async () => {
    if (!deployment.runId) {
        setLogError("This deployment is not linked to a workflow run, so logs cannot be retrieved.");
        setIsLoadingLogs(false);
        return;
    }
    
    // Don't show loader for polling updates
    if (pollingIntervalRef.current === null) {
      setIsLoadingLogs(true);
    }
    setLogError(null);

    try {
        const logContent = await getWorkflowRunLogs(token, repo.owner.login, repo.name, deployment.runId);
        setLogs(logContent);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        setLogError(errorMessage);
    } finally {
        setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    fetchAndSetLogs();

    const isPolling = deployment.status === DeploymentStatus.InProgress || deployment.status === DeploymentStatus.Queued;
    
    if (isPolling) {
        pollingIntervalRef.current = window.setInterval(fetchAndSetLogs, 10000); // Poll every 10 seconds
    }

    return () => {
        if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
        }
    };
  }, [deployment.id]); // Re-run only when the deployment itself changes

  useEffect(() => {
      // Auto-scroll to bottom
      if (logContainerRef.current) {
          logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
      }
  }, [logs]);

  const handleDebug = async () => {
    setIsDebugging(true);
    setAiAnalysis('');
    setDebugError(null);

    try {
        const response = await fetch(API_ENDPOINT_DEBUG_FAILURE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ logs, repoName: repo.name }),
        });

        if (!response.ok || !response.body) {
            const errorData = await response.json().catch(() => ({ error: 'An unknown error occurred.' }));
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            setAiAnalysis(prev => prev + chunk);
        }
    } catch (err) {
        setDebugError(err instanceof Error ? err.message : "Failed to get AI analysis.");
    } finally {
        setIsDebugging(false);
    }
  };
  
  const isFailed = deployment.status === DeploymentStatus.Failed || deployment.status === DeploymentStatus.Error;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50">
      <div className="bg-light-surface dark:bg-brand-surface rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col transform transition-all animate-scale-up border border-gray-200 dark:border-gray-700">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Deployment Logs</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">{repo.full_name} @ {deployment.sha.substring(0, 7)}</p>
          </div>
          <div className="flex items-center space-x-4">
              {isFailed && (
                <button 
                  onClick={handleDebug} 
                  disabled={isDebugging || !logs}
                  className="flex items-center bg-sky-600 hover:bg-sky-700 text-white font-semibold py-2 px-4 rounded-lg transition duration-300 disabled:bg-sky-800 disabled:cursor-not-allowed"
                >
                  <LogoIcon className={`w-5 h-5 mr-2 ${isDebugging ? 'animate-rocket-float' : ''}`} />
                  {isDebugging ? 'Analyzing...' : 'Debug with AI'}
                </button>
              )}
             <button onClick={onClose} className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white text-3xl leading-none">&times;</button>
          </div>
        </div>

        <div className="flex-grow flex overflow-hidden">
            <div className="flex-1 flex flex-col bg-gray-900 dark:bg-black p-4 overflow-hidden">
                <div ref={logContainerRef} className="flex-grow overflow-y-auto font-mono text-sm text-gray-300 whitespace-pre-wrap">
                    {isLoadingLogs ? (
                        <div className="flex items-center justify-center h-full flex-col">
                            <ArrowPathIcon className="w-8 h-8 text-gray-400 animate-spin" />
                            <p className="mt-3 text-gray-400">Fetching logs...</p>
                        </div>
                    ) : logError ? (
                        <div className="text-red-400">Error fetching logs: {logError}</div>
                    ) : logs ? (
                         <>
                            <div className="p-2 bg-yellow-900/50 text-yellow-300 rounded-md text-xs mb-4">
                                <strong>Note:</strong> Displaying raw log archive content. A production app would use a library (e.g., JSZip) to parse this and show individual step logs.
                            </div>
                            {logs}
                         </>
                    ) : (
                        <div>No log output available for this run.</div>
                    )}
                </div>
            </div>
            {(isDebugging || aiAnalysis || debugError) && (
                <div className="w-1/2 flex-shrink-0 border-l border-gray-200 dark:border-gray-700 flex flex-col">
                    <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center space-x-2">
                         <CodeBracketIcon className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                         <h3 className="font-semibold text-gray-800 dark:text-gray-200">AI Debugger Analysis</h3>
                    </div>
                    <div className="flex-grow p-4 overflow-y-auto">
                        {isDebugging && !aiAnalysis && (
                            <div className="flex items-center justify-center h-full flex-col">
                                <LogoIcon className="w-12 h-12 text-gray-800 dark:text-gray-200 animate-rocket-float" />
                                <p className="mt-3 text-gray-600 dark:text-gray-400">AI is analyzing the logs...</p>
                            </div>
                        )}
                        {debugError && <div className="p-4 bg-red-500/10 text-red-500 dark:text-red-400 rounded-lg">{debugError}</div>}
                        {aiAnalysis && <MarkdownContent content={aiAnalysis} />}
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default LogViewer;