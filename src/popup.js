document.addEventListener('DOMContentLoaded', () => {
    const summarizeBtn = document.getElementById('summarizeBtn');
    const languageSelect = document.getElementById('language');

    // Load the preferred language and set it as the default in the dropdown
    chrome.storage.sync.get(['preferredLanguage'], (result) => {
        if (result.preferredLanguage) {
            languageSelect.value = result.preferredLanguage;
        }
    });

    summarizeBtn.addEventListener('click', () => {
        // Get the currently active tab
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0];
            if (activeTab && activeTab.id) {
                // 1. Inject the AI script into the active tab
                chrome.scripting.executeScript({ // This injects the script that listens for messages
                    target: { tabId: activeTab.id },
                    files: ['src/ai.js']
                }).then(() => {
                    // 2. Inject a function to get page content and then send the message
                    chrome.scripting.executeScript({
                        target: { tabId: activeTab.id },
                        func: (lang) => {
                            const content = document.body.innerText;
                            chrome.runtime.sendMessage({ action: "summarize", content: content, selectedLanguage: lang });
                        },
                        args: [languageSelect.value]
                    });
                    window.close(); // Close the popup immediately
                }).catch(err => console.error("Script injection failed: ", err));
            }
        });
    });
});