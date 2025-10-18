import React, { useState, useCallback, useEffect } from 'react';
import { Repository, TechStack, DeploymentTarget, DeploymentEnvironment, RequiredVariable, RequiredSecret } from '../types';
import { generateWorkflow, AdvancedTriggers } from '../services/geminiService';
import { createWorkflowFile, setRepositoryVariable, setRepositorySecret, analyzeRepository } from '../services/githubService';
import { 
    CheckCircleIcon, LogoIcon,
    VercelIcon, GitHubIcon, RailwayIcon, HerokuIcon, AWSIcon
} from './icons';

interface WizardProps {
  repos: Repository[];
  token: string;
  onClose: () => void;
  onComplete: (repoId: number) => void;
}

type WizardStep = 'SELECT_REPO' | 'SELECT_TARGET' | 'CONFIGURE' | 'COMMIT' | 'SUCCESS';

const Stepper: React.FC<{ currentStep: WizardStep }> = ({ currentStep }) => {
    const steps: { id: WizardStep, name: string }[] = [
        { id: 'SELECT_REPO', name: 'Select Repo' },
        { id: 'SELECT_TARGET', name: 'Choose Target' },
        { id: 'CONFIGURE', name: 'Configure' },
        { id: 'COMMIT', name: 'Deploy' },
    ];
    const currentIndex = steps.findIndex(s => s.id === currentStep);

    return (
        <nav aria-label="Progress">
            <ol role="list" className="flex items-center">
                {steps.map((step, stepIdx) => (
                    <li key={step.name} className={`relative ${stepIdx !== steps.length - 1 ? 'pr-8 sm:pr-20' : ''}`}>
                        {stepIdx < currentIndex ? (
                            <>
                                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                    <div className="h-0.5 w-full bg-brand-primary" />
                                </div>
                                <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-brand-primary">
                                    <CheckCircleIcon className="h-5 w-5 text-white" aria-hidden="true" />
                                </div>
                            </>
                        ) : stepIdx === currentIndex ? (
                            <>
                                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                    <div className="h-0.5 w-full bg-gray-200 dark:bg-gray-700" />
                                </div>
                                <div className="relative flex h-8 w-8 items-center justify-center rounded-full border-2 border-brand-primary bg-light-surface dark:bg-brand-surface">
                                    <span className="h-2.5 w-2.5 rounded-full bg-brand-primary" aria-hidden="true" />
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                    <div className="h-0.5 w-full bg-gray-200 dark:bg-gray-700" />
                                </div>
                                <div className="relative flex h-8 w-8 items-center justify-center rounded-full border-2 border-gray-300 dark:border-gray-600 bg-light-surface dark:bg-brand-surface" />
                            </>
                        )}
                        <span className="absolute -bottom-6 text-xs font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">{step.name}</span>
                    </li>
                ))}
            </ol>
        </nav>
    );
};


