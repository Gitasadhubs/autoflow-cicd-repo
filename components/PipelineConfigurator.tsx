import React, { useState, useCallback, useEffect } from 'react';
import { Repository, TechStack, DeploymentTarget, DeploymentEnvironment, RequiredVariable, RequiredSecret } from '../types';
import { generateWorkflow } from '../services/geminiService';
import { createWorkflowFile, setRepositoryVariable, setRepositorySecret } from '../services/githubService';
import { ClipboardIcon, ClipboardCheckIcon, CodeBracketIcon, ArrowPathIcon, CheckCircleIcon, LockClosedIcon, EyeIcon, EyeSlashIcon } from './icons';

interface PipelineConfiguratorProps {
  repo: Repository;
  token: string;
  onClose: () => void;
  onPipelineConfigured: (repoId: number) => void;
}

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
  const [commitStatus, setCommitStatus] = useState('');
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  useEffect(() => {
    // Pre-fill variable values with defaults when they are loaded
    const initialValues: Record<string, string> = {};
    requiredVariables.forEach(v => {
        initialValues[v.name] = v.defaultValue || '';
    });
    setVariableValues(initialValues);
  }, [requiredVariables]);


  const handleGenerate = useCallback(async () => {
    setIsLoading(true);
    setGeneratedYaml('');
    setRequiredVariables([]);
    setRequiredSecrets([]);
    setVariableValues({});
    setSecretValues({});
    setVisibleSecrets({});
    const { yaml, variables, secrets } = await generateWorkflow(techStack, deploymentTarget, deploymentEnvironment, repo.name);
    setGeneratedYaml(yaml);
    setRequiredVariables(variables);
    setRequiredSecrets(secrets);
    setIsLoading(false);
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
  
  const handleConfirmSetup = async () => {
    setIsCommitting(true);
    setCommitError(null);
    try {
        setCommitStatus('Committing workflow file...');
        const fileName = `${repo.name.replace(/[^a-zA-Z0-9-]/g, '-')}-autoflow-${deploymentEnvironment.toLowerCase()}.yml`;
        await createWorkflowFile(token, repo.owner.login, repo.name, repo.default_branch, fileName, generatedYaml, `ci: Add AutoFlow workflow for ${repo.name} (${deploymentEnvironment})`);
        
        if (requiredVariables.length > 0) {
            setCommitStatus('Setting repository variables...');
            const variablePromises = Object.entries(variableValues).map(([name, value]) => {
                if (value) { // Only set variables that have a value
                    return setRepositoryVariable(token, repo.owner.login, repo.name, name, value);
                }
                return Promise.resolve();
            });
            await Promise.all(variablePromises);
        }

        if (requiredSecrets.length > 0) {
            setCommitStatus('Setting repository secrets...');
            const secretPromises = Object.entries(secretValues).map(([name, value]) => {
                if (value) { // Only set secrets that have a value
                    return setRepositorySecret(token, repo.owner.login, repo.name, name, value);
                }
                return Promise.resolve();
            });
            await Promise.all(secretPromises);
        }

        setCommitStatus('Success!');
        onPipelineConfigured(repo.id);
        setTimeout(() => {
            onClose();
        }, 1000); // Close modal after a short delay to show success
    } catch(error) {
        console.error("Failed to commit workflow file or set secrets/variables", error);
        // Fix: The caught error is of type 'unknown'. Cast to 'Error' to access the 'message' property.
        const errorMessage = error instanceof Error ? error.message : String(error);
        setCommitError(errorMessage);
        setIsCommitting(false);
        setCommitStatus('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-3xl transform transition-all duration-300 scale-95 animate-[scale-up_0.2s_ease-out_forwards]">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Configure Pipeline</h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1">For repository: <span className="font-semibold text-brand-primary dark:text-brand-secondary">{repo.full_name}</span></p>
        </div>
        
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          <fieldset className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
            <legend className="text-sm font-medium text-gray-700 dark:text-gray-300 px-2">Build & Deploy Settings</legend>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div>
                <label htmlFor="tech-stack" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tech Stack</label>
                <select 
                    id="tech-stack"
                    value={techStack}
                    onChange={(e) => setTechStack(e.target.value as TechStack)}
                    className="w-full bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-brand-secondary focus:border-brand-secondary block p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
                >
                    {Object.values(TechStack).map(ts => <option key={ts} value={ts}>{ts}</option>)}
                </select>
                </div>
                <div>
                <label htmlFor="deployment-target" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Deployment Target</label>
                <select 
                    id="deployment-target"
                    value={deploymentTarget}
                    onChange={(e) => setDeploymentTarget(e.target.value as DeploymentTarget)}
                    className="w-full bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-brand-secondary focus:border-brand-secondary block p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
                >
                    {Object.values(DeploymentTarget).map(dt => <option key={dt} value={dt}>{dt}</option>)}
                </select>
                </div>
                <div>
                <label htmlFor="deployment-environment" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Environment</label>
                <select 
                    id="deployment-environment"
                    value={deploymentEnvironment}
                    onChange={(e) => setDeploymentEnvironment(e.target.value as DeploymentEnvironment)}
                    className="w-full bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-brand-secondary focus:border-brand-secondary block p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
                >
                    {Object.values(DeploymentEnvironment).map(de => <option key={de} value={de}>{de}</option>)}
                </select>
                </div>
            </div>
          </fieldset>
          
          <button
            onClick={handleGenerate}
            disabled={isLoading || isCommitting}
            className="w-full flex items-center justify-center bg-brand-primary hover:bg-brand-dark text-white font-bold py-2.5 px-4 rounded-lg transition duration-300 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <><ArrowPathIcon className="h-5 w-5 mr-2 animate-spin" />Generating...</>
            ) : (
              <><CodeBracketIcon className="h-5 w-5 mr-2" />Generate Workflow File</>
            )}
          </button>

          {requiredVariables.length > 0 && (
            <fieldset className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                <legend className="text-sm font-medium text-gray-700 dark:text-gray-300 px-2">Configure Workflow Variables</legend>
                <p className="text-xs text-gray-500 dark:text-gray-400 pb-3">These non-sensitive variables will be set in your repository settings.</p>
                <div className="space-y-3">
                    {requiredVariables.map(variable => (
                        <div key={variable.name}>
                            <label htmlFor={variable.name} className="block text-sm font-medium text-gray-700 dark:text-gray-300">{variable.name}</label>
                             <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{variable.description}</p>
                            <input
                                id={variable.name}
                                type="text"
                                value={variableValues[variable.name] || ''}
                                placeholder={variable.defaultValue || 'Enter value'}
                                onChange={(e) => handleVariableChange(variable.name, e.target.value)}
                                className="w-full bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-brand-secondary focus:border-brand-secondary block p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
                            />
                        </div>
                    ))}
                </div>
            </fieldset>
          )}

          {requiredSecrets.length > 0 && (
            <fieldset className="p-4 border border-amber-300 dark:border-amber-600 rounded-lg bg-amber-50 dark:bg-amber-900/20">
              <legend className="text-sm font-medium text-amber-800 dark:text-amber-300 px-2 flex items-center">
                <LockClosedIcon className="h-4 w-4 mr-1.5" />
                Configure Workflow Secrets
              </legend>
              <p className="text-xs text-amber-700 dark:text-amber-400 pb-3">These sensitive values will be stored as encrypted secrets in your repository.</p>
              <div className="space-y-3">
                {requiredSecrets.map(secret => (
                  <div key={secret.name}>
                    <label htmlFor={secret.name} className="block text-sm font-medium text-gray-700 dark:text-gray-300">{secret.name}</label>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{secret.description}</p>
                    <div className="relative">
                      <input
                        id={secret.name}
                        type={visibleSecrets[secret.name] ? 'text' : 'password'}
                        value={secretValues[secret.name] || ''}
                        placeholder={`Enter value for ${secret.name}`}
                        onChange={(e) => handleSecretChange(secret.name, e.target.value)}
                        className="w-full bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-brand-secondary focus:border-brand-secondary block p-2.5 pr-10 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() => toggleSecretVisibility(secret.name)}
                        className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
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
                <div className="relative bg-gray-900 rounded-lg p-4 max-h-60 overflow-auto">
                    <button
                        onClick={copyToClipboard}
                        className="absolute top-2 right-2 p-1.5 bg-gray-700 hover:bg-gray-600 rounded-md text-gray-300"
                        title="Copy to clipboard"
                    >
                        {isCopied ? <ClipboardCheckIcon className="h-5 w-5 text-green-400" /> : <ClipboardIcon className="h-5 w-5" />}
                    </button>
                    <pre><code className="text-sm text-white font-mono">{generatedYaml}</code></pre>
                </div>
            </div>
          )}
          {commitError && <p className="text-sm text-red-500 text-center">Failed to commit: {commitError}</p>}
        </div>
        
        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700/50 flex justify-end space-x-3 rounded-b-xl">
          <button onClick={onClose} className="py-2 px-4 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 transition">Cancel</button>
          <button 
            onClick={handleConfirmSetup}
            disabled={!generatedYaml || isCommitting}
            className="py-2 px-4 bg-status-success text-white rounded-lg hover:bg-green-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed min-w-[150px] flex items-center justify-center"
          >
            {isCommitting ? (
              commitStatus === 'Success!' ? <CheckCircleIcon className="h-5 w-5 text-white" /> : <><ArrowPathIcon className="h-5 w-5 animate-spin mr-2" /> <span>{commitStatus || 'Processing...'}</span></>
            ) : "Confirm Setup" }
          </button>
        </div>
      </div>
    </div>
  );
};

export default PipelineConfigurator;