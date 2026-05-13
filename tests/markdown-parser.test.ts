import { MarkdownParser } from '../src/parsers/markdown-parser';

// ---------------------------------------------------------------------------
// parseInlineTags
// ---------------------------------------------------------------------------
describe('MarkdownParser.parseInlineTags', () => {
    it('parses a status tag', () => {
        const tags = MarkdownParser.parseInlineTags('@status/In Progress');
        expect(tags).toHaveLength(1);
        expect(tags[0]).toMatchObject({ type: 'status', value: 'In' }); // single-word value (space terminates)
    });

    it('parses an assignee tag', () => {
        const tags = MarkdownParser.parseInlineTags('@assignee/john.doe');
        expect(tags).toHaveLength(1);
        expect(tags[0]).toMatchObject({ type: 'assignee', value: 'john.doe' });
    });

    it('parses a priority tag', () => {
        const tags = MarkdownParser.parseInlineTags('@priority/2');
        expect(tags).toHaveLength(1);
        expect(tags[0]).toMatchObject({ type: 'priority', value: '2' });
    });

    it('parses a project tag', () => {
        const tags = MarkdownParser.parseInlineTags('@project/Q4-Roadmap');
        expect(tags).toHaveLength(1);
        expect(tags[0]).toMatchObject({ type: 'project', value: 'Q4-Roadmap' });
    });

    it('parses a label (hashtag)', () => {
        const tags = MarkdownParser.parseInlineTags('#bug');
        expect(tags).toHaveLength(1);
        expect(tags[0]).toMatchObject({ type: 'label', value: 'bug' });
    });

    it('parses multiple tags and sorts by position', () => {
        const content = '@assignee/alice @priority/1 #frontend';
        const tags = MarkdownParser.parseInlineTags(content);
        expect(tags.length).toBeGreaterThanOrEqual(3);
        // Positions should be non-decreasing
        for (let i = 1; i < tags.length; i++) {
            expect(tags[i].position.start).toBeGreaterThanOrEqual(tags[i - 1].position.start);
        }
    });

    it('returns empty array for content with no tags', () => {
        expect(MarkdownParser.parseInlineTags('Just some plain text.')).toEqual([]);
    });

    it('records correct start/end positions', () => {
        const content = '@priority/3';
        const tags = MarkdownParser.parseInlineTags(content);
        expect(tags[0].position.start).toBe(0);
        expect(tags[0].position.end).toBe(content.length);
    });

    it('is idempotent across multiple calls (regex state reset)', () => {
        const content = '@assignee/bob @priority/1';
        const first = MarkdownParser.parseInlineTags(content);
        const second = MarkdownParser.parseInlineTags(content);
        expect(second).toEqual(first);
    });
});

// ---------------------------------------------------------------------------
// extractTitle
// ---------------------------------------------------------------------------
describe('MarkdownParser.extractTitle', () => {
    it('extracts title from H1 heading', () => {
        expect(MarkdownParser.extractTitle('# My Issue Title\n\nSome body.')).toBe('My Issue Title');
    });

    it('falls back to the first line when no heading exists', () => {
        expect(MarkdownParser.extractTitle('Plain first line\nSecond line')).toBe('Plain first line');
    });

    it('returns "Untitled Issue" for empty content', () => {
        expect(MarkdownParser.extractTitle('')).toBe('Untitled Issue');
    });

    it('trims whitespace from heading', () => {
        expect(MarkdownParser.extractTitle('#   Spaced Title   \n\nBody')).toBe('Spaced Title');
    });
});

// ---------------------------------------------------------------------------
// convertToLinearDescription
// ---------------------------------------------------------------------------
describe('MarkdownParser.convertToLinearDescription', () => {
    it('strips frontmatter', () => {
        const content = '---\ntitle: Test\n---\nBody text.';
        expect(MarkdownParser.convertToLinearDescription(content)).toBe('Body text.');
    });

    it('strips inline tags', () => {
        const content = 'Fix the bug @assignee/alice @priority/1 #critical';
        const result = MarkdownParser.convertToLinearDescription(content);
        expect(result).not.toContain('@assignee/alice');
        expect(result).not.toContain('@priority/1');
    });

    it('converts wikilinks to plain links', () => {
        const result = MarkdownParser.convertToLinearDescription('See [[My Note]] for details.');
        expect(result).toContain('[My Note]');
        expect(result).not.toContain('[[');
    });

    it('converts Obsidian highlights to bold', () => {
        const result = MarkdownParser.convertToLinearDescription('This is ==important==.');
        expect(result).toContain('**important**');
    });

    it('returns trimmed output', () => {
        const result = MarkdownParser.convertToLinearDescription('  Hello  ');
        expect(result).toBe('Hello');
    });
});

// ---------------------------------------------------------------------------
// generateIssueReference
// ---------------------------------------------------------------------------
describe('MarkdownParser.generateIssueReference', () => {
    it('generates a markdown link to the Linear issue', () => {
        const ref = MarkdownParser.generateIssueReference('abc-123', 'ENG-42');
        expect(ref).toBe('[ENG-42](https://linear.app/issue/abc-123)');
    });
});

// ---------------------------------------------------------------------------
// embedIssueReference
// ---------------------------------------------------------------------------
describe('MarkdownParser.embedIssueReference', () => {
    const ref = '[ENG-1](https://linear.app/issue/id-1)';

    it('appends reference at the bottom by default', () => {
        const result = MarkdownParser.embedIssueReference('Body text.', ref);
        expect(result.endsWith(`**Linear Issue:** ${ref}\n---\n`)).toBe(true);
        expect(result.startsWith('Body text.')).toBe(true);
    });

    it('inserts reference at the top (after frontmatter) when position=top', () => {
        const content = '---\nfoo: bar\n---\nBody.';
        const result = MarkdownParser.embedIssueReference(content, ref, 'top');
        const frontmatterEnd = result.indexOf('---\n', 4) + 4; // end of closing ---
        expect(result.slice(frontmatterEnd)).toContain(`**Linear Issue:** ${ref}`);
        expect(result.endsWith('Body.')).toBe(true);
    });

    it('inserts at the very top when no frontmatter and position=top', () => {
        const result = MarkdownParser.embedIssueReference('Body.', ref, 'top');
        expect(result).toContain(`**Linear Issue:** ${ref}`);
        expect(result.endsWith('Body.')).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// replaceInlineTags
// ---------------------------------------------------------------------------
describe('MarkdownParser.replaceInlineTags', () => {
    it('replaces all matching tags', () => {
        const content = 'Fix @status/Todo and @status/Todo again.';
        const result = MarkdownParser.replaceInlineTags(content, {
            '@status/Todo': '@status/Done',
        });
        expect(result).toBe('Fix @status/Done and @status/Done again.');
    });

    it('handles regex special characters in tags safely', () => {
        const content = 'Issue [ENG-1] here.';
        const result = MarkdownParser.replaceInlineTags(content, { '[ENG-1]': '[ENG-99]' });
        expect(result).toBe('Issue [ENG-99] here.');
    });

    it('returns original string when no replacements match', () => {
        const content = 'No tags here.';
        expect(MarkdownParser.replaceInlineTags(content, { '@foo/bar': '@foo/baz' })).toBe(content);
    });
});
