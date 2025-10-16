import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Repository, TechStack, DeploymentTarget, DeploymentEnvironment, RequiredVariable, RequiredSecret } from '../types';
import { generateWorkflow } from '../services/geminiService';
import { createWorkflowFile, setRepositoryVariable, setRepositorySecret } from '../services/githubService';
import { 
    ClipboardIcon, ClipboardCheckIcon, CodeBracketIcon, CheckCircleIcon, LockClosedIcon, 
    EyeIcon, EyeSlashIcon, LogoIcon, ArrowPathIcon, XCircleIcon 
} from './icons';

interface PipelineConfiguratorProps {
  repo: Repository;
  token: string;
  onClose: () => void;
  onPipelineConfigured: (repoId: number) => void;
}

type CommitProgressState = 'pending' | 'in-progress' | 'success' | 'error';

interface CommitProgress {
    workflowFile: CommitProgressState;
    variables: CommitProgressState;
    secrets: CommitProgressState;
}

const initialCommitProgress: CommitProgress = {
    workflowFile: 'pending',
    variables: 'pending',
    secrets: 'pending',
};

const ProgressItem: React.FC<{ 
    status: CommitProgressState; 
    text: string;
    onRetry?: () => void;
}> = ({ status, text, onRetry }) => {
    let icon;
    let textColor = 'text-gray-500 dark:text-gray-400';

    switch (status) {
        case 'in-progress':
            icon = <ArrowPathIcon className="h-4 w-4 text-yellow-500 dark:text-yellow-400 animate-spin" />;
            textColor = 'text-gray-800 dark:text-gray-200';
            break;
        case 'success':
            icon = <CheckCircleIcon className="h-4 w-4 text-green-500 dark:text-green-400 animate-scale-up" />;
            textColor = 'text-gray-800 dark:text-gray-200';
            break;
        case 'error':
            icon = <XCircleIcon className="h-4 w-4 text-red-500 dark:text-red-400" />;
            textColor = 'text-red-500 dark:text-red-400';
            break;
        default: // 'pending'
            icon = <div className="h-4 w-4 border-2 border-gray-400 dark:border-gray-500 rounded-full"></div>;
            break;
    }
    
    return (
        <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
                <div className="w-5 h-5 flex items-center justify-center">{icon}</div>
                <span className={textColor}>{text}</span>
            </div>
            {status === 'error' && onRetry && (
                <button
                    onClick={onRetry}
                    className="text-xs text-brand-secondary hover:underline font-semibold flex items-center"
                    aria-label={`Retry ${text}`}
                >
                    <ArrowPathIcon className="h-3 w-3 mr-1" />
                    Retry
                </button>
            )}
        </div>
    );
};


