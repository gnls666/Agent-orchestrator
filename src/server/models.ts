import type { ModelInfo } from '@github/copilot-sdk';
import type { ModelOption } from '../shared/types';

export function normalizeModels(models: ModelInfo[]): ModelOption[] {
  return models.map((model) => ({
    id: model.id,
    name: model.name,
    supportsReasoningEffort: Boolean(model.capabilities.supports.reasoningEffort),
    supportsVision: Boolean(model.capabilities.supports.vision),
    supportedReasoningEfforts: model.supportedReasoningEfforts ?? [],
    defaultReasoningEffort: model.defaultReasoningEffort,
    billingMultiplier: model.billing?.multiplier,
  }));
}
