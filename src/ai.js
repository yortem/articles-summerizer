// This file contains the logic for interacting with a free AI summarization API. 
// It formats the prompt according to the specified requirements and processes the response to display the summary.

async function summarizeText(content, selectedLanguage) {
    const { apiKey } = await chrome.storage.sync.get('apiKey');

    if (!apiKey) {
        throw new Error(chrome.i18n.getMessage('errorApiKeyNotFound'));
    }

    // Use Google Gemini API endpoint
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    // Improved prompt for better and more structured summaries
    const prompt = `
You are an expert text summarizer. Your goal is to provide a clear, concise, and easy-to-read summary of the provided article text.

Follow these steps:
1.  **Headline**: Create a short, engaging headline for the summary. This should be a single, impactful sentence. If the original article title is clickbait, this headline should directly answer the clickbait question.
2.  **Bullet Points**: Generate 3 to 5 key bullet points that capture the main ideas of the text. Each bullet point should be concise (6-10 words).
3.  **Expanded Summary**: After the bullet points, write a slightly more detailed summary of 2-3 sentences that elaborates on the main points.

**Response Format**:
-   Your entire response must be in ${selectedLanguage}.
-   Start with the headline, prefixed by '# '.
-   Follow with the bullet points, each on a new line and prefixed by '* '.
-   Follow with the expanded summary, prefixed by '> '.
-   Do not use any other formatting, HTML, or markdown.

Here is the text to summarize:
---
${content}
---`;

    const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        // Body format required by Google Gemini API
        body: JSON.stringify({
            "contents": [{
                "parts": [{
                    "text": prompt
                }]
            }]
        }),
    });

    if (!response.ok) {
        const errorBody = await response.json().catch(() => ({})); // Try to parse error
        const errorMessage = errorBody?.error?.message || `HTTP error! status: ${response.status}`;
        console.error("API Error:", errorMessage);
        const userFriendlyMessage = response.status === 400 ? chrome.i18n.getMessage('errorInvalidApiKey') : chrome.i18n.getMessage('errorApiFailed', errorMessage);
        throw new Error(userFriendlyMessage);
    }

    const data = await response.json();
    
    // Extract the summary text from the Gemini API response
    if (data.candidates && data.candidates[0] && data.candidates[0].content.parts[0].text) {
        let summaryText = data.candidates[0].content.parts[0].text;
        // The new prompt is less likely to produce markdown code blocks, but cleanup is still good practice if needed.
        return summaryText.trim();
    } else {
        throw new Error(chrome.i18n.getMessage('errorParse'));
    }
}

