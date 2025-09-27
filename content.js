// Global variables to track state
let highlightedElements = [];
let currentIndex = -1;

// Function to escape special regex characters from user input
function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Function to create the search regex dynamically
function createNumberRegex(includeList, ignoreList) {
    let numberPattern = `\\$?\\s?\\b\\d{1,3}(?:,?\\d{3})*(?:\\.\\d+)?\\b`;
    let prefixPattern = '';
    let suffixPattern = '';

    // Process the include list for required prefixes
    if (includeList && includeList.trim() !== "") {
        const includeTerms = includeList.split(',').map(term => escapeRegex(term.trim())).filter(Boolean);
        const includePattern = includeTerms.join('|');
        // (?<=...) - Positive Lookbehind: Must be preceded by these symbols, followed by optional space(s)
        prefixPattern = `(?<=(?:${includePattern})\\s*)`;
        
        // --- THIS IS THE FIX ---
        // The number pattern should NOT look for a space, as the prefix pattern already handles it.
        numberPattern = `\\b\\d{1,3}(?:,?\\d{3})*(?:\\.\\d+)?\\b`;
    }

    // Process the ignore list for suffixes to exclude
    if (ignoreList && ignoreList.trim() !== "") {
        const ignoreTerms = ignoreList.split(',').map(term => escapeRegex(term.trim())).filter(Boolean);
        const ignorePattern = ignoreTerms.join('|');
        // (?!...) - Negative Lookahead: Must not be followed by these symbols
        suffixPattern = `(?!\\s*(?:${ignorePattern}))`;
    }
    
    // Combine them into a final regex
    const finalRegexPattern = `${prefixPattern}${numberPattern}${suffixPattern}`;
    
    return new RegExp(finalRegexPattern, 'g');
}


// The main find and highlight function
function findAndHighlight(searchTerm, min, max, includeList, ignoreList) {
    clearHighlights();

    const matchesToProcess = [];
    const isRangeSearch = min !== null && max !== null;
    const textSearchRegex = searchTerm ? new RegExp(searchTerm, 'gi') : null;
    const numberRegex = isRangeSearch ? createNumberRegex(includeList, ignoreList) : null;

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    let node;

    // PASS 1: FIND ALL MATCHES
    while (node = walker.nextNode()) {
        if (node.parentElement.tagName === 'SCRIPT' || node.parentElement.tagName === 'STYLE') continue;

        const text = node.nodeValue;
        const regexToUse = isRangeSearch ? numberRegex : textSearchRegex;
        if (!regexToUse) continue;

        let match;
        while ((match = regexToUse.exec(text)) !== null) {
            let processMatch = false;
            if (isRangeSearch) {
                const num = parseFloat(match[0].replace(/[^0-9.]/g, ''));
                if (!isNaN(num) && num >= min && num <= max) processMatch = true;
            } else {
                processMatch = true;
            }

            if (processMatch) {
                matchesToProcess.push({ node: node, match: match });
            }
        }
    }

    // PASS 2: HIGHLIGHT ALL FOUND MATCHES
    for (let i = matchesToProcess.length - 1; i >= 0; i--) {
        const item = matchesToProcess[i];
        const node = item.node;
        const match = item.match;

        const mark = document.createElement('mark');
        mark.textContent = match[0];
        mark.style.backgroundColor = '#FFDE59';
        mark.style.color = 'black';
        
        const after = node.splitText(match.index);
        after.nodeValue = after.nodeValue.substring(match[0].length);
        node.parentNode.insertBefore(mark, after);

        highlightedElements.unshift(mark);
    }

    if (highlightedElements.length > 0) {
        currentIndex = 0;
        navigateToMatch();
    }
    
    chrome.runtime.sendMessage({
        action: "update_count",
        current: highlightedElements.length > 0 ? currentIndex + 1 : 0,
        total: highlightedElements.length
    });
}


// --- UTILITY AND NAVIGATION FUNCTIONS (UNCHANGED) ---

function clearHighlights() {
    highlightedElements.forEach(element => {
        const parent = element.parentNode;
        if (parent) {
            parent.replaceChild(document.createTextNode(element.textContent), element);
            parent.normalize();
        }
    });
    highlightedElements = [];
    currentIndex = -1;
}

function navigateToMatch() {
    if (highlightedElements.length === 0) return;
    highlightedElements.forEach(el => {
        el.style.backgroundColor = '#FFDE59';
        el.style.outline = 'none';
    });
    const currentElement = highlightedElements[currentIndex];
    currentElement.style.backgroundColor = '#FFA500';
    currentElement.style.outline = '2px solid red';
    currentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "find") {
        findAndHighlight(request.searchTerm, request.min, request.max, request.includeList, request.ignoreList);
    } else if (request.action === "clear") {
        clearHighlights();
         chrome.runtime.sendMessage({ action: "update_count", current: 0, total: 0 });
    } else if (request.action === "next") {
        if (highlightedElements.length > 0) {
            currentIndex = (currentIndex + 1) % highlightedElements.length;
            navigateToMatch();
            chrome.runtime.sendMessage({ action: "update_count", current: currentIndex + 1, total: highlightedElements.length });
        }
    } else if (request.action === "prev") {
        if (highlightedElements.length > 0) {
            currentIndex = (currentIndex - 1 + highlightedElements.length) % highlightedElements.length;
            navigateToMatch();
            chrome.runtime.sendMessage({ action: "update_count", current: currentIndex + 1, total: highlightedElements.length });
        }
    }
});