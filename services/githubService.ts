import { User, Repository, Deployment, DeploymentStatus, DeploymentStatusPayload, WorkflowRunStatus, RequiredVariable, RequiredSecret, RepoAnalysisResult } from '../types';
import { API_ENDPOINT_ENCRYPT_SECRET } from '../constants';

const GITHUB_API_BASE = 'https://api.github.com';

// Helper function to handle API requests
async function githubApiRequest<T>(endpoint: string, token: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers({
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...options.headers,
  });

  // Handle both full URLs (like those from API responses) and relative endpoints
  const url = endpoint.startsWith('https://') ? endpoint : `${GITHUB_API_BASE}${endpoint}`;

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'An unknown error occurred' }));
    throw new Error(`GitHub API Error: ${response.status} ${response.statusText} - ${errorData.message || 'Check repository permissions and token scopes.'}`);
  }
  
  // Handle 202 Accepted for cancellation request
  if (response.status === 202 || response.status === 204 || response.status === 201) { // Accepted, No Content or Created
      return null as T;
  }

  return response.json();
}

// Helper to get file content, returns null if not found
async function getFileContent(token: string, owner: string, repo: string, path: string): Promise<string | null> {
    try {
        const response = await githubApiRequest<{ content: string, encoding: string }>(`/repos/${owner}/${repo}/contents/${path}`, token);
        if (response.encoding === 'base64') {
            return decodeURIComponent(escape(atob(response.content)));
        }
        return response.content;
    } catch (error) {
        if (error instanceof Error && error.message.includes('404')) {
            return null; // File not found, which is a valid scenario
        }
        console.error(`Error fetching file content for ${path}:`, error);
        throw error; // Re-throw other errors
    }
}

// Function to get the authenticated user's data
export const getUser = (token: string): Promise<User> => {
  return githubApiRequest<User>('/user', token);
};

// Function to get the user's repositories
export const getRepos = (token: string): Promise<Repository[]> => {
  // Fetches up to 100 repos, sorted by last push. For more, pagination would be needed.
  return githubApiRequest<Repository[]>('/user/repos?sort=pushed&per_page=100', token);
};


// Function to check if a repo has a .github/workflows directory
export const hasWorkflows = async (token: string, owner: string, repo: string): Promise<boolean> => {
    try {
        await githubApiRequest(`/repos/${owner}/${repo}/contents/.github/workflows`, token);
        return true;
    } catch (error) {
        // A 404 error means the directory doesn't exist, which is expected.
        if (error instanceof Error && error.message.includes('404')) {
            return false;
        }
        // Re-throw other errors so the caller can handle them.
        throw error;
    }
}

// Interface for the GitHub API response for a workflow run
interface GitHubWorkflowRun {
    id: number;
    status: 'queued' | 'in_progress' | 'completed';
    conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null;
    html_url: string;
}

// Function to get the latest workflow run for a repository
export const getLatestWorkflowRun = async (
    token: string,
    owner: string,
    repo: string
): Promise<{ status: WorkflowRunStatus; url: string; runId: number } | null> => {
    try {
        const response = await githubApiRequest<{ workflow_runs: GitHubWorkflowRun[] }>(
            `/repos/${owner}/${repo}/actions/runs?per_page=1`,
            token
        );

        if (!response.workflow_runs || response.workflow_runs.length === 0) {
            return null;
        }

        const latestRun = response.workflow_runs[0];
        
        let status: WorkflowRunStatus;
        
        if (latestRun.status === 'in_progress') {
            status = WorkflowRunStatus.InProgress;
        } else if (latestRun.status === 'queued') {
            status = WorkflowRunStatus.Queued;
        } else if (latestRun.status === 'completed') {
            switch (latestRun.conclusion) {
                case 'success': status = WorkflowRunStatus.Success; break;
                case 'failure': status = WorkflowRunStatus.Failure; break;
                case 'cancelled': status = WorkflowRunStatus.Cancelled; break;
                case 'skipped': status = WorkflowRunStatus.Skipped; break;
                case 'timed_out': status = WorkflowRunStatus.TimedOut; break;
                case 'neutral': status = WorkflowRunStatus.Neutral; break;
                case 'action_required': status = WorkflowRunStatus.ActionRequired; break;
                default: status = WorkflowRunStatus.Completed; break;
            }
        } else {
            status = WorkflowRunStatus.Unknown;
        }

        return {
            status,
            url: latestRun.html_url,
            runId: latestRun.id,
        };
    } catch (error) {
        if (!(error instanceof Error && error.message.includes('404'))) {
             console.error(`Could not fetch workflow runs for ${owner}/${repo}:`, error);
        }
        return null;
    }
};

