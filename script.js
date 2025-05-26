// script.js
// Client-side logic for 8kuk, a web interface for 8kun.top
// Optimized for 8kun.top's API, preserving all features from the original 4chan implementation

// DOM Elements
const boardsPage = document.getElementById('boards-page');
const threadsPage = document.getElementById('threads-page');
const chatPage = document.getElementById('chat-page');
const boardsList = document.getElementById('boards-list');
const favoriteBoardsList = document.getElementById('favorite-boards-list');
const favoriteBoardsSection = document.getElementById('favorite-boards');
const boardTitle = document.getElementById('board-title');
const threadsList = document.getElementById('threads-list');
const threadTitle = document.getElementById('thread-title');
const chatMessages = document.getElementById('chat-messages');
const imageModal = document.getElementById('image-modal');
const modalImage = document.getElementById('modal-image');
const zoomImagePreview = document.getElementById('zoom-image-preview');
const replyPreviewPopup = document.getElementById('reply-preview-popup');
const settingsToggleBoards = document.getElementById('settings-toggle-boards');
const darkModeToggleThreads = document.getElementById('dark-mode-toggle-threads');
const darkModeToggleChat = document.getElementById('dark-mode-toggle-chat');
const settingsPopup = document.getElementById('settings-popup');
const settingsClose = document.getElementById('settings-close');
const hoverZoomToggle = document.getElementById('hover-zoom-toggle');
const darkModeToggleSettings = document.getElementById('dark-mode-toggle-settings');
const highContrastToggle = document.getElementById('high-contrast-toggle');
const ipDisplayToggle = document.getElementById('ip-display-toggle');
const autoRefreshToggle = document.getElementById('auto-refresh-toggle');
const favoriteBoardsSelector = document.getElementById('favorite-boards-selector');
const threadTagInput = document.getElementById('thread-tag-input');
const threadTagsList = document.getElementById('thread-tags-list');
const backToBoardsBtn = document.getElementById('back-to-boards-btn');
const backToThreadsBtn = document.getElementById('back-to-threads-btn');
const threadFilter = document.getElementById('thread-filter');
const threadSort = document.getElementById('thread-sort');
const mediaFilter = document.getElementById('media-filter');
const ipDisplay = document.getElementById('ip-display');
const ipAddressDisplay = document.getElementById('ip-address');
const countryFlagDisplay = document.getElementById('country-flag');
const ipDisplayThreads = document.getElementById('ip-display-threads');
const ipAddressThreads = document.getElementById('ip-address-threads');
const countryFlagThreads = document.getElementById('country-flag-threads');

// Constants
const CORS_PROXY = 'https://cors-anywhere.herokuapp.com/';
const API_BASE = 'https://a.4cdn.org';
const MEDIA_BASE = 'https://i.4cdn.org';
const CURRENT_DATE = new Date('2025-05-05');

// State Management
let settings = {
    hoverZoom: false,
    darkMode: false,
    highContrast: false,
    showIP: false,
    autoRefresh: false,
    favoriteBoards: [],
    pinnedThreads: [],
    threadTags: [],
    taggedThreads: {}
};
let autoRefreshInterval = null;
let currentBoardCode = '';
let allBoards = [];
let lastScrollTop = 0;

// Fallback boards for offline or failed API
const FALLBACK_BOARDS = [
    { board: 'b', title: 'Random', meta_description: 'Anything goes' },
    { board: 'pol', title: 'Politically Incorrect', meta_description: 'Politics and news' },
    { board: 'tech', title: 'Technology', meta_description: 'Tech discussions' }
];

// Utility Functions
/**
 * Debounces a function to limit execution rate.
 * @param {Function} func - Function to debounce.
 * @param {number} wait - Delay in milliseconds.
 * @returns {Function} Debounced function.
 */
function debounce(func, wait) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

/**
 * Throttles a function to limit execution frequency.
 * @param {Function} func - Function to throttle.
 * @param {number} limit - Minimum interval between executions in milliseconds.
 * @returns {Function} Throttled function.
 */
function throttle(func, limit) {
    let inThrottle;
    return (...args) => {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => (inThrottle = false), limit);
        }
    };
}

/**
 * Sanitizes HTML content to prevent XSS.
 * @param {string} input - Input string to sanitize.
 * @returns {string} Sanitized string.
 */
function sanitizeHTML(input) {
    const div = document.createElement('div');
    div.textContent = input || '';
    return div.innerHTML;
}

/**
 * Escapes HTML characters to prevent injection.
 * @param {string} str - String to escape.
 * @returns {string} Escaped string.
 */
