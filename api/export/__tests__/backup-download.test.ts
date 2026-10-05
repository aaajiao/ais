// @vitest-environment node
import { once } from 'node:events';
import { PassThrough } from 'node:stream';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { GetBlobResult } from '@vercel/blob';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  verifyAuth: vi.fn(),
  from: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
}));

vi.mock('@vercel/blob', () => ({ get: mocks.get }));
vi.mock('../../lib/auth', () => ({ verifyAuth: mocks.verifyAuth }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mocks.from }),
}));

import handler from '../backup/download';

function response() {
  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  return Object.assign(stream, {
    chunks,
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
  });
}

function blobResult(stream = new ReadableStream<Uint8Array>({
  start(controller) {
    controller.enqueue(new TextEncoder().encode('PK-backup'));
    controller.close();
  },
})): GetBlobResult {
  return {
    statusCode: 200,
    stream,
    headers: new Headers({ 'content-length': '9' }),
    blob: {
      url: 'https://private.example/latest.zip',
      downloadUrl: 'https://private.example/latest.zip?download=1',
      pathname: 'backups/user-1/latest.zip',
      contentDisposition: 'attachment',
      cacheControl: 'private',
      uploadedAt: new Date(),
      etag: 'test-etag',
      contentType: 'application/zip',
      size: 9,
    },
  };
}

async function download(res: ReturnType<typeof response>, method = 'GET') {
  await handler({ method } as VercelRequest, res as unknown as VercelResponse);
}

describe('private backup download', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://supabase.example');
    vi.stubEnv('SUPABASE_SERVICE_KEY', 'test-key');
    mocks.verifyAuth.mockResolvedValue({ success: true, userId: 'user-1' });
    mocks.get.mockResolvedValue(blobResult());
    mocks.from.mockReturnValue({ update: mocks.update });
    mocks.update.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockResolvedValue({ error: null });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('rejects unauthorized requests before reading Blob', async () => {
    mocks.verifyAuth.mockResolvedValue({ success: false, error: 'Unauthorized' });
    const res = response();

    await download(res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('returns no_backup when the exact private pathname is missing', async () => {
    mocks.get.mockResolvedValue(null);
    const res = response();

    await download(res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'no_backup' });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('streams the latest user backup without returning a Blob URL or credentials', async () => {
    const res = response();
    const finished = once(res, 'finish');

    await download(res);
    await finished;

    expect(mocks.get).toHaveBeenCalledWith('backups/user-1/latest.zip', {
      access: 'private', useCache: false,
    });
    expect(Buffer.concat(res.chunks).toString()).toBe('PK-backup');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/zip');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Length', '9');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store, private');
    expect(res.json).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith({ last_backup_downloaded_at: expect.any(String) });
    expect(mocks.eq).toHaveBeenCalledWith('id', 'user-1');
  });

  it('reports upstream failures without marking a successful download', async () => {
    mocks.get.mockRejectedValue(new Error('Blob unavailable'));
    const res = response();

    await download(res);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('destroys a failed stream without marking it downloaded', async () => {
    mocks.get.mockResolvedValue(blobResult(new ReadableStream({
      start(controller) { controller.error(new Error('truncated backup')); },
    })));
    const res = response();
    const failed = once(res, 'error');

    await download(res);

    await expect(failed).resolves.toEqual([expect.objectContaining({ message: 'truncated backup' })]);
    expect(res.destroyed).toBe(true);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
