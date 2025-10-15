import React, { useState, useCallback, useEffect } from 'react';
import { User, Repository, Deployment, DeploymentStatus } from '../types';
import PipelineConfigurator from './PipelineConfigurator';
import LogViewer from './LogViewer';
import { GitHubIcon, CheckCircleIcon, XCircleIcon, ArrowPathIcon, CodeBracketIcon, LockClosedIcon } from './icons';
import { getRepos, getDeploymentsForRepo, hasWorkflows } from '../services/githubService';

interface DashboardProps {
  user: User;
  token: string;
  onLogout: () => void;
}

const Header: React.FC<{ user: User; onLogout: () => void }> = ({ user, onLogout }) => (
  <header className="bg-white dark:bg-gray-800 shadow-md p-4 flex justify-between items-center">
    <div className="flex items-center space-x-3">
        <div className="w-10 h-10 bg-brand-primary rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">AutoFlow</h1>
    </div>
    <div className="flex items-center space-x-4">
      <span className="text-gray-600 dark:text-gray-300 hidden md:block">Welcome, {user.name || user.login}</span>
      <img src={user.avatar_url} alt={user.login} className="w-10 h-10 rounded-full border-2 border-brand-secondary" />
      <button onClick={onLogout} className="bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg transition duration-300">
        Logout
      </button>
    </div>
  </header>
);

const timeSince = (dateString: string) => {
    const date = new Date(dateString);
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " minutes ago";
    return Math.floor(seconds) + " seconds ago";
}

const RepositoryListItem: React.FC<{ repo: Repository; onConfigure: (repo: Repository) => void }> = ({ repo, onConfigure }) => (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm hover:shadow-lg transition-shadow duration-300 flex justify-between items-center">
        <div>
            <div className="flex items-center space-x-3">
                <a href={`https://github.com/${repo.full_name}`} target="_blank" rel="noopener noreferrer" className="font-bold text-brand-primary dark:text-brand-secondary hover:underline">{repo.name}</a>
                {repo.private && <LockClosedIcon className="w-4 h-4 text-gray-500" title="Private Repository" />}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 truncate">{repo.description || 'No description available.'}</p>
            <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
                {repo.language && <span className="flex items-center"><CodeBracketIcon className="w-3 h-3 mr-1" />{repo.language}</span>}
                <span>Updated {timeSince(repo.updated_at)}</span>
            </div>
        </div>
        {repo.has_workflows ? (
             <span className="flex items-center text-sm font-medium text-status-success bg-green-100 dark:bg-green-900/50 py-1 px-3 rounded-full">
                <CheckCircleIcon className="w-4 h-4 mr-1.5" />
                Pipeline Active
            </span>
        ) : (
            <button onClick={() => onConfigure(repo)} className="bg-brand-secondary hover:bg-brand-dark text-white font-semibold py-2 px-4 rounded-lg transition duration-300 whitespace-nowrap">
                Configure Pipeline
            </button>
        )}
    </div>
);


const DeploymentStatusIcon: React.FC<{ status: DeploymentStatus }> = ({ status }) => {
  switch (status) {
    case DeploymentStatus.Success:
      return <CheckCircleIcon className="w-6 h-6 text-status-success" />;
    case DeploymentStatus.Failed:
    case DeploymentStatus.Error:
      return <XCircleIcon className="w-6 h-6 text-status-failed" />;
    case DeploymentStatus.InProgress:
    case DeploymentStatus.Pending:
    case DeploymentStatus.Queued:
      return <ArrowPathIcon className="w-6 h-6 text-status-in-progress animate-spin" />;
    default:
      return null;
  }
};

const DeploymentListItem: React.FC<{ deployment: Deployment & { status: DeploymentStatus, duration: string }; onLogView: (deployment: Deployment) => void }> = ({ deployment, onLogView }) => (
    <div className="grid grid-cols-12 items-center gap-4 py-3 px-4 text-sm text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 last:border-b-0">
        <div className="col-span-1"><DeploymentStatusIcon status={deployment.status} /></div>
        <div className="col-span-4 font-medium">
            <p className="truncate text-gray-900 dark:text-white">{deployment.description || 'No description'}</p>
            <p className="text-gray-500 dark:text-gray-400 font-mono text-xs">{deployment.sha.substring(0, 7)}</p>
        </div>
        <div className="col-span-2 text-gray-500 dark:text-gray-400">{deployment.ref}</div>
        <div className="col-span-2 text-gray-500 dark:text-gray-400">{deployment.duration}</div>
        <div className="col-span-3 flex justify-end">
             <button onClick={() => onLogView(deployment)} className="text-brand-secondary hover:underline font-semibold">View Details</button>
        </div>
    </div>
);


