document.addEventListener('DOMContentLoaded', () => {
    // Function to set localized text
    const setLocaleText = () => {
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const messageKey = element.getAttribute('data-i18n');
            element.textContent = chrome.i18n.getMessage(messageKey);
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
            const messageKey = element.getAttribute('data-i18n-placeholder');
            element.placeholder = chrome.i18n.getMessage(messageKey);
        });
        document.title = chrome.i18n.getMessage('optionsTitle');
    };

    // Set initial text
    setLocaleText();

    // Set page direction for RTL languages
    const uiLang = chrome.i18n.getUILanguage();
    if (uiLang.startsWith('he') || uiLang.startsWith('ar')) {
        document.body.dir = 'rtl';
    }

    const apiKeyInput = document.getElementById('apiKey');
    const saveButton = document.getElementById('save');
    const languageSelect = document.getElementById('language');
    const buttonPositionSelect = document.getElementById('buttonPosition');
    const statusDiv = document.getElementById('status');

    // Load the saved settings
    chrome.storage.sync.get(['apiKey', 'preferredLanguage', 'buttonPosition'], (result) => {
        if (result.apiKey) {
            apiKeyInput.value = result.apiKey;
        }
        if (result.preferredLanguage) {
            languageSelect.value = result.preferredLanguage;
        }
        if (result.buttonPosition) {
            buttonPositionSelect.value = result.buttonPosition;
        }
    });

    // Save the settings
    saveButton.addEventListener('click', () => {
        const apiKey = apiKeyInput.value;
        const preferredLanguage = languageSelect.value;
        const buttonPosition = buttonPositionSelect.value;

        chrome.storage.sync.set({ apiKey, preferredLanguage, buttonPosition }, () => {
            // Display a success message instead of an alert
            statusDiv.textContent = chrome.i18n.getMessage('settingsSaved');
            // Clear the message after a few seconds
            setTimeout(() => { statusDiv.textContent = ''; }, 3000);
        });
    });
});