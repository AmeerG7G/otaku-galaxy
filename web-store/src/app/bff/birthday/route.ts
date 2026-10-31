import { apiFetch } from '@/lib/api';
import { bffError, bffJson, handleBff, readJsonBody } from '@/lib/bff';
import type { BirthdayStatus } from '@/lib/types';

/** Save the birthday — once, after the first received order. The API enforces both; a correction is the admin's (D1). */
export async function POST(request: Request) {
  return handleBff(request, { auth: true }, async ({ session }) => {
    const body = await readJsonBody(request);
    const { day, month } = body ?? {};
    if (!Number.isInteger(day) || !Number.isInteger(month)) return bffError(400, 'VALIDATION_ERROR', 'تاريخ غير صالح');
    const { data, message } = await apiFetch<BirthdayStatus>('/birthday', {
      method: 'POST',
      body: { day, month },
      token: session!.token,
    });
    return bffJson(200, { data, message });
  });
}