const Dashboard: React.FC<DashboardProps> = ({ user, token, onLogout }) => {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [deployments, setDeployments] = useState<(Deployment & { status: DeploymentStatus, duration: string })[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(true);
  const [loadingDeployments, setLoadingDeployments] = useState(true);
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [viewingLogs, setViewingLogs] = useState<Deployment | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  
  const fetchAllData = useCallback(async () => {
    setLoadingRepos(true);
    setLoadingDeployments(true);
    setDataError(null);

    try {
        const fetchedRepos = await getRepos(token);
        // Filter for repos with push access to prevent API errors on read-only repos.
        const writableRepos = fetchedRepos.filter(repo => repo.permissions && repo.permissions.push);

        const reposWithWorkflowStatus = await Promise.all(
            writableRepos.map(async (repo) => {
                const hasWorkflow = await hasWorkflows(token, repo.owner.login, repo.name);
                return { ...repo, has_workflows: hasWorkflow };
            })
        );
        setRepositories(reposWithWorkflowStatus);
        
        const allDeployments: (Deployment & { status: DeploymentStatus, duration: string })[] = [];
        // Fetch deployments only for a few repos to avoid hitting rate limits
        const reposToCheck = reposWithWorkflowStatus.slice(0, 5);
        for (const repo of reposToCheck) {
            const repoDeployments = await getDeploymentsForRepo(token, repo.owner.login, repo.name);
            allDeployments.push(...repoDeployments);
        }

        allDeployments.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setDeployments(allDeployments.slice(0, 10)); // Show latest 10
    } catch (error) {
        console.error("Failed to fetch data", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while fetching data.";
        setDataError(errorMessage);
    } finally {
        setLoadingRepos(false);
        setLoadingDeployments(false);
    }
  }, [token]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);
  
  const handlePipelineConfigured = useCallback((repoId: number) => {
    setRepositories(prev => prev.map(r => r.id === repoId ? { ...r, has_workflows: true } : r));
    // Optionally refetch deployments
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <Header user={user} onLogout={onLogout} />
      <main className="p-4 md:p-8">
        {dataError && (
          <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-lg mb-6" role="alert">
            <p className="font-bold">Failed to load data</p>
            <p>{dataError}</p>
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          <div className="space-y-6">
            <h2 className="text-3xl font-bold text-gray-800 dark:text-white">Your Repositories</h2>
            <div className="space-y-4">
              {loadingRepos ? <p className="text-gray-500 dark:text-gray-400">Loading repositories...</p> : 
               repositories.length > 0 ? (
                repositories.map(repo => (
                  <RepositoryListItem key={repo.id} repo={repo} onConfigure={setSelectedRepo} />
                ))
               ) : (
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm text-center">
                    <p className="text-gray-700 dark:text-gray-300 font-semibold">No writable repositories found.</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                        Please ensure your Personal Access Token has the 'repo' scope and that you have write permissions for the repositories you wish to manage.
                    </p>
                </div>
               )}
            </div>
          </div>
          
          <div className="space-y-6">
            <h2 className="text-3xl font-bold text-gray-800 dark:text-white">Recent Deployments</h2>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
                <div className="grid grid-cols-12 items-center gap-4 py-3 px-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                    <div className="col-span-1"></div>
                    <div className="col-span-4">Commit</div>
                    <div className="col-span-2">Branch</div>
                    <div className="col-span-2">Duration</div>
                    <div className="col-span-3 text-right">Details</div>
                </div>
                {loadingDeployments ? <p className="text-gray-500 dark:text-gray-400 p-4">Loading deployments...</p> :
                 deployments.map(dep => (
                    <DeploymentListItem key={dep.id} deployment={dep} onLogView={setViewingLogs} />
                ))}
            </div>
          </div>
          
        </div>
      </main>
      
      {selectedRepo && (
        <PipelineConfigurator 
            repo={selectedRepo}
            token={token}
            onClose={() => setSelectedRepo(null)} 
            onPipelineConfigured={handlePipelineConfigured}
        />
      )}
      {viewingLogs && (
        <LogViewer deployment={viewingLogs} onClose={() => setViewingLogs(null)} />
      )}
    </div>
  );
};

export default Dashboard;