function escapeHTML(str) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return str.replace(/[&<>"']/g, m => map[m]);
}

/**
 * Fetches data with retry logic and exponential backoff.
 * @param {string} url - URL to fetch.
 * @param {number} retries - Number of retry attempts.
 * @param {number} baseDelay - Base delay between retries in milliseconds.
 * @returns {Promise<Object>} Fetched data.
 */
async function fetchWithRetry(url, retries = 5, baseDelay = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (compatible; 8kuk/1.0)'
                }
            });
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            const data = await response.json();
            return data;
        } catch (error) {
            if (i === retries - 1) {
                console.error(`Failed to fetch ${url} after ${retries} attempts:`, error);
                throw error;
            }
            const delay = baseDelay * Math.pow(2, i); // Exponential backoff
            console.log(`Retrying fetch for ${url} in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

/**
 * Formats a Unix timestamp for display.
 * @param {number} unixTime - Unix timestamp in seconds.
 * @returns {string} Formatted timestamp (e.g., "14:30" or "14:30 - 5 May").
 */
function formatTimestamp(unixTime) {
    const date = new Date(unixTime * 1000);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const day = date.getDate();
    const month = date.toLocaleString('default', { month: 'short' });
    const isToday = day === CURRENT_DATE.getDate() && date.getMonth() === CURRENT_DATE.getMonth();
    return isToday ? `${hours}:${minutes}` : `${hours}:${minutes} - ${day} ${month}`;
}

/**
 * Converts country code to flag emoji.
 * @param {string} countryCode - ISO country code.
 * @returns {string} Flag emoji or fallback.
 */
function countryCodeToFlag(countryCode) {
    const flagMap = {
        'US': '🇺🇸', 'BR': '🇧🇷', 'DE': '🇩🇪', 'FR': '🇫🇷', 'GB': '🇬🇧', 'JP': '🇯🇵',
        'CN': '🇨🇳', 'IN': '🇮🇳', 'RU': '🇷🇺', 'CA': '🇨🇦', 'AU': '🇦🇺', 'ES': '🇪🇸',
        'IT': '🇮🇹', 'KR': '🇰🇷', 'MX': '🇲🇽', 'NL': '🇳🇱', 'SE': '🇸🇪', 'CH': '🇨🇭'
    };
    return flagMap[countryCode.toUpperCase()] || '❌';
}

// Settings Management
/**
 * Loads settings from localStorage with validation.
 */
function loadSettings() {
    try {
        const savedSettings = localStorage.getItem('settings');
        if (savedSettings) {
            const parsed = JSON.parse(savedSettings);
            settings = {
                ...settings,
                hoverZoom: !!parsed.hoverZoom,
                darkMode: !!parsed.darkMode,
                highContrast: !!parsed.highContrast,
                showIP: !!parsed.showIP,
                autoRefresh: !!parsed.autoRefresh,
                favoriteBoards: Array.isArray(parsed.favoriteBoards) ? parsed.favoriteBoards : [],
                pinnedThreads: Array.isArray(parsed.pinnedThreads) ? parsed.pinnedThreads : [],
                threadTags: Array.isArray(parsed.threadTags) ? parsed.threadTags : [],
                taggedThreads: parsed.taggedThreads && typeof parsed.taggedThreads === 'object' ? parsed.taggedThreads : {}
            };
            console.log('Settings loaded successfully');
        }
    } catch (error) {
        console.error('Error loading settings:', error);
    }
    applySettings();
}

/**
 * Saves settings to localStorage.
 */
function saveSettings() {
    try {
        localStorage.setItem('settings', JSON.stringify(settings));
        console.log('Settings saved');
    } catch (error) {
        console.error('Error saving settings:', error);
    }
}

/**
 * Applies settings to the UI and functionality.
 */
function applySettings() {
    document.body.classList.toggle('dark-mode', settings.darkMode);
    document.body.classList.toggle('high-contrast', settings.highContrast);

    [darkModeToggleSettings, darkModeToggleThreads, darkModeToggleChat].forEach(toggle => {
        if (toggle) {
            toggle.setAttribute('data-checked', settings.darkMode);
            toggle.textContent = settings.darkMode ? 'On' : 'Off';
        }
    });

    if (highContrastToggle) {
        highContrastToggle.setAttribute('data-checked', settings.highContrast);
        highContrastToggle.textContent = settings.highContrast ? 'On' : 'Off';
    }

    if (hoverZoomToggle) {
        hoverZoomToggle.setAttribute('data-checked', settings.hoverZoom);
        hoverZoomToggle.textContent = settings.hoverZoom ? 'On' : 'Off';
    }

    if (ipDisplayToggle) {
        ipDisplayToggle.setAttribute('data-checked', settings.showIP);
        ipDisplayToggle.textContent = settings.showIP ? 'On' : 'Off';
        [ipDisplay, ipDisplayThreads].forEach(display => {
            if (display) display.classList.toggle('active', settings.showIP);
        });
    }

    if (autoRefreshToggle) {
        autoRefreshToggle.setAttribute('data-checked', settings.autoRefresh);
        autoRefreshToggle.textContent = settings.autoRefresh ? 'On' : 'Off';
        if (settings.autoRefresh && currentBoardCode) startAutoRefresh();
        else stopAutoRefresh();
    }
}

// Scroll Handling
/**
 * Handles scroll events to hide/show headers based on scroll direction.
 */
function handleScroll() {
    const headers = document.querySelectorAll('.header');
    const activePage = document.querySelector('.page.active');
    if (!activePage) return;

    const scrollTop = activePage.scrollTop || window.pageYOffset || document.documentElement.scrollTop;
    headers.forEach(header => {
        header.classList.toggle('hidden', scrollTop > lastScrollTop && scrollTop > 50);
    });
    lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;
}

[boardsPage, threadsPage, chatPage].forEach(page => {
    if (page) page.addEventListener('scroll', throttle(handleScroll, 100));
});

// IP and Flag Display
/**
 * Fetches and displays the user's IP address and country flag.
 */
async function displayIPAndFlag() {
    if (!settings.showIP) return;
    try {
        const response = await fetch('https://ipapi.co/json/');
        if (!response.ok) throw new Error('Failed to fetch IP data');
        const data = await response.json();
        const ip = data.ip ? data.ip.split('.').slice(0, 3).join('.') + '.xxx' : 'xxx.xxx.xxx';
        const flag = countryCodeToFlag(data.country_code || '');
        [ipAddressDisplay, ipAddressThreads].forEach(display => {
            if (display) display.textContent = ip;
        });
        [countryFlagDisplay, countryFlagThreads].forEach(display => {
            if (display) display.textContent = flag;
        });
        console.log('IP and flag displayed');
    } catch (error) {
        console.error('Error fetching IP:', error);
        [ipAddressDisplay, ipAddressThreads].forEach(display => {
            if (display) display.textContent = 'xxx.xxx.xxx';
        });
        [countryFlagDisplay, countryFlagThreads].forEach(display => {
            if (display) display.textContent = '🏳️';
        });
    }
}

// Auto-Refresh
/**
 * Starts auto-refreshing threads.
 */
function startAutoRefresh() {
    stopAutoRefresh();
    autoRefreshInterval = setInterval(() => {
        if (currentBoardCode) {
            console.log(`Auto-refreshing threads for board: ${currentBoardCode}`);
            fetchThreads(currentBoardCode);
        }
    }, 30000);
}

/**
 * Stops auto-refresh.
 */
function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
        console.log('Auto-refresh stopped');
    }
}

// Boards Page
/**
 * Fetches all boards from 8kun.top with caching and fallback.
 * @returns {Promise<Array>} List of normalized board objects.
 */
async function fetchBoards() {
    try {
        const url = `${CORS_PROXY}${API_BASE}boards.json`;
        const data = await fetchWithRetry(url);
        
        // Validate response structure
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid response format: Expected JSON object');
        }
        if (!data.boards) {
            throw new Error('Missing boards property in response');
        }
        if (!Array.isArray(data.boards)) {
            throw new Error('Boards property is not an array');
        }
        if (data.boards.length === 0) {
            console.warn('Boards array is empty; using cached or fallback data');
            const cachedBoards = localStorage.getItem('cachedBoards');
            if (cachedBoards) {
                console.log('Loading cached boards');
                return JSON.parse(cachedBoards);
            }
            return FALLBACK_BOARDS;
        }

        // Normalize board data
        const boards = data.boards
            .map(board => ({
                board: board.uri || board.board || '',
                title: board.title || 'Untitled',
                meta_description: board.description || board.subtitle || ''
            }))
            .filter(board => board.board && board.title);

        // Cache boards for offline use
        try {
            localStorage.setItem('cachedBoards', JSON.stringify(boards));
            console.log('Boards cached successfully');
        } catch (error) {
            console.error('Error caching boards:', error);
        }

        return boards;
    } catch (error) {
        console.error('Error fetching boards:', error.message);
        if (boardsList) {
            boardsList.innerHTML = `
                <div class="error-message">
                    Unable to load boards: ${error.message}.
                    <button id="retry-boards">Retry</button>
                </div>
            `;
            const retryButton = boardsList.querySelector('#retry-boards');
            if (retryButton) {
                retryButton.addEventListener('click', () => {
                    boardsList.innerHTML = '<div class="loading">Retrying...</div>';
                    loadBoards();
                });
            }
        }
        // Attempt to load cached boards
        const cachedBoards = localStorage.getItem('cachedBoards');
        if (cachedBoards) {
            console.log('Falling back to cached boards');
            return JSON.parse(cachedBoards);
        }
        console.log('Using fallback boards');
        return FALLBACK_BOARDS;
    }
}

/**
 * Initializes board search functionality with autocomplete.
 */
async function initializeSearch() {
    allBoards = await fetchBoards();
    const boardSearch = document.getElementById('board-search');
    const searchSuggestions = document.getElementById('search-suggestions');
    if (!boardSearch || !searchSuggestions) {
        console.error('Search elements not found');
        return;
    }

    boardSearch.addEventListener('input', debounce(() => {
        const query = boardSearch.value.toLowerCase().trim();
        searchSuggestions.innerHTML = '';
        if (!query) {
            searchSuggestions.classList.remove('active');
            return;
        }

        const filteredBoards = allBoards.filter(board =>
            board.title.toLowerCase().includes(query) ||
            board.board.toLowerCase().includes(query) ||
            board.meta_description.toLowerCase().includes(query)
        );

        const fragment = document.createDocumentFragment();
        filteredBoards.slice(0, 5).forEach(board => {
            const suggestion = document.createElement('div');
            suggestion.classList.add('suggestion-item');
            suggestion.innerHTML = `
                <span>${sanitizeHTML(board.title)}</span>
                <p>${sanitizeHTML(board.meta_description || 'No description')}</p>
            `;
            suggestion.addEventListener('click', () => {
                boardSearch.value = '';
                searchSuggestions.classList.remove('active');
                openThreads(board);
            });
            fragment.appendChild(suggestion);
        });
        searchSuggestions.appendChild(fragment);
        searchSuggestions.classList.toggle('active', filteredBoards.length > 0);
    }, 300));

    document.addEventListener('click', e => {
        if (!searchSuggestions.contains(e.target) && e.target !== boardSearch) {
            searchSuggestions.classList.remove('active');
        }
    });

    boardSearch.addEventListener('keypress', e => {
        if (e.key === 'Enter' && searchSuggestions.children.length > 0) {
            searchSuggestions.children[0].click();
        }
    });
}

/**
 * Loads and displays boards in the UI.
 */
async function loadBoards() {
    if (!boardsList || !favoriteBoardsList || !favoriteBoardsSection) {
        console.error('Board list elements not found');
        return;
    }

    boardsList.innerHTML = '<div class="loading">Loading boards...</div>';
    const boards = await fetchBoards();
    const fragmentFav = document.createDocumentFragment();
    const fragmentAll = document.createDocumentFragment();
    const favoriteBoards = boards.filter(board => settings.favoriteBoards.includes(board.board));

    favoriteBoardsSection.classList.toggle('active', favoriteBoards.length > 0);
    favoriteBoards.forEach(board => fragmentFav.appendChild(createBoardItem(board)));
    boards.forEach(board => fragmentAll.appendChild(createBoardItem(board)));

    favoriteBoardsList.innerHTML = '';
    boardsList.innerHTML = '';
    favoriteBoardsList.appendChild(fragmentFav);
    boardsList.appendChild(fragmentAll);

    if (favoriteBoardsSelector) {
        const fragment = document.createDocumentFragment();
        boards.forEach(board => {
            const item = document.createElement('div');
            item.classList.add('favorite-board-item');
            item.innerHTML = `
                <span>${sanitizeHTML(board.title)}</span>
                <input type="checkbox" data-board="${board.board}" ${settings.favoriteBoards.includes(board.board) ? 'checked' : ''}>
            `;
            fragment.appendChild(item);
        });
        favoriteBoardsSelector.innerHTML = '';
        favoriteBoardsSelector.appendChild(fragment);

        favoriteBoardsSelector.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                const boardCode = checkbox.getAttribute('data-board');
                settings.favoriteBoards = checkbox.checked
                    ? [...settings.favoriteBoards, boardCode]
                    : settings.favoriteBoards.filter(code => code !== boardCode);
                saveSettings();
                loadBoards();
            });
        });
    }

    loadThreadTags();
    initializeSearch();
    displayIPAndFlag();
}

/**
 * Creates a board item element.
 * @param {Object} board - Board data.
 * @returns {HTMLElement} Board item element.
 */
function createBoardItem(board) {
    const boardItem = document.createElement('div');
    boardItem.classList.add('board-item');
    boardItem.innerHTML = `
        <div>
            <span>${sanitizeHTML(board.title)}</span>
            <p>${sanitizeHTML(board.meta_description || 'No description')}</p>
        </div>
    `;
    boardItem.addEventListener('click', () => openThreads(board));
    return boardItem;
}

// Threads Page
/**
 * Transitions to the threads page for a specific board.
 * @param {Object} board - Board data.
 */
function openThreads(board) {
    if (!boardsPage || !threadsPage || !boardTitle) {
        console.error('Thread page elements not found');
        return;
    }
    currentBoardCode = board.board;
    boardsPage.classList.remove('active');
    setTimeout(() => {
        threadsPage.classList.add('active');
        boardTitle.textContent = sanitizeHTML(board.title);
        threadsList.innerHTML = '<div class="loading">Loading threads...</div>';
        fetchThreads(board.board);
        if (settings.autoRefresh) startAutoRefresh();
    }, 300);
}

/**
 * Fetches threads for a board from 8kun.top.
 * @param {string} boardCode - Board code.
 */
async function fetchThreads(boardCode) {
    if (!threadsList) {
        console.error('Threads list element not found');
        return;
    }
    try {
        const data = await fetchWithRetry(`${CORS_PROXY}${API_BASE}${boardCode}/catalog.json`);
        filterAndSortThreads(data, boardCode);
    } catch (error) {
        console.error('Error fetching threads:', error);
        threadsList.innerHTML = `
            <div class="error-message">
                Failed to load threads: ${error.message}.
                <button id="retry-threads">Retry</button>
            </div>
        `;
        const retryButton = threadsList.querySelector('#retry-threads');
        if (retryButton) {
            retryButton.addEventListener('click', () => {
                threadsList.innerHTML = '<div class="loading">Retrying...</div>';
                fetchThreads(boardCode);
            });
        }
    }
}

/**
 * Filters and sorts threads based on user input.
 * @param {Array} data - Catalog data from API.
 * @param {string} boardCode - Board code.
 */
function filterAndSortThreads(data, boardCode) {
    if (!threadsList) return;
    const filterQuery = threadFilter?.value.toLowerCase() || '';
    const sortOption = threadSort?.value || 'default';
    const mediaOption = mediaFilter?.value || 'all';
    let threads = [];
    data.forEach(page => {
        if (page.threads && Array.isArray(page.threads)) {
            threads.push(...page.threads);
        }
    });

    if (filterQuery) {
        threads = threads.filter(thread =>
            (thread.sub?.toLowerCase().includes(filterQuery) ||
             thread.com?.toLowerCase().includes(filterQuery))
        );
    }

    if (mediaOption === 'images') {
        threads = threads.filter(thread => thread.tim && thread.ext?.match(/\.(jpg|png|gif)$/i));
    } else if (mediaOption === 'videos') {
        threads = threads.filter(thread => thread.tim && thread.ext?.match(/\.(mp4|webm)$/i));
    }

    if (sortOption === 'replies') {
        threads.sort((a, b) => (b.replies || 0) - (a.replies || 0));
    } else if (sortOption === 'recent') {
        threads.sort((a, b) => (b.last_modified || b.time || 0) - (a.last_modified || a.time || 0));
    }

    threads.sort((a, b) => {
        const aPinned = settings.pinnedThreads.includes(`${boardCode}:${a.no}`);
        const bPinned = settings.pinnedThreads.includes(`${boardCode}:${b.no}`);
        return bPinned - aPinned;
    });

    displayThreads(threads, boardCode);
}

/**
 * Toggles pinning for a thread.
 * @param {string} boardCode - Board code.
 * @param {number} threadNo - Thread number.
 */
function togglePinThread(boardCode, threadNo) {
    const threadId = `${boardCode}:${threadNo}`;
    settings.pinnedThreads = settings.pinnedThreads.includes(threadId)
        ? settings.pinnedThreads.filter(id => id !== threadId)
        : [...settings.pinnedThreads, threadId];
    saveSettings();
    fetchThreads(boardCode);
}

/**
 * Toggles a tag for a thread.
 * @param {string} boardCode - Board code.
 * @param {number} threadNo - Thread number.
 * @param {string} tag - Tag to toggle.
 */
function toggleThreadTag(boardCode, threadNo, tag) {
    const threadId = `${boardCode}:${threadNo}`;
    settings.taggedThreads[threadId] = settings.taggedThreads[threadId] || [];
    settings.taggedThreads[threadId] = settings.taggedThreads[threadId].includes(tag)
        ? settings.taggedThreads[threadId].filter(t => t !== tag)
        : [...settings.taggedThreads[threadId], tag];

    if (settings.taggedThreads[threadId].length === 0) {
        delete settings.taggedThreads[threadId];
    }
    saveSettings();
    fetchThreads(boardCode);
}

/**
 * Loads thread tags into the settings UI.
 */
function loadThreadTags() {
    if (!threadTagsList) {
        console.error('Thread tags list element not found');
        return;
    }
    const fragment = document.createDocumentFragment();
    settings.threadTags.forEach((tag, index) => {
        const item = document.createElement('div');
        item.classList.add('thread-tag-item');
        item.style.animationDelay = `${index * 0.05}s`;
        item.innerHTML = `
            <span>${sanitizeHTML(tag)}</span>
            <button class="delete-tag" data-tag="${tag}"><i class="fas fa-trash"></i></button>
        `;
        fragment.appendChild(item);
    });
    threadTagsList.innerHTML = '';
    threadTagsList.appendChild(fragment);

    threadTagsList.querySelectorAll('.delete-tag').forEach(button => {
        button.addEventListener('click', () => {
            const tag = button.getAttribute('data-tag');
            settings.threadTags = settings.threadTags.filter(t => t !== tag);
            Object.keys(settings.taggedThreads).forEach(threadId => {
                settings.taggedThreads[threadId] = settings.taggedThreads[threadId].filter(t => t !== tag);
                if (settings.taggedThreads[threadId].length === 0) {
                    delete settings.taggedThreads[threadId];
                }
            });
            saveSettings();
            loadThreadTags();
        });
    });
}

/**
 * Adds a new thread tag from user input.
 */
function addThreadTag() {
    if (!threadTagInput) {
        console.error('Thread tag input element not found');
        return;
    }
    const tag = threadTagInput.value.trim();
    if (tag && !settings.threadTags.includes(tag)) {
        settings.threadTags.push(tag);
        saveSettings();
        loadThreadTags();
        threadTagInput.value = '';
        console.log(`Added thread tag: ${tag}`);
    }
}

/**
 * Displays threads in a grid view with previews.
 * @param {Array} threads - List of threads.
 * @param {string} boardCode - Board code.
 */
function displayThreads(threads, boardCode) {
    if (!threadsList) {
        console.error('Threads list element not found');
        return;
    }
    const fragment = document.createDocumentFragment();
    threads.forEach(thread => {
        const threadItem = document.createElement('div');
        threadItem.classList.add('thread-item');
        const threadId = `${boardCode}:${thread.no}`;
        if (settings.pinnedThreads.includes(threadId)) {
            threadItem.classList.add('pinned');
        }
        if (thread.tim && thread.ext) {
            threadItem.classList.add('has-image');
            threadItem.style.backgroundImage = `url(${MEDIA_BASE}${thread.tim}${thread.ext})`;
            threadItem.classList.add(Math.random() > 0.5 ? 'light-text' : 'dark-text');
        }

        const contentDiv = document.createElement('div');
        contentDiv.classList.add('content');

        const titleDiv = document.createElement('div');
        titleDiv.classList.add('thread-title');
        titleDiv.textContent = thread.sub || `Thread #${thread.no}`;

        const usernameDiv = document.createElement('div');
        usernameDiv.classList.add('username');
        usernameDiv.textContent = thread.name || 'Anonymous';

        const previewDiv = document.createElement('div');
        previewDiv.classList.add('thread-preview');
        const previewText = thread.com
            ? thread.com.replace(/<[^>]+>/g, '').substring(0, 50) + (thread.com.length > 50 ? '...' : '')
            : 'No preview available';
        previewDiv.textContent = previewText;

        const tags = settings.taggedThreads[threadId] || [];
        if (tags.length > 0) {
            const tagsDiv = document.createElement('div');
            tagsDiv.classList.add('thread-tags');
            tagsDiv.textContent = `Tags: ${tags.join(', ')}`;
            contentDiv.appendChild(tagsDiv);
        }

        const pinButton = document.createElement('button');
        pinButton.innerHTML = settings.pinnedThreads.includes(threadId)
            ? '<i class="fas fa-thumbtack"></i>'
            : '<i class="far fa-thumbtack"></i>';
        pinButton.title = settings.pinnedThreads.includes(threadId) ? 'Unpin Thread' : 'Pin Thread';
        pinButton.addEventListener('click', e => {
            e.stopPropagation();
            togglePinThread(boardCode, thread.no);
        });

        const tagButton = document.createElement('button');
        tagButton.innerHTML = '<i class="fas fa-tag"></i>';
        tagButton.title = 'Add or remove a tag';
        tagButton.addEventListener('click', e => {
            e.stopPropagation();
            const tag = prompt('Enter tag for this thread:', tags[0] || '');
            if (tag && settings.threadTags.includes(tag)) {
                toggleThreadTag(boardCode, thread.no, tag);
            } else if (tag) {
                alert('Please add the tag in Settings first.');
            }
        });

        contentDiv.appendChild(titleDiv);
        contentDiv.appendChild(usernameDiv);
        contentDiv.appendChild(previewDiv);
        threadItem.appendChild(pinButton);
        threadItem.appendChild(tagButton);
        threadItem.appendChild(contentDiv);
        threadItem.addEventListener('click', () => openThread(boardCode, thread));
        fragment.appendChild(threadItem);
    });
    threadsList.innerHTML = '';
    threadsList.appendChild(fragment);
}