// Function to get deployments for a specific repository
export const getDeploymentsForRepo = async (token:string, owner: string, repo: string): Promise<Deployment[]> => {
    const deploymentsData = await githubApiRequest<Omit<Deployment, 'status'|'duration'|'runId'>[]>(`/repos/${owner}/${repo}/deployments`, token);
    const deployments: Deployment[] = deploymentsData;

    // Get the latest status for each deployment and try to find its workflow run ID
    const deploymentPromises = deployments.map(async (dep) => {
        try {
            const statuses = await githubApiRequest<DeploymentStatusPayload[]>(dep.statuses_url, token);
            const latestStatus = statuses.length > 0 ? statuses[0].state : DeploymentStatus.Pending;
            
            const durationMs = new Date(dep.updated_at).getTime() - new Date(dep.created_at).getTime();
            const durationSec = Math.floor(durationMs / 1000);
            const durationMin = Math.floor(durationSec / 60);
            const duration = latestStatus === DeploymentStatus.InProgress ? '...' : `${durationMin}m ${durationSec % 60}s`;

            let runId: number | undefined;
            // Try to associate the deployment with a workflow run via its commit SHA
            if (dep.sha) {
                 try {
                    const runsResponse = await githubApiRequest<{ workflow_runs: GitHubWorkflowRun[] }>(`/repos/${owner}/${repo}/actions/runs?head_sha=${dep.sha}&per_page=1`, token);
                    if (runsResponse.workflow_runs.length > 0) {
                        runId = runsResponse.workflow_runs[0].id;
                    }
                 } catch (e) {
                    console.warn(`Could not find workflow run for SHA ${dep.sha}`, e);
                 }
            }

            return { ...dep, status: latestStatus, duration, runId };
        } catch (error) {
            console.error(`Failed to process deployment ID ${dep.id} for repo ${owner}/${repo}:`, error);
            // Return null for this deployment so Promise.all doesn't reject, allowing other deployments to load.
            return null;
        }
    });

    const deploymentsWithStatus = await Promise.all(deploymentPromises);

    // Filter out any deployments that failed to process.
    return deploymentsWithStatus.filter(d => d !== null) as Deployment[];
}


