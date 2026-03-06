/**
 * Helper to clear a JobQueue between tests.
 */
export async function clear(queue: JobQueue): Promise<void> {
  await queue.clear();
}
