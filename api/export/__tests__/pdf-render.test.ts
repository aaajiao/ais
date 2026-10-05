import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const mocks = vi.hoisted(() => ({
  launch: vi.fn(),
  executablePath: vi.fn(),
  newPage: vi.fn(),
  close: vi.fn(),
  setContent: vi.fn(),
  waitForNetworkIdle: vi.fn(),
  evaluate: vi.fn(),
  pdf: vi.fn(),
  verifyAuth: vi.fn(),
  getSupabaseClient: vi.fn(),
}));

vi.mock('puppeteer-core', () => ({ default: { launch: mocks.launch } }));
vi.mock('@sparticuz/chromium-min', () => ({
  default: { args: ['--serverless-flag'], executablePath: mocks.executablePath },
}));
vi.mock('../../lib/auth', () => ({ verifyAuth: mocks.verifyAuth }));
vi.mock('../shared', () => ({
  getSupabaseClient: mocks.getSupabaseClient,
  fetchArtworkExportData: vi.fn(),
}));

import handler, { renderHTMLToPDF } from '../pdf';

describe('PDF renderer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('VERCEL', '0');
    mocks.executablePath.mockResolvedValue('/tmp/chromium');
    mocks.launch.mockResolvedValue({ newPage: mocks.newPage, close: mocks.close });
    mocks.newPage.mockResolvedValue({
      setContent: mocks.setContent,
      waitForNetworkIdle: mocks.waitForNetworkIdle,
      evaluate: mocks.evaluate,
      pdf: mocks.pdf,
    });
    mocks.pdf.mockResolvedValue(new TextEncoder().encode('%PDF-1.7'));
  });

  afterEach(() => vi.unstubAllEnvs());

  it('uses the matching architecture pack and headless shell in Vercel', async () => {
    vi.stubEnv('VERCEL', '1');

    await renderHTMLToPDF('<html>Catalog</html>');

    expect(mocks.executablePath).toHaveBeenCalledWith(
      `https://github.com/Sparticuz/chromium/releases/download/v153.0.0/chromium-v153.0.0-pack.${process.arch}.tar`,
    );
    expect(mocks.launch).toHaveBeenCalledWith(expect.objectContaining({
      executablePath: '/tmp/chromium',
      headless: 'shell',
      defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
      args: expect.arrayContaining(['--serverless-flag']),
    }));
    expect(mocks.pdf).toHaveBeenCalledWith(expect.objectContaining({
      format: 'A4', printBackground: true, preferCSSPageSize: true,
    }));
    expect(mocks.waitForNetworkIdle).toHaveBeenCalledWith({ idleTime: 500, timeout: 30000 });
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('uses local Chrome and preserves the PDF byte range', async () => {
    const storage = new Uint8Array([0, 0, 37, 80, 68, 70, 0, 0]);
    mocks.pdf.mockResolvedValue(storage.subarray(2, 6));

    const result = await renderHTMLToPDF('<html>Catalog</html>');

    expect(mocks.launch).toHaveBeenCalledWith({ headless: true, channel: 'chrome' });
    expect(Buffer.from(result).toString()).toBe('%PDF');
    expect(mocks.executablePath).not.toHaveBeenCalled();
  });

  it('closes Chrome if rendering fails', async () => {
    mocks.pdf.mockRejectedValueOnce(new Error('PDF generation failed'));

    await expect(renderHTMLToPDF('<html>Catalog</html>')).rejects.toThrow('PDF generation failed');

    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('scopes catalog locations to the authenticated user before exporting', async () => {
    mocks.verifyAuth.mockResolvedValue({ success: true, userId: 'user-1' });
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null }),
    };
    mocks.getSupabaseClient.mockReturnValue({ from: vi.fn().mockReturnValue(query) });
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    await handler({
      method: 'POST', body: { source: 'catalog', locationName: 'Private gallery' },
    } as VercelRequest, res as unknown as VercelResponse);

    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mocks.launch).not.toHaveBeenCalled();
  });
});