// Thread Detail Page
/**
 * Transitions to the thread detail page.
 * @param {string} boardCode - Board code.
 * @param {Object} thread - Thread data.
 */
async function openThread(boardCode, thread) {
    if (!threadsPage || !chatPage || !threadTitle || !chatMessages) {
        console.error('Chat page elements not found');
        return;
    }
    threadsPage.classList.remove('active');
    setTimeout(() => {
        chatPage.classList.add('active');
        threadTitle.textContent = thread.sub || `Thread #${thread.no}`;
        chatMessages.innerHTML = '<div class="loading">Loading messages...</div>';
        fetchThreadMessages(boardCode, thread.no);
        stopAutoRefresh();
    }, 300);
}

/**
 * Fetches messages for a thread.
 * @param {string} boardCode - Board code.
 * @param {number} threadNo - Thread number.
 */
async function fetchThreadMessages(boardCode, threadNo) {
    try {
        const data = await fetchWithRetry(`${CORS_PROXY}${API_BASE}${boardCode}/res/${threadNo}.json`);
        if (!data.posts || !Array.isArray(data.posts)) {
            throw new Error('Invalid thread data');
        }
        displayMessages(boardCode, data.posts);
    } catch (error) {
        console.error('Error fetching thread messages:', error);
        if (chatMessages) {
            chatMessages.innerHTML = `
                <div class="error-message">
                    Failed to load messages: ${error.message}.
                    <button id="retry-messages">Retry</button>
                </div>
            `;
            const retryButton = chatMessages.querySelector('#retry-messages');
            if (retryButton) {
                retryButton.addEventListener('click', () => {
                    chatMessages.innerHTML = '<div class="loading">Retrying...</div>';
                    fetchThreadMessages(boardCode, threadNo);
                });
            }
        }
    }
}

