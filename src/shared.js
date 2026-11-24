/*
 * Shared configuration and tiny helpers used by every extension context.
 *
 * Loaded via importScripts() in the service worker, injected into the page
 * before ai.js, and with a <script> tag in the options/popup pages.
 * Keep this file dependency-free and safe to evaluate more than once.
 */
(() => {
    // Free-tier models only. The quota is per model per project (requests/day),
    // so users can switch models when one bucket is exhausted.
    const MODELS = [
        {
            id: 'gemini-3.5-flash-lite',
            name: 'Gemini 3.5 Flash-Lite',
            thinkingLevel: 'MINIMAL',
            freePerDay: 500
        },
        {
            id: 'gemini-3.1-flash-lite',
            name: 'Gemini 3.1 Flash-Lite',
            thinkingLevel: 'MINIMAL',
            freePerDay: 500
        },
        {
            id: 'gemini-3.8-flash',
            name: 'Gemini 3.8 Flash',
            thinkingLevel: 'LOW',
            freePerDay: 20
        },
        {
            id: 'gemini-3.6-flash',
            name: 'Gemini 3.6 Flash',
            thinkingLevel: 'LOW',
            freePerDay: 20
        }
    ];

    const LANGUAGES = [
        'English', 'Hebrew', 'Arabic', 'Spanish', 'French', 'German', 'Italian',
        'Japanese', 'Korean', 'Portuguese', 'Russian', 'Chinese', 'Dutch',
        'Swedish', 'Turkish', 'Ukrainian', 'Vietnamese', 'Hindi', 'Indonesian',
        'Thai', 'Persian', 'Urdu'
    ];

    const LANGUAGE_BY_CODE = {
        en: 'English', he: 'Hebrew', iw: 'Hebrew', ar: 'Arabic', es: 'Spanish',
        fr: 'French', de: 'German', it: 'Italian', ja: 'Japanese', ko: 'Korean',
        pt: 'Portuguese', ru: 'Russian', zh: 'Chinese', nl: 'Dutch', sv: 'Swedish',
        tr: 'Turkish', uk: 'Ukrainian', vi: 'Vietnamese', hi: 'Hindi',
        id: 'Indonesian', th: 'Thai', fa: 'Persian', ur: 'Urdu'
    };

    const RTL_LANGUAGES = new Set(['Hebrew', 'Arabic', 'Persian', 'Urdu']);

    const LIMITS = Object.freeze({
        // Long-read sized payload; keeps cost and latency predictable.
        maxArticleChars: 45000,
        minArticleChars: 200,
        maxOutputTokens: 2048,
        requestTimeoutMs: 45000,
        cacheTtlMs: 24 * 60 * 60 * 1000,
        maxCacheEntries: 60
    });

    const DEFAULT_SETTINGS = Object.freeze({
        preferredLanguage: 'English',
        modelId: MODELS[0].id
    });

    /** Trim text to a paragraph/sentence boundary near `max`. */
    function clipText(text, max = LIMITS.maxArticleChars) {
        if (typeof text !== 'string') return '';
        const normalized = text.replace(/\r\n?/g, '\n').trim();
        if (normalized.length <= max) return normalized;

        const slice = normalized.slice(0, max);
        const candidates = [
            slice.lastIndexOf('\n\n'),
            slice.lastIndexOf('. '),
            slice.lastIndexOf('! '),
            slice.lastIndexOf('? ')
        ];
        const cut = Math.max(...candidates);
        return (cut > max * 0.7 ? slice.slice(0, cut + 1) : slice).trim();
    }

    function isRtlLanguage(language) {
        return RTL_LANGUAGES.has(language);
    }

    /** Accept both display names ("Hebrew") and codes ("he", "he-IL"). */
    function normalizeLanguage(value) {
        if (typeof value !== 'string' || !value.trim()) {
            return DEFAULT_SETTINGS.preferredLanguage;
        }

        const display = value.trim();
        if (LANGUAGES.includes(display)) return display;

        const byName = LANGUAGES.find(language => language.toLowerCase() === display.toLowerCase());
        if (byName) return byName;

        const base = display.toLowerCase().split(/[-_]/)[0];
        return LANGUAGE_BY_CODE[base] || DEFAULT_SETTINGS.preferredLanguage;
    }

    function estimateReadingTime(text) {
        if (typeof text !== 'string' || !text.trim()) return 1;
        const words = text.trim().split(/\s+/).filter(Boolean).length;
        return Math.max(1, Math.ceil(words / 220));
    }

    function getModel(modelId) {
        return MODELS.find(model => model.id === modelId) || null;
    }

    globalThis.SummarizerShared = Object.freeze({
        MODELS,
        LANGUAGES,
        DEFAULT_SETTINGS,
        LIMITS,
        clipText,
        isRtlLanguage,
        normalizeLanguage,
        estimateReadingTime,
        getModel
    });
})();
