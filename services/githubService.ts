import { User, Repository, Deployment, DeploymentStatus, DeploymentStatusPayload } from '../types';

const GITHUB_API_BASE = 'https://api.github.com';

// libsodium is loaded globally from a script tag in index.html
declare const libsodium: any;

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
  
  if (response.status === 204 || response.status === 201) { // No Content or Created
      return null as T;
  }

  return response.json();
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
        // Re-throw other errors
        console.error(`Error checking for workflows in ${owner}/${repo}:`, error);
        return false;
    }
}

// Function to get deployments for a specific repository
export const getDeploymentsForRepo = async (token:string, owner: string, repo: string): Promise<(Deployment & { status: DeploymentStatus, duration: string })[]> => {
    const deployments = await githubApiRequest<Deployment[]>(`/repos/${owner}/${repo}/deployments`, token);

    // Get the latest status for each deployment
    const deploymentsWithStatus = await Promise.all(
        deployments.map(async (dep) => {
            const statuses = await githubApiRequest<DeploymentStatusPayload[]>(dep.statuses_url, token);
            const latestStatus = statuses.length > 0 ? statuses[0].state : DeploymentStatus.Pending;
            
            const durationMs = new Date(dep.updated_at).getTime() - new Date(dep.created_at).getTime();
            const durationSec = Math.floor(durationMs / 1000);
            const durationMin = Math.floor(durationSec / 60);

            const duration = latestStatus === DeploymentStatus.InProgress ? '...' : `${durationMin}m ${durationSec % 60}s`;

            return { ...dep, status: latestStatus, duration };
        })
    );
    return deploymentsWithStatus;
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
    // Note: Creating a variable that already exists will update its value.
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

    await libsodium.ready;

    // Convert the secret and key to Uint8Array
    const secretBytes = libsodium.utils.decode_utf8(value);
    const publicKeyBytes = libsodium.utils.decode_base64(publicKey);

    // Encrypt the secret using libsodium
    const encryptedBytes = libsodium.crypto_box_seal(secretBytes, publicKeyBytes);

    // Convert the encrypted Uint8Array to a base64 string
    const encryptedValue = libsodium.utils.encode_base64(encryptedBytes);

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