/**
 * Sanitizes and formats a comment with greentext and reply links.
 * @param {string} comment - Comment text.
 * @returns {string} Formatted HTML.
 */
function sanitizeComment(comment) {
    if (!comment) return '';
    const div = document.createElement('div');
    div.innerHTML = comment;
    const text = div.textContent || div.innerText || '';
    const lines = text.split('\n').map(line => {
        line = sanitizeHTML(line.trim());
        if (line.startsWith('>') && !line.startsWith('>>')) {
            return `<span class="greentext">${escapeHTML(line)}</span>`;
        } else if (line.startsWith('>>')) {
            const match = line.match(/>>(\d+)/);
            if (match) {
                return `<span class="reply-link" data-post-no="${match[1]}">${escapeHTML(line)}</span>`;
            }
        }
        return `<p>${escapeHTML(line)}</p>`;
    });
    return lines.join('');
}

/**
 * Displays thread messages with reply previews and images.
 * @param {string} boardCode - Board code.
 * @param {Array} posts - List of posts.
 */
function displayMessages(boardCode, posts) {
    if (!chatMessages) {
        console.error('Chat messages element not found');
        return;
    }
    const fragment = document.createDocumentFragment();
    const postMap = new Map(posts.map(post => [post.no, post]));

    posts.forEach((post, index) => {
        const message = document.createElement('div');
        message.id = `post-${post.no}`;
        message.style.animationDelay = `${index * 0.05}s`;
        const commentText = sanitizeComment(post.com);
        const isReply = post.resto !== 0 || commentText.includes('reply-link');

        message.classList.add('message', isReply ? 'reply' : 'received');
        if (isReply && commentText.startsWith('<span class="reply-link')) {
            message.classList.add('reply-link-start');
        }

        let commentHtml = commentText.replace(/>>(\d+)/g, `<span class="reply-link" data-post-no="$1">>>$1</span>`);
        let previewHtml = '';
        if (isReply) {
            const replyMatch = post.com?.match(/>>(\d+)/);
            if (replyMatch) {
                const referencedPost = postMap.get(parseInt(replyMatch[1]));
                if (referencedPost) {
                    let previewText = sanitizeComment(referencedPost.com).replace(/<[^>]+>/g, '').substring(0, 47);
                    if (previewText.length > 47) previewText += '...';
                    previewHtml = `<div class="reply-preview">`;
                    if (referencedPost.tim && referencedPost.ext) {
                        const imgUrl = `${MEDIA_BASE}${referencedPost.tim}${referencedPost.ext}`;
                        previewHtml += `<img src="${imgUrl}" onerror="this.style.display='none'">`;
                    }
                    previewHtml += `<span>${sanitizeHTML(previewText)}</span></div>`;
                }
            }
        }

        let html = `
            <div class="username">${sanitizeHTML(post.name || 'Anonymous')} #${post.no}<span class="timestamp">${formatTimestamp(post.time)}</span></div>
        `;
        if (commentHtml && !(post.tim && post.ext && !post.com)) {
            html += `<div class="message-content">${commentHtml}</div>`;
        }
        if (post.tim && post.ext) {
            const imgUrl = `${MEDIA_BASE}${post.tim}${post.ext}`;
            html += `
                <img src="${imgUrl}" data-fullsrc="${imgUrl}" onerror="this.style.display='none'" class="message-image">
                <button class="download-btn" title="Download Image"><i class="fas fa-download"></i></button>
            `;
        }

        message.innerHTML = previewHtml + html;

        const img = message.querySelector('img.message-image');
        if (img) {
            img.addEventListener('click', () => openImageModal(img.getAttribute('data-fullsrc')));
            if (settings.hoverZoom) {
                img.addEventListener('mouseenter', e => showZoomPreview(e, img.getAttribute('data-fullsrc')));
                img.addEventListener('mouseleave', hideZoomPreview);
            }
        }

        const downloadBtn = message.querySelector('.download-btn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => {
                const url = img?.getAttribute('data-fullsrc');
                if (url) {
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = url.split('/').pop();
                    a.click();
                }
            });
        }

        fragment.appendChild(message);
    });

    chatMessages.innerHTML = '';
    chatMessages.appendChild(fragment);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    chatMessages.querySelectorAll('.reply-link').forEach(link => {
        link.addEventListener('mouseenter', e => showReplyPreview(link, postMap, boardCode, e));
        link.addEventListener('mouseleave', hideReplyPreview);
    });
}