const DeploymentWizard: React.FC<WizardProps> = ({ repos, token, onClose, onComplete }) => {
    const [step, setStep] = useState<WizardStep>('SELECT_REPO');
    
    // Step 1 State
    const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);

    // Step 2 State
    const [selectedTarget, setSelectedTarget] = useState<DeploymentTarget | null>(null);

    // Step 3 State
    const [isGenerating, setIsGenerating] = useState(false);
    const [generationError, setGenerationError] = useState<string | null>(null);
    const [generatedYaml, setGeneratedYaml] = useState('');
    const [requiredVariables, setRequiredVariables] = useState<RequiredVariable[]>([]);
    const [requiredSecrets, setRequiredSecrets] = useState<RequiredSecret[]>([]);
    const [variableValues, setVariableValues] = useState<Record<string, string>>({});

    // For CLI token validation
    const [deploymentToken, setDeploymentToken] = useState('');
    const [isTokenValidating, setIsTokenValidating] = useState(false);
    const [tokenValidationResult, setTokenValidationResult] = useState<'valid' | 'invalid' | null>(null);
    const [tokenValidationError, setTokenValidationError] = useState<string | null>(null);

    // Step 4 State
    const [isCommitting, setIsCommitting] = useState(false);
    const [commitError, setCommitError] = useState<string | null>(null);

    const handleGenerateWorkflow = useCallback(async () => {
        if (!selectedRepo || !selectedTarget) return;

        setIsGenerating(true);
        setGenerationError(null);
        setGeneratedYaml('');
        setRequiredVariables([]);
        setRequiredSecrets([]);

        try {
            const analysis = await analyzeRepository(token, selectedRepo.owner.login, selectedRepo.name, selectedRepo.default_branch);
            
            // For simplicity, this wizard uses a default trigger configuration.
            const defaultTriggers: AdvancedTriggers = {
              push: { enabled: true, branches: [selectedRepo.default_branch], branchesIgnore: [] },
              pullRequest: { enabled: true, branches: [selectedRepo.default_branch], branchesIgnore: [] },
              schedule: { enabled: false, crons: [] },
            };

            const { yaml, variables, secrets } = await generateWorkflow(
                TechStack.React, // Tech stack is detected by AI, this is a placeholder
                selectedTarget,
                DeploymentEnvironment.Production, // Default to production for simplicity
                selectedRepo.name,
                defaultTriggers,
                analysis
            );

            setGeneratedYaml(yaml);
            setRequiredVariables(variables);
            setRequiredSecrets(secrets);

            const initialVarValues: Record<string, string> = {};
            variables.forEach(v => { initialVarValues[v.name] = v.defaultValue || ''; });
            setVariableValues(initialVarValues);

        } catch (error) {
            setGenerationError(error instanceof Error ? error.message : "An unknown error occurred.");
        } finally {
            setIsGenerating(false);
        }
    }, [selectedRepo, selectedTarget, token]);

    useEffect(() => {
        if (step === 'CONFIGURE' && !generatedYaml && !isGenerating) {
            handleGenerateWorkflow();
        }
    }, [step, isGenerating, generatedYaml, handleGenerateWorkflow]);

    const handleValidateToken = useCallback(async () => {
        if (!deploymentToken || !selectedTarget) return;
        
        let command: string;
        if (selectedTarget === DeploymentTarget.Vercel) command = 'vercel projects list';
        else if (selectedTarget === DeploymentTarget.Railway) command = 'railway projects';
        else return;

        setIsTokenValidating(true);
        setTokenValidationResult(null);
        setTokenValidationError(null);
        
        try {
            const response = await fetch('/api/run-cli', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command, token: deploymentToken }),
            });
            const result = await response.json();
            if (!response.ok || result.error) {
                throw new Error(result.output || result.error || 'Validation failed.');
            }
            setTokenValidationResult('valid');
        } catch (err) {
            setTokenValidationResult('invalid');
            setTokenValidationError(err instanceof Error ? err.message : 'An unknown error occurred.');
        } finally {
            setIsTokenValidating(false);
        }
    }, [deploymentToken, selectedTarget]);

    const handleCommit = async () => {
        if (!selectedRepo || !generatedYaml) return;

        setIsCommitting(true);
        setCommitError(null);

        try {
            // 1. Commit workflow file
            const fileName = `${selectedRepo.name.replace(/[^a-zA-Z0-9-]/g, '-')}-autoflow.yml`;
            const commitMessage = `ci: Add AutoFlow workflow for ${selectedRepo.name}`;
            await createWorkflowFile(token, selectedRepo.owner.login, selectedRepo.name, selectedRepo.default_branch, fileName, generatedYaml, commitMessage);
            
            // 2. Set variables
            const varPromises = Object.entries(variableValues)
                .map(([name, value]) => value ? setRepositoryVariable(token, selectedRepo.owner.login, selectedRepo.name, name, value) : Promise.resolve());
            await Promise.all(varPromises);

            // 3. Set secrets (including validated deployment token)
            const allSecrets: Record<string, string> = {};
            const deploymentSecret = requiredSecrets.find(s => s.name.includes('TOKEN'));
            if (deploymentSecret && deploymentToken) {
                allSecrets[deploymentSecret.name] = deploymentToken;
            }

            const secretPromises = Object.entries(allSecrets)
                .map(([name, value]) => value ? setRepositorySecret(token, selectedRepo.owner.login, selectedRepo.name, name, value) : Promise.resolve());
            await Promise.all(secretPromises);

            setStep('SUCCESS');

        } catch (error) {
            setCommitError(error instanceof Error ? error.message : "An unknown error occurred during setup.");
            setStep('CONFIGURE'); // Go back to config step on error
        } finally {
            setIsCommitting(false);
        }
    };
    
    const needsCliValidation = selectedTarget === DeploymentTarget.Vercel || selectedTarget === DeploymentTarget.Railway;
    const canProceedFromConfig = !isGenerating && !generationError && (!needsCliValidation || tokenValidationResult === 'valid');

    const deploymentTargets = [
        { id: DeploymentTarget.Vercel, name: 'Vercel', icon: VercelIcon },
        { id: DeploymentTarget.GitHubPages, name: 'GitHub Pages', icon: GitHubIcon },
        { id: DeploymentTarget.Railway, name: 'Railway', icon: RailwayIcon },
        { id: DeploymentTarget.Heroku, name: 'Heroku', icon: HerokuIcon },
        { id: DeploymentTarget.AWSElasticBeanstalk, name: 'AWS EB', icon: AWSIcon },
    ];

    const renderContent = () => {
        switch (step) {
            case 'SELECT_REPO': return (
                <div>
                    <h3 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Select a Repository</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Choose a repository you have push access to.</p>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                        {repos.map(repo => (
                            <button key={repo.id} onClick={() => setSelectedRepo(repo)} className={`w-full text-left p-3 rounded-lg border transition ${selectedRepo?.id === repo.id ? 'bg-brand-primary/10 border-brand-primary' : 'bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:border-brand-secondary'}`}>
                                {repo.full_name}
                            </button>
                        ))}
                    </div>
                </div>
            );
            case 'SELECT_TARGET': return (
                <div>
                    <h3 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Choose a Deployment Target</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {deploymentTargets.map(target => (
                             <button key={target.id} onClick={() => setSelectedTarget(target.id)} className={`p-4 text-left rounded-lg border transition flex flex-col items-center justify-center space-y-2 ${selectedTarget === target.id ? 'bg-brand-primary/10 border-brand-primary' : 'bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:border-brand-secondary'}`}>
                                <target.icon className="w-8 h-8 text-gray-700 dark:text-gray-300" />
                                <span className="font-semibold text-gray-800 dark:text-gray-200">{target.name}</span>
                            </button>
                        ))}
                    </div>
                </div>
            );
            case 'CONFIGURE': return (
                <div>
                    <h3 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Configure & Validate</h3>
                    {isGenerating && (
                        <div className="flex flex-col items-center justify-center p-8 text-center">
                           <LogoIcon className="w-12 h-12 text-gray-800 dark:text-gray-200 animate-rocket-float" />
                           <p className="mt-4 text-gray-600 dark:text-gray-400">Analyzing repo and generating workflow...</p>
                        </div>
                    )}
                    {generationError && <div className="p-4 bg-red-500/10 text-red-500 dark:text-red-400 rounded-lg">{generationError}</div>}
                    {commitError && <div className="p-4 bg-red-500/10 text-red-500 dark:text-red-400 rounded-lg">{commitError}</div>}
                    {!isGenerating && generatedYaml && (
                        <div className="space-y-4">
                            {requiredVariables.length > 0 && (
                                <fieldset className="p-3 border rounded-lg">
                                    <legend className="px-2 text-sm font-medium">Required Variables</legend>
                                    {requiredVariables.map(v => (
                                        <div key={v.name} className="mb-2">
                                            <label htmlFor={v.name} className="block text-xs font-medium text-gray-700 dark:text-gray-300">{v.name}</label>
                                            <input id={v.name} type="text" value={variableValues[v.name] || ''} onChange={e => setVariableValues(p => ({...p, [v.name]: e.target.value}))} className="w-full text-sm p-2 bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 rounded-md" />
                                        </div>
                                    ))}
                                </fieldset>
                            )}
                            {needsCliValidation && (
                                <fieldset className="p-3 border rounded-lg">
                                    <legend className="px-2 text-sm font-medium">Deployment Credentials</legend>
                                    <label htmlFor="dep-token" className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                                        {selectedTarget} Token
                                    </label>
                                    <div className="flex items-center space-x-2">
                                        <input id="dep-token" type="password" value={deploymentToken} onChange={e => setDeploymentToken(e.target.value)} className="flex-grow text-sm p-2 bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 rounded-md" placeholder="Paste your token here" />
                                        <button onClick={handleValidateToken} disabled={isTokenValidating || !deploymentToken} className="px-3 py-2 text-sm font-semibold text-white bg-gray-600 hover:bg-gray-700 rounded-md disabled:bg-gray-400">
                                            {isTokenValidating ? 'Validating...' : 'Validate'}
                                        </button>
                                    </div>
                                    {tokenValidationResult === 'valid' && <p className="text-xs text-green-600 mt-1">Token is valid!</p>}
                                    {tokenValidationResult === 'invalid' && <p className="text-xs text-red-600 mt-1">Validation Failed: {tokenValidationError}</p>}
                                </fieldset>
                            )}
                        </div>
                    )}
                </div>
            );
            case 'COMMIT': return (
                <div className="flex flex-col items-center justify-center p-8 text-center">
                    <LogoIcon className="w-12 h-12 text-gray-800 dark:text-gray-200 animate-rocket-float" />
                    <p className="mt-4 text-gray-600 dark:text-gray-400">Committing workflow and setting secrets...</p>
                </div>
            );
            case 'SUCCESS': return (
                 <div className="flex flex-col items-center justify-center p-8 text-center">
                    <CheckCircleIcon className="w-16 h-16 text-status-success animate-scale-up" />
                    <h3 className="text-xl font-semibold mt-4 text-gray-900 dark:text-gray-100">Deployment Pipeline Created!</h3>
                    <p className="mt-2 text-gray-600 dark:text-gray-400">
                        The workflow file has been committed to your repository. Your first deployment should start automatically on the next push to your main branch.
                    </p>
                    <a href={`https://github.com/${selectedRepo?.full_name}/actions`} target="_blank" rel="noopener noreferrer" className="mt-4 text-brand-secondary hover:underline">
                        View Actions on GitHub &rarr;
                    </a>
                </div>
            );
        }
    };
    
    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50">
          <div className="bg-light-surface dark:bg-brand-surface rounded-xl shadow-2xl w-full max-w-2xl transform transition-all animate-scale-up border border-gray-200 dark:border-gray-700">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">New Deployment Pipeline</h2>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">A guided setup to get you deploying in minutes.</p>
                </div>
                <button onClick={onClose} disabled={isCommitting} className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white text-3xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-8">
                <Stepper currentStep={step} />
            </div>
            
            <div className="p-6 min-h-[200px]">
                {renderContent()}
            </div>
            
            <div className="px-6 py-4 bg-gray-100 dark:bg-gray-900/50 flex justify-between items-center rounded-b-xl border-t border-gray-200 dark:border-gray-700">
                <button 
                  onClick={() => {
                      if (step === 'SELECT_TARGET') setStep('SELECT_REPO');
                      if (step === 'CONFIGURE') setStep('SELECT_TARGET');
                  }}
                  disabled={step === 'SELECT_REPO' || isCommitting}
                  className="py-2 px-4 bg-gray-600 text-white rounded-lg hover:bg-gray-500 transition disabled:opacity-50"
                >
                    Back
                </button>
                 {step !== 'SUCCESS' ? (
                    <button 
                        onClick={() => {
                            if (step === 'SELECT_REPO') setStep('SELECT_TARGET');
                            if (step === 'SELECT_TARGET') setStep('CONFIGURE');
                            if (step === 'CONFIGURE') {
                                setStep('COMMIT');
                                handleCommit();
                            }
                        }}
                        disabled={
                            (step === 'SELECT_REPO' && !selectedRepo) ||
                            (step === 'SELECT_TARGET' && !selectedTarget) ||
                            (step === 'CONFIGURE' && !canProceedFromConfig) ||
                            isCommitting
                        }
                        className="py-2 px-4 bg-brand-primary text-white rounded-lg hover:bg-brand-dark transition disabled:bg-gray-400 font-semibold"
                    >
                        {step === 'CONFIGURE' ? 'Commit & Deploy' : 'Next'}
                    </button>
                 ) : (
                    <button onClick={() => onComplete(selectedRepo!.id)} className="py-2 px-4 bg-status-success text-white rounded-lg hover:bg-green-700 transition font-semibold">
                        Finish
                    </button>
                 )}
            </div>
          </div>
        </div>
    );
};

export default DeploymentWizard;