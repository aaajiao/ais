import { describe, it, expect, vi } from 'vitest';

// Mock font-loader to avoid fs.readFileSync in tests
vi.mock('../font-loader.js', () => ({
  getInlineFontCSS: () => '/* mocked fonts */',
}));

import { generateCatalogHTML, type CatalogItem, type CatalogOptions } from '../catalog-template';

// --- Test data factories ---

function createItem(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    titleEn: 'Test Artwork',
    titleCn: '测试作品',
    year: '2024',
    type: 'Installation',
    materials: 'Mixed media',
    dimensions: '100 × 200 × 50 cm',
    editionLabel: '1/5',
    editionInfo: 'Edition of 5 + 2AP',
    ...overrides,
  };
}

function createOptions(overrides: Partial<CatalogOptions> = {}): CatalogOptions {
  return {
    locationName: 'Gallery X',
    includePrice: false,
    includeStatus: false,
    date: 'January 29, 2026',
    ...overrides,
  };
}

// --- Tests ---

describe('generateCatalogHTML', () => {
  describe('HTML structure', () => {
    it('should return valid HTML document', () => {
      const html = generateCatalogHTML([], createOptions());
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html lang="en">');
      expect(html).toContain('<head>');
      expect(html).toContain('<meta charset="UTF-8">');
      expect(html).toContain('<style>');
      expect(html).toContain('</style>');
      expect(html).toContain('<body>');
      expect(html).toContain('</body>');
      expect(html).toContain('</html>');
    });

    it('should include CSS with A4 page setup', () => {
      const html = generateCatalogHTML([], createOptions());
      expect(html).toContain('@page');
      expect(html).toContain('size: A4');
      expect(html).toContain('page-break-after: always');
    });

    it('should include font stack with project fonts', () => {
      const html = generateCatalogHTML([], createOptions());
      expect(html).toContain('IBM Plex Sans');
      expect(html).toContain('Space Mono');
      expect(html).toContain('Noto Sans SC');
    });
  });

  describe('cover page', () => {
    it('should contain artist name', () => {
      const html = generateCatalogHTML([], createOptions());
      expect(html).toContain('aaajiao');
    });

    it('should contain location name', () => {
      const html = generateCatalogHTML([], createOptions({ locationName: 'White Cube' }));
      expect(html).toContain('White Cube');
    });

    it('should contain date', () => {
      const html = generateCatalogHTML([], createOptions({ date: 'February 1, 2026' }));
      expect(html).toContain('February 1, 2026');
    });

    it('should contain "Selected Works" subtitle', () => {
      const html = generateCatalogHTML([], createOptions());
      expect(html).toContain('Selected Works');
    });

    it('should display correct work count', () => {
      const items = [createItem(), createItem({ titleEn: 'Another' })];
      const html = generateCatalogHTML(items, createOptions());
      expect(html).toContain('2 works');
    });

    it('should show 0 works for empty list', () => {
      const html = generateCatalogHTML([], createOptions());
      expect(html).toContain('0 works');
    });

    it('should contain copyright with current year', () => {
      const html = generateCatalogHTML([], createOptions());
      const year = new Date().getFullYear();
      expect(html).toContain(`${year} aaajiao studio`);
    });

    it('should escape HTML in location name', () => {
      const html = generateCatalogHTML([], createOptions({ locationName: '<script>alert("xss")</script>' }));
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });

  describe('artwork pages', () => {
    it('should generate one page per item', () => {
      const items = [createItem(), createItem({ titleEn: 'Second' }), createItem({ titleEn: 'Third' })];
      const html = generateCatalogHTML(items, createOptions());
      // Cover + 3 artwork pages = 4 .page divs
      const pageCount = (html.match(/class="page/g) || []).length;
      expect(pageCount).toBe(4);
    });

    it('should display English title', () => {
      const html = generateCatalogHTML([createItem({ titleEn: 'Digital Garden' })], createOptions());
      expect(html).toContain('Digital Garden');
    });

    it('should display Chinese title when provided', () => {
      const html = generateCatalogHTML([createItem({ titleCn: '数字花园' })], createOptions());
      expect(html).toContain('数字花园');
    });

    it('should not include Chinese title div when not provided', () => {
      const html = generateCatalogHTML([createItem({ titleCn: undefined })], createOptions());
      // CSS class definition exists in styles, but the actual element should not be rendered
      expect(html).not.toContain('<div class="artwork-title-cn">');
    });

    it('should display year when provided', () => {
      const html = generateCatalogHTML([createItem({ year: '2023' })], createOptions());
      expect(html).toContain('Year');
      expect(html).toContain('2023');
    });

    it('should not display year row when not provided', () => {
      const html = generateCatalogHTML([createItem({ year: undefined })], createOptions());
      // Check that "Year" label is not present as a meta-label
      const yearLabelRegex = /meta-label[^<]*>Year</;
      expect(html).not.toMatch(yearLabelRegex);
    });

    it('should display metadata fields when provided', () => {
      const item = createItem({
        type: 'Video installation',
        materials: 'LED screens, custom software',
        dimensions: '300 × 500 cm',
        duration: '12:30',
      });
      const html = generateCatalogHTML([item], createOptions());
      expect(html).toContain('Video installation');
      expect(html).toContain('LED screens, custom software');
      expect(html).toContain('300 × 500 cm');
      expect(html).toContain('12:30');
    });

    it('should skip metadata fields that are not provided', () => {
      const item = createItem({
        type: undefined,
        materials: undefined,
        dimensions: undefined,
        duration: undefined,
      });
      const html = generateCatalogHTML([item], createOptions());
      // Extract only the artwork-meta section to count meta-labels (excluding CSS definitions)
      const metaSection = html.match(/<div class="artwork-meta">([\s\S]*?)<\/div>\s*<\/div>/)?.[1] || '';
      const metaLabelCount = (metaSection.match(/meta-label/g) || []).length;
      // Should only have Year (from createItem default) and Edition
      expect(metaLabelCount).toBe(2);
    });

    it('should always show edition info', () => {
      const html = generateCatalogHTML([createItem({ editionLabel: '3/10' })], createOptions());
      expect(html).toContain('Edition');
      expect(html).toContain('3/10');
    });

    it('should show edition info from editionInfo when editionLabel is empty', () => {
      const html = generateCatalogHTML(
        [createItem({ editionLabel: '', editionInfo: 'Edition of 5 + 2AP' })],
        createOptions(),
      );
      expect(html).toContain('Edition of 5 + 2AP');
    });
  });

  describe('optional status', () => {
    it('should include status with color dot when includeStatus is true', () => {
      const item = createItem({ status: 'In Studio' });
      const html = generateCatalogHTML([item], createOptions({ includeStatus: true }));
      expect(html).toContain('Status');
      expect(html).toContain('In Studio');
      expect(html).toContain('status-dot');
      expect(html).toContain('status-in_studio');
    });

    it('should not include status when includeStatus is false', () => {
      const item = createItem({ status: 'Sold' });
      const html = generateCatalogHTML([item], createOptions({ includeStatus: false }));
      const statusLabelRegex = /meta-label[^<]*>Status</;
      expect(html).not.toMatch(statusLabelRegex);
    });

    it('should not include status row when item has no status', () => {
      const item = createItem({ status: undefined });
      const html = generateCatalogHTML([item], createOptions({ includeStatus: true }));
      const statusLabelRegex = /meta-label[^<]*>Status</;
      expect(html).not.toMatch(statusLabelRegex);
    });

    it('should map all status values to CSS classes', () => {
      const statuses = ['In Production', 'In Studio', 'On Loan', 'On Exhibition', 'In Transit', 'Sold', 'Gifted', 'Lost', 'Damaged'];
      const expectedClasses = ['in_production', 'in_studio', 'at_gallery', 'at_museum', 'in_transit', 'sold', 'gifted', 'lost', 'damaged'];

      statuses.forEach((status, i) => {
        const html = generateCatalogHTML([createItem({ status })], createOptions({ includeStatus: true }));
        expect(html).toContain(`status-${expectedClasses[i]}`);
      });
    });

    it('should fallback to in_studio for unknown status', () => {
      const html = generateCatalogHTML(
        [createItem({ status: 'Unknown Status' })],
        createOptions({ includeStatus: true }),
      );
      expect(html).toContain('status-in_studio');
    });
  });

  describe('optional price', () => {
    it('should include price when includePrice is true and price exists', () => {
      const item = createItem({ price: '¥50,000' });
      const html = generateCatalogHTML([item], createOptions({ includePrice: true }));
      expect(html).toContain('Price');
      expect(html).toContain('¥50,000');
    });

    it('should not include price when includePrice is false', () => {
      const item = createItem({ price: '$10,000' });
      const html = generateCatalogHTML([item], createOptions({ includePrice: false }));
      const priceLabelRegex = /meta-label[^<]*>Price</;
      expect(html).not.toMatch(priceLabelRegex);
    });

    it('should not include price row when item has no price', () => {
      const item = createItem({ price: undefined });
      const html = generateCatalogHTML([item], createOptions({ includePrice: true }));
      const priceLabelRegex = /meta-label[^<]*>Price</;
      expect(html).not.toMatch(priceLabelRegex);
    });
  });

  describe('source URL link', () => {
    it('should show link icon when sourceUrl is provided', () => {
      const item = createItem({ sourceUrl: 'https://aaajiao.me/works/test' });
      const html = generateCatalogHTML([item], createOptions());
      expect(html).toContain('title-link');
      expect(html).toContain('https://aaajiao.me/works/test');
      expect(html).toContain('<svg');
    });

    it('should not show link icon when sourceUrl is not provided', () => {
      const item = createItem({ sourceUrl: undefined });
      const html = generateCatalogHTML([item], createOptions());
      expect(html).not.toContain('<a class="title-link"');
    });

    it('should escape special characters in sourceUrl', () => {
      const item = createItem({ sourceUrl: 'https://example.com/art?id=1&name="test"' });
      const html = generateCatalogHTML([item], createOptions());
      expect(html).toContain('&amp;name=&quot;test&quot;');
    });
  });

  describe('image handling', () => {
    it('should include image tag when thumbnailBase64 is provided', () => {
      const item = createItem({ thumbnailBase64: 'data:image/jpeg;base64,abc123' });
      const html = generateCatalogHTML([item], createOptions());
      expect(html).toContain('<img');
      expect(html).toContain('data:image/jpeg;base64,abc123');
    });

    it('should show empty container when no image', () => {
      const item = createItem({ thumbnailBase64: undefined });
      const html = generateCatalogHTML([item], createOptions());
      expect(html).toContain('artwork-image-container');
      expect(html).not.toContain('<img');
    });

    it('should escape title in img alt attribute', () => {
      const item = createItem({ titleEn: 'Art "with" quotes', thumbnailBase64: 'data:image/png;base64,x' });
      const html = generateCatalogHTML([item], createOptions());
      expect(html).toContain('Art &quot;with&quot; quotes');
    });
  });

  describe('pagination', () => {
    it('should show correct page numbers', () => {
      const items = [createItem({ titleEn: 'A' }), createItem({ titleEn: 'B' }), createItem({ titleEn: 'C' })];
      const html = generateCatalogHTML(items, createOptions());
      expect(html).toContain('1/3');
      expect(html).toContain('2/3');
      expect(html).toContain('3/3');
    });

    it('should show 1/1 for single item', () => {
      const html = generateCatalogHTML([createItem()], createOptions());
      expect(html).toContain('1/1');
    });
  });

  describe('HTML escaping', () => {
    it('should escape special characters in title', () => {
      const item = createItem({ titleEn: '<b>Bold & "Quoted"</b>' });
      const html = generateCatalogHTML([item], createOptions());
      expect(html).toContain('&lt;b&gt;Bold &amp; &quot;Quoted&quot;&lt;/b&gt;');
    });

    it('should escape special characters in metadata', () => {
      const item = createItem({ materials: 'Glass & <steel>' });
      const html = generateCatalogHTML([item], createOptions());
      expect(html).toContain('Glass &amp; &lt;steel&gt;');
    });

    it('should escape single quotes', () => {
      const item = createItem({ titleEn: "Artist's Work" });
      const html = generateCatalogHTML([item], createOptions());
      expect(html).toContain('Artist&#039;s Work');
    });
  });

  describe('edge cases', () => {
    it('should handle empty items array (cover page only)', () => {
      const html = generateCatalogHTML([], createOptions());
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('cover');
      // Only 1 page (cover)
      const pageCount = (html.match(/class="page/g) || []).length;
      expect(pageCount).toBe(1);
    });

    it('should handle item with minimal fields', () => {
      const item: CatalogItem = {
        titleEn: 'Minimal',
        editionLabel: 'Unique',
        editionInfo: 'Unique',
      };
      const html = generateCatalogHTML([item], createOptions());
      expect(html).toContain('Minimal');
      expect(html).toContain('Unique');
    });

    it('should handle both status and price together', () => {
      const item = createItem({ status: 'Sold', price: '$100,000' });
      const options = createOptions({ includeStatus: true, includePrice: true });
      const html = generateCatalogHTML([item], options);
      expect(html).toContain('Sold');
      expect(html).toContain('$100,000');
    });

    it('should handle many items without error', () => {
      const items = Array.from({ length: 50 }, (_, i) =>
        createItem({ titleEn: `Artwork ${i + 1}` })
      );
      const html = generateCatalogHTML(items, createOptions());
      expect(html).toContain('Artwork 1');
      expect(html).toContain('Artwork 50');
      expect(html).toContain('50 works');
    });
  });
});
