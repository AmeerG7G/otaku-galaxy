import { apiFetch } from '@/lib/api';
import { bffError, bffJson, handleBff } from '@/lib/bff';
import { isLevelKey } from '@/lib/points';

/**
 * Claim a level's reward. Only the level comes from the browser; the API reads
 * the ledger and decides. Claiming reserves the reward — it does not spend
 * points. A repeated claim returns the same reward.
 */
export async function POST(request: Request, context: { params: Promise<{ levelKey: string }> }) {
  return handleBff(request, { auth: true }, async ({ session }) => {
    const { levelKey } = await context.params;
    if (!isLevelKey(levelKey)) return bffError(400, 'VALIDATION_ERROR', 'مستوى غير معروف');
    const { data, message } = await apiFetch<unknown>(`/points/rewards/${levelKey}/claim`, {
      method: 'POST',
      token: session!.token,
    });
    return bffJson(200, { data, message });
  });
}
