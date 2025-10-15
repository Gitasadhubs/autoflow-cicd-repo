import { TechStack, DeploymentTarget, DeploymentEnvironment, RequiredVariable, RequiredSecret } from '../types';

interface WorkflowGenerationResponse {
  yaml: string;
  variables: RequiredVariable[];
  secrets: RequiredSecret[];
}

export const generateWorkflow = async (
  techStack: TechStack,
  deploymentTarget: DeploymentTarget,
  deploymentEnvironment: DeploymentEnvironment,
  repoName: string
): Promise<WorkflowGenerationResponse> => {
  try {
    const response = await fetch('/api/generate-workflow', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        techStack,
        deploymentTarget,
        deploymentEnvironment,
        repoName,
      }),
    });

    if (!response.ok) {
      // Robust error handling: try to parse as JSON, fall back to text.
      let errorMessage = 'An unknown error occurred from the backend.';
      try {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          errorMessage = errorData.error || JSON.stringify(errorData);
        } else {
          errorMessage = await response.text();
        }
      } catch (e) {
        // Fallback for cases where content-type is wrong or body is empty.
        errorMessage = await response.text().catch(() => 'Could not retrieve error message from server.');
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return {
      yaml: data.yaml,
      variables: data.variables || [],
      secrets: data.secrets || [],
    };
  } catch (error) {
    console.error("Error generating workflow:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      yaml: `# An error occurred while communicating with the workflow generation service.\n# Please check the server logs.\n# Error: ${errorMessage}`,
      variables: [],
      secrets: [],
    };
  }
};