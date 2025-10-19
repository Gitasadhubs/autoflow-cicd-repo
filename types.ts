// types.ts

// Represents the authenticated user, based on the GitHub API response
export interface User {
  name: string | null;
  avatar_url: string;
  login: string; // GitHub username
}

export enum WorkflowRunStatus {
  Success = 'success',
  Failure = 'failure',
  InProgress = 'in_progress',
  Queued = 'queued',
  Cancelled = 'cancelled',
  Neutral = 'neutral',
  Skipped = 'skipped',
  TimedOut = 'timed_out',
  ActionRequired = 'action_required',
  Completed = 'completed', // A general completed state if conclusion is null
  Unknown = 'unknown',
}


// Represents a repository, based on the GitHub API response
export interface Repository {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  language: string | null;
  updated_at: string;
  private: boolean;
  owner: {
    login: string;
  };
  default_branch: string;
  has_workflows: boolean; // Custom property to be added after fetching
  permissions?: { // Permissions for the authenticated user
    admin: boolean;
    push: boolean;
    pull: boolean;
  };
  latestRunStatus?: WorkflowRunStatus;
  latestRunUrl?: string;
  latestRunId?: number;
}

export enum DeploymentStatus {
  Success = 'success',
  Failed = 'failure',
  InProgress = 'in_progress',
  Error = 'error',
  Queued = 'queued',
  Pending = 'pending',
}

// Represents a deployment, based on the GitHub API response
export interface Deployment {
  id: number;
  sha: string;
  ref: string; // Branch or tag
  task: string;
  environment: string;
  description: string | null;
  creator: {
    login: string;
  };
  created_at: string;
  updated_at: string;
  statuses_url: string;

  // Custom properties added by AutoFlow
  runId?: number; // Added to link deployment to a specific workflow run
  status?: DeploymentStatus; // Latest status of the deployment
  duration?: string; // Calculated duration of the deployment
}

// Represents the status of a specific deployment
export interface DeploymentStatusPayload {
    id: number;
    state: DeploymentStatus;
    log_url: string;
    description: string;
    created_at: string;
}


export enum TechStack {
  React = 'React (Vite)',
  NextJS = 'Next.js',
  NodeJS = 'Node.js (Express)',
  Vue = 'Vue.js',
  Python = 'Python (Flask/Django)',
  Static = 'Static HTML/JS'
}

export enum DeploymentTarget {
  Vercel = 'Vercel',
  Firebase = 'Firebase Hosting',
  GitHubPages = 'GitHub Pages',
  Railway = 'Railway',
  Heroku = 'Heroku',
  AWSElasticBeanstalk = 'AWS Elastic Beanstalk',
}

export enum DeploymentEnvironment {
    Staging = 'Staging',
    Production = 'Production',
}

// Represents a non-sensitive variable required by a workflow
export interface RequiredVariable {
    name: string;
    description: string;
    defaultValue?: string;
}

// Represents a sensitive secret required by a workflow
export interface RequiredSecret {
    name: string;
    description: string;
}

// Represents the result of analyzing a repository's code
export interface RepoAnalysisResult {
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'unknown';
  nodeVersion: string | null;
  buildCommand: string | null;
  testCommand: string | null;
  installCommand: string;
  runCommand: string;
  lockFile: string | null;
  framework: string | null;
  // Send content of key files, not all files
  keyFiles: { path: string, content: string }[]; 
}