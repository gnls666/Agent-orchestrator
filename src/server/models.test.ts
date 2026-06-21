import { describe, expect, it } from 'vitest';
import { normalizeModels } from './models';

describe('normalizeModels', () => {
  it('maps Copilot SDK model metadata into UI model options', () => {
    const models = normalizeModels([
      {
        id: 'gpt-5',
        name: 'GPT-5',
        capabilities: {
          supports: {
            reasoningEffort: true,
            vision: true,
          },
          limits: {
            max_context_window_tokens: 128000,
          },
        },
        supportedReasoningEfforts: ['low', 'medium', 'high'],
        defaultReasoningEffort: 'medium',
        billing: {
          multiplier: 1,
        },
      },
      {
        id: 'fast-model',
        name: 'Fast Model',
        capabilities: {
          supports: {
            reasoningEffort: false,
            vision: false,
          },
          limits: {
            max_context_window_tokens: 64000,
          },
        },
      },
    ]);

    expect(models).toEqual([
      {
        id: 'gpt-5',
        name: 'GPT-5',
        supportsReasoningEffort: true,
        supportsVision: true,
        supportedReasoningEfforts: ['low', 'medium', 'high'],
        defaultReasoningEffort: 'medium',
        billingMultiplier: 1,
      },
      {
        id: 'fast-model',
        name: 'Fast Model',
        supportsReasoningEffort: false,
        supportsVision: false,
        supportedReasoningEfforts: [],
      },
    ]);
  });
});