/**
 * Opens the image modal for enlarged viewing.
 * @param {string} src - Image URL.
 */
function openImageModal(src) {
    if (!imageModal || !modalImage) {
        console.error('Image modal elements not found');
        return;
    }
    modalImage.src = src || '';
    imageModal.classList.add('active');
    imageModal.addEventListener('click', () => {
        imageModal.classList.remove('active');
        modalImage.src = '';
    }, { once: true });
}

/**
 * Shows a zoom preview for an image on hover.
 * @param {Event} event - Mouse event.
 * @param {string} src - Image URL.
 */
function showZoomPreview(event, src) {
    if (!zoomImagePreview) {
        console.error('Zoom image preview element not found');
        return;
    }
    zoomImagePreview.innerHTML = `<img src="${src || ''}" onerror="this.parentElement.style.display='none'">`;
    zoomImagePreview.style.display = 'block';
    zoomImagePreview.style.left = `${event.pageX + 10}px`;
    zoomImagePreview.style.top = `${event.pageY + 10}px`;
}

/**
 * Hides the zoom preview.
 */
function hideZoomPreview() {
    if (zoomImagePreview) {
        zoomImagePreview.style.display = 'none';
        zoomImagePreview.innerHTML = '';
    }
}

/**
 * Shows a reply preview popup on hover.
 * @param {HTMLElement} link - Reply link element.
 * @param {Map} postMap - Map of post numbers to posts.
 * @param {string} boardCode - Board code.
 * @param {Event} event - Mouse event.
 */