// Function to create or update a workflow file in a repository
export const createWorkflowFile = async (
    token: string,
    owner: string,
    repo: string,
    branch: string,
    fileName: string,
    content: string,
    commitMessage: string
): Promise<void> => {
    const path = `.github/workflows/${fileName}`;
    // Use a robust method to handle potential UTF-8 characters in the workflow content.
    const encodedContent = btoa(unescape(encodeURIComponent(content)));

    const body: {
        message: string;
        content: string;
        branch: string;
        sha?: string;
    } = {
        message: commitMessage,
        content: encodedContent,
        branch: branch,
    };

    // To update a file, you must provide its SHA.
    // First, try to get the existing file's SHA.
    try {
        const existingFile = await githubApiRequest<{ sha: string }>(`/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, token);
        if (existingFile && existingFile.sha) {
            body.sha = existingFile.sha;
        }
    } catch (error) {
        // A 404 error is expected if the file doesn't exist yet.
        // We can ignore it and proceed with creating the file.
        if (!(error instanceof Error && error.message.includes('404'))) {
            // Re-throw any other unexpected errors.
            throw error;
        }
    }

    // This endpoint creates a new file or replaces an existing one (if SHA is provided).
    await githubApiRequest(`/repos/${owner}/${repo}/contents/${path}`, token, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
};

// Function to set a repository-level GitHub Actions variable
export const setRepositoryVariable = async (
    token: string,
    owner: string,
    repo: string,
    variableName: string,
    value: string
): Promise<void> => {
    try {
        // First, try to update the variable. This handles re-configurations.
        await githubApiRequest(`/repos/${owner}/${repo}/actions/variables/${variableName}`, token, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: variableName,
                value: value,
            }),
        });
    } catch (error) {
        // If the update fails with a 404, it means the variable doesn't exist, so create it.
        if (error instanceof Error && error.message.includes('404')) {
            await githubApiRequest(`/repos/${owner}/${repo}/actions/variables`, token, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: variableName,
                    value: value,
                }),
            });
        } else {
            // Re-throw any other unexpected errors.
            throw error;
        }
    }
};

// Function to get a repository's public key for encrypting secrets
export const getRepositoryPublicKey = (
    token: string,
    owner: string,
    repo: string
): Promise<{ key_id: string; key: string }> => {
    return githubApiRequest<{ key_id: string; key: string }>(`/repos/${owner}/${repo}/actions/secrets/public-key`, token);
};

// Function to create or update a repository-level GitHub Actions secret
export const setRepositorySecret = async (
    token: string,
    owner: string,
    repo: string,
    secretName: string,
    value: string
): Promise<void> => {
    if (!value) {
        // Don't set empty secrets
        return;
    }

    const { key_id, key: publicKey } = await getRepositoryPublicKey(token, owner, repo);

    // Encryption is now done on the server-side to avoid client-side crypto issues.
    const response = await fetch(API_ENDPOINT_ENCRYPT_SECRET, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            publicKey: publicKey,
            valueToEncrypt: value,
        }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "An unknown error occurred during encryption." }));
        throw new Error(`Failed to encrypt secret: ${errorData.error}`);
    }

    const { encryptedValue } = await response.json();

    await githubApiRequest(`/repos/${owner}/${repo}/actions/secrets/${secretName}`, token, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            encrypted_value: encryptedValue,
            key_id: key_id,
        }),
    });
};


// Function to re-run an entire workflow
export const rerunWorkflow = (
    token: string,
    owner: string,
    repo: string,
    runId: number
): Promise<void> => {
    return githubApiRequest(
        `/repos/${owner}/${repo}/actions/runs/${runId}/rerun`,
        token,
        { method: 'POST' }
    );
};

// Function to re-run only the failed jobs in a workflow
export const rerunFailedJobs = (
    token: string,
    owner: string,
    repo: string,
    runId: number
): Promise<void> => {
    return githubApiRequest(
        `/repos/${owner}/${repo}/actions/runs/${runId}/rerun-failed-jobs`,
        token,
        { method: 'POST' }
    );
};

// Function to cancel a workflow run
export const cancelWorkflowRun = (
    token: string,
    owner: string,
    repo: string,
    runId: number
): Promise<void> => {
    return githubApiRequest(
        `/repos/${owner}/${repo}/actions/runs/${runId}/cancel`,
        token,
        { method: 'POST' }
    );
};


interface GitHubWorkflow {
  id: number;
  name: string;
  path: string;
  state: string;
}

// Interfaces for fetching existing variables and secrets
interface RepoVariable {
    name: string;
    value: string;
}
interface RepoSecret {
    name: string;
}

export const getWorkflowConfiguration = async (token: string, owner: string, repo: string): Promise<{
    yaml: string;
    path: string;
    variables: (RequiredVariable & { value: string })[];
    secrets: RequiredSecret[];
}> => {
    // 1. Find the AutoFlow workflow file
    const { workflows } = await githubApiRequest<{ workflows: GitHubWorkflow[] }>(`/repos/${owner}/${repo}/actions/workflows`, token);
    const autoFlowWorkflow = workflows.find(wf => wf.path.includes('autoflow'));

    if (!autoFlowWorkflow) {
        throw new Error("No AutoFlow-managed workflow found in this repository.");
    }
    const path = autoFlowWorkflow.path;

    // 2. Get the content of the workflow file
    const fileContentResponse = await githubApiRequest<{ content: string, encoding: string }>(`/repos/${owner}/${repo}/contents/${path}`, token);
    const yaml = fileContentResponse.encoding === 'base64'
        ? decodeURIComponent(escape(atob(fileContentResponse.content)))
        : fileContentResponse.content;

    // 3. Get repository variables
    const { variables: repoVariables } = await githubApiRequest<{ variables: RepoVariable[] }>(`/repos/${owner}/${repo}/actions/variables?per_page=100`, token);
    const variables = repoVariables.map(v => ({
        name: v.name,
        value: v.value,
        description: `Repository variable.`,
        defaultValue: v.value,
    }));

    // 4. Get repository secrets
    const { secrets: repoSecrets } = await githubApiRequest<{ secrets: RepoSecret[] }>(`/repos/${owner}/${repo}/actions/secrets?per_page=100`, token);
    const secrets = repoSecrets.map(s => ({
        name: s.name,
        description: `Repository secret. Provide a new value to update it, or leave blank to keep it unchanged.`,
    }));

    return { yaml, path, variables, secrets };
};


// Function to trigger a new deployment via workflow_dispatch
export const triggerRedeployment = async (
    token: string,
    owner: string,
    repo: string,
    branch: string
): Promise<void> => {
    // 1. List workflows to find one managed by AutoFlow
    const { workflows } = await githubApiRequest<{ workflows: GitHubWorkflow[] }>(
        `/repos/${owner}/${repo}/actions/workflows`,
        token
    );
    
    if (!workflows || workflows.length === 0) {
        throw new Error("No workflows found for this repository.");
    }

    // 2. Find the AutoFlow workflow by a keyword in its path
    const autoFlowWorkflow = workflows.find(wf => wf.path.includes('autoflow'));

    if (!autoFlowWorkflow) {
        throw new Error("Could not find a workflow managed by AutoFlow. Please configure a pipeline first.");
    }

    // 3. Trigger the workflow dispatch event on the specified branch
    await githubApiRequest(
        `/repos/${owner}/${repo}/actions/workflows/${autoFlowWorkflow.id}/dispatches`,
        token,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ref: branch }),
        }
    );
};

export const getWorkflowRunLogs = async (
    token: string,
    owner: string,
    repo: string,
    runId: number
): Promise<string> => {
    try {
        // This endpoint returns a 302 redirect to a temporary URL for the logs zip file.
        // The default `fetch` behavior is to follow this redirect.
        const response = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/actions/runs/${runId}/logs`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'X-GitHub-Api-Version': '2022-11-28',
            }
        });

        if (!response.ok) {
             const errorData = await response.json().catch(() => ({ message: 'Could not parse error from GitHub.' }));
             throw new Error(`GitHub API Error: ${response.status} - ${errorData.message}`);
        }
        
        // IMPORTANT: The response body is a zip archive. Without a client-side zip library,
        // we can't properly parse it. We'll return it as text, which will show the raw
        // zip content. A full implementation would require a library like JSZip to extract
        // individual log files from the archive. For this exercise, we display the raw text
        // to prove the data fetching works.
        const logZipContentAsText = await response.text();
        return logZipContentAsText;

    } catch (error) {
        console.error(`Failed to fetch logs for run ${runId}:`, error);
        throw error;
    }
};

