// This file contains the background script for the Chrome extension. 
// It manages events and communicates between the content script and the popup.

chrome.action.onClicked.addListener(async (tab) => {
    if (tab.id) {
        try {
            // 1. Inject the content script that can receive messages
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['src/ai.js']
            });
            
            // 2. Get preferred language from storage
            const { preferredLanguage } = await chrome.storage.sync.get('preferredLanguage');
            const lang = preferredLanguage || 'English'; // Default to English
            
            // 3. Execute a script to get page content
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => document.body.innerText
            }, (injectionResults) => {
                // 4. Send the content to the now-active content script
                const content = injectionResults[0].result;
                chrome.tabs.sendMessage(tab.id, { action: "summarize", content, selectedLanguage: lang });
            });
        } catch (err) {
            console.error(`Failed to summarize: ${err}`);
        }
    }
});