import {
    setDynamicProperty,
    getDynamicProperty,
    hasProperty,
} from '../src/utils/type-utils';

describe('setDynamicProperty', () => {
    it('sets a new property on an object', () => {
        const obj: Record<string, unknown> = {};
        setDynamicProperty(obj, 'foo', 'bar');
        expect(obj['foo']).toBe('bar');
    });

    it('overwrites an existing property', () => {
        const obj: Record<string, unknown> = { foo: 'old' };
        setDynamicProperty(obj, 'foo', 'new');
        expect(obj['foo']).toBe('new');
    });

    it('handles numeric values', () => {
        const obj: Record<string, unknown> = {};
        setDynamicProperty(obj, 'count', 42);
        expect(obj['count']).toBe(42);
    });

    it('handles nested object values', () => {
        const obj: Record<string, unknown> = {};
        const nested = { a: 1 };
        setDynamicProperty(obj, 'nested', nested);
        expect(obj['nested']).toBe(nested);
    });
});

describe('getDynamicProperty', () => {
    it('retrieves an existing property', () => {
        const obj: Record<string, unknown> = { name: 'Alice' };
        expect(getDynamicProperty<string>(obj, 'name')).toBe('Alice');
    });

    it('returns undefined for a missing property', () => {
        const obj: Record<string, unknown> = {};
        expect(getDynamicProperty<string>(obj, 'missing')).toBeUndefined();
    });

    it('returns the correct type when casting', () => {
        const obj: Record<string, unknown> = { count: 7 };
        const val = getDynamicProperty<number>(obj, 'count');
        expect(typeof val).toBe('number');
        expect(val).toBe(7);
    });
});

describe('hasProperty', () => {
    it('returns true when property exists and is not undefined', () => {
        const obj: Record<string, unknown> = { key: 'value' };
        expect(hasProperty(obj, 'key')).toBe(true);
    });

    it('returns false when property is missing', () => {
        const obj: Record<string, unknown> = {};
        expect(hasProperty(obj, 'key')).toBe(false);
    });

    it('returns false when property is explicitly undefined', () => {
        const obj: Record<string, unknown> = { key: undefined };
        expect(hasProperty(obj, 'key')).toBe(false);
    });

    it('returns true for falsy but defined values (null, 0, empty string)', () => {
        const obj: Record<string, unknown> = { a: null, b: 0, c: '' };
        expect(hasProperty(obj, 'a')).toBe(true);
        expect(hasProperty(obj, 'b')).toBe(true);
        expect(hasProperty(obj, 'c')).toBe(true);
    });
});
