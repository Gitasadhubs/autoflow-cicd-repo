import React, { useState, useCallback, useEffect } from 'react';
import { User, Repository, Deployment, DeploymentStatus, WorkflowRunStatus } from '../types';
import PipelineConfigurator from './PipelineConfigurator';
import LogViewer from './LogViewer';
import DocsChat from './DocsChat';
import { GitHubIcon, CheckCircleIcon, XCircleIcon, ArrowPathIcon, CodeBracketIcon, LockClosedIcon, StopCircleIcon, LogoIcon, QuestionMarkCircleIcon } from './icons';
import { getRepos, getDeploymentsForRepo, hasWorkflows, getLatestWorkflowRun } from '../services/githubService';

interface DashboardProps {
  user: User;
  token: string;
  onLogout: () => void;
}

const Header: React.FC<{ user: User; onLogout: () => void; onShowDocs: () => void; }> = ({ user, onLogout, onShowDocs }) => (
  <header className="bg-brand-surface shadow-md p-4 flex justify-between items-center border-b border-gray-700">
    <div className="flex items-center space-x-3">
        <div className="w-10 h-10 bg-brand-primary/10 text-brand-primary rounded-lg flex items-center justify-center ring-1 ring-brand-primary/30">
            <LogoIcon className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-bold text-gray-100">AutoFlow</h1>
    </div>
    <div className="flex items-center space-x-4">
      <span className="text-gray-300 hidden md:block">Welcome, {user.name || user.login}</span>
      <img src={user.avatar_url} alt={user.login} className="w-10 h-10 rounded-full border-2 border-brand-primary" />
      <button 
        onClick={onShowDocs} 
        className="bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg transition duration-300 flex items-center"
        title="Chat with Documentation AI"
      >
        <QuestionMarkCircleIcon className="w-5 h-5 mr-0 md:mr-2" />
        <span className="hidden md:block">Chat with Docs</span>
      </button>
      <button onClick={onLogout} className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg transition duration-300">
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

const WorkflowStatusBadge: React.FC<{ status: WorkflowRunStatus; url: string }> = ({ status, url }) => {
    const statusConfig = {
        [WorkflowRunStatus.Success]: { icon: <CheckCircleIcon className="w-4 h-4 mr-1.5" />, text: 'Success', className: 'text-green-400 bg-green-500/10 ring-green-500/30' },
        [WorkflowRunStatus.Failure]: { icon: <XCircleIcon className="w-4 h-4 mr-1.5" />, text: 'Failed', className: 'text-red-400 bg-red-500/10 ring-red-500/30' },
        [WorkflowRunStatus.TimedOut]: { icon: <XCircleIcon className="w-4 h-4 mr-1.5" />, text: 'Timed Out', className: 'text-red-400 bg-red-500/10 ring-red-500/30' },
        [WorkflowRunStatus.InProgress]: { icon: <ArrowPathIcon className="w-4 h-4 mr-1.5 animate-spin" />, text: 'In Progress', className: 'text-yellow-400 bg-yellow-500/10 ring-yellow-500/30' },
        [WorkflowRunStatus.Queued]: { icon: <ArrowPathIcon className="w-4 h-4 mr-1.5 animate-spin" />, text: 'Queued', className: 'text-yellow-400 bg-yellow-500/10 ring-yellow-500/30' },
        [WorkflowRunStatus.ActionRequired]: { icon: <ArrowPathIcon className="w-4 h-4 mr-1.5" />, text: 'Action Required', className: 'text-yellow-400 bg-yellow-500/10 ring-yellow-500/30' },
        [WorkflowRunStatus.Cancelled]: { icon: <StopCircleIcon className="w-4 h-4 mr-1.5" />, text: 'Cancelled', className: 'text-gray-400 bg-gray-500/10 ring-gray-500/30' },
        [WorkflowRunStatus.Skipped]: { icon: <StopCircleIcon className="w-4 h-4 mr-1.5" />, text: 'Skipped', className: 'text-gray-400 bg-gray-500/10 ring-gray-500/30' },
        [WorkflowRunStatus.Neutral]: { icon: <StopCircleIcon className="w-4 h-4 mr-1.5" />, text: 'Neutral', className: 'text-gray-400 bg-gray-500/10 ring-gray-500/30' },
        [WorkflowRunStatus.Completed]: { icon: <CheckCircleIcon className="w-4 h-4 mr-1.5" />, text: 'Completed', className: 'text-gray-400 bg-gray-500/10 ring-gray-500/30' },
        [WorkflowRunStatus.Unknown]: { icon: <CheckCircleIcon className="w-4 h-4 mr-1.5" />, text: 'Unknown', className: 'text-gray-400 bg-gray-500/10 ring-gray-500/30' },
    };

    const config = statusConfig[status] || statusConfig[WorkflowRunStatus.Unknown];

    return (
        <a 
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title={`Last workflow run status: ${config.text}`}
            className={`flex items-center text-sm font-medium py-1 px-3 rounded-full transition-colors ring-1 hover:ring-2 ${config.className} whitespace-nowrap`}
        >
            {config.icon}
            {config.text}
        </a>
    );
};


const RepositoryListItem: React.FC<{ 
    repo: Repository; 
    onConfigure: (repo: Repository) => void;
    onSelect: (repo: Repository) => void;
    isSelected: boolean;
}> = ({ repo, onConfigure, onSelect, isSelected }) => (
    <div 
        onClick={() => onSelect(repo)}
        className={`p-4 rounded-lg shadow-sm hover:shadow-lg transition-all duration-300 cursor-pointer border ${isSelected ? 'bg-gray-700/50 border-brand-primary' : 'bg-brand-surface border-gray-700 hover:border-gray-600'}`}
    >
        <div className="flex justify-between items-center">
            <div>
                <div className="flex items-center space-x-3">
                    <a href={`https://github.com/${repo.full_name}`} target="_blank" rel="noopener noreferrer" className="font-bold text-brand-primary hover:underline">{repo.name}</a>
                    {repo.private && <LockClosedIcon className="w-4 h-4 text-gray-400" title="Private Repository" />}
                </div>
                <p className="text-sm text-gray-400 mt-1 truncate">{repo.description || 'No description available.'}</p>
                <div className="flex items-center space-x-4 mt-2 text-xs text-gray-400">
                    {repo.language && <span className="flex items-center"><CodeBracketIcon className="w-3 h-3 mr-1" />{repo.language}</span>}
                    <span>Updated {timeSince(repo.updated_at)}</span>
                </div>
            </div>
            {repo.has_workflows ? (
                (repo.latestRunStatus && repo.latestRunUrl) ? (
                    <WorkflowStatusBadge status={repo.latestRunStatus} url={repo.latestRunUrl} />
                ) : (
                    <span className="flex items-center text-sm font-medium text-gray-400 bg-gray-500/10 ring-1 ring-gray-500/30 py-1 px-3 rounded-full">
                        No Runs
                    </span>
                )
            ) : (
                <button 
                    onClick={(e) => {
                        e.stopPropagation(); // Prevent onSelect from firing when clicking the button
                        onConfigure(repo);
                    }} 
                    className="bg-brand-primary hover:bg-brand-dark text-white font-semibold py-2 px-4 rounded-lg transition duration-300 whitespace-nowrap"
                >
                    Configure Pipeline
                </button>
            )}
        </div>
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
    <div className="grid grid-cols-12 items-center gap-4 py-3 px-4 text-sm text-gray-300 border-b border-gray-700 last:border-b-0">
        <div className="col-span-1"><DeploymentStatusIcon status={deployment.status} /></div>
        <div className="col-span-4 font-medium">
            <p className="truncate text-gray-100">{deployment.description || 'No description'}</p>
            <p className="text-gray-400 font-mono text-xs">{deployment.sha.substring(0, 7)}</p>
        </div>
        <div className="col-span-2 text-gray-400">{deployment.ref}</div>
        <div className="col-span-2 text-gray-400">{deployment.duration}</div>
        <div className="col-span-3 flex justify-end">
             <button onClick={() => onLogView(deployment)} className="text-brand-secondary hover:underline font-semibold">View Details</button>
        </div>
    </div>
);


const Dashboard: React.FC<DashboardProps> = ({ user, token, onLogout }) => {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [deployments, setDeployments] = useState<(Deployment & { status: DeploymentStatus, duration: string })[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(true);
  const [loadingDeployments, setLoadingDeployments] = useState(false);
  
  const [configRepo, setConfigRepo] = useState<Repository | null>(null); // Repo for pipeline configurator modal
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null); // Repo for viewing deployments
  const [viewingLogs, setViewingLogs] = useState<Deployment | null>(null);
  const [showDocsChat, setShowDocsChat] = useState<boolean>(false);
  
  const [repoError, setRepoError] = useState<string | null>(null);
  const [deploymentError, setDeploymentError] = useState<string | null>(null);
  
  const fetchRepos = useCallback(async () => {
    setLoadingRepos(true);
    setRepoError(null);
    try {
        const fetchedRepos = await getRepos(token);
        const writableRepos = fetchedRepos.filter(repo => repo.permissions && repo.permissions.push);

        const reposWithWorkflowStatus = await Promise.all(
            writableRepos.map(async (repo) => {
                const hasWorkflow = await hasWorkflows(token, repo.owner.login, repo.name);
                 if (hasWorkflow) {
                    const latestRun = await getLatestWorkflowRun(token, repo.owner.login, repo.name);
                    if (latestRun) {
                         return { ...repo, has_workflows: true, latestRunStatus: latestRun.status, latestRunUrl: latestRun.url };
                    }
                    return { ...repo, has_workflows: true }; // Has workflow but no runs found
                }
                return { ...repo, has_workflows: false };
            })
        );
        setRepositories(reposWithWorkflowStatus);
    } catch (error) {
        console.error("Failed to fetch repositories", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while fetching repositories.";
        setRepoError(errorMessage);
    } finally {
        setLoadingRepos(false);
    }
  }, [token]);

  useEffect(() => {
    fetchRepos();
  }, [fetchRepos]);

  const handleRepoSelect = useCallback(async (repo: Repository) => {
    if (selectedRepo?.id === repo.id) return; // Don't refetch if already selected

    setSelectedRepo(repo);
    setLoadingDeployments(true);
    setDeployments([]);
    setDeploymentError(null);
    try {
        const repoDeployments = await getDeploymentsForRepo(token, repo.owner.login, repo.name);
        repoDeployments.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setDeployments(repoDeployments);
    } catch (error) {
        console.error(`Failed to fetch deployments for ${repo.name}`, error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        setDeploymentError(errorMessage);
    } finally {
        setLoadingDeployments(false);
    }
  }, [token, selectedRepo]);
  
  const handlePipelineConfigured = useCallback((repoId: number) => {
    setRepositories(prev => prev.map(r => r.id === repoId ? { ...r, has_workflows: true } : r));
    const newlyConfiguredRepo = repositories.find(r => r.id === repoId);
    if (newlyConfiguredRepo) {
        handleRepoSelect(newlyConfiguredRepo);
    }
  }, [repositories, handleRepoSelect]);

  return (
    <div className="min-h-screen bg-brand-bg text-gray-200">
      <Header user={user} onLogout={onLogout} onShowDocs={() => setShowDocsChat(true)} />
      <main className="p-4 md:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          <div className="space-y-6">
            <h2 className="text-3xl font-bold text-gray-100">Your Repositories</h2>
            {repoError && (
              <div className="bg-red-500/10 border-l-4 border-red-500 text-red-300 p-4 rounded-lg" role="alert">
                <p className="font-bold">Failed to load repositories</p>
                <p>{repoError}</p>
              </div>
            )}
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
              {loadingRepos ? (
                <div className="flex flex-col items-center justify-center p-8 text-center">
                    <LogoIcon className="w-16 h-16 animate-rocket-float" />
                    <p className="mt-4 text-gray-400">Fetching repositories...</p>
                </div>
               ) : 
               repositories.length > 0 ? (
                repositories.map(repo => (
                  <RepositoryListItem 
                    key={repo.id} 
                    repo={repo} 
                    onConfigure={setConfigRepo}
                    onSelect={handleRepoSelect}
                    isSelected={selectedRepo?.id === repo.id}
                  />
                ))
               ) : (
                <div className="bg-brand-surface p-6 rounded-lg shadow-sm text-center border border-gray-700">
                    <p className="text-gray-300 font-semibold">No writable repositories found.</p>
                    <p className="text-sm text-gray-400 mt-2">
                        Please ensure your Personal Access Token has the 'repo' scope and that you have write permissions for the repositories you wish to manage.
                    </p>
                </div>
               )}
            </div>
          </div>
          
          <div className="space-y-6">
            <h2 className="text-3xl font-bold text-gray-100">
                {selectedRepo ? `Deployments for ${selectedRepo.name}` : 'Repository Details'}
            </h2>
            <div className="bg-brand-surface rounded-lg shadow-sm overflow-hidden border border-gray-700">
                <div className="grid grid-cols-12 items-center gap-4 py-3 px-4 text-xs font-bold text-gray-400 uppercase border-b border-gray-700 bg-gray-900/50">
                    <div className="col-span-1"></div>
                    <div className="col-span-4">Commit</div>
                    <div className="col-span-2">Branch</div>
                    <div className="col-span-2">Duration</div>
                    <div className="col-span-3 text-right">Details</div>
                </div>
                <div className="min-h-[200px]">
                    {loadingDeployments && (
                        <div className="flex items-center justify-center h-[200px] flex-col">
                            <LogoIcon className="w-12 h-12 animate-rocket-float" />
                            <p className="mt-3 text-gray-400">Fetching deployments...</p>
                        </div>
                    )}
                    {deploymentError && <p className="text-red-400 p-4 text-center">Failed to load deployments: {deploymentError}</p>}
                    
                    {!loadingDeployments && !selectedRepo && (
                         <div className="flex items-center justify-center h-[200px]">
                            <p className="text-gray-400 text-center">Select a repository from the left to view its deployments.</p>
                        </div>
                    )}

                    {!loadingDeployments && selectedRepo && deployments.length === 0 && !deploymentError && (
                         <div className="flex items-center justify-center h-[200px]">
                            <p className="text-gray-400 text-center">No deployments found for this repository.</p>
                        </div>
                    )}
                    
                    {deployments.map(dep => (
                        <DeploymentListItem key={dep.id} deployment={dep} onLogView={setViewingLogs} />
                    ))}
                </div>
            </div>
          </div>
          
        </div>
      </main>
      
      {configRepo && (
        <PipelineConfigurator 
            repo={configRepo}
            token={token}
            onClose={() => setConfigRepo(null)} 
            onPipelineConfigured={handlePipelineConfigured}
        />
      )}
      {viewingLogs && (
        <LogViewer deployment={viewingLogs} onClose={() => setViewingLogs(null)} />
      )}
      {showDocsChat && (
        <DocsChat onClose={() => setShowDocsChat(false)} />
      )}
    </div>
  );
};

export default Dashboard;