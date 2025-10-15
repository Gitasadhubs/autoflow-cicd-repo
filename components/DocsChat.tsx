import React, { useState, useRef, useEffect } from 'react';
import { LogoIcon } from './icons';
import { API_ENDPOINT_CHAT_WITH_DOCS } from '../constants';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface DocsChatProps {
  onClose: () => void;
}

const Code: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <code className="bg-gray-800 text-brand-secondary font-mono text-sm py-0.5 px-1.5 rounded-md">{children}</code>
);

const MessageContent: React.FC<{ content: string }> = ({ content }) => {
    // A simple parser to convert markdown-style `code` into <code> tags safely.
    const parts = content.split(/(`[^`]+`)/g);
    return (
        <p className="text-sm whitespace-pre-wrap">
            {parts.map((part, i) => {
                if (part.startsWith('`') && part.endsWith('`')) {
                    return <Code key={i}>{part.slice(1, -1)}</Code>;
                }
                return part;
            })}
        </p>
    );
};


const DocsChat: React.FC<DocsChatProps> = ({ onClose }) => {
    const [messages, setMessages] = useState<Message[]>([
        { role: 'assistant', content: "Hi! I'm Flowy, your AI assistant for AutoFlow. How can I help you get started?" }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const chatContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSendMessage = async (e?: React.FormEvent, prompt?: string) => {
        if (e) e.preventDefault();
        const userMessageContent = (prompt || input).trim();
        if (!userMessageContent || isLoading) return;

        const newUserMessage: Message = { role: 'user', content: userMessageContent };
        const newMessages = [...messages, newUserMessage];
        setMessages(newMessages);
        setInput('');
        setIsLoading(true);
        setError(null);

        // Add an empty placeholder for the assistant's streaming response
        setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

        try {
            const response = await fetch(API_ENDPOINT_CHAT_WITH_DOCS, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: newMessages }),
            });

            if (!response.ok || !response.body) {
                const errorData = await response.json().catch(() => ({error: 'An unknown error occurred.'}));
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                setMessages(prev => {
                    const lastMessage = prev[prev.length - 1];
                    const updatedLastMessage = { ...lastMessage, content: lastMessage.content + chunk };
                    return [...prev.slice(0, -1), updatedLastMessage];
                });
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "Failed to get a response.";
            setError(errorMessage);
            // Remove the empty assistant message on error
            setMessages(prev => {
                if (prev[prev.length - 1]?.content === '') {
                    return prev.slice(0, -1);
                }
                return prev;
            });
        } finally {
            setIsLoading(false);
        }
    };
    
    const suggestedPrompts = [
      "How do I generate a token?",
      "Why aren't my repos showing up?",
      "What secrets does Vercel need?",
    ];

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50">
            <div className="bg-brand-surface rounded-xl shadow-2xl w-full max-w-2xl h-[80vh] flex flex-col transform transition-all animate-scale-up border border-gray-700">
                <div className="p-4 border-b border-gray-700 flex justify-between items-center flex-shrink-0">
                    <div className="flex items-center space-x-3">
                         <LogoIcon className="h-7 w-7 text-brand-primary" />
                         <h2 className="text-xl font-bold text-gray-100">Chat with Flowy</h2>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-3xl leading-none">&times;</button>
                </div>
                <div ref={chatContainerRef} className="flex-grow p-6 space-y-6 overflow-y-auto text-gray-300">
                    {messages.map((msg, index) => (
                        <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                            {msg.role === 'assistant' && <div className="w-8 h-8 rounded-full bg-brand-primary/20 flex items-center justify-center flex-shrink-0 mt-1"><LogoIcon className="w-5 h-5 text-brand-primary" /></div>}
                            <div className={`max-w-md p-3 rounded-lg ${msg.role === 'user' ? 'bg-brand-primary text-white' : 'bg-gray-700 text-gray-200'}`}>
                                <MessageContent content={msg.content} />
                            </div>
                        </div>
                    ))}
                    {isLoading && messages[messages.length - 1].role === 'assistant' && messages[messages.length - 1].content === '' && (
                         <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-full bg-brand-primary/20 flex items-center justify-center flex-shrink-0 mt-1"><LogoIcon className="w-5 h-5 text-brand-primary" /></div>
                            <div className="max-w-md p-3 rounded-lg bg-gray-700 text-gray-200">
                                <div className="flex items-center space-x-1">
                                    <span className="h-2 w-2 bg-brand-secondary rounded-full animate-pulse [animation-delay:-0.3s]"></span>
                                    <span className="h-2 w-2 bg-brand-secondary rounded-full animate-pulse [animation-delay:-0.15s]"></span>
                                    <span className="h-2 w-2 bg-brand-secondary rounded-full animate-pulse"></span>
                                </div>
                            </div>
                         </div>
                    )}
                </div>
                {messages.length <= 1 && (
                    <div className="p-6 pt-0 border-t border-gray-700 flex-shrink-0">
                        <p className="text-sm text-gray-400 mb-3">Or try one of these:</p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            {suggestedPrompts.map(prompt => (
                                <button key={prompt} onClick={() => handleSendMessage(undefined, prompt)} className="text-left text-sm p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition">
                                    {prompt}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                <div className="p-4 border-t border-gray-700 flex-shrink-0">
                    <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Ask about AutoFlow..."
                            className="w-full bg-gray-900 border border-gray-600 text-gray-200 text-sm rounded-lg focus:ring-brand-primary focus:border-brand-primary block p-2.5 placeholder-gray-400"
                            disabled={isLoading}
                        />
                        <button type="submit" disabled={isLoading || !input} className="py-2.5 px-4 bg-brand-primary text-white rounded-lg hover:bg-brand-dark transition disabled:bg-gray-500 disabled:cursor-not-allowed font-semibold">
                            Send
                        </button>
                    </form>
                    {error && <p className="text-red-400 text-xs mt-2 text-center">{error}</p>}
                </div>
            </div>
        </div>
    );
};

export default DocsChat;