const PipelineConfigurator: React.FC<PipelineConfiguratorProps> = ({ repo, token, onClose, onPipelineConfigured }) => {
  const [techStack, setTechStack] = useState<TechStack>(TechStack.React);
  const [deploymentTarget, setDeploymentTarget] = useState<DeploymentTarget>(DeploymentTarget.Vercel);
  const [deploymentEnvironment, setDeploymentEnvironment] = useState<DeploymentEnvironment>(DeploymentEnvironment.Production);
  const [generatedYaml, setGeneratedYaml] = useState<string>('');
  const [requiredVariables, setRequiredVariables] = useState<RequiredVariable[]>([]);
  const [requiredSecrets, setRequiredSecrets] = useState<RequiredSecret[]>([]);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [secretValues, setSecretValues] = useState<Record<string, string>>({});
  const [visibleSecrets, setVisibleSecrets] = useState<Record<string, boolean>>({});

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isCommitting, setIsCommitting] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [commitProgress, setCommitProgress] = useState<CommitProgress>(initialCommitProgress);
  
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const loadingIntervalRef = useRef<number | null>(null);


  useEffect(() => {
    // Pre-fill variable values with defaults when they are loaded
    const initialValues: Record<string, string> = {};
    requiredVariables.forEach(v => {
        initialValues[v.name] = v.defaultValue || '';
    });
    setVariableValues(initialValues);
  }, [requiredVariables]);
  
  // This effect checks if all setup steps are successfully completed.
  useEffect(() => {
    if (!isCommitting) return;

    const allStepsSuccessful =
      commitProgress.workflowFile === 'success' &&
      (requiredVariables.length > 0 ? commitProgress.variables === 'success' : true) &&
      (requiredSecrets.length > 0 ? commitProgress.secrets === 'success' : true);

    if (allStepsSuccessful) {
      setCommitError(null);
      onPipelineConfigured(repo.id);
      setTimeout(() => {
        onClose();
      }, 1500);
    }
  }, [commitProgress, isCommitting, requiredVariables.length, requiredSecrets.length, repo.id, onPipelineConfigured, onClose]);


  const handleGenerate = useCallback(async () => {
    setIsLoading(true);
    setGeneratedYaml('');
    setRequiredVariables([]);
    setRequiredSecrets([]);
    setVariableValues({});
    setSecretValues({});
    setVisibleSecrets({});
    setGenerationError(null);
    
    const loadingMessages = [
        "Contacting AI DevOps expert...",
        "Analyzing project requirements...",
        "Crafting the perfect YAML script...",
        "Adding dependency caching for speed...",
        "Defining required variables and secrets...",
        "Finalizing the deployment strategy...",
    ];
    let messageIndex = 0;
    setLoadingMessage(loadingMessages[messageIndex]);
    loadingIntervalRef.current = window.setInterval(() => {
        messageIndex = (messageIndex + 1) % loadingMessages.length;
        setLoadingMessage(loadingMessages[messageIndex]);
    }, 2500);

    try {
        const { yaml, variables, secrets } = await generateWorkflow(techStack, deploymentTarget, deploymentEnvironment, repo.name);
        setGeneratedYaml(yaml);
        setRequiredVariables(variables);
        setRequiredSecrets(secrets);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred during workflow generation.";
        setGenerationError(errorMessage);
        console.error("Workflow generation failed:", error);
    } finally {
        setIsLoading(false);
        if (loadingIntervalRef.current) {
            clearInterval(loadingIntervalRef.current);
            loadingIntervalRef.current = null;
        }
    }
  }, [techStack, deploymentTarget, deploymentEnvironment, repo.name]);
  
  const handleVariableChange = (name: string, value: string) => {
    setVariableValues(prev => ({ ...prev, [name]: value }));
  };

  const handleSecretChange = (name: string, value: string) => {
    setSecretValues(prev => ({ ...prev, [name]: value }));
  };
  
  const toggleSecretVisibility = (name: string) => {
    setVisibleSecrets(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedYaml);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };
  
  const executeWorkflowFileStep = useCallback(async () => {
    const fileName = `${repo.name.replace(/[^a-zA-Z0-9-]/g, '-')}-autoflow-${deploymentEnvironment.toLowerCase()}.yml`;
    await createWorkflowFile(token, repo.owner.login, repo.name, repo.default_branch, fileName, generatedYaml, `ci: Add AutoFlow workflow for ${repo.name} (${deploymentEnvironment})`);
  }, [token, repo, deploymentEnvironment, generatedYaml]);

  const executeVariablesStep = useCallback(async () => {
      const variablePromises = Object.entries(variableValues).map(([name, value]) => {
          if (value) {
              return setRepositoryVariable(token, repo.owner.login, repo.name, name, value);
          }
          return Promise.resolve();
      });
      await Promise.all(variablePromises);
  }, [token, repo, variableValues]);

  const executeSecretsStep = useCallback(async () => {
      const secretPromises = Object.entries(secretValues).map(([name, value]) => {
          if (value) {
              return setRepositorySecret(token, repo.owner.login, repo.name, name, value);
          }
          return Promise.resolve();
      });
      await Promise.all(secretPromises);
  }, [token, repo, secretValues]);
  
  const runSteps = useCallback(async (startingStep: keyof CommitProgress) => {
    setCommitError(null);

    const stepExecutors: Record<keyof CommitProgress, () => Promise<void>> = {
      workflowFile: executeWorkflowFileStep,
      variables: executeVariablesStep,
      secrets: executeSecretsStep,
    };
    const steps: (keyof CommitProgress)[] = ['workflowFile', 'variables', 'secrets'];
    const startIndex = steps.indexOf(startingStep);
    
    // Reset statuses for the steps that are about to run
    setCommitProgress(prev => {
      const next = { ...prev };
      for (let i = startIndex; i < steps.length; i++) {
        next[steps[i]] = 'pending';
      }
      return next;
    });

    for (let i = startIndex; i < steps.length; i++) {
      const step = steps[i];

      // Skip steps that don't have associated configurations
      if ((step === 'variables' && requiredVariables.length === 0) || (step === 'secrets' && requiredSecrets.length === 0)) {
        setCommitProgress(prev => ({ ...prev, [step]: 'success' }));
        continue;
      }

      try {
        setCommitProgress(prev => ({ ...prev, [step]: 'in-progress' }));
        await stepExecutors[step]();
        setCommitProgress(prev => ({ ...prev, [step]: 'success' }));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : `An unknown error occurred during the '${step}' step.`;
        setCommitError(errorMessage);
        setCommitProgress(prev => ({ ...prev, [step]: 'error' }));
        return; // Stop on error, allowing the user to retry
      }
    }
  }, [executeWorkflowFileStep, executeVariablesStep, executeSecretsStep, requiredVariables.length, requiredSecrets.length]);

  const handleConfirmSetup = useCallback(() => {
    setIsCommitting(true);
    setCommitProgress(initialCommitProgress);
    runSteps('workflowFile');
  }, [runSteps]);
  
  const handleRetry = useCallback((step: keyof CommitProgress) => {
    runSteps(step);
  }, [runSteps]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50">
      <div className="bg-light-surface dark:bg-brand-surface rounded-xl shadow-2xl w-full max-w-3xl transform transition-all animate-scale-up border border-gray-200 dark:border-gray-700">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Configure Pipeline</h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">For repository: <span className="font-semibold text-brand-primary">{repo.full_name}</span></p>
        </div>
        
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          <fieldset className="p-4 border border-gray-300 dark:border-gray-700 rounded-lg">
            <legend className="text-sm font-medium text-gray-700 dark:text-gray-300 px-2">Build & Deploy Settings</legend>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div>
                <label htmlFor="tech-stack" className="block text-sm font-medium text-gray-800 dark:text-gray-300 mb-1">Tech Stack</label>
                <select 
                    id="tech-stack"
                    value={techStack}
                    onChange={(e) => setTechStack(e.target.value as TechStack)}
                    className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-200 text-sm rounded-lg focus:ring-brand-primary focus:border-brand-primary block p-2.5 placeholder-gray-500 dark:placeholder-gray-400"
                >
                    {Object.values(TechStack).map(ts => <option key={ts} value={ts}>{ts}</option>)}
                </select>
                </div>
                <div>
                <label htmlFor="deployment-target" className="block text-sm font-medium text-gray-800 dark:text-gray-300 mb-1">Deployment Target</label>
                <select 
                    id="deployment-target"
                    value={deploymentTarget}
                    onChange={(e) => setDeploymentTarget(e.target.value as DeploymentTarget)}
                    className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-200 text-sm rounded-lg focus:ring-brand-primary focus:border-brand-primary block p-2.5 placeholder-gray-500 dark:placeholder-gray-400"
                >
                    {Object.values(DeploymentTarget).map(dt => <option key={dt} value={dt}>{dt}</option>)}
                </select>
                </div>
                <div>
                <label htmlFor="deployment-environment" className="block text-sm font-medium text-gray-800 dark:text-gray-300 mb-1">Environment</label>
                <select 
                    id="deployment-environment"
                    value={deploymentEnvironment}
                    onChange={(e) => setDeploymentEnvironment(e.target.value as DeploymentEnvironment)}
                    className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-200 text-sm rounded-lg focus:ring-brand-primary focus:border-brand-primary block p-2.5 placeholder-gray-500 dark:placeholder-gray-400"
                >
                    {Object.values(DeploymentEnvironment).map(de => <option key={de} value={de}>{de}</option>)}
                </select>
                </div>
            </div>
          </fieldset>
          
          <button
            onClick={handleGenerate}
            disabled={isLoading || isCommitting}
            className="w-full flex items-center justify-center bg-brand-primary hover:bg-brand-dark text-white font-bold py-2.5 px-4 rounded-lg transition duration-300 disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-light-surface dark:focus:ring-offset-brand-surface focus:ring-brand-secondary"
          >
            {isLoading ? (
              <><LogoIcon className="h-5 w-5 mr-2 animate-rocket-float" />{loadingMessage}</>
            ) : (
              <><CodeBracketIcon className="h-5 w-5 mr-2" />Generate Workflow File</>
            )}
          </button>

          {generationError && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-500 dark:text-red-400 text-sm">
                <p className="font-bold">Generation Failed</p>
                <p className="mt-1">{generationError}</p>
            </div>
          )}

          {requiredVariables.length > 0 && (
            <fieldset className="p-4 border border-gray-300 dark:border-gray-700 rounded-lg">
                <legend className="text-sm font-medium text-gray-700 dark:text-gray-300 px-2">Configure Workflow Variables</legend>
                <p className="text-xs text-gray-500 dark:text-gray-400 pb-3">These non-sensitive variables will be set in your repository settings.</p>
                <div className="space-y-3">
                    {requiredVariables.map(variable => (
                        <div key={variable.name}>
                            <label htmlFor={variable.name} className="block text-sm font-medium text-gray-800 dark:text-gray-300">{variable.name}</label>
                             <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{variable.description}</p>
                            <input
                                id={variable.name}
                                type="text"
                                value={variableValues[variable.name] || ''}
                                placeholder={variable.defaultValue || 'Enter value'}
                                onChange={(e) => handleVariableChange(variable.name, e.target.value)}
                                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-200 text-sm rounded-lg focus:ring-brand-primary focus:border-brand-primary block p-2.5 placeholder-gray-400 dark:placeholder-gray-500"
                            />
                        </div>
                    ))}
                </div>
            </fieldset>
          )}

          {requiredSecrets.length > 0 && (
            <fieldset className="p-4 border border-amber-500 dark:border-amber-600 rounded-lg bg-amber-500/10">
              <legend className="text-sm font-medium text-amber-700 dark:text-amber-300 px-2 flex items-center">
                <LockClosedIcon className="h-4 w-4 mr-1.5" />
                Configure Workflow Secrets
              </legend>
              <p className="text-xs text-amber-600 dark:text-amber-400 pb-3">These sensitive values will be stored as encrypted secrets in your repository.</p>
              <div className="space-y-3">
                {requiredSecrets.map(secret => (
                  <div key={secret.name}>
                    <label htmlFor={secret.name} className="block text-sm font-medium text-gray-800 dark:text-gray-300">{secret.name}</label>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">{secret.description}</p>
                    <div className="relative">
                      <input
                        id={secret.name}
                        type={visibleSecrets[secret.name] ? 'text' : 'password'}
                        value={secretValues[secret.name] || ''}
                        placeholder={`Enter value for ${secret.name}`}
                        onChange={(e) => handleSecretChange(secret.name, e.target.value)}
                        className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-200 text-sm rounded-lg focus:ring-brand-primary focus:border-brand-primary block p-2.5 pr-10 placeholder-gray-400 dark:placeholder-gray-500"
                      />
                      <button
                        type="button"
                        onClick={() => toggleSecretVisibility(secret.name)}
                        className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                        aria-label={visibleSecrets[secret.name] ? 'Hide secret' : 'Show secret'}
                      >
                        {visibleSecrets[secret.name] ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </fieldset>
          )}
          
          {generatedYaml && (
            <div className="space-y-2">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Generated Workflow</h3>
                <div className="relative bg-gray-100 dark:bg-gray-900 rounded-lg p-4 max-h-60 overflow-auto border border-gray-300 dark:border-gray-700">
                    <button
                        onClick={copyToClipboard}
                        className="absolute top-2 right-2 p-1.5 bg-gray-300 dark:bg-gray-700 hover:bg-gray-400 dark:hover:bg-gray-600 rounded-md text-gray-700 dark:text-gray-300"
                        title="Copy to clipboard"
                    >
                        {isCopied ? <ClipboardCheckIcon className="h-5 w-5 text-green-500" /> : <ClipboardIcon className="h-5 w-5" />}
                    </button>
                    <pre><code className="text-sm text-gray-800 dark:text-gray-200 font-mono">{generatedYaml}</code></pre>
                </div>
            </div>
          )}
        </div>
        
        <div className="px-6 py-4 bg-gray-100 dark:bg-gray-900/50 flex justify-between items-center rounded-b-xl border-t border-gray-200 dark:border-gray-700 min-h-[76px]">
          <button 
            onClick={onClose} 
            disabled={isCommitting && !commitError}
            className="py-2 px-4 bg-gray-600 text-gray-100 dark:text-gray-200 rounded-lg hover:bg-gray-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          
          {isCommitting ? (
            <div className="text-sm w-full max-w-xs">
                <div className="space-y-1">
                    <ProgressItem 
                        status={commitProgress.workflowFile}
                        text="Commit workflow file"
                        onRetry={() => handleRetry('workflowFile')} 
                    />
                    {requiredVariables.length > 0 && 
                        <ProgressItem 
                            status={commitProgress.variables}
                            text="Set repository variables"
                            onRetry={() => handleRetry('variables')}
                        />
                    }
                    {requiredSecrets.length > 0 && 
                        <ProgressItem
                            status={commitProgress.secrets}
                            text="Set repository secrets"
                            onRetry={() => handleRetry('secrets')}
                        />
                    }
                </div>
                {commitError && <p className="text-sm text-red-500 text-left mt-2">Error: {commitError}</p>}
            </div>
          ) : (
            <button 
              onClick={handleConfirmSetup}
              disabled={!generatedYaml}
              className="py-2 px-4 bg-status-success text-white rounded-lg hover:bg-green-700 transition disabled:bg-gray-400 dark:disabled:bg-gray-500 disabled:cursor-not-allowed min-w-[150px] flex items-center justify-center font-semibold"
            >
              Confirm Setup
            </button>
          )}

        </div>
      </div>
    </div>
  );
};

export default PipelineConfigurator;