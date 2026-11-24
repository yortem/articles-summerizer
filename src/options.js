/* Options page: loads shared configuration and persists user settings. */
document.addEventListener('DOMContentLoaded', () => {
    const {
        LANGUAGES,
        MODELS,
        DEFAULT_SETTINGS,
        normalizeLanguage
    } = globalThis.SummarizerShared;

    const apiKeyInput = document.getElementById('apiKey');
    const saveButton = document.getElementById('save');
    const languageSelect = document.getElementById('language');
    const modelSelect = document.getElementById('model');
    const statusDiv = document.getElementById('status');

    setLocaleText();
    setDirection();
    populateSelect(languageSelect, LANGUAGES, DEFAULT_SETTINGS.preferredLanguage);
    populateSelect(
        modelSelect,
        MODELS.map(model => ({
            value: model.id,
            label: chrome.i18n.getMessage('modelOptionLabel', [
                model.name,
                String(model.freePerDay)
            ]) || `${model.name} — ${model.freePerDay}/day`
        })),
        DEFAULT_SETTINGS.modelId
    );
    saveButton.disabled = true;
    void loadSettings();

    function setLocaleText() {
        document.querySelectorAll('[data-i18n]').forEach(element => {
            element.textContent = chrome.i18n.getMessage(element.getAttribute('data-i18n'));
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
            element.placeholder = chrome.i18n.getMessage(element.getAttribute('data-i18n-placeholder'));
        });
        document.title = chrome.i18n.getMessage('optionsTitle');
    }

    function setDirection() {
        const uiLanguage = chrome.i18n.getUILanguage();
        if (uiLanguage.startsWith('he') || uiLanguage.startsWith('ar')) {
            document.body.dir = 'rtl';
        }
    }

    function populateSelect(select, items, selectedValue) {
        select.replaceChildren();
        items.forEach(item => {
            const option = document.createElement('option');
            const value = typeof item === 'string' ? item : item.value;
            option.value = value;
            option.textContent = typeof item === 'string' ? item : item.label;
            if (value === selectedValue) option.selected = true;
            select.appendChild(option);
        });
    }

    async function loadSettings() {
        let loaded = false;
        try {
            const stored = await chrome.storage.sync.get(['apiKey', 'preferredLanguage', 'modelId']);

            if (stored.apiKey) apiKeyInput.value = stored.apiKey;

            if (stored.preferredLanguage) {
                languageSelect.value = normalizeLanguage(stored.preferredLanguage);
            }

            if (stored.modelId && MODELS.some(model => model.id === stored.modelId)) {
                modelSelect.value = stored.modelId;
            }
            loaded = true;
        } catch (error) {
            console.error('Could not load settings:', error);
        } finally {
            // Do not allow saving defaults over existing settings if loading failed.
            if (loaded) saveButton.disabled = false;
        }
    }

    saveButton.addEventListener('click', async () => {
        const settings = {
            apiKey: apiKeyInput.value.trim(),
            preferredLanguage: normalizeLanguage(languageSelect.value),
            modelId: modelSelect.value
        };

        try {
            await chrome.storage.sync.set(settings);
            statusDiv.textContent = chrome.i18n.getMessage('settingsSaved');
            setTimeout(() => { statusDiv.textContent = ''; }, 3000);
        } catch (error) {
            console.error('Could not save settings:', error);
            statusDiv.textContent = chrome.i18n.getMessage('errorSaveSettings', [error.message || '']);
        }
    });
});
