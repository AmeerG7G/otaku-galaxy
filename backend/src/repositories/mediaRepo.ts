import type pg from 'pg';
import type { MediaPurpose } from '../types/index.js';

export interface MediaDto {
  id: string;
  url: string;
  storageKey: string;
  purpose: MediaPurpose;
  mimeType: string;
  sizeBytes: number;
}

export const mediaRepo = {
  async create(
    db: pg.Pool | pg.PoolClient,
    input: {
      storageKey: string;
      url: string;
      purpose: MediaPurpose;
      mimeType: string;
      sizeBytes: number;
      uploadedBy: string | null;
    },
  ): Promise<MediaDto> {
    const { rows } = await db.query<{
      id: string;
      url: string;
      storage_key: string;
      purpose: MediaPurpose;
      mime_type: string;
      size_bytes: number;
    }>(
      `INSERT INTO media_files (storage_key, url, purpose, mime_type, size_bytes, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, url, storage_key, purpose, mime_type, size_bytes`,
      [
        input.storageKey,
        input.url,
        input.purpose,
        input.mimeType,
        input.sizeBytes,
        input.uploadedBy,
      ],
    );
    const row = rows[0]!;
    return {
      id: row.id,
      url: row.url,
      storageKey: row.storage_key,
      purpose: row.purpose,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
    };
  },

  async findByUrl(db: pg.Pool | pg.PoolClient, url: string) {
    const { rows } = await db.query<{ id: string; storage_key: string }>(
      'SELECT id, storage_key FROM media_files WHERE url = $1',
      [url],
    );
    return rows[0] ?? null;
  },
};
