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
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to generate workflow from the backend.');
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