export const analyzeRepository = async (
    token: string,
    owner: string,
    repo: string,
    defaultBranch: string
): Promise<RepoAnalysisResult> => {
    const result: RepoAnalysisResult = {
        packageManager: 'npm', // Default
        nodeVersion: null,
        buildCommand: 'npm run build', // Default
        testCommand: 'npm test', // Default
        installCommand: 'npm ci', // Default
        runCommand: 'npm',
        lockFile: null,
        framework: null,
        keyFiles: [],
    };
    
    // 1. Get root file list to detect lock files
    const rootContents = await githubApiRequest<{ name: string }[]>(`/repos/${owner}/${repo}/contents/?ref=${defaultBranch}`, token);
    const rootFiles = rootContents.map(file => file.name);

    if (rootFiles.includes('yarn.lock')) {
        result.packageManager = 'yarn';
        result.installCommand = 'yarn install --frozen-lockfile';
        result.runCommand = 'yarn';
        result.lockFile = 'yarn.lock';
    } else if (rootFiles.includes('pnpm-lock.yaml')) {
        result.packageManager = 'pnpm';
        result.installCommand = 'pnpm install --frozen-lockfile';
        result.runCommand = 'pnpm';
        result.lockFile = 'pnpm-lock.yaml';
    } else if (rootFiles.includes('package-lock.json')) {
        result.packageManager = 'npm';
        result.installCommand = 'npm ci';
        result.runCommand = 'npm';
        result.lockFile = 'package-lock.json';
    }
    
    // 2. Fetch and analyze key files
    const filesToAnalyze = [
        'package.json',
        '.nvmrc',
        'vite.config.js', 'vite.config.ts',
        'next.config.js',
        'requirements.txt',
    ];
    
    const filePromises = filesToAnalyze.map(path => getFileContent(token, owner, repo, path).then(content => ({ path, content })));
    const fetchedFiles = await Promise.all(filePromises);

    const validFiles = fetchedFiles.filter(f => f.content !== null) as { path: string; content: string }[];
    result.keyFiles = validFiles;

    const packageJsonContent = validFiles.find(f => f.path === 'package.json')?.content;
    if (packageJsonContent) {
        try {
            const packageJson = JSON.parse(packageJsonContent);
            if (packageJson.scripts?.build) {
                result.buildCommand = `${result.runCommand} run build`;
            }
            if (packageJson.scripts?.test) {
                result.testCommand = `${result.runCommand} test`;
            }
            if (packageJson.engines?.node) {
                result.nodeVersion = packageJson.engines.node;
            }
            if (packageJson.dependencies?.next || packageJson.devDependencies?.next) {
                result.framework = 'Next.js';
            } else if (packageJson.dependencies?.vite || packageJson.devDependencies?.vite) {
                result.framework = 'Vite';
            }
        } catch (e) {
            console.error("Failed to parse package.json", e);
        }
    }
    
    const nvmrcContent = validFiles.find(f => f.path === '.nvmrc')?.content;
    if (nvmrcContent) {
        result.nodeVersion = nvmrcContent.trim();
    }
    
    return result;
};