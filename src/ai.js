// This file contains the logic for interacting with a free AI summarization API. 
// It formats the prompt according to the specified requirements and processes the response to display the summary.

async function summarizeText(content, selectedLanguage) {
    const { apiKey } = await chrome.storage.sync.get('apiKey');

    if (!apiKey) {
        throw new Error('API Key not found. Please set it in the extension options.');
    }

    // Use Google Gemini API endpoint
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const prompt = `
    Summarize the text I give you in 1 sentence. make it bold and big at the top of the text inside a different div. 
    Then, make a list <ul> with up to 5 concise bulletpoints (perfer 3 if there's no need for more info). 
    Your response should be in ${selectedLanguage}. Use short text in each bulletpoint, up to 6-10 words. 
    if the title of the article has a clickbait, make the answer of that clickbait be bold.
    In cases where the title is ambiguous or does not provide clear context, base your summary solely on the content provided with explicit content, like numbers and names if needed.
    Use the following content: ${content}. don't add any css to the text, just html tags.`;

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
        if (response.status === 401) {
            throw new Error('Authentication failed. Please check your API key in the extension options.');
        }
        throw new Error('Failed to fetch summary from AI API');
    }

    const data = await response.json();
    
    // Extract the summary text from the Gemini API response
    if (data.candidates && data.candidates[0] && data.candidates[0].content.parts[0].text) {
        let summaryText = data.candidates[0].content.parts[0].text;
        // Clean up markdown code blocks that the AI might add
        summaryText = summaryText.replace(/```html/g, '');
        summaryText = summaryText.replace(/```/g, '');
        return summaryText.trim();
    } else {
        throw new Error('Could not parse summary from API response.');
    }
}

function markdownToHtml(text) {
    // Convert bold and italic (**text** or *text*)
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Convert headings (# text)
    text = text.replace(/^#\s+(.*)/gm, '<h1>$1</h1>');
    // Convert list items (* text)
    const lines = text.split('\n');
    const htmlLines = lines.map(line => {
        if (line.trim().startsWith('*')) {
            return `<li>${line.trim().substring(1).trim()}</li>`;
        }
        return line;
    });
    return `<ul>${htmlLines.join('')}</ul>`.replace(/<\/ul><ul>/g, ''); // Join lists
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
    container.innerHTML = `Please wait...`;
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
        .ai-summary-container ul { padding-right: 20px; list-style-type: inherit; }
        .ai-summary-container a { color: #d6d6ff; text-decoration: underline; }
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

function createSummarizerButton() {
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
        top: 150px; /* Lowered a bit */
        right: -20px; /* Mostly hidden, adjust as needed */
        background-color: rgb(110 92 237);
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        border-radius: 10px 0 0 10px; /* Rounded corners on the left side */
        padding: 0px 30px 5px 10px;
        cursor: pointer;
        z-index: 2147483647;
        transition: right 0.3s ease-in-out; /* Smoother transition */
        font-size: 15px;
        font-weight: bold;
        text-orientation: mixed;
    `;

    button.onmouseover = () => { button.style.right = '0'; };
    button.onmouseout = () => { button.style.right = '-20px'; };

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
            displaySummary(`<p style="color: #ffdddd;">Error: ${error.message}</p>`, 'English'); // Display error in the box
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
                if (error.message.includes('API Key not found')) {
                    const optionsUrl = chrome.runtime.getURL('options.html');
                    displaySummary(`<div class="error-message"><p>API Key is missing.</p><p><a href="${optionsUrl}" target="_blank">Please set your API key in the options page.</a></p></div>`, 'English');
                } else {
                    displaySummary(`<p style="color: #ffdddd;">Error: ${error.message}</p>`, 'English'); // Display error
                }
            });
        return true; // Indicates that the response will be sent asynchronously
    }
});

// Create the button when the script is injected
createSummarizerButton();