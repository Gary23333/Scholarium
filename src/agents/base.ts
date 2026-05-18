import type { Agent, AgentOptions } from '../types/index.ts';

export abstract class BaseAgent<I, O> implements Agent<I, O> {
  abstract readonly name: string;

  async execute(input: I, options?: AgentOptions): Promise<O> {
    if (options?.mock) return this.mockExecute(input, options);
    return this.realExecute(input, options);
  }

  protected abstract realExecute(input: I, options?: AgentOptions): Promise<O>;
  protected abstract mockExecute(input: I, options?: AgentOptions): Promise<O>;
}
