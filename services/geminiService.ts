import { TechStack, DeploymentTarget, DeploymentEnvironment, RequiredVariable, RequiredSecret } from '../types';
import { API_ENDPOINT_GENERATE_WORKFLOW } from '../constants';

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
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30-second timeout

  try {
    const response = await fetch(API_ENDPOINT_GENERATE_WORKFLOW, {
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
      signal: controller.signal, // Pass the signal to fetch
    });

    // Clear the timeout if the request completes in time
    clearTimeout(timeoutId);

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
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
        console.error("Request timed out after 30 seconds.");
        throw new Error("The request timed out after 30 seconds. The server may be overloaded or the AI is taking too long. Please try again.");
    }

    console.error("Error generating workflow:", error);
    // Re-throw the error so the UI component can handle it,
    // providing a better user experience than embedding errors in YAML.
    throw error;
  }
};