function showReplyPreview(link, postMap, boardCode, event) {
    if (!replyPreviewPopup) {
        console.error('Reply preview popup element not found');
        return;
    }
    const postNo = link.getAttribute('data-post-no');
    const post = postMap.get(parseInt(postNo));
    if (!post) return;

    let previewText = sanitizeComment(post.com || '').replace(/<[^>]+>/g, '').substring(0, 100);
    if (previewText.length > 100) previewText += '...';
    let html = `<div>${sanitizeHTML(post.name || 'Anonymous')} #${post.no}<br>${sanitizeHTML(previewText)}</div>`;
    if (post.tim && post.ext) {
        const imgUrl = `${MEDIA_BASE}${post.tim}${post.ext}`;
        html += `<img src="${imgUrl}" onerror="this.style.display='none'">`;
    }

    replyPreviewPopup.innerHTML = html;
    replyPreviewPopup.style.display = 'block';
    replyPreviewPopup.style.left = `${event.pageX + 10}px`;
    replyPreviewPopup.style.top = `${event.pageY + 10}px`;
}

/**
 * Hides the reply preview popup.
 */
function hideReplyPreview() {
    if (replyPreviewPopup) {
        replyPreviewPopup.style.display = 'none';
        replyPreviewPopup.innerHTML = '';
    }
}

