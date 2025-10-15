import React from 'react';
import { Deployment } from '../types';

interface LogViewerProps {
  deployment: Deployment;
  onClose: () => void;
}

const LogViewer: React.FC<LogViewerProps> = ({ deployment, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50">
      <div className="bg-brand-surface rounded-xl shadow-2xl w-full max-w-2xl transform transition-all animate-scale-up border border-gray-700">
        <div className="p-4 border-b border-gray-700 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-gray-100">Deployment Details</h2>
            <p className="text-sm text-gray-400 font-mono">{deployment.sha.substring(0, 7)}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-3xl leading-none">&times;</button>
        </div>
        <div className="p-6 space-y-4">
            <div className="grid grid-cols-3 gap-4 text-sm">
                <span className="font-semibold text-gray-400">Commit Message:</span>
                <span className="col-span-2 text-gray-200">{deployment.description || 'N/A'}</span>

                <span className="font-semibold text-gray-400">Branch/Ref:</span>
                <span className="col-span-2 text-gray-200 font-mono">{deployment.ref}</span>

                <span className="font-semibold text-gray-400">Environment:</span>
                <span className="col-span-2 text-gray-200">{deployment.environment}</span>

                <span className="font-semibold text-gray-400">Triggered By:</span>
                <span className="col-span-2 text-gray-200">{deployment.creator.login}</span>

                <span className="font-semibold text-gray-400">Created:</span>
                <span className="col-span-2 text-gray-200">{new Date(deployment.created_at).toLocaleString()}</span>
            </div>
            <div className="pt-4 border-t border-gray-700">
                <p className="text-xs text-gray-400">
                    This panel shows metadata for the deployment. For detailed build and runtime logs, please check the 'Actions' tab in your GitHub repository.
                </p>
                 <a href={deployment.statuses_url.replace('/statuses', '').replace('api.github.com/repos', 'github.com')} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-brand-secondary hover:underline">
                    View on GitHub &rarr;
                </a>
            </div>
        </div>
      </div>
    </div>
  );
};

export default LogViewer;