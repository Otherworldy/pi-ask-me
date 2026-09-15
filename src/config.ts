export type PromptConfig = {
  enabled: boolean;
};

export function defaultConfig(): PromptConfig {
  return { enabled: true };
}
