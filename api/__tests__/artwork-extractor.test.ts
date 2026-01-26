import { describe, it, expect } from 'vitest';
import { extractImageUrls, cleanHtml } from '../lib/artwork-extractor';

describe('extractImageUrls', () => {
  describe('img tag extraction', () => {
    it('should extract URLs from img src attributes', () => {
      const html = '<img src="https://example.com/image.jpg">';
      expect(extractImageUrls(html)).toContain('https://example.com/image.jpg');
    });

    it('should extract multiple img URLs', () => {
      const html = `
        <img src="https://example.com/image1.jpg">
        <img src="https://example.com/image2.png">
      `;
      const urls = extractImageUrls(html);
      expect(urls).toContain('https://example.com/image1.jpg');
      expect(urls).toContain('https://example.com/image2.png');
    });

    it('should handle double and single quotes', () => {
      const html = `
        <img src="https://example.com/double.jpg">
        <img src='https://example.com/single.jpg'>
      `;
      const urls = extractImageUrls(html);
      expect(urls).toContain('https://example.com/double.jpg');
      expect(urls).toContain('https://example.com/single.jpg');
    });

    it('should handle img tags with additional attributes', () => {
      const html = '<img class="artwork" alt="Title" src="https://example.com/image.jpg" loading="lazy">';
      expect(extractImageUrls(html)).toContain('https://example.com/image.jpg');
    });
  });

  describe('filtering', () => {
    it('should filter out non-http URLs', () => {
      const html = `
        <img src="/relative/path.jpg">
        <img src="data:image/png;base64,abc">
        <img src="https://example.com/valid.jpg">
      `;
      const urls = extractImageUrls(html);
      expect(urls).toHaveLength(1);
      expect(urls[0]).toBe('https://example.com/valid.jpg');
    });

    it('should filter out icon URLs', () => {
      const html = '<img src="https://example.com/icon.png">';
      expect(extractImageUrls(html)).toHaveLength(0);
    });

    it('should filter out logo URLs', () => {
      const html = '<img src="https://example.com/logo.svg">';
      expect(extractImageUrls(html)).toHaveLength(0);
    });

    it('should filter out favicon URLs', () => {
      const html = '<img src="https://example.com/favicon.ico">';
      expect(extractImageUrls(html)).toHaveLength(0);
    });

    it('should filter out avatar URLs', () => {
      const html = '<img src="https://example.com/avatar.jpg">';
      expect(extractImageUrls(html)).toHaveLength(0);
    });

    it('should filter out spinner/loading URLs', () => {
      const html = `
        <img src="https://example.com/spinner.gif">
        <img src="https://example.com/loading.svg">
      `;
      expect(extractImageUrls(html)).toHaveLength(0);
    });

    it('should keep valid artwork images', () => {
      const html = `
        <img src="https://example.com/artwork-image.jpg">
        <img src="https://payload.cargocollective.com/1/photo.jpg">
      `;
      const urls = extractImageUrls(html);
      expect(urls).toHaveLength(2);
    });
  });

  describe('background-image extraction', () => {
    it('should extract URLs from CSS background-image', () => {
      const html = '<div style="background-image: url(https://example.com/bg.jpg)"></div>';
      expect(extractImageUrls(html)).toContain('https://example.com/bg.jpg');
    });

    it('should handle quoted background-image URLs', () => {
      const html = `
        <div style="background-image: url('https://example.com/single.jpg')"></div>
        <div style="background-image: url(&quot;https://example.com/double.jpg&quot;)"></div>
      `;
      const urls = extractImageUrls(html);
      expect(urls).toContain('https://example.com/single.jpg');
    });

    it('should filter non-http background images', () => {
      const html = '<div style="background-image: url(/local/path.jpg)"></div>';
      expect(extractImageUrls(html)).toHaveLength(0);
    });
  });

  describe('data-src extraction (lazy loading)', () => {
    it('should extract URLs from data-src attributes', () => {
      const html = '<img src="placeholder.gif" data-src="https://example.com/lazy.jpg">';
      expect(extractImageUrls(html)).toContain('https://example.com/lazy.jpg');
    });

    it('should filter non-http data-src URLs', () => {
      const html = '<img data-src="/relative/lazy.jpg">';
      expect(extractImageUrls(html)).toHaveLength(0);
    });
  });

  describe('deduplication', () => {
    it('should remove duplicate URLs', () => {
      const html = `
        <img src="https://example.com/same.jpg">
        <img src="https://example.com/same.jpg">
        <div style="background-image: url(https://example.com/same.jpg)"></div>
      `;
      const urls = extractImageUrls(html);
      expect(urls).toHaveLength(1);
      expect(urls[0]).toBe('https://example.com/same.jpg');
    });
  });

  describe('empty input', () => {
    it('should return empty array for empty HTML', () => {
      expect(extractImageUrls('')).toEqual([]);
    });

    it('should return empty array for HTML without images', () => {
      expect(extractImageUrls('<div>No images here</div>')).toEqual([]);
    });
  });
});

describe('cleanHtml', () => {
  describe('script removal', () => {
    it('should remove script tags and content', () => {
      const html = '<div>Hello</div><script>alert("bad")</script><p>World</p>';
      const cleaned = cleanHtml(html);
      expect(cleaned).not.toContain('script');
      expect(cleaned).not.toContain('alert');
      expect(cleaned).toContain('Hello');
      expect(cleaned).toContain('World');
    });

    it('should remove multiline scripts', () => {
      const html = `
        <script type="text/javascript">
          var x = 1;
          console.log(x);
        </script>
        <div>Content</div>
      `;
      const cleaned = cleanHtml(html);
      expect(cleaned).not.toContain('var x');
      expect(cleaned).toContain('Content');
    });
  });

  describe('style removal', () => {
    it('should remove style tags and content', () => {
      const html = '<style>.class { color: red; }</style><div>Content</div>';
      const cleaned = cleanHtml(html);
      expect(cleaned).not.toContain('color: red');
      expect(cleaned).toContain('Content');
    });
  });

  describe('comment removal', () => {
    it('should remove HTML comments', () => {
      const html = '<div>Before</div><!-- This is a comment --><div>After</div>';
      const cleaned = cleanHtml(html);
      expect(cleaned).not.toContain('comment');
      expect(cleaned).toContain('Before');
      expect(cleaned).toContain('After');
    });

    it('should remove multiline comments', () => {
      const html = `
        <!--
          Multi
          line
          comment
        -->
        <div>Content</div>
      `;
      const cleaned = cleanHtml(html);
      expect(cleaned).not.toContain('Multi');
      expect(cleaned).toContain('Content');
    });
  });

  describe('SVG removal', () => {
    it('should remove SVG elements', () => {
      const html = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg><div>Content</div>';
      const cleaned = cleanHtml(html);
      expect(cleaned).not.toContain('svg');
      expect(cleaned).not.toContain('circle');
      expect(cleaned).toContain('Content');
    });
  });

  describe('whitespace compression', () => {
    it('should compress multiple spaces to single space', () => {
      const html = '<div>Hello    World</div>';
      const cleaned = cleanHtml(html);
      expect(cleaned).not.toContain('    ');
      expect(cleaned).toContain('Hello World');
    });

    it('should compress newlines and tabs', () => {
      const html = '<div>\n\t\tIndented\n\tcontent\n</div>';
      const cleaned = cleanHtml(html);
      expect(cleaned).not.toContain('\n');
      expect(cleaned).not.toContain('\t');
    });
  });

  describe('length limiting', () => {
    it('should truncate to 50000 characters', () => {
      const longHtml = 'a'.repeat(60000);
      const cleaned = cleanHtml(longHtml);
      expect(cleaned.length).toBe(50000);
    });

    it('should not truncate short HTML', () => {
      const shortHtml = '<div>Short content</div>';
      const cleaned = cleanHtml(shortHtml);
      expect(cleaned.length).toBeLessThan(50000);
    });
  });

  describe('edge cases', () => {
    it('should handle empty input', () => {
      expect(cleanHtml('')).toBe('');
    });

    it('should preserve useful content', () => {
      const html = `
        <html>
          <head>
            <title>Artwork Title</title>
            <script>console.log("remove me")</script>
          </head>
          <body>
            <h1>Guard, I / 守卫 I</h1>
            <p>Installation, 2024</p>
            <p>Silicone, fiberglass, magnets</p>
          </body>
        </html>
      `;
      const cleaned = cleanHtml(html);
      expect(cleaned).toContain('Guard, I');
      expect(cleaned).toContain('守卫 I');
      expect(cleaned).toContain('Installation');
      expect(cleaned).toContain('Silicone');
      expect(cleaned).not.toContain('remove me');
    });
  });
});
