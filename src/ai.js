/*
 * Content script: article extraction + summary UI.
 *
 * All model output is rendered with textContent / createElement (never
 * innerHTML), so a malicious page or model response cannot inject markup.
 */
(() => {
    if (globalThis.__articlesSummarizerLoaded) return;
    globalThis.__articlesSummarizerLoaded = true;

    const {
        LIMITS,
        clipText,
        isRtlLanguage,
        estimateReadingTime,
        getModel
    } = globalThis.SummarizerShared;

    const HOST_ID = 'ai-summary-container';
    const LOADING_DELAY_MS = 120;
    const MESSAGE_TIMEOUT_MS = 60000;

    const ERROR_MESSAGE_KEYS = {
        MISSING_KEY: 'errorApiKeyNotFound',
        INVALID_KEY: 'errorInvalidApiKey',
        AUTH: 'errorAuth',
        QUOTA: 'errorQuota',
        TIMEOUT: 'errorTimeout',
        NETWORK: 'errorNetwork',
        BLOCKED: 'errorBlocked',
        TRUNCATED: 'errorTruncated',
        NO_CONTENT: 'errorNoContent',
        MODEL_NOT_FOUND: 'errorModel',
        PARSE: 'errorParse',
        EMPTY: 'errorParse',
        CONTEXT_LOST: 'errorContextLost',
        UNKNOWN: 'errorUnknown',
        API_ERROR: 'errorApiFailed',
        UPSTREAM: 'errorApiFailed'
    };

    const SETTINGS_ERROR_CODES = new Set(['MISSING_KEY', 'INVALID_KEY', 'AUTH', 'MODEL_NOT_FOUND', 'QUOTA']);
    const RETRYABLE_CODES = new Set([
        'QUOTA', 'TIMEOUT', 'NETWORK', 'TRUNCATED', 'PARSE', 'EMPTY',
        'UNKNOWN', 'API_ERROR', 'UPSTREAM'
    ]);

    let isBusy = false;
    let activeRun = 0;
    let currentView = null;

    /* ---------------------------------------------------------------------- */
    /* Messaging                                                              */
    /* ---------------------------------------------------------------------- */

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (!message || message.action !== 'START_SUMMARY') return undefined;
        void runSummary({ force: false });
        sendResponse({ started: true });
        return undefined;
    });

    function sendToBackground(payload) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(appError('TIMEOUT')), MESSAGE_TIMEOUT_MS);

            try {
                chrome.runtime.sendMessage({ action: 'SUMMARIZE', payload }, response => {
                    clearTimeout(timer);
                    const runtimeError = chrome.runtime.lastError;
                    if (runtimeError) {
                        reject(appError(mapRuntimeError(runtimeError.message), runtimeError.message));
                        return;
                    }
                    resolve(response);
                });
            } catch (error) {
                clearTimeout(timer);
                reject(appError(mapRuntimeError(error && error.message), error && error.message));
            }
        });
    }

    function mapRuntimeError(message = '') {
        if (/context invalidated|receiving end does not exist|message port closed/i.test(message)) {
            return 'CONTEXT_LOST';
        }
        return 'NETWORK';
    }

    function appError(code, details = '') {
        const error = new Error(details || code);
        error.code = code;
        error.details = details;
        return error;
    }

    /** Safe i18n lookup: an invalidated extension context must not break the UI. */
    function t(key, args) {
        try {
            return chrome.i18n.getMessage(key, args) || key;
        } catch {
            return key;
        }
    }

    function extensionUrl(path) {
        try {
            return chrome.runtime.getURL(path);
        } catch {
            return '';
        }
    }

    function uiIsRtl() {
        try {
            return /^(he|ar|fa|ur)/i.test(chrome.i18n.getUILanguage());
        } catch {
            return false;
        }
    }

    /* ---------------------------------------------------------------------- */
    /* Article extraction                                                     */
    /* ---------------------------------------------------------------------- */

    const ROOT_SELECTORS = [
        'article',
        'main',
        '[role="main"]',
        '[itemprop="articleBody"]',
        '.article-body',
        '.article__body',
        '.post-content',
        '.entry-content',
        '.post-body',
        '.story-body'
    ];

    const NOISE_LINE = /^(advertisement|advertising|sponsored|read more|share|share this|subscribe|sign up|log in|menu|skip to content)$/i;

    function extractArticle() {
        const root = findBestRoot();
        let text = cleanText(root ? root.innerText : '');

        if (text.length < 400 && root !== document.body) {
            text = cleanText(document.body ? document.body.innerText : '');
        }

        return {
            title: getTitle(),
            text: clipText(text, LIMITS.maxArticleChars),
            readingTimeMinutes: estimateReadingTime(text)
        };
    }

    function findBestRoot() {
        let best = null;
        let bestScore = 0;

        for (const selector of ROOT_SELECTORS) {
            for (const element of document.querySelectorAll(selector)) {
                if (!(element instanceof HTMLElement)) continue;
                const blocks = element.querySelectorAll('p, li, blockquote, h2, h3');
                let score = 0;
                blocks.forEach(block => {
                    const value = (block.textContent || '').trim();
                    if (value.length > 40) score += value.length;
                });
                if (score > bestScore) {
                    best = element;
                    bestScore = score;
                }
            }
        }

        return bestScore >= 200 ? best : document.body;
    }

    function cleanText(value) {
        if (typeof value !== 'string') return '';
        return value
            .replace(/\u00a0/g, ' ')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .replace(/[ \t]+/g, ' ')
            .replace(/ *\n */g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .split('\n')
            .filter(line => !NOISE_LINE.test(line.trim()))
            .join('\n')
            .trim();
    }

    function getTitle() {
        const ogTitle = document.querySelector('meta[property="og:title"]');
        const heading = document.querySelector('h1');
        const raw = (ogTitle && ogTitle.content)
            || (heading && heading.innerText)
            || document.title
            || '';
        return raw.replace(/\s+/g, ' ').trim().slice(0, 300);
    }

    function getPageUrl() {
        try {
            const url = new URL(location.href);
            // Strip query and hash: they often contain private tokens and are
            // not needed to summarize the article.
            return `${url.origin}${url.pathname}`;
        } catch {
            return '';
        }
    }

    /* ---------------------------------------------------------------------- */
    /* Run                                                                    */
    /* ---------------------------------------------------------------------- */

    async function runSummary({ force = false } = {}) {
        if (isBusy) return;

        isBusy = true;
        const runId = ++activeRun;
        clearView();

        const loadingTimer = setTimeout(() => {
            if (runId === activeRun) showLoading();
        }, LOADING_DELAY_MS);

        try {
            const article = extractArticle();
            if (!article.text || article.text.length < LIMITS.minArticleChars) {
                throw appError('NO_CONTENT');
            }

            const response = await sendToBackground({
                text: article.text,
                title: article.title,
                url: getPageUrl(),
                readingTimeMinutes: article.readingTimeMinutes,
                force
            });

            if (runId !== activeRun) return;
            clearTimeout(loadingTimer);

            if (!response || response.ok !== true) {
                const error = response && response.error ? response.error : {};
                throw appError(error.code || 'UNKNOWN', error.details || '');
            }

            renderSummary(response.summary, response.meta || {});
        } catch (error) {
            if (runId !== activeRun) return;
            clearTimeout(loadingTimer);
            console.error('Summarizer:', error);
            renderError(error);
        } finally {
            clearTimeout(loadingTimer);
            if (runId === activeRun) isBusy = false;
        }
    }

    /* ---------------------------------------------------------------------- */
    /* View plumbing                                                          */
    /* ---------------------------------------------------------------------- */

    const STYLES = `
        :host { all: initial; }
        * { box-sizing: border-box; }
        .overlay {
            position: fixed;
            inset: 0;
            z-index: 2147483647;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            background: rgba(18, 14, 36, 0.55);
            backdrop-filter: blur(2px);
        }
        .card {
            position: relative;
            width: min(640px, 92vw);
            max-height: 86vh;
            overflow: auto;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border: 4px solid #ffffff;
            border-radius: 16px;
            box-shadow: 0 18px 60px rgba(0, 0, 0, 0.35);
            padding: 26px 28px;
            color: #ffffff;
            font-family: "Segoe UI", "Arial Hebrew", "Noto Sans Hebrew", "Noto Sans Arabic", Arial, sans-serif;
            font-size: 17px;
            line-height: 1.65;
            text-align: start;
        }
        .card[dir="rtl"] { text-align: right; }
        .card--loading {
            width: auto;
            min-width: 260px;
            max-width: 420px;
            text-align: center;
            padding: 32px 36px;
        }
        .actions {
            position: absolute;
            top: 8px;
            inset-inline-end: 10px;
            display: flex;
            gap: 2px;
        }
        .icon-btn {
            width: 32px;
            height: 32px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border: 0;
            border-radius: 8px;
            background: transparent;
            color: #ffffff;
            font: inherit;
            font-size: 22px;
            line-height: 1;
            cursor: pointer;
            opacity: 0.85;
        }
        .icon-btn:hover { background: rgba(255, 255, 255, 0.18); opacity: 1; }
        .icon-btn:focus-visible { outline: 2px solid #ffffff; outline-offset: 2px; }
        h1 {
            margin: 0;
            padding-inline-end: 66px;
            font-size: 21px;
            line-height: 1.35;
            font-weight: 700;
        }
        .tldr {
            margin: 14px 0 0;
            padding: 10px 14px;
            border-radius: 10px;
            background: rgba(255, 255, 255, 0.15);
            font-size: 16.5px;
            font-weight: 600;
        }
        .bullets {
            margin: 14px 0 0;
            padding-inline-start: 22px;
        }
        .bullets li { margin: 5px 0; }
        .summary { margin: 14px 0 0; }
        details {
            margin-top: 12px;
            padding: 8px 14px;
            border-radius: 10px;
            background: rgba(255, 255, 255, 0.12);
        }
        summary { cursor: pointer; font-weight: 700; }
        summary:focus-visible { outline: 2px solid #ffffff; outline-offset: 2px; border-radius: 4px; }
        dl { margin: 8px 0 2px; }
        dt { font-weight: 700; }
        dd { margin: 0 0 8px; }
        dd:last-child { margin-bottom: 0; }
        .meta {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 18px;
            padding-top: 12px;
            border-top: 1px solid rgba(255, 255, 255, 0.3);
            font-size: 13px;
        }
        .chip {
            padding: 2px 10px;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.16);
            white-space: nowrap;
        }
        .chip--warning {
            background: #ffe1e1;
            color: #7a1f1f;
            font-weight: 700;
        }
        .loading-row {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            font-size: 17px;
        }
        .spinner {
            width: 22px;
            height: 22px;
            border: 3px solid rgba(255, 255, 255, 0.35);
            border-top-color: #ffffff;
            border-radius: 50%;
            animation: summarizer-spin 0.8s linear infinite;
            flex: 0 0 auto;
        }
        @keyframes summarizer-spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
            .spinner { animation: none; }
        }
        .error-card { text-align: center; }
        .error-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 46px;
            height: 46px;
            margin-bottom: 8px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.18);
            font-size: 26px;
            font-weight: 700;
        }
        .error-title { margin: 0 0 8px; font-size: 20px; }
        .error-message { margin: 0; }
        .error-details {
            margin: 10px 0 0;
            font-size: 12.5px;
            opacity: 0.8;
            overflow-wrap: anywhere;
        }
        .error-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            justify-content: center;
            margin-top: 18px;
        }
        .action-btn {
            display: inline-block;
            padding: 8px 16px;
            border-radius: 8px;
            border: 1px solid rgba(255, 255, 255, 0.8);
            background: rgba(255, 255, 255, 0.16);
            color: #ffffff;
            font: inherit;
            font-size: 15px;
            font-weight: 700;
            text-decoration: none;
            cursor: pointer;
        }
        .action-btn:hover { background: rgba(255, 255, 255, 0.28); }
        .action-btn:focus-visible { outline: 2px solid #ffffff; outline-offset: 2px; }
        @media (max-width: 520px) {
            .overlay { padding: 12px; }
            .card { padding: 22px 18px; }
            h1 { font-size: 19px; }
        }
    `;

    function clearView() {
        if (currentView) {
            currentView.cleanup();
            currentView.host.remove();
            currentView = null;
        }
        const stale = document.getElementById(HOST_ID);
        if (stale) stale.remove();
    }

    function dismiss() {
        activeRun += 1;
        isBusy = false;
        clearView();
    }

    function mount(buildCard) {
        clearView();

        const host = document.createElement('div');
        host.id = HOST_ID;
        host.style.cssText = 'all: initial;';

        const shadow = host.attachShadow({ mode: 'open' });
        applyStyles(shadow);

        const overlay = document.createElement('div');
        overlay.className = 'overlay';

        const card = document.createElement('div');
        card.className = 'card';
        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-modal', 'true');
        card.dir = uiIsRtl() ? 'rtl' : 'ltr';

        overlay.appendChild(card);
        shadow.appendChild(overlay);
        document.body.appendChild(host);

        const onKeyDown = event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                dismiss();
            }
        };
        overlay.addEventListener('click', event => {
            if (event.target === overlay) dismiss();
        });
        document.addEventListener('keydown', onKeyDown, true);

        currentView = {
            host,
            cleanup: () => document.removeEventListener('keydown', onKeyDown, true)
        };

        buildCard(card, shadow);
        return card;
    }

    function applyStyles(shadow) {
        try {
            const sheet = new CSSStyleSheet();
            sheet.replaceSync(STYLES);
            shadow.adoptedStyleSheets = [sheet];
            return;
        } catch {
            // Older engines: fall back to a <style> element.
        }

        const style = document.createElement('style');
        style.textContent = STYLES;
        shadow.appendChild(style);
    }

    function addActions(card, { onRefresh } = {}) {
        const actions = document.createElement('div');
        actions.className = 'actions';

        if (onRefresh) {
            actions.appendChild(iconButton('↻', 'refreshLabel', onRefresh));
        }
        actions.appendChild(iconButton('×', 'closeLabel', dismiss));
        card.appendChild(actions);
    }

    function iconButton(glyph, labelKey, onClick) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'icon-btn';
        button.textContent = glyph;
        button.title = t(labelKey);
        button.setAttribute('aria-label', button.title);
        button.addEventListener('click', onClick);
        return button;
    }

    function element(tag, text, className) {
        const node = document.createElement(tag);
        if (text) node.textContent = text;
        if (className) node.className = className;
        return node;
    }

    /* ---------------------------------------------------------------------- */
    /* Views                                                                  */
    /* ---------------------------------------------------------------------- */

    function showLoading() {
        const card = mount(currentCard => {
            currentCard.classList.add('card--loading');
            addActions(currentCard);

            const row = element('div', '', 'loading-row');
            const spinner = element('span', '', 'spinner');
            spinner.setAttribute('aria-hidden', 'true');
            row.appendChild(spinner);
            row.appendChild(element('span', t('loadingMessage')));
            currentCard.appendChild(row);

            currentCard.setAttribute('aria-label', t('loadingMessage'));
        });
        card.setAttribute('aria-busy', 'true');
    }

    function renderSummary(summary, meta) {
        if (!summary || !summary.headline) {
            renderError(appError('PARSE'));
            return;
        }

        const language = meta.language || 'English';
        const rtl = isRtlLanguage(language);

        mount(card => {
            card.dir = rtl ? 'rtl' : 'ltr';
            card.setAttribute('dir', card.dir);
            card.setAttribute('aria-label', summary.headline);

            addActions(card, {
                onRefresh: () => {
                    void runSummary({ force: true });
                }
            });

            card.appendChild(element('h1', summary.headline));

            if (summary.tldr) {
                card.appendChild(element('p', summary.tldr, 'tldr'));
            }

            if (Array.isArray(summary.bullets) && summary.bullets.length) {
                const list = element('ul', '', 'bullets');
                summary.bullets.forEach(item => list.appendChild(element('li', item)));
                card.appendChild(list);
            }

            if (summary.summary) {
                card.appendChild(element('p', summary.summary, 'summary'));
            }

            if (Array.isArray(summary.keyTerms) && summary.keyTerms.length) {
                const list = document.createElement('dl');
                summary.keyTerms.forEach(item => {
                    list.appendChild(element('dt', item.term));
                    list.appendChild(element('dd', item.definition));
                });
                card.appendChild(detailsBlock('keyTermsTitle', list));
            }

            if (Array.isArray(summary.questions) && summary.questions.length) {
                const list = element('ul', '', 'bullets');
                summary.questions.forEach(item => list.appendChild(element('li', item)));
                card.appendChild(detailsBlock('questionsTitle', list));
            }

            card.appendChild(buildMeta(summary, meta));
        });
    }

    function detailsBlock(titleKey, body) {
        const details = document.createElement('details');
        details.appendChild(element('summary', t(titleKey)));
        details.appendChild(body);
        return details;
    }

    function buildMeta(summary, meta) {
        const bar = element('div', '', 'meta');

        const minutes = Number(summary.readingTimeMinutes);
        if (Number.isFinite(minutes) && minutes > 0) {
            bar.appendChild(element('span', t('readingTime', [String(Math.round(minutes))]), 'chip'));
        }

        const modelName = (getModel(meta.model) || {}).name || meta.model;
        if (modelName) {
            bar.appendChild(element('span', t('summaryByModel', [modelName]), 'chip'));
        }

        if (meta.cached) {
            bar.appendChild(element('span', t('cachedLabel'), 'chip'));
        }

        if (meta.languageMismatch) {
            bar.appendChild(element('span', t('languageWarning'), 'chip chip--warning'));
        }

        return bar;
    }

    function renderError(error) {
        const code = error && error.code ? error.code : 'UNKNOWN';
        const details = error && error.details ? String(error.details).slice(0, 300) : '';
        const messageKey = ERROR_MESSAGE_KEYS[code] || 'errorApiFailed';
        const message = t(messageKey, [details || code]);

        mount(card => {
            card.classList.add('error-card');
            card.setAttribute('aria-label', message);
            addActions(card);

            card.appendChild(element('div', '!', 'error-icon'));
            card.appendChild(element('h2', t('errorTitle'), 'error-title'));
            card.appendChild(element('p', message, 'error-message'));

            const actions = element('div', '', 'error-actions');

            if (RETRYABLE_CODES.has(code)) {
                const retry = element('button', t('retryButton'), 'action-btn');
                retry.type = 'button';
                retry.addEventListener('click', () => {
                    void runSummary({ force: true });
                });
                actions.appendChild(retry);
            }

            if (SETTINGS_ERROR_CODES.has(code)) {
                const link = element('a', t('errorSetApiKey'), 'action-btn');
                link.href = extensionUrl('options.html');
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                actions.appendChild(link);
            }

            if (actions.childElementCount) card.appendChild(actions);

            if (details && (code === 'UNKNOWN' || code === 'API_ERROR' || code === 'UPSTREAM')) {
                card.appendChild(element('p', details, 'error-details'));
            }
        });
    }
})();
