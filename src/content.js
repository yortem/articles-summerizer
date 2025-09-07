const button = document.createElement('button');
button.innerText = 'סכם';
button.style.position = 'fixed';
button.style.top = '100px';
button.style.right = '0px';
button.style.zIndex = '1000';
button.style.padding = '10px';
button.style.backgroundColor = '#4CAF50';
button.style.color = 'white';
button.style.border = 'none';
button.style.borderRadius = '5px 0px 0px 5px';
button.style.cursor = 'pointer';

document.body.appendChild(button);

button.addEventListener('click', () => {
    const pageContent = document.body.innerText;
    chrome.runtime.sendMessage({ action: 'summarize', content: pageContent }, (response) => {
        if (response && response.summary) {
            displaySummary(response.summary);
        }
    });
});

function displaySummary(summary) {
    const summaryDiv = document.createElement('div');
    summaryDiv.style.position = 'fixed';
    summaryDiv.style.top = '50px';
    summaryDiv.style.right = '10px';
    summaryDiv.style.zIndex = '1000';
    summaryDiv.style.backgroundColor = 'white';
    summaryDiv.style.border = '1px solid #ccc';
    summaryDiv.style.padding = '10px';
    summaryDiv.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
    summaryDiv.innerHTML = `<h2 style="font-size: 20px; font-weight: bold;">${summary.title}</h2>
                            <p style="font-size: 16px;">${summary.context}</p>`;
    
    document.body.appendChild(summaryDiv);
}