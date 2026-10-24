import { apiFetch } from '@/lib/api';
import { bffError, bffJson, handleBff, readJsonBody } from '@/lib/bff';
import { isUuid } from '@/lib/catalog';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  return handleBff(request, { auth: true }, async ({ session }) => {
    const { id } = await params;
    if (!isUuid(id)) return bffError(400, 'VALIDATION_ERROR', 'معرّف عنصر غير صالح');
    const body = (await readJsonBody(request)) ?? {};
    const { data } = await apiFetch<unknown>(`/cart/${id}`, {
      method: 'PATCH',
      token: session!.token,
      body: { quantity: body.quantity },
    });
    return bffJson(200, { data });
  });
}

export async function DELETE(request: Request, { params }: Params) {
  return handleBff(request, { auth: true }, async ({ session }) => {
    const { id } = await params;
    if (!isUuid(id)) return bffError(400, 'VALIDATION_ERROR', 'معرّف عنصر غير صالح');
    const { data } = await apiFetch<unknown>(`/cart/${id}`, { method: 'DELETE', token: session!.token });
    return bffJson(200, { data });
  });
}
