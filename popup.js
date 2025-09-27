document.addEventListener('DOMContentLoaded', () => {
    const findBtn = document.getElementById('find-btn');
    const clearBtn = document.getElementById('clear-btn');
    const nextBtn = document.getElementById('next-btn');
    const prevBtn = document.getElementById('prev-btn');
    const counterEl = document.getElementById('counter');
    const searchInput = document.getElementById('search-input');
    const minInput = document.getElementById('min-input');
    const maxInput = document.getElementById('max-input');
    const includeInput = document.getElementById('include-input'); // Get the new include input
    const ignoreInput = document.getElementById('ignore-input');

    const sendMessageToContentScript = (message) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].id) {
                chrome.scripting.executeScript({
                    target: { tabId: tabs[0].id },
                    files: ['content.js']
                }).then(() => {
                    chrome.tabs.sendMessage(tabs[0].id, message);
                }).catch(err => console.error("Error injecting script:", err));
            }
        });
    };

    findBtn.addEventListener('click', () => {
        const searchTerm = searchInput.value;
        const min = minInput.value ? parseFloat(minInput.value) : null;
        const max = maxInput.value ? parseFloat(maxInput.value) : null;
        const includeList = includeInput.value; // Get the include list value
        const ignoreList = ignoreInput.value;

        sendMessageToContentScript({
            action: 'find',
            searchTerm: searchTerm,
            min: min,
            max: max,
            includeList: includeList, // Send it to the content script
            ignoreList: ignoreList
        });
    });

    clearBtn.addEventListener('click', () => {
        sendMessageToContentScript({ action: 'clear' });
        counterEl.textContent = '0 / 0';
    });

    nextBtn.addEventListener('click', () => {
        sendMessageToContentScript({ action: 'next' });
    });

    prevBtn.addEventListener('click', () => {
        sendMessageToContentScript({ action: 'prev' });
    });
    
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "update_count") {
            counterEl.textContent = `${request.current} / ${request.total}`;
        }
    });
});