function markdownToHtml(text) {
    // Convert bold and italic (**text** or *text*)
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'); // This might be used by the AI despite instructions
    // Convert headings (# text)
    text = text.replace(/^#\s+(.*)/gm, '<h1>$1</h1>');
    // Convert expanded summary (> text)
    text = text.replace(/^>\s+(.*)/gm, '<p class="expanded-summary">$1</p>');
    // Convert list items (* text)
    const lines = text.split('\n');
    let inList = false;
    let html = lines.map(line => {
        line = line.trim();
        if (line.startsWith('* ')) return `<li>${line.substring(2).replace(/<p class="expanded-summary">.*<\/p>/, '')}</li>`; // Avoid nesting p in li
        return line; // Keep other lines as they are (like the h1)
    }).join('');
    return html.replace(/<li>/g, '<ul><li>').replace(/<\/li>(?!<li>)/g, '</li></ul>').replace(/<\/li><li>/g, '</li><li>');
}

function showLoadingState() {
    const existingContainer = document.getElementById('ai-summary-container');
    if (existingContainer) existingContainer.remove();

    // Create a host element for the Shadow DOM, same as in displaySummary
    const host = document.createElement('div');
    host.id = 'ai-summary-container';
    host.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        background-color: rgba(0, 0, 0, 0.4);
        z-index: 2147483647;
    `;

    const shadow = host.attachShadow({ mode: 'open' });

    // Create the container inside the Shadow DOM with the same styles
    const container = document.createElement('div');
    container.style.cssText = `
        min-width: 250px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border: 5px solid white;
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.15);
        padding: 40px;
        font-family: 'Open sans hebrew', Arial, sans-serif;
        font-size: 22px;
        color: #ffffff;
        text-align: center;
    `;
    container.innerHTML = chrome.i18n.getMessage('loadingMessage');
    shadow.appendChild(container);
    document.body.appendChild(host);
}

function handleOutsideClick(event) {
    const summaryContainer = document.getElementById('ai-summary-container');
    // If the click target is the host overlay itself, close the summary.
    // This correctly ignores clicks on the summary box (the child of the host's shadow DOM).
    if (summaryContainer && event.target === summaryContainer) {
        summaryContainer.remove();
        document.removeEventListener('click', handleOutsideClick, true); // Clean up the listener
    }
}

function displaySummary(summary, language) {
    // Remove existing summary if one exists
    const existingContainer = document.getElementById('ai-summary-container');
    if (existingContainer) {
        existingContainer.remove();
    }

    // Create a host element for the Shadow DOM
    const host = document.createElement('div');
    host.id = 'ai-summary-container';
    host.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        background-color: rgba(0, 0, 0, 0.4);
        z-index: 2147483647;
    `;
    
    // Create the Shadow DOM
    const shadow = host.attachShadow({ mode: 'open' });

    // Create the container inside the Shadow DOM
    const container = document.createElement('div');
    container.style.cssText = `
        width: 90vw;
        max-width: 600px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border: 5px solid white;
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.15);
        padding: 24px;
        direction: ${['Hebrew', 'Arabic'].includes(language) ? 'rtl' : 'ltr'};
        text-align: ${['Hebrew', 'Arabic'].includes(language) ? 'right' : 'left'};
        font-family: 'Open sans hebrew', Arial, sans-serif;
        line-height: 1.7;
        color: #ffffff;
        position: relative; /* For the close button */
    `;
    container.className = 'ai-summary-container';

    // Create the close button
    const closeButton = document.createElement('button');
    closeButton.innerText = '×';
    closeButton.style.cssText = `
        position: absolute; top: 10px; ${['Hebrew', 'Arabic'].includes(language) ? 'left: 15px;' : 'right: 15px;'} font-size: 24px;
        background: none; border: none; cursor: pointer; color: white; padding: 0; line-height: 1;
    `;
    closeButton.onclick = () => host.remove(); // Remove the host element

    // Add a style tag to control the font and h1 size within the container
    const style = document.createElement('style');
    style.textContent = `
        .ai-summary-container, .ai-summary-container * { font-family: 'Open sans hebrew' !important; font-size: 20px !important; }
        .ai-summary-container h1, .ai-summary-container h1 * { font-size: 20px !important; margin-top: 0; } /* Slightly smaller h1 */
        .ai-summary-container ul { padding-right: 20px; list-style-type: inherit; margin-top: 10px; margin-bottom: 10px; }
        .ai-summary-container li { line-height: 1.4; padding-bottom: 5px; }
        .ai-summary-container a { color: #d6d6ff; text-decoration: underline; }
        .ai-summary-container .expanded-summary { font-size: 16px !important; opacity: 0.9; margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.3); padding-top: 15px; }
        .ai-summary-container .error-message {
            display: flex;
            flex-direction: column;
            align-items: center;
        }
    `;

    // Create a wrapper for the content
    const contentWrapper = document.createElement('div');
    contentWrapper.innerHTML = markdownToHtml(summary);

    container.appendChild(contentWrapper);
    container.prepend(closeButton); // Add close button at the beginning
    shadow.appendChild(style);
    shadow.appendChild(container);
    document.body.appendChild(host);

    // Add listener to close the box when clicking outside
    setTimeout(() => document.addEventListener('click', handleOutsideClick, true), 0);
}

