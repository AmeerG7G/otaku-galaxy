import { bffError, bffJson, handleBff } from '@/lib/bff';
import { isUuid, listZones } from '@/lib/catalog';

/** Delivery zones of a governorate (public). Zoned governorates require one. */
export async function GET(request: Request) {
  return handleBff(request, { auth: false }, async () => {
    const governorateId = new URL(request.url).searchParams.get('governorateId') ?? '';
    if (!isUuid(governorateId)) return bffError(400, 'VALIDATION_ERROR', 'محافظة غير صالحة');
    return bffJson(200, { data: { items: await listZones(governorateId) } });
  });
}
