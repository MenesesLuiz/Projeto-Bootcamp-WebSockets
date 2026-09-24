/** Awaitable delay, used to pace the agent's streamed reply between chunks. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
