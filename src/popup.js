/* Popup: asks the active tab's content script to start a summary. */
document.addEventListener('DOMContentLoaded', () => {
    const summarizeButton = document.getElementById('summarizeBtn');

    summarizeButton.addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id) return;

        try {
            await startSummarizer(tab.id);
        } catch (error) {
            console.error('Could not start the summarizer:', error);
        }

        window.close();
    });

    async function startSummarizer(tabId) {
        try {
            const response = await chrome.tabs.sendMessage(tabId, { action: 'START_SUMMARY' });
            if (response && response.started) return;
        } catch {
            // The tab was opened before the extension was installed or reloaded.
        }

        await chrome.scripting.executeScript({
            target: { tabId },
            files: ['shared.js', 'ai.js']
        });
        await chrome.tabs.sendMessage(tabId, { action: 'START_SUMMARY' });
    }
});