async function createSummarizerButton() {
    // Avoid creating multiple buttons
    if (document.getElementById('summarizer-button')) {
        return;
    }

    const button = document.createElement('button');
    button.id = 'summarizer-button';
    button.innerText = 'S'; // Short text for the button
    
    // Apply styles from popup.css via a class or directly
    button.style.cssText = `
        position: fixed;
        background-color: rgb(110 92 237);
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        padding: 0px 30px 5px 10px;
        cursor: pointer;
        z-index: 2147483647;
        transition: all 0.3s ease-in-out; /* Smoother transition for all properties */
        font-size: 15px;
        font-weight: bold;
        text-orientation: mixed;
    `;

    // Get position from storage and apply styles
    const { buttonPosition } = await chrome.storage.sync.get('buttonPosition');
    const position = buttonPosition || 'top-right'; // Default to top-right

    const hiddenOffset = '-20px';
    const visibleOffset = '0';

    switch (position) {
        case 'top-left':
            Object.assign(button.style, { top: '150px', left: hiddenOffset, borderRadius: '0 10px 10px 0' });
            button.onmouseover = () => { button.style.left = visibleOffset; };
            button.onmouseout = () => { button.style.left = hiddenOffset; };
            break;
        case 'bottom-right':
            Object.assign(button.style, { bottom: '50px', right: hiddenOffset, borderRadius: '10px 0 0 10px' });
            button.onmouseover = () => { button.style.right = visibleOffset; };
            button.onmouseout = () => { button.style.right = hiddenOffset; };
            break;
        case 'bottom-left':
            Object.assign(button.style, { bottom: '50px', left: hiddenOffset, borderRadius: '0 10px 10px 0' });
            button.onmouseover = () => { button.style.left = visibleOffset; };
            button.onmouseout = () => { button.style.left = hiddenOffset; };
            break;
        case 'top-right':
        default:
            Object.assign(button.style, { top: '150px', right: hiddenOffset, borderRadius: '10px 0 0 10px' });
            button.onmouseover = () => { button.style.right = visibleOffset; };
            button.onmouseout = () => { button.style.right = hiddenOffset; };
            break;
    }

    // Restore the click functionality to the floating button
    button.addEventListener('click', async () => {
        try {
            showLoadingState(); // Show loading spinner
            const content = document.body.innerText;
            const { preferredLanguage } = await chrome.storage.sync.get('preferredLanguage');
            const lang = preferredLanguage || 'English'; // Default to English if not set
            await summarizeText(content, lang).then(summary => displaySummary(summary, lang));
        } catch (error) {
            console.error(error);
            displaySummary(`<p style="color: #ffdddd;">${chrome.i18n.getMessage('genericError', error.message)}</p>`, 'English'); // Display error in the box
        }
    });

    document.body.appendChild(button);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'summarize') {
        showLoadingState(); // Show loading spinner
        summarizeText(request.content, request.selectedLanguage)
            .then(summary => {
                displaySummary(summary, request.selectedLanguage);
                sendResponse({ success: true });
            })
            .catch(error => {
                console.error(error);
                if (error.message === chrome.i18n.getMessage('errorApiKeyNotFound')) {
                    const optionsUrl = chrome.runtime.getURL('options.html'); // Keep this for the specific "not set" error
                    displaySummary(`<div class="error-message"><p>${chrome.i18n.getMessage('errorApiKeyMissing')}</p><p><a href="${optionsUrl}" target="_blank">${chrome.i18n.getMessage('errorSetApiKey')}</a></p></div>`, 'English');
                } else {
                    displaySummary(`<p style="color: #ffdddd;">${chrome.i18n.getMessage('genericError', error.message)}</p>`, 'English'); // Display error
                }
            });
        return true; // Indicates that the response will be sent asynchronously
    }
});

// Create the button when the script is injected
createSummarizerButton();