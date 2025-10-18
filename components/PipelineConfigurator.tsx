import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Repository, TechStack, DeploymentTarget, DeploymentEnvironment, RequiredVariable, RequiredSecret } from '../types';
import { generateWorkflow, AdvancedTriggers } from '../services/geminiService';
import { createWorkflowFile, setRepositoryVariable, setRepositorySecret, getWorkflowConfiguration, analyzeRepository } from '../services/githubService';
import Editor from 'react-simple-code-editor';
import Prism from 'prismjs';
// This import will load the yaml grammar into the Prism object.
import 'prismjs/components/prism-yaml.js';
import { 
    ClipboardIcon, ClipboardCheckIcon, CodeBracketIcon, CheckCircleIcon, LockClosedIcon, 
    EyeIcon, EyeSlashIcon, LogoIcon, ArrowPathIcon, XCircleIcon, XCircleIcon as XIcon,
    VercelIcon, GitHubIcon, RailwayIcon, HerokuIcon, AWSIcon, DocumentArrowUpIcon
} from './icons';

interface PipelineConfiguratorProps {
  repo: Repository;
  token: string;
  mode: 'create' | 'edit';
  onClose: () => void;
  onPipelineConfigured: (repoId: number) => void;
}

type CommitProgressState = 'pending' | 'in-progress' | 'success' | 'error';

interface CommitProgress {
    workflowFile: CommitProgressState;
    variables: CommitProgressState;
    secrets: CommitProgressState;
}

// New state structures for advanced trigger configuration
interface TriggerBranchConfig {
    enabled: boolean;
    branches: string; // comma-separated
    branchesIgnore: string; // comma-separated
}
interface TriggerScheduleConfig {
    enabled: boolean;
    crons: string[];
}

interface WorkflowTemplate {
    id: string;
    name: string;
    description: string;
    techStack: TechStack;
    deploymentTarget: DeploymentTarget;
    icon: React.FC<{ className?: string }>;
}

const templates: WorkflowTemplate[] = [
    { id: 'react-vercel', name: 'React to Vercel', description: 'Deploy a Vite-based React app to Vercel.', techStack: TechStack.React, deploymentTarget: DeploymentTarget.Vercel, icon: VercelIcon },
    { id: 'static-ghpages', name: 'Static to GitHub Pages', description: 'Host a static HTML/JS site from your repo.', techStack: TechStack.Static, deploymentTarget: DeploymentTarget.GitHubPages, icon: GitHubIcon },
    { id: 'node-railway', name: 'Node.js to Railway', description: 'Deploy a Node.js Express server to Railway.', techStack: TechStack.NodeJS, deploymentTarget: DeploymentTarget.Railway, icon: RailwayIcon },
    { id: 'python-heroku', name: 'Python to Heroku', description: 'Deploy a Python (Flask/Django) app to Heroku.', techStack: TechStack.Python, deploymentTarget: DeploymentTarget.Heroku, icon: HerokuIcon },
    { id: 'node-aws-eb', name: 'Node.js to AWS EB', description: 'Deploy a Node.js app to AWS Elastic Beanstalk.', techStack: TechStack.NodeJS, deploymentTarget: DeploymentTarget.AWSElasticBeanstalk, icon: AWSIcon },
    { id: 'import', name: 'Import from File', description: 'Use your own existing workflow .yml file.', techStack: TechStack.Static, deploymentTarget: DeploymentTarget.GitHubPages, icon: DocumentArrowUpIcon },
    { id: 'custom', name: 'Custom Pipeline', description: 'Manually configure stack and deployment target.', techStack: TechStack.React, deploymentTarget: DeploymentTarget.Vercel, icon: CodeBracketIcon } // Dummy values for custom
];


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


