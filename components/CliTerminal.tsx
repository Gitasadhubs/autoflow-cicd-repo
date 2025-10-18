import React, { useState, useRef, useEffect } from 'react';
import { LogoIcon, XCircleIcon } from './icons';

interface CliTerminalProps {
  onClose: () => void;
}

interface HistoryItem {
  command: string;
  output: string;
  isError: boolean;
}

const API_ENDPOINT_RUN_CLI = '/api/run-cli';

const CliTerminal: React.FC<CliTerminalProps> = ({ onClose }) => {
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [command, setCommand] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [vercelToken, setVercelToken] = useState('');
    const [railwayToken, setRailwayToken] = useState('');
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    const inputRef = useRef<HTMLInputElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [history]);

    useEffect(() => {
        inputRef.current?.focus();
    }, [isAuthenticated, isLoading]);

    const executeCommand = async (cmd: string) => {
        setIsLoading(true);
        const newHistory: HistoryItem[] = [...history, { command: cmd, output: '', isError: false }];
        setHistory(newHistory);

        const parts = cmd.trim().split(/\s+/);
        const cli = parts[0];
        let token: string;

        if (cmd.trim() === 'clear') {
            setHistory([]);
            setIsLoading(false);
            return;
        } 
        
        if (cmd.trim() === 'help') {
             setHistory(prev => [...prev, {
                command: cmd,
                output: `Available commands:\n- vercel [projects list, deployments ls, logs <id>, ...]\n- railway [projects, services, logs, ...]\n- clear: Clears the terminal history.\n- help: Shows this help message.`,
                isError: false,
            }]);
            setIsLoading(false);
            return;
        }

        if (cli === 'vercel') {
            token = vercelToken;
        } else if (cli === 'railway') {
            token = railwayToken;
        } else {
             setHistory(prev => [...prev, {
                command: cmd,
                output: `Error: Command must start with 'vercel' or 'railway'.`,
                isError: true,
            }]);
            setIsLoading(false);
            return;
        }
        
        if (!token) {
            setHistory(prev => [...prev, {
                command: cmd,
                output: `Error: No token set for '${cli}'. Please close and re-authenticate.`,
                isError: true,
            }]);
            setIsAuthenticated(false);
            setIsLoading(false);
            return;
        }

        try {
            const response = await fetch(API_ENDPOINT_RUN_CLI, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: cmd, token }),
            });

            const result = await response.json();
            
            if (!response.ok) {
                 setHistory(prev => [...prev, {
                    command: cmd,
                    output: result.error || `HTTP error! status: ${response.status}`,
                    isError: true,
                }]);
            } else {
                 setHistory(prev => [...prev, {
                    command: cmd,
                    output: result.output,
                    isError: result.error,
                }]);
            }

        } catch (error) {
             const message = error instanceof Error ? error.message : "An unknown error occurred";
             setHistory(prev => [...prev, {
                command: cmd,
                output: message,
                isError: true,
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedCommand = command.trim();
        if (!trimmedCommand) return;
        executeCommand(trimmedCommand);
        setCommand('');
    };

    const handleAuthSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!vercelToken && !railwayToken) {
            alert('Please provide at least one token.');
            return;
        }
        setIsAuthenticated(true);
        setHistory([{
            command: '',
            output: 'Tokens saved for this session. You can now run commands. Type `help` for a list of commands.',
            isError: false,
        }]);
    };

    if (!isAuthenticated) {
        return (
             <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center p-4 z-50">
                <div className="bg-[#1a1a1a] rounded-lg shadow-2xl w-full max-w-lg transform transition-all animate-scale-up border border-gray-700 text-gray-200 font-mono">
                     <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                        <h3 className="text-lg font-bold">CLI Authentication</h3>
                        <button onClick={onClose}><XCircleIcon className="w-6 h-6 text-gray-400 hover:text-white" /></button>
                    </div>
                    <form onSubmit={handleAuthSubmit} className="p-6 space-y-4">
                        <p className="text-sm text-gray-400">Provide your provider tokens to use the CLI. These are stored only for this session and are not saved.</p>
                        <div>
                            <label htmlFor="vercel-token" className="block text-xs mb-1 text-gray-400">Vercel Token (optional)</label>
                            <input
                                id="vercel-token"
                                type="password"
                                value={vercelToken}
                                onChange={e => setVercelToken(e.target.value)}
                                className="w-full bg-black border border-gray-600 rounded p-2 focus:ring-brand-primary focus:border-brand-primary"
                                placeholder="Vercel Access Token"
                            />
                        </div>
                         <div>
                            <label htmlFor="railway-token" className="block text-xs mb-1 text-gray-400">Railway Token (optional)</label>
                            <input
                                id="railway-token"
                                type="password"
                                value={railwayToken}
                                onChange={e => setRailwayToken(e.target.value)}
                                className="w-full bg-black border border-gray-600 rounded p-2 focus:ring-brand-primary focus:border-brand-primary"
                                placeholder="Railway Account Token"
                            />
                        </div>
                        <div className="pt-2 flex justify-end">
                            <button type="submit" className="px-4 py-2 bg-brand-primary text-white font-semibold rounded hover:bg-brand-dark transition">Authenticate Session</button>
                        </div>
                    </form>
                </div>
            </div>
        )
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center p-4 z-50">
            <div className="bg-[#1a1a1a] rounded-lg shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col transform transition-all animate-scale-up border border-gray-700 text-gray-200 font-mono">
                <div className="p-2 border-b border-gray-700 flex justify-between items-center flex-shrink-0">
                    <h3 className="text-sm font-bold pl-2">AutoFlow CLI</h3>
                    <button onClick={onClose}><XCircleIcon className="w-6 h-6 text-gray-400 hover:text-white" /></button>
                </div>

                <div ref={scrollRef} className="flex-grow p-4 overflow-y-auto text-sm" onClick={() => inputRef.current?.focus()}>
                    {history.map((item, index) => (
                        <div key={index} className="mb-2">
                           {item.command && (
                             <div className="flex items-center">
                                <span className="text-green-400">$</span>
                                <p className="ml-2">{item.command}</p>
                            </div>
                           )}
                            <pre className={`whitespace-pre-wrap ${item.isError ? 'text-red-400' : 'text-gray-300'}`}>{item.output}</pre>
                        </div>
                    ))}
                     {isLoading && (
                        <div className="flex items-center space-x-2">
                            <LogoIcon className="w-4 h-4 text-brand-secondary animate-pulse" />
                            <span>Executing...</span>
                        </div>
                    )}
                </div>

                <div className="p-2 border-t border-gray-700 flex-shrink-0">
                    <form onSubmit={handleFormSubmit} className="flex items-center">
                        <span className="text-green-400 pl-2">$</span>
                        <input
                            ref={inputRef}
                            type="text"
                            value={command}
                            onChange={(e) => setCommand(e.target.value)}
                            placeholder="Type a command (e.g., 'vercel projects list')"
                            className="w-full bg-transparent border-none text-gray-200 focus:ring-0 ml-2"
                            disabled={isLoading}
                            autoComplete="off"
                        />
                    </form>
                </div>
            </div>
        </div>
    );
};

export default CliTerminal;