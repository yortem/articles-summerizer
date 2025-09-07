document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('apiKey');
    const saveButton = document.getElementById('save');
    const languageSelect = document.getElementById('language');
    const statusDiv = document.getElementById('status');

    // Load the saved settings
    chrome.storage.sync.get(['apiKey', 'preferredLanguage'], (result) => {
        if (result.apiKey) {
            apiKeyInput.value = result.apiKey;
        }
        if (result.preferredLanguage) {
            languageSelect.value = result.preferredLanguage;
        }
    });

    // Save the settings
    saveButton.addEventListener('click', () => {
        const apiKey = apiKeyInput.value;
        const preferredLanguage = languageSelect.value;

        chrome.storage.sync.set({ apiKey, preferredLanguage }, () => {
            // Display a success message instead of an alert
            statusDiv.textContent = 'Settings saved successfully!';
            // Clear the message after a few seconds
            setTimeout(() => { statusDiv.textContent = ''; }, 3000);
        });
    });
});