const PipelineConfigurator: React.FC<PipelineConfiguratorProps> = ({ repo, token, mode, onClose, onPipelineConfigured }) => {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(templates[0].id);
  const [techStack, setTechStack] = useState<TechStack>(templates[0].techStack);
  const [deploymentTarget, setDeploymentTarget] = useState<DeploymentTarget>(templates[0].deploymentTarget);
  const [deploymentEnvironment, setDeploymentEnvironment] = useState<DeploymentEnvironment>(DeploymentEnvironment.Production);
  
  // State for advanced trigger configuration
  const [pushConfig, setPushConfig] = useState<TriggerBranchConfig>({ enabled: true, branches: '', branchesIgnore: '' });
  const [pullRequestConfig, setPullRequestConfig] = useState<TriggerBranchConfig>({ enabled: false, branches: '', branchesIgnore: '' });
  const [scheduleConfig, setScheduleConfig] = useState<TriggerScheduleConfig>({ enabled: false, crons: ['0 0 * * *'] });

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
  
  const [workflowFilePath, setWorkflowFilePath] = useState<string | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(mode === 'edit');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const highlightWithLineNumbers = (code: string) =>
    Prism.highlight(code, Prism.languages.yaml, 'yaml')
        .split('\n')
        .map((line) => `<span class="line-content">${line}</span>`)
        .join('\n');


  useEffect(() => {
    // Pre-fill variable values with defaults when they are loaded
    const initialValues: Record<string, string> = {};
    requiredVariables.forEach(v => {
        initialValues[v.name] = v.defaultValue || '';
    });
    setVariableValues(initialValues);
  }, [requiredVariables]);
  
    useEffect(() => {
        if (mode === 'create') {
            const selected = templates.find(t => t.id === selectedTemplateId);
            if (selected) {
                if (selected.id === 'custom') {
                    // When switching to 'Custom', reset to the first available option
                    // to make it clear the user is now in manual selection mode.
                    setTechStack(Object.values(TechStack)[0]);
                    setDeploymentTarget(Object.values(DeploymentTarget)[0]);
                } else if (selected.id !== 'import') {
                    // For pre-defined templates, use their settings.
                    setTechStack(selected.techStack);
                    setDeploymentTarget(selected.deploymentTarget);
                }
            }
            
            if (selectedTemplateId !== 'import') {
                setGeneratedYaml('');
                setRequiredVariables([]);
                setRequiredSecrets([]);
                setVariableValues({});
                setSecretValues({});
            }
            setGenerationError(null);
            setIsCommitting(false);
            setCommitProgress(initialCommitProgress);
        }
    }, [selectedTemplateId, mode]);
    
    useEffect(() => {
        if (mode === 'edit') {
            const loadExistingConfig = async () => {
                setIsInitialLoading(true);
                setGenerationError(null);
                try {
                    const { yaml, path, variables, secrets } = await getWorkflowConfiguration(token, repo.owner.login, repo.name);
                    setGeneratedYaml(yaml);
                    setWorkflowFilePath(path);

                    const formattedVariables = variables.map(v => ({
                        name: v.name,
                        description: v.description,
                        defaultValue: v.value,
                    }));
                    setRequiredVariables(formattedVariables);

                    const initialVarValues: Record<string, string> = {};
                    variables.forEach(v => { initialVarValues[v.name] = v.value; });
                    setVariableValues(initialVarValues);
                    
                    setRequiredSecrets(secrets);
                    setSecretValues({});

                } catch (error) {
                    if (error instanceof Error) {
                        setGenerationError(`Failed to load existing configuration: ${error.message}`);
                    } else {
                        setGenerationError("An unknown error occurred while loading the configuration.");
                    }
                } finally {
                    setIsInitialLoading(false);
                }
            };
            loadExistingConfig();
        }
    }, [mode, repo, token]);


  // This effect checks if all setup steps are successfully completed.
  useEffect(() => {
    if (!isCommitting) return;

    const allStepsSuccessful =
      commitProgress.workflowFile === 'success' &&
      (requiredVariables.length > 0 ? commitProgress.variables === 'success' : true) &&
      (Object.keys(secretValues).filter(key => secretValues[key]).length > 0 ? commitProgress.secrets === 'success' : true);

    if (allStepsSuccessful) {
      setCommitError(null);
      onPipelineConfigured(repo.id);
      setTimeout(() => {
        onClose();
      }, 1500);
    }
  }, [commitProgress, isCommitting, requiredVariables.length, secretValues, repo.id, onPipelineConfigured, onClose]);

  const handleCronChange = (index: number, value: string) => {
    const newCrons = [...scheduleConfig.crons];
    newCrons[index] = value;
    setScheduleConfig(prev => ({ ...prev, crons: newCrons }));
  };

  const addCron = () => {
    setScheduleConfig(prev => ({ ...prev, crons: [...prev.crons, ''] }));
  };

  const removeCron = (index: number) => {
    setScheduleConfig(prev => ({ ...prev, crons: prev.crons.filter((_, i) => i !== index) }));
  };


  const handleGenerate = useCallback(async () => {
    setIsLoading(true);
    setGeneratedYaml('');
    setRequiredVariables([]);
    setRequiredSecrets([]);
    setVariableValues({});
    setSecretValues({});
    setVisibleSecrets({});
    setGenerationError(null);
    setLoadingMessage("Analyzing repository structure...");

    try {
        const analysis = await analyzeRepository(token, repo.owner.login, repo.name, repo.default_branch);

        const loadingMessages = [
            "Contacting AI DevOps expert...",
            "Reviewing repository analysis...",
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

        const triggersPayload: AdvancedTriggers = {
          push: {
            enabled: pushConfig.enabled,
            branches: pushConfig.branches.split(',').map(b => b.trim()).filter(Boolean),
            branchesIgnore: pushConfig.branchesIgnore.split(',').map(b => b.trim()).filter(Boolean),
          },
          pullRequest: {
            enabled: pullRequestConfig.enabled,
            branches: pullRequestConfig.branches.split(',').map(b => b.trim()).filter(Boolean),
            branchesIgnore: pullRequestConfig.branchesIgnore.split(',').map(b => b.trim()).filter(Boolean),
          },
          schedule: {
            enabled: scheduleConfig.enabled,
            crons: scheduleConfig.crons.filter(Boolean),
          },
        };

        const { yaml, variables, secrets } = await generateWorkflow(techStack, deploymentTarget, deploymentEnvironment, repo.name, triggersPayload, analysis);
        setGeneratedYaml(yaml);
        setRequiredVariables(variables);
        setRequiredSecrets(secrets);
    } catch (error) {
        let displayMessage = "An unknown error occurred during workflow generation. Please check the browser console for more details.";
        if (error instanceof Error) {
            const lowerCaseError = error.message.toLowerCase();
            if (lowerCaseError.includes('api_key')) {
                displayMessage = "AI generation failed due to a server configuration error. The API key may be missing or invalid. Please contact the administrator.";
            } else if (lowerCaseError.includes('safety filter') || lowerCaseError.includes('blocked')) {
                displayMessage = "The request was blocked by the AI's safety filters. This can happen if the generated content contains sensitive keywords. Please try adjusting your configuration.";
            } else if (lowerCaseError.includes('malformed') || lowerCaseError.includes('could not be processed')) {
                displayMessage = "The AI model returned a malformed response that couldn't be understood. This might be a temporary issue. Please try generating the workflow again.";
            } else if (lowerCaseError.includes('timeout')) {
                displayMessage = "The request to the AI model timed out as it took longer than 30 seconds. The service may be under heavy load. Please wait a moment and try again.";
            } else {
                // Use the original error message if it's not one of the specific cases, but provide context.
                displayMessage = `An unexpected error occurred: ${error.message}`;
            }
        }
        
        setGenerationError(displayMessage);
        console.error("Workflow generation failed:", error);
    } finally {
        setIsLoading(false);
        if (loadingIntervalRef.current) {
            clearInterval(loadingIntervalRef.current);
            loadingIntervalRef.current = null;
        }
    }
  }, [techStack, deploymentTarget, deploymentEnvironment, repo, token, pushConfig, pullRequestConfig, scheduleConfig]);
  
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
    let fileName: string;
    if (workflowFilePath) {
        fileName = workflowFilePath.split('/').pop() || 'autoflow-workflow.yml';
    } else {
        fileName = `${repo.name.replace(/[^a-zA-Z0-9-]/g, '-')}-autoflow-${deploymentEnvironment.toLowerCase()}.yml`;
    }
    const commitMessage = `ci: ${mode === 'edit' ? 'Update' : 'Add'} AutoFlow workflow for ${repo.name} (${deploymentEnvironment})`;
    await createWorkflowFile(token, repo.owner.login, repo.name, repo.default_branch, fileName, generatedYaml, commitMessage);
  }, [token, repo, deploymentEnvironment, generatedYaml, mode, workflowFilePath]);

  const executeVariablesStep = useCallback(async () => {
      const variablePromises = Object.entries(variableValues).map(([name, value]) => {
          if (value) { // GitHub variables cannot be empty strings
              return setRepositoryVariable(token, repo.owner.login, repo.name, name, value);
          }
          return Promise.resolve();
      });
      await Promise.all(variablePromises);
  }, [token, repo, variableValues]);

  const executeSecretsStep = useCallback(async () => {
      const secretPromises = Object.entries(secretValues).map(([name, value]) => {
          if (value) { // Only update secrets if a new value is provided
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
    
    setCommitProgress(prev => {
      const next = { ...prev };
      for (let i = startIndex; i < steps.length; i++) {
        next[steps[i]] = 'pending';
      }
      return next;
    });

    for (let i = startIndex; i < steps.length; i++) {
      const step = steps[i];

      const activeSecretsToSet = Object.keys(secretValues).filter(key => secretValues[key]).length > 0;
      if ((step === 'variables' && requiredVariables.length === 0) || (step === 'secrets' && !activeSecretsToSet)) {
        setCommitProgress(prev => ({ ...prev, [step]: 'success' }));
        continue;
      }

      try {
        setCommitProgress(prev => ({ ...prev, [step]: 'in-progress' }));
        await stepExecutors[step]();
        setCommitProgress(prev => ({ ...prev, [step]: 'success' }));
      } catch (error) {
        if (error instanceof Error) {
            setCommitError(error.message);
        } else {
            setCommitError(`An unknown error occurred during the '${step}' step.`);
        }
        setCommitProgress(prev => ({ ...prev, [step]: 'error' }));
        return;
      }
    }
  }, [executeWorkflowFileStep, executeVariablesStep, executeSecretsStep, requiredVariables.length, secretValues]);

  const handleConfirmSetup = useCallback(() => {
    setIsCommitting(true);
    setCommitProgress(initialCommitProgress);
    runSteps('workflowFile');
  }, [runSteps]);
  
  const handleRetry = useCallback((step: keyof CommitProgress) => {
    runSteps(step);
  }, [runSteps]);

  const parseYamlForVariablesAndSecrets = (yamlContent: string) => {
    const secretRegex = /\${{\s*secrets\.([A-Z0-9_]+)\s*}}/g;
    const varRegex = /\${{\s*vars\.([A-Z0-9_]+)\s*}}/g;

    const foundSecretNames = new Set<string>();
    const foundVarNames = new Set<string>();

    let match;
    while ((match = secretRegex.exec(yamlContent)) !== null) {
        // Avoid adding built-in secrets like GITHUB_TOKEN
        if (match[1] !== 'GITHUB_TOKEN') {
            foundSecretNames.add(match[1]);
        }
    }

    while ((match = varRegex.exec(yamlContent)) !== null) {
        foundVarNames.add(match[1]);
    }

    const secrets: RequiredSecret[] = Array.from(foundSecretNames).map(name => ({
        name,
        description: 'Secret detected from imported workflow file.',
    }));

    const variables: RequiredVariable[] = Array.from(foundVarNames).map(name => ({
        name,
        description: 'Variable detected from imported workflow file.',
        defaultValue: '',
    }));

    return { secrets, variables };
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const content = e.target?.result as string;
        if (content) {
            setGeneratedYaml(content);
            const { secrets, variables } = parseYamlForVariablesAndSecrets(content);
            setRequiredSecrets(secrets);
            setRequiredVariables(variables);
            setGenerationError(null);
        } else {
            setGenerationError("Could not read the selected file. It might be empty or corrupted.");
        }
    };
    reader.onerror = () => {
        setGenerationError("An error occurred while reading the file.");
    };
    reader.readAsText(file);
  };
  
  const handleTemplateClick = (templateId: string) => {
    if (templateId === 'import') {
        fileInputRef.current?.click();
    }
    setSelectedTemplateId(templateId);
  };

  const targetBranch = deploymentEnvironment === DeploymentEnvironment.Production ? 'main' : 'staging';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50">
      <div className="bg-light-surface dark:bg-brand-surface rounded-xl shadow-2xl w-full max-w-3xl transform transition-all animate-scale-up border border-gray-200 dark:border-gray-700">
        <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".yml,.yaml"
            className="hidden"
            aria-hidden="true"
        />
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{mode === 'edit' ? 'Edit Pipeline' : 'Configure Pipeline'}</h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">For repository: <span className="font-semibold text-brand-primary">{repo.full_name}</span></p>
        </div>
        
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
         {isInitialLoading ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
                <LogoIcon className="w-16 h-16 text-gray-800 dark:text-gray-200 animate-rocket-float" />
                <p className="mt-4 text-gray-600 dark:text-gray-400">Loading existing workflow configuration...</p>
            </div>
          ) : (
            <>
              {(mode === 'create' && !generatedYaml) && (
                 <>
                  <fieldset className="p-4 border border-gray-300 dark:border-gray-700 rounded-lg">
                    <legend className="text-sm font-medium text-gray-700 dark:text-gray-300 px-2">Choose a Method</legend>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                        {templates.map(template => (
                            <button
                                key={template.id}
                                onClick={() => handleTemplateClick(template.id)}
                                className={`p-3 text-left rounded-lg transition-all duration-200 flex flex-col justify-between h-full ${selectedTemplateId === template.id 
                                    ? 'ring-2 ring-brand-primary bg-brand-primary/10 dark:bg-brand-primary/20' 
                                    : 'ring-1 ring-gray-300 dark:ring-gray-600 hover:ring-brand-secondary dark:hover:ring-brand-secondary bg-gray-50/50 dark:bg-gray-800/50'
                                }`}
                            >
                                <div>
                                    <div className="flex items-center space-x-2">
                                        <template.icon className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                                        <span className="font-semibold text-sm text-gray-800 dark:text-gray-200">{template.name}</span>
                                    </div>
                                    <span className="text-xs text-gray-500 dark:text-gray-400 mt-1 block">{template.description}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                  </fieldset>
                  
                  {selectedTemplateId !== 'import' && (
                    <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {selectedTemplateId === 'custom' && (
                            <>
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
                            </>
                        )}
                        <div className={selectedTemplateId === 'custom' ? '' : 'col-start-1'}>
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

                    <fieldset className="p-4 border border-gray-300 dark:border-gray-700 rounded-lg">
                        <legend className="text-sm font-medium text-gray-700 dark:text-gray-300 px-2">Workflow Triggers</legend>
                        <div className="pt-2 space-y-4">
                            {/* Push Trigger */}
                            <div>
                                <div className="flex items-center">
                                    <input id="trigger-push" type="checkbox" checked={pushConfig.enabled} onChange={e => setPushConfig(p => ({ ...p, enabled: e.target.checked }))} className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-brand-primary focus:ring-brand-secondary bg-gray-100 dark:bg-gray-900" />
                                    <label htmlFor="trigger-push" className="ml-3 text-sm text-gray-800 dark:text-gray-300">
                                        On push to branches
                                    </label>
                                </div>
                                {pushConfig.enabled && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 mt-2 pl-7 text-xs">
                                        <input type="text" value={pushConfig.branches} onChange={e => setPushConfig(p => ({ ...p, branches: e.target.value }))} className="w-full font-mono bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-200 rounded-lg focus:ring-brand-primary focus:border-brand-primary block p-2 placeholder-gray-400 dark:placeholder-gray-500" placeholder={`e.g., ${targetBranch}, feature/*`} />
                                        <input type="text" value={pushConfig.branchesIgnore} onChange={e => setPushConfig(p => ({ ...p, branchesIgnore: e.target.value }))} className="w-full font-mono bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-200 rounded-lg focus:ring-brand-primary focus:border-brand-primary block p-2 placeholder-gray-400 dark:placeholder-gray-500" placeholder="Branches to ignore, e.g., docs/*" />
                                    </div>
                                )}
                            </div>
                            {/* Pull Request Trigger */}
                            <div>
                                <div className="flex items-center">
                                    <input id="trigger-pr" type="checkbox" checked={pullRequestConfig.enabled} onChange={e => setPullRequestConfig(p => ({ ...p, enabled: e.target.checked }))} className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-brand-primary focus:ring-brand-secondary bg-gray-100 dark:bg-gray-900" />
                                    <label htmlFor="trigger-pr" className="ml-3 text-sm text-gray-800 dark:text-gray-300">
                                        On pull request to branches
                                    </label>
                                </div>
                                {pullRequestConfig.enabled && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 mt-2 pl-7 text-xs">
                                    <input type="text" value={pullRequestConfig.branches} onChange={e => setPullRequestConfig(p => ({ ...p, branches: e.target.value }))} className="w-full font-mono bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-200 rounded-lg focus:ring-brand-primary focus:border-brand-primary block p-2 placeholder-gray-400 dark:placeholder-gray-500" placeholder={`e.g., ${targetBranch}`} />
                                    <input type="text" value={pullRequestConfig.branchesIgnore} onChange={e => setPullRequestConfig(p => ({ ...p, branchesIgnore: e.target.value }))} className="w-full font-mono bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-200 rounded-lg focus:ring-brand-primary focus:border-brand-primary block p-2 placeholder-gray-400 dark:placeholder-gray-500" placeholder="Branches to ignore" />
                                    </div>
                                )}
                            </div>
                            {/* Schedule Trigger */}
                            <div>
                                <div className="flex items-center">
                                    <input id="trigger-schedule" type="checkbox" checked={scheduleConfig.enabled} onChange={e => setScheduleConfig(p => ({...p, enabled: e.target.checked}))} className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-brand-primary focus:ring-brand-secondary bg-gray-100 dark:bg-gray-900" />
                                    <label htmlFor="trigger-schedule" className="ml-3 text-sm text-gray-800 dark:text-gray-300">On a schedule (cron syntax)</label>
                                </div>
                                {scheduleConfig.enabled && (
                                    <div className="mt-2 pl-7 space-y-2">
                                        {scheduleConfig.crons.map((cron, index) => (
                                            <div key={index} className="flex items-center gap-2">
                                                <input type="text" value={cron} onChange={e => handleCronChange(index, e.target.value)} className="flex-grow font-mono bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-200 text-sm rounded-lg focus:ring-brand-primary focus:border-brand-primary block p-2 placeholder-gray-400" placeholder="e.g., '0 8 * * 1-5'" />
                                                {scheduleConfig.crons.length > 1 && (
                                                    <button onClick={() => removeCron(index)} className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-full" aria-label="Remove schedule"><XIcon className="h-4 w-4" /></button>
                                                )}
                                            </div>
                                        ))}
                                        <div className="flex items-center justify-between">
                                        <button onClick={addCron} className="text-xs text-brand-secondary hover:underline font-semibold">+ Add another schedule</button>
                                        <a href="https://crontab.guru/" target="_blank" rel="noopener noreferrer" className="text-xs text-brand-secondary hover:underline whitespace-nowrap">
                                            cron help
                                        </a>
                                    </div>
                                    </div>
                                )}
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
                    </>
                  )}
                 </>
              )}

              {isLoading && mode === 'create' && (
                <div className="flex flex-col items-center justify-center p-8 text-center">
                    <LogoIcon className="w-16 h-16 text-gray-800 dark:text-gray-200 animate-rocket-float" />
                    <p className="mt-4 text-gray-600 dark:text-gray-400">{loadingMessage}</p>
                </div>
              )}

              {generationError && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-500 dark:text-red-400 text-sm">
                    <p className="font-bold">{mode === 'edit' ? 'Loading Failed' : 'Generation Failed'}</p>
                    <p className="mt-1">{generationError}</p>
                </div>
              )}

              {(generatedYaml && !isInitialLoading) && (
                <>
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
                        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex justify-between items-center">
                            <span>Generated Workflow</span>
                            <span className="text-xs font-normal text-gray-500 dark:text-gray-400">You can edit the YAML below before committing.</span>
                        </h3>
                        <div className="relative">
                            <button
                                onClick={copyToClipboard}
                                className="absolute top-2 right-2 z-10 p-1.5 bg-gray-300/80 dark:bg-gray-700/80 backdrop-blur-sm hover:bg-gray-400 dark:hover:bg-gray-600 rounded-md text-gray-700 dark:text-gray-300"
                                title="Copy to clipboard"
                            >
                                {isCopied ? <ClipboardCheckIcon className="h-5 w-5 text-green-500" /> : <ClipboardIcon className="h-5 w-5" />}
                            </button>
                            <div className="yaml-editor-container border border-gray-300 dark:border-gray-700 focus-within:ring-2 focus-within:ring-brand-primary">
                                <Editor
                                    value={generatedYaml}
                                    onValueChange={setGeneratedYaml}
                                    highlight={highlightWithLineNumbers}
                                    padding={10}
                                    style={{
                                        fontFamily: '"Fira Code", "Courier New", Courier, monospace',
                                        fontSize: 14,
                                        lineHeight: 1.5,
                                    }}
                                    aria-label="Generated workflow YAML content"
                                    spellCheck="false"
                                    className="yaml-editor"
                                />
                            </div>
                        </div>
                    </div>
                  )}
                </>
              )}
            </>
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
                    {Object.keys(secretValues).filter(key => secretValues[key]).length > 0 && 
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
              disabled={!generatedYaml || isInitialLoading}
              className="py-2 px-4 bg-status-success text-white rounded-lg hover:bg-green-700 transition disabled:bg-gray-400 dark:disabled:bg-gray-500 disabled:cursor-not-allowed min-w-[150px] flex items-center justify-center font-semibold"
            >
              {mode === 'edit' ? 'Update Configuration' : 'Confirm Setup'}
            </button>
          )}

        </div>
      </div>
    </div>
  );
};

export default PipelineConfigurator;