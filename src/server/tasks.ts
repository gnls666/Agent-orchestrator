import type { AgentTask } from '../shared/types';

export type BuildTaskPromptInput = {
  mode: AgentTask['mode'];
  userPrompt: string;
  folderPath: string;
  selectedAgentPath?: string;
  selectedSkillPaths?: string[];
};

export function buildTaskPrompt(input: BuildTaskPromptInput): string {
  const modeInstructions =
    input.mode === 'plan'
      ? [
          'Plan mode:',
          'Do not edit files or run mutating commands.',
          'Inspect the project, identify risks, and return a concrete implementation plan.',
        ]
      : [
          'Execution mode:',
          'Make the requested changes in the project.',
          'Run relevant verification commands when practical and summarize results.',
        ];

  return [
    `You are working in ${input.folderPath}.`,
    ...modeInstructions,
    ...assetInstructions(input),
    '',
    'User task:',
    input.userPrompt.trim(),
  ].join('\n');
}

function assetInstructions(input: BuildTaskPromptInput): string[] {
  const selectedSkillPaths = input.selectedSkillPaths ?? [];

  if (!input.selectedAgentPath && selectedSkillPaths.length === 0) {
    return [];
  }

  return [
    '',
    'Copilot assets selected by the user:',
    ...(input.selectedAgentPath ? [`- Agent: ${input.selectedAgentPath}`] : []),
    ...selectedSkillPaths.map((skillPath) => `- Skill: ${skillPath}`),
    'Prefer these selected instructions when they are relevant to the task.',
  ];
}
