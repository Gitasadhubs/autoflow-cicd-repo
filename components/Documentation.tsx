import React from 'react';

interface DocumentationProps {
  onClose: () => void;
}

const YamlBlock: React.FC<{ children: string }> = ({ children }) => (
    <div className="bg-gray-900 rounded-md p-3 my-2 border border-gray-700">
        <pre><code className="text-sm text-gray-200 font-mono">{children.trim()}</code></pre>
    </div>
);

const Code: React.FC<{ children: string }> = ({ children }) => (
    <code className="bg-gray-700 text-brand-secondary font-mono text-sm py-0.5 px-1.5 rounded-md">{children}</code>
);

const Documentation: React.FC<DocumentationProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50">
      <div className="bg-brand-surface rounded-xl shadow-2xl w-full max-w-3xl transform transition-all animate-scale-up border border-gray-700">
        <div className="p-4 border-b border-gray-700 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-100">AutoFlow Documentation</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-3xl leading-none">&times;</button>
        </div>
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto text-gray-300">
            
            <section>
                <h3 className="text-xl font-semibold text-gray-100 mb-2">Welcome to AutoFlow!</h3>
                <p>AutoFlow simplifies the process of creating Continuous Integration and Continuous Deployment (CI/CD) pipelines for your projects. By connecting to your GitHub account, AutoFlow helps you automatically generate the necessary workflow files to build, test, and deploy your applications whenever you push new code.</p>
            </section>

            <section>
                <h3 className="text-xl font-semibold text-gray-100 mb-2">Getting Started</h3>
                <p>To begin, you need to provide a GitHub Personal Access Token (PAT). This allows AutoFlow to securely access your repositories, check for existing workflows, and create new ones on your behalf.</p>
                <p className="mt-2">Your token needs the following scopes:</p>
                <ul className="list-disc list-inside mt-2 ml-4 space-y-1">
                    <li><Code>repo</Code>: Full control of private repositories. Required to read repository contents and create workflow files.</li>
                    <li><Code>read:user</Code>: Grants read access to your user profile information to display your name and avatar.</li>
                </ul>
            </section>
            
            <section>
                <h3 className="text-xl font-semibold text-gray-100 mb-2">How to Configure a Pipeline</h3>
                <p>Once you've logged in, select a repository from the list and click "Configure Pipeline". This will open the Pipeline Configurator, where you'll define your deployment.</p>
                <ol className="list-decimal list-inside mt-2 ml-4 space-y-4">
                    <li>
                        <strong className="text-gray-200">Select Settings:</strong> Choose your project's Tech Stack, your desired Deployment Target, and the Environment (e.g., Production).
                    </li>
                    <li>
                        <strong className="text-gray-200">Generate Workflow:</strong> Click "Generate Workflow File". AutoFlow sends your settings to an AI that specializes in DevOps to create a custom GitHub Actions YAML file tailored to your needs.
                    </li>
                    <li>
                        <strong className="text-gray-200">Configure Variables and Secrets:</strong> The generated workflow often requires configuration.
                        <ul className="list-disc list-inside mt-2 ml-4 space-y-2 text-sm">
                            <li><strong>Variables</strong> are for non-sensitive data, like a Node.js version or a build directory path. They are stored as plain text.</li>
                            <li><strong>Secrets</strong> are for sensitive information like API tokens or passwords. They are stored encrypted by GitHub and are never exposed in logs. <strong className="text-amber-400">Never commit secrets directly into your code.</strong></li>
                        </ul>
                    </li>
                     <li>
                        <strong className="text-gray-200">Confirm Setup:</strong> Once you've filled in the required values, click "Confirm Setup". AutoFlow will:
                         <ul className="list-disc list-inside mt-2 ml-4 space-y-1 text-sm">
                            <li>Commit the generated <Code>.yml</Code> file to the <Code>.github/workflows/</Code> directory in your repository.</li>
                            <li>Create the configured variables and secrets in your repository's settings under <Code>Settings &gt; Secrets and variables &gt; Actions</Code>.</li>
                        </ul>
                    </li>
                </ol>
            </section>

            <section>
                <h3 className="text-xl font-semibold text-gray-100 mb-2">Tech Stack Examples</h3>

                <div className="mt-4">
                    <h4 className="text-lg font-medium text-gray-200">Example 1: React (Vite) to Vercel</h4>
                    <p className="text-sm">This is a common setup for deploying a modern frontend application. The generated workflow will build your React app and then deploy the static output to Vercel.</p>
                    <p className="text-sm mt-2 font-semibold">Typical Secrets:</p>
                    <ul className="list-disc list-inside mt-1 ml-4 text-sm">
                        <li><Code>VERCEL_TOKEN</Code>: Your Vercel account token for authentication.</li>
                        <li><Code>VERCEL_PROJECT_ID</Code>: The ID of the project on Vercel you're deploying to.</li>
                         <li><Code>VERCEL_ORG_ID</Code>: The ID of your organization or team on Vercel.</li>
                    </ul>
                    <p className="text-sm mt-2 font-semibold">Example Workflow Snippet:</p>
                    <YamlBlock>{`
- name: Deploy to Vercel
  uses: amondnet/vercel-action@v20
  with:
    vercel-token: \${{ secrets.VERCEL_TOKEN }}
    vercel-project-id: \${{ secrets.VERCEL_PROJECT_ID }}
    vercel-org-id: \${{ secrets.VERCEL_ORG_ID }}
                    `}</YamlBlock>
                </div>

                <div className="mt-6">
                    <h4 className="text-lg font-medium text-gray-200">Example 2: Static HTML/JS to GitHub Pages</h4>
                    <p className="text-sm">A simple and free way to host a static website directly from your repository.</p>
                     <p className="text-sm mt-2 font-semibold">Typical Secrets/Variables:</p>
                    <p className="text-sm mt-1 ml-4">Usually, none are required! The workflow uses the built-in <Code>GITHUB_TOKEN</Code> which is automatically available.</p>
                    <p className="text-sm mt-2 font-semibold">Example Workflow Snippet:</p>
                    <YamlBlock>{`
- name: Deploy to GitHub Pages
  uses: actions/deploy-pages@v2
                    `}</YamlBlock>
                </div>
            </section>

             <section>
                <h3 className="text-xl font-semibold text-gray-100 mb-2">Troubleshooting</h3>
                <ul className="list-disc list-inside mt-2 ml-4 space-y-2">
                    <li>
                        <strong className="text-gray-200">My repositories aren't showing up.</strong>
                        <p className="text-sm">Ensure your Personal Access Token has the required <Code>repo</Code> scope. Also, make sure you have admin or push permissions for the repository you want to configure.</p>
                    </li>
                     <li>
                        <strong className="text-gray-200">My pipeline failed.</strong>
                        <p className="text-sm">The dashboard shows the high-level status. For detailed error logs, click the status badge (e.g., "Failed") on the repository item. This will take you directly to the workflow run on GitHub where you can inspect the logs for each step.</p>
                    </li>
                </ul>
            </section>
        </div>
        <div className="px-6 py-3 bg-gray-900/50 flex justify-end rounded-b-xl border-t border-gray-700">
          <button onClick={onClose} className="py-2 px-4 bg-brand-primary text-white rounded-lg hover:bg-brand-dark transition">Close</button>
        </div>
      </div>
    </div>
  );
};

export default Documentation;