// Event Listeners
/**
 * Initializes all event listeners for the application.
 */
function initializeEventListeners() {
    if (settingsToggleBoards) {
        settingsToggleBoards.addEventListener('click', () => {
            settingsPopup.classList.toggle('active');
            console.log('Settings popup toggled');
        });
    }

    if (settingsClose) {
        settingsClose.addEventListener('click', () => {
            settingsPopup.classList.remove('active');
            console.log('Settings popup closed');
        });
    }

    if (backToBoardsBtn) {
        backToBoardsBtn.addEventListener('click', () => {
            threadsPage.classList.remove('active');
            setTimeout(() => {
                boardsPage.classList.add('active');
                stopAutoRefresh();
            }, 300);
            console.log('Navigated back to boards page');
        });
    }

    if (backToThreadsBtn) {
        backToThreadsBtn.addEventListener('click', () => {
            chatPage.classList.remove('active');
            setTimeout(() => {
                threadsPage.classList.add('active');
                if (settings.autoRefresh) startAutoRefresh();
            }, 300);
            console.log('Navigated back to threads page');
        });
    }

    if (hoverZoomToggle) {
        hoverZoomToggle.addEventListener('click', () => {
            settings.hoverZoom = !settings.hoverZoom;
            saveSettings();
            applySettings();
            console.log(`Hover zoom ${settings.hoverZoom ? 'enabled' : 'disabled'}`);
        });
    }

    if (darkModeToggleSettings) {
        darkModeToggleSettings.addEventListener('click', () => {
            settings.darkMode = !settings.darkMode;
            saveSettings();
            applySettings();
            console.log(`Dark mode ${settings.darkMode ? 'enabled' : 'disabled'}`);
        });
    }

    if (darkModeToggleThreads) {
        darkModeToggleThreads.addEventListener('click', () => {
            settings.darkMode = !settings.darkMode;
            saveSettings();
            applySettings();
            console.log(`Dark mode ${settings.darkMode ? 'enabled' : 'disabled'}`);
        });
    }

    if (darkModeToggleChat) {
        darkModeToggleChat.addEventListener('click', () => {
            settings.darkMode = !settings.darkMode;
            saveSettings();
            applySettings();
            console.log(`Dark mode ${settings.darkMode ? 'enabled' : 'disabled'}`);
        });
    }

    if (highContrastToggle) {
        highContrastToggle.addEventListener('click', () => {
            settings.highContrast = !settings.highContrast;
            saveSettings();
            applySettings();
            console.log(`High contrast ${settings.highContrast ? 'enabled' : 'disabled'}`);
        });
    }

    if (ipDisplayToggle) {
        ipDisplayToggle.addEventListener('click', () => {
            settings.showIP = !settings.showIP;
            saveSettings();
            applySettings();
            if (settings.showIP) displayIPAndFlag();
            console.log(`IP display ${settings.showIP ? 'enabled' : 'disabled'}`);
        });
    }

    if (autoRefreshToggle) {
        autoRefreshToggle.addEventListener('click', () => {
            settings.autoRefresh = !settings.autoRefresh;
            saveSettings();
            applySettings();
            console.log(`Auto-refresh ${settings.autoRefresh ? 'enabled' : 'disabled'}`);
        });
    }

    if (threadTagInput) {
        threadTagInput.addEventListener('keypress', e => {
            if (e.key === 'Enter') {
                addThreadTag();
                console.log('Attempted to add new thread tag');
            }
        });
    }

    if (threadFilter) {
        threadFilter.addEventListener('input', debounce(() => {
            if (currentBoardCode) {
                fetchThreads(currentBoardCode);
                console.log(`Filtering threads with query: ${threadFilter.value}`);
            }
        }, 300));
    }

    if (threadSort) {
        threadSort.addEventListener('change', () => {
            if (currentBoardCode) {
                fetchThreads(currentBoardCode);
                console.log(`Sorting threads by: ${threadSort.value}`);
            }
        });
    }

    if (mediaFilter) {
        mediaFilter.addEventListener('change', () => {
            if (currentBoardCode) {
                fetchThreads(currentBoardCode);
                console.log(`Filtering threads by media: ${mediaFilter.value}`);
            }
        });
    }
}

// Initialization
/**
 * Initializes the application.
 */
function initialize() {
    console.log('Initializing 8kuk application');
    loadSettings();
    initializeEventListeners();
    loadBoards();
}

// Start the application
initialize();
