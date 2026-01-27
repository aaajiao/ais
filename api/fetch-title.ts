/**
 * API endpoint to fetch webpage title using open-graph-scraper
 * GET /api/fetch-title?url=https://example.com
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import ogs from 'open-graph-scraper';

// Use Node.js runtime for open-graph-scraper compatibility
export const config = {
  runtime: 'nodejs',
  maxDuration: 10,
};

interface FetchTitleResponse {
  title: string | null;
  error?: string;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse<FetchTitleResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ title: null, error: 'Method not allowed' });
  }

  const { url } = req.query;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ title: null, error: 'Missing url parameter' });
  }

  // Validate URL format
  try {
    new URL(url);
  } catch {
    return res.status(400).json({ title: null, error: 'Invalid URL format' });
  }

  try {
    const data = await ogs({
      url,
      timeout: 5, // 5 seconds timeout
      fetchOptions: {
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; AIS/1.0; +https://github.com/aaajiao)',
          'accept-language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
        },
      },
    });

    if (data.error) {
      // Return null title on error, let client handle fallback
      return res.json({ title: null });
    }

    // Priority: og:title > twitter:title > dc:title > page title
    const title = data.result.ogTitle
      || data.result.twitterTitle
      || data.result.dcTitle
      || null;

    return res.json({ title });
  } catch (error) {
    console.error('[fetch-title] Error:', error);
    // Return null title on error, let client handle fallback
    return res.json({ title: null });
  }
}
