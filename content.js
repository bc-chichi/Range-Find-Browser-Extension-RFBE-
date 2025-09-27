// --- CONFIGURATION SECTION ---

// Default price prefixes to automatically include in searches.
const DEFAULT_INCLUDE_PREFIXES = ['Rs', 'rs', '₹'];

// Default terms to automatically ignore, both before and after a number.
const DEFAULT_IGNORE_TERMS = ['comments', 'comment', 'upvotes', 'upvote'];

// Site-specific rules to limit the search area on certain websites.
const siteConfigurations = {
    'www.reddit.com': 'div[data-testid="post-comment-thread"]'
};


// Global variables to track state
let highlightedElements = [];
let currentIndex = -1;

// Function to create the search regex dynamically, now with built-in defaults
function createNumberRegex(includeList, ignoreList) {
    // --- NEW LOGIC: MERGE USER INPUT WITH DEFAULTS ---
    const userIncludeTerms = includeList ? includeList.split(',').map(term => term.trim()).filter(Boolean) : [];
    const allIncludeTerms = [...new Set([...DEFAULT_INCLUDE_PREFIXES, ...userIncludeTerms])];

    const userIgnoreTerms = ignoreList ? ignoreList.split(',').map(term => term.trim()).filter(Boolean) : [];
    const allIgnoreTerms = [...new Set([...DEFAULT_IGNORE_TERMS, ...userIgnoreTerms])];
    // --- END OF NEW LOGIC ---

    let numberPattern = `\\b\\d{1,3}(?:,?\\d{3})*(?:\\.\\d+)?\\b`;
    let prefixPattern = '';
    let suffixPattern = '';

    // Process the include list for required prefixes (takes priority)
    const processedInclude = allIncludeTerms.map(term => escapeRegex(term)).filter(Boolean);
    if (processedInclude.length > 0) {
        const includePattern = processedInclude.join('|');
        prefixPattern = `(?<=(?:${includePattern})\\s*)`;
    } 
    // If not using an include list, process the ignore list for prefixes to AVOID
    else {
        const processedIgnore = allIgnoreTerms.map(term => escapeRegex(term)).filter(Boolean);
        if (processedIgnore.length > 0) {
            const ignorePattern = processedIgnore.join('|');
            // Negative Lookbehind: Must NOT be preceded by these symbols
            prefixPattern = `(?<!(?:${ignorePattern}|\\$|@)\\s*)`;
        }
    }

    // Process the ignore list for suffixes to AVOID
    const processedIgnoreSuffix = allIgnoreTerms.map(term => escapeRegex(term)).filter(Boolean);
    if (processedIgnoreSuffix.length > 0) {
        const ignorePattern = processedIgnoreSuffix.join('|');
        // Negative Lookahead: Must NOT be followed by these symbols
        suffixPattern = `(?!\\s*(?:${ignorePattern}))`;
    }
    
    // Combine them into a final regex
    const finalRegexPattern = `${prefixPattern}${numberPattern}${suffixPattern}`;
    
    return new RegExp(finalRegexPattern, 'gi');
}


// The main find and highlight function
function findAndHighlight(searchTerm, min, max, includeList, ignoreList) {
    clearHighlights();

    const currentHostname = window.location.hostname;
    let searchRoot = document.body; 

    if (siteConfigurations[currentHostname]) {
        const specificElement = document.querySelector(siteConfigurations[currentHostname]);
        if (specificElement) {
            searchRoot = specificElement;
        }
    }

    const matchesToProcess = [];
    const isRangeSearch = min !== null && max !== null;
    const textSearchRegex = searchTerm ? new RegExp(searchTerm, 'gi') : null;
    const numberRegex = isRangeSearch ? createNumberRegex(includeList, ignoreList) : null;

    const walker = document.createTreeWalker(searchRoot, NodeFilter.SHOW_TEXT, null, false);
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


// --- UTILITY AND OTHER FUNCTIONS (UNCHANGED) ---

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
