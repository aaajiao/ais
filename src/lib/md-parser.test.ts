import { describe, it, expect } from 'vitest';
import {
  parseMDBlock,
  parseMDFile,
  validateParsedArtwork,
  parseAndValidateMDFile,
} from './md-parser';

describe('parseMDBlock', () => {
  describe('title parsing', () => {
    it('should parse English-only title', () => {
      const content = '## Guard, I\n\n**Year**: 2024';
      const result = parseMDBlock(content);
      expect(result?.title_en).toBe('Guard, I');
      expect(result?.title_cn).toBeNull();
    });

    it('should parse bilingual title with " / " separator', () => {
      const content = '## Guard, I / 守卫 I\n\n**Year**: 2024';
      const result = parseMDBlock(content);
      expect(result?.title_en).toBe('Guard, I');
      expect(result?.title_cn).toBe('守卫 I');
    });

    it('should handle multiple "/" in title', () => {
      const content = '## Title Part 1 / 标题部分 1 / 副标题\n\n**Year**: 2024';
      const result = parseMDBlock(content);
      expect(result?.title_en).toBe('Title Part 1');
      expect(result?.title_cn).toBe('标题部分 1 / 副标题');
    });

    it('should return null for content without title', () => {
      const content = '**Year**: 2024\n**Type**: Installation';
      const result = parseMDBlock(content);
      expect(result).toBeNull();
    });
  });

  describe('field parsing', () => {
    it('should parse Year field', () => {
      const content = '## Test\n\n**Year**: 2024';
      const result = parseMDBlock(content);
      expect(result?.year).toBe('2024');
    });

    it('should parse Type field', () => {
      const content = '## Test\n\n**Type**: Installation';
      const result = parseMDBlock(content);
      expect(result?.type).toBe('Installation');
    });

    it('should parse Size as dimensions', () => {
      const content = '## Test\n\n**Size**: 75 x 75 x 140 cm';
      const result = parseMDBlock(content);
      expect(result?.dimensions).toBe('75 x 75 x 140 cm');
    });

    it('should parse Materials field', () => {
      const content = '## Test\n\n**Materials**: silicone, fiberglass, magnets';
      const result = parseMDBlock(content);
      expect(result?.materials).toBe('silicone, fiberglass, magnets');
    });

    it('should parse Duration field', () => {
      const content = "## Test\n\n**Duration**: 12'00\"";
      const result = parseMDBlock(content);
      expect(result?.duration).toBe("12'00\"");
    });

    it('should parse URL as source_url', () => {
      const content = '## Test\n\n**URL**: https://example.com/artwork';
      const result = parseMDBlock(content);
      expect(result?.source_url).toBe('https://example.com/artwork');
    });

    it('should parse multiple fields', () => {
      const content = `## Test Artwork

**Year**: 2024
**Type**: Sculpture
**Size**: 100 x 50 cm
**Materials**: bronze, steel`;

      const result = parseMDBlock(content);
      expect(result?.year).toBe('2024');
      expect(result?.type).toBe('Sculpture');
      expect(result?.dimensions).toBe('100 x 50 cm');
      expect(result?.materials).toBe('bronze, steel');
    });

    it('should skip Video field', () => {
      const content = '## Test\n\n**Video**: https://vimeo.com/123';
      const result = parseMDBlock(content);
      // Video should not be stored anywhere
      expect(result?.source_url).toBeNull();
    });

    it('should skip Description field', () => {
      const content = '## Test\n\n**Description**: Long description text here';
      const result = parseMDBlock(content);
      // No description field in result
      expect(result?.title_en).toBe('Test');
    });

    it('should handle multi-line values', () => {
      const content = `## Test

**Materials**: silicone, fiberglass,
magnets, LED lights,
custom electronics`;

      const result = parseMDBlock(content);
      expect(result?.materials).toBe('silicone, fiberglass, magnets, LED lights, custom electronics');
    });
  });

  describe('image extraction', () => {
    it('should extract images from <a href><img></a> format', () => {
      const content = `## Test

<a href="https://example.com/full.jpg"><img src="https://example.com/thumb.jpg"></a>`;

      const result = parseMDBlock(content);
      expect(result?.images).toContain('https://example.com/full.jpg');
    });

    it('should extract images from <img src> format', () => {
      const content = `## Test

<img src="https://example.com/image.jpg">`;

      const result = parseMDBlock(content);
      expect(result?.images).toContain('https://example.com/image.jpg');
    });

    it('should extract images from Markdown format', () => {
      const content = `## Test

![Artwork](https://example.com/image.jpg)`;

      const result = parseMDBlock(content);
      expect(result?.images).toContain('https://example.com/image.jpg');
    });

    it('should deduplicate images', () => {
      const content = `## Test

<a href="https://example.com/image.jpg"><img src="https://example.com/image.jpg"></a>
<img src="https://example.com/image.jpg">
![Alt](https://example.com/image.jpg)`;

      const result = parseMDBlock(content);
      expect(result?.images).toHaveLength(1);
      expect(result?.images[0]).toBe('https://example.com/image.jpg');
    });

    it('should filter non-http images', () => {
      const content = `## Test

<img src="/local/image.jpg">
<img src="data:image/png;base64,abc">
<img src="https://example.com/valid.jpg">`;

      const result = parseMDBlock(content);
      expect(result?.images).toHaveLength(1);
      expect(result?.images[0]).toBe('https://example.com/valid.jpg');
    });

    it('should extract multiple images', () => {
      const content = `## Test

<img src="https://example.com/image1.jpg">
<img src="https://example.com/image2.jpg">`;

      const result = parseMDBlock(content);
      expect(result?.images).toHaveLength(2);
    });
  });

  describe('edge cases', () => {
    it('should handle empty content', () => {
      expect(parseMDBlock('')).toBeNull();
    });

    it('should handle content with only whitespace', () => {
      expect(parseMDBlock('   \n\n   ')).toBeNull();
    });

    it('should handle fields without values', () => {
      const content = '## Test\n\n**Year**:';
      const result = parseMDBlock(content);
      expect(result?.year).toBeNull();
    });

    it('should handle special characters in field values', () => {
      const content = '## Test / 测试\n\n**Materials**: 钢铁、玻璃、LED';
      const result = parseMDBlock(content);
      expect(result?.materials).toBe('钢铁、玻璃、LED');
    });
  });
});

describe('parseMDFile', () => {
  it('should parse single artwork', () => {
    const content = '## Artwork 1\n\n**Year**: 2024';
    const results = parseMDFile(content);
    expect(results).toHaveLength(1);
    expect(results[0].title_en).toBe('Artwork 1');
  });

  it('should parse multiple artworks', () => {
    const content = `## Artwork 1

**Year**: 2023

## Artwork 2

**Year**: 2024`;

    const results = parseMDFile(content);
    expect(results).toHaveLength(2);
    expect(results[0].title_en).toBe('Artwork 1');
    expect(results[0].year).toBe('2023');
    expect(results[1].title_en).toBe('Artwork 2');
    expect(results[1].year).toBe('2024');
  });

  it('should skip invalid blocks', () => {
    const content = `## Valid Artwork

**Year**: 2024

Some random text without title

## Another Valid

**Type**: Sculpture`;

    const results = parseMDFile(content);
    expect(results).toHaveLength(2);
  });

  it('should handle empty file', () => {
    expect(parseMDFile('')).toHaveLength(0);
  });
});

describe('validateParsedArtwork', () => {
  it('should return warning for missing title', () => {
    const artwork = {
      title_en: '',
      title_cn: null,
      year: '2024',
      type: null,
      dimensions: null,
      materials: null,
      duration: null,
      source_url: 'https://example.com',
      images: [],
    };
    const warnings = validateParsedArtwork(artwork);
    expect(warnings).toContain('缺少作品标题');
  });

  it('should return warning for missing source_url', () => {
    const artwork = {
      title_en: 'Test',
      title_cn: null,
      year: '2024',
      type: null,
      dimensions: null,
      materials: null,
      duration: null,
      source_url: null,
      images: [],
    };
    const warnings = validateParsedArtwork(artwork);
    expect(warnings.some(w => w.includes('来源链接'))).toBe(true);
  });

  it('should return no warnings for valid artwork', () => {
    const artwork = {
      title_en: 'Test',
      title_cn: '测试',
      year: '2024',
      type: 'Installation',
      dimensions: '100 x 50 cm',
      materials: 'steel',
      duration: null,
      source_url: 'https://example.com/artwork',
      images: ['https://example.com/image.jpg'],
    };
    const warnings = validateParsedArtwork(artwork);
    expect(warnings).toHaveLength(0);
  });
});

describe('parseAndValidateMDFile', () => {
  it('should return artworks with warnings', () => {
    const content = `## Artwork Without URL

**Year**: 2024

## Complete Artwork

**Year**: 2024
**URL**: https://example.com`;

    const { artworks, warnings } = parseAndValidateMDFile(content);
    expect(artworks).toHaveLength(2);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].title).toBe('Artwork Without URL');
  });

  it('should handle file with all valid artworks', () => {
    const content = `## Artwork 1

**URL**: https://example.com/1

## Artwork 2

**URL**: https://example.com/2`;

    const { artworks, warnings } = parseAndValidateMDFile(content);
    expect(artworks).toHaveLength(2);
    expect(warnings).toHaveLength(0);
  });
});
