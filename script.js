// Grab all the DOM stuff we need, ugh so many elements
const boardList = document.getElementById('board-list');
const boardView = document.getElementById('board-view');
const threadView = document.getElementById('thread-view');
const mainHeader = document.getElementById('main-header');
const headerTitle = document.getElementById('header-title');
const backButton = document.getElementById('back-button');
const breadcrumbs = document.getElementById('breadcrumbs');
const threadList = document.getElementById('thread-list');
const threadPosts = document.getElementById('thread-posts');
const loaderContainer = document.getElementById('loader-container');
const loaderMessage = document.getElementById('loader-message');
const loadMoreButton = document.getElementById('load-more');
const settingsButton = document.getElementById('settings-button');
const imageModal = document.getElementById('image-modal');
const modalImage = document.getElementById('modal-image');
const modalClose = document.querySelector('.modal-close');
const settingsPopup = document.getElementById('settings-popup');
const popupClose = document.getElementById('popup-close');
const pullRefresh = document.getElementById('pull-refresh');
const corsPopup = document.getElementById('cors-popup');

let currentBoard = localStorage.getItem('lastBoard') || '';
let currentThread = null;
let currentPage = 0;
let isLoading = false;
let boardData = null;
let threadData = [];
const CORS_PROXY = 'https://cors-anywhere.herokuapp.com/';
const CACHE_KEY = 'ichan_board_cache';
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours, seems fine

// Settings stuff, load from localStorage if it exists
const settings = {
    darkMode: localStorage.getItem('theme') === 'dark',
    hideNSFW: localStorage.getItem('hideNSFW') === 'true',
    autoRefresh: localStorage.getItem('autoRefresh') === 'true',
    hideImages: localStorage.getItem('hideImages') === 'true',
    boardSort: localStorage.getItem('boardSort') || 'alphabetical',
    boardFilter: localStorage.getItem('boardFilter') || 'all'
};

// Sanitize HTML to avoid XSS, gotta be safe
function sanitizeHTML(html) {
    return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}

// Format timestamp so it looks nice
function formatTimestamp(timestamp) {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' });
}

// Cache stuff so we don’t hit the API too much
function getCachedBoards() {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp > CACHE_EXPIRY) {
        localStorage.removeItem(CACHE_KEY);
        return null;
    }
    return data;
}

function cacheBoards(data) {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
}

// Fetch with retry because 4chan API can be flaky sometimes
async function fetchWithRetry(url, maxRetries = 3, delay = 1000) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(CORS_PROXY + url, {
                headers: { 'User-Agent': 'iChan/1.0 (https://user7210unix.github.io/ichan/)' }
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// Debounce for search or whatever, don’t need it now but keeping it
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// Header float thing, makes it slide up when scrolling
let lastScrollY = 0;
window.addEventListener('scroll', () => {
    const scrollY = window.scrollY;
    mainHeader.style.transform = `translateY(${scrollY > lastScrollY && scrollY > 60 ? -100 : 0}%)`;
    lastScrollY = scrollY;
});

// Load boards, the main entry point
async function loadBoards(useCache = true) {
    if (isLoading) return;
    isLoading = true;
    loaderContainer.classList.add('active');
    loaderMessage.textContent = 'Connecting to boards...';
    try {
        let data = useCache ? getCachedBoards() : null;
        if (!data) {
            data = await fetchWithRetry('https://a.4cdn.org/boards.json');
            cacheBoards(data);
        }
        boardData = data;
        corsPopup.style.display = 'none'; // Hide popup once boards load
        renderBoards(boardData.boards);
        if (currentBoard) openBoard(currentBoard);
    } catch (error) {
        console.error('Error loading boards:', error);
        let errorMessage = 'Using cached boards...';
        const cachedData = getCachedBoards();
        if (cachedData) {
            boardData = cachedData;
            renderBoards(boardData.boards);
        } else {
            errorMessage = 'Unable to connect.';
            boardList.innerHTML = `<p class="error-message">${errorMessage}</p>`;
        }
        loaderMessage.textContent = errorMessage.includes('Unable') ? 'Connection failed...' : errorMessage;
    } finally {
        isLoading = false;
        loaderContainer.classList.remove('active');
    }
}

// Short description for boards, cleans up the meta stuff
function getShortDescription(board) {
    let desc = board.meta_description || board.title;
    desc = desc.replace(/is 4chan's board for\s*/i, '').replace(/^\s*-\s*/, '');
    return desc.charAt(0).toUpperCase() + desc.slice(1);
}

// Render the boards, make them look pretty
function renderBoards(boards) {
    let filteredBoards = boards.filter(board => {
        const matchesFilter = settings.boardFilter === 'all' || 
                             (settings.boardFilter === 'sfw' && !board.ws_board) || 
                             (settings.boardFilter === 'nsfw' && board.ws_board);
        const matchesNSFW = !settings.hideNSFW || !board.ws_board;
        return matchesFilter && matchesNSFW;
    });

    if (settings.boardSort === 'alphabetical') {
        filteredBoards.sort((a, b) => a.board.localeCompare(b.board));
    } else {
        filteredBoards.sort((a, b) => (b.posts_total || 0) - (a.posts_total || 0));
    }

    boardList.innerHTML = ''; // No search bar anymore
    filteredBoards.forEach((board, index) => {
        const boardItem = document.createElement('div');
        boardItem.classList.add('board-item');
        boardItem.tabIndex = 0;
        boardItem.innerHTML = `
            <img src="assets/board-icons/${board.board}.png" onerror="this.src='assets/ichan-icon.png'" class="board-icon" alt="${board.board} icon">
            <div class="board-content">
                <div class="board-item-title">/${board.board}/ - ${board.title}</div>
                <div class="board-item-snippet">${sanitizeHTML(getShortDescription(board))}</div>
            </div>
        `;
        boardItem.addEventListener('click', () => openBoard(board.board));
        boardItem.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') openBoard(board.board);
        });
        boardList.appendChild(boardItem);
        gsap.from(boardItem, { opacity: 0, y: 40, duration: 0.6, delay: index * 0.1, ease: 'power2.out' });
    });

    if (filteredBoards.length === 0) {
        boardList.innerHTML += '<p class="error-message">No boards found.</p>';
    }
}

// Open a board, show its threads
function openBoard(boardId) {
    currentBoard = boardId;
    currentThread = null;
    localStorage.setItem('lastBoard', currentBoard);
    const board = boardData.boards.find(b => b.board === boardId);
    headerTitle.textContent = `/${boardId}/ - ${board?.title || 'Board'}`;
    boardList.style.display = 'none';
    boardView.style.display = 'flex';
    threadView.style.display = 'none';
    backButton.style.display = 'inline-block';
    backButton.classList.remove('inactive');
    breadcrumbs.style.display = 'flex';
    breadcrumbs.innerHTML = `
        <span class="breadcrumb" onclick="returnToBoardList()"><i class="fas fa-home"></i> Home</span>
        <span class="breadcrumb-sep">/</span>
        <span class="breadcrumb active"><i class="fas fa-folder"></i> /${boardId}/</span>
    `;
    loadThreads(boardId);
}

// Open a thread, show its posts
function openThread(boardId, threadId, threadSubject) {
    currentThread = threadId;
    headerTitle.textContent = threadSubject || `Thread #${threadId}`;
    boardList.style.display = 'none';
    boardView.style.display = 'none';
    threadView.style.display = 'flex';
    backButton.style.display = 'inline-block';
    backButton.classList.remove('inactive');
    breadcrumbs.style.display = 'flex';
    breadcrumbs.innerHTML = `
        <span class="breadcrumb" onclick="returnToBoardList()"><i class="fas fa-home"></i> Home</span>
        <span class="breadcrumb-sep">/</span>
        <span class="breadcrumb" onclick="returnToThreadList()"><i class="fas fa-folder"></i> /${boardId}/</span>
        <span class="breadcrumb-sep">/</span>
        <span class="breadcrumb active"><i class="fas fa-file"></i> Thread #${threadId}</span>
    `;
    loadThreadPosts(boardId, threadId);
}

// Go back to board list
function returnToBoardList() {
    boardView.style.display = 'none';
    threadView.style.display = 'none';
    boardList.style.display = 'flex';
    headerTitle.textContent = 'iChan';
    backButton.style.display = 'none';
    backButton.classList.add('inactive');
    breadcrumbs.style.display = 'none';
    currentBoard = '';
    currentThread = null;
    localStorage.removeItem('lastBoard');
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
}

// Go back to thread list
function returnToThreadList() {
    threadView.style.display = 'none';
    boardView.style.display = 'flex';
    boardList.style.display = 'none';
    const board = boardData.boards.find(b => b.board === currentBoard);
    headerTitle.textContent = `/${currentBoard}/ - ${board?.title || 'Board'}`;
    backButton.style.display = 'inline-block';
    backButton.classList.remove('inactive');
    breadcrumbs.innerHTML = `
        <span class="breadcrumb" onclick="returnToBoardList()"><i class="fas fa-home"></i> Home</span>
        <span class="breadcrumb-sep">/</span>
        <span class="breadcrumb active"><i class="fas fa-folder"></i> /${currentBoard}/</span>
    `;
    currentThread = null;
    loadThreads(currentBoard);
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
}

// Load threads for a board
async function loadThreads(board, append = false) {
    if (isLoading) return;
    isLoading = true;
    loaderContainer.classList.add('active');
    loaderMessage.textContent = 'Loading threads...';
    try {
        if (!append) {
            currentPage = 0;
            threadData = [];
            threadList.innerHTML = '';
        }
        const data = await fetchWithRetry(`https://a.4cdn.org/${board}/catalog.json`);
        const threads = data.flatMap(page => page.threads);
        threadData = append ? threadData.concat(threads) : threads;
        renderThreads(board, threadData);
        loadMoreButton.style.display = threadData.length > (currentPage + 1) * 10 ? 'block' : 'none';
        loadMoreButton.classList.remove('inactive');
        currentPage++;
    } catch (error) {
        console.error('Error loading threads:', error);
        let errorMessage = 'Unable to load threads. Please try again.';
        threadList.innerHTML = `
            <p class="error-message">${errorMessage}</p>
            <button class="jelly-button retry-button">Retry<span></span></button>
        `;
        const retryButton = threadList.querySelector('.retry-button');
        retryButton.addEventListener('click', () => loadThreads(board));
        retryButton.classList.remove('inactive');
        loaderMessage.textContent = errorMessage;
    } finally {
        isLoading = false;
        loaderContainer.classList.remove('active');
    }
}

// Render threads, no search bar so it’s simpler now
function renderThreads(board, threads) {
    threadList.innerHTML = `<h2>Threads in /${board}/</h2>`;
    const filteredThreads = threads.slice(currentPage * 10, (currentPage + 1) * 10);

    if (filteredThreads.length === 0) {
        threadList.innerHTML += '<p class="error-message">No threads found.</p>';
        loadMoreButton.style.display = 'none';
        loadMoreButton.classList.add('inactive');
        return;
    }

    filteredThreads.forEach((thread, index) => {
        const threadDiv = document.createElement('div');
        threadDiv.classList.add('thread');
        threadDiv.tabIndex = 0;
        threadDiv.innerHTML = `
            <div class="thread-title">${sanitizeHTML(thread.sub || `Thread #${thread.no}`)}</div>
            <div class="post op-post">${sanitizeHTML(thread.com || 'No comment')}</div>
            ${!settings.hideImages && thread.tim && thread.ext ? `<img src="https://i.4cdn.org/${board}/${thread.tim}${thread.ext}" loading="lazy" alt="Thread image" class="post-image">` : ''}
            <div class="post-timestamp">${formatTimestamp(thread.time)}</div>
        `;
        const img = threadDiv.querySelector('.post-image');
        if (img) {
            img.onerror = () => { img.src = 'https://via.placeholder.com/150?text=Image+Not+Found'; };
            img.addEventListener('click', () => openImageModal(img.src));
        }
        threadDiv.addEventListener('click', () => openThread(board, thread.no, thread.sub));
        threadDiv.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') openThread(board, thread.no, thread.sub);
        });
        threadList.appendChild(threadDiv);
        gsap.from(threadDiv, { opacity: 0, y: 40, duration: 0.6, delay: index * 0.1, ease: 'power2.out' });
    });
}

// Load posts for a thread
let autoRefreshInterval = null;
async function loadThreadPosts(board, threadId) {
    if (isLoading) return;
    isLoading = true;
    loaderContainer.classList.add('active');
    loaderMessage.textContent = 'Loading thread...';
    try {
        threadPosts.innerHTML = '';
        const data = await fetchWithRetry(`https://a.4cdn.org/${board}/thread/${threadId}.json`);
        data.posts.forEach((post, index) => {
            const postDiv = document.createElement('div');
            postDiv.classList.add('post', index === 0 ? 'op-post' : 'reply-post');
            postDiv.innerHTML = sanitizeHTML(post.com || 'No comment');
            if (!settings.hideImages && post.tim && post.ext) {
                const img = document.createElement('img');
                img.src = `https://i.4cdn.org/${board}/${post.tim}${post.ext}`;
                img.loading = 'lazy';
                img.alt = index === 0 ? 'Thread image' : 'Reply image';
                img.className = 'post-image';
                img.onerror = () => { img.src = 'https://via.placeholder.com/150?text=Image+Not+Found'; };
                img.addEventListener('click', () => openImageModal(img.src));
                postDiv.appendChild(img);
            }
            const timestamp = document.createElement('div');
            timestamp.classList.add('post-timestamp');
            timestamp.textContent = formatTimestamp(post.time);
            postDiv.appendChild(timestamp);
            threadPosts.appendChild(postDiv);
            gsap.from(postDiv, { opacity: 0, x: index === 0 ? 60 : -60, duration: 0.6, delay: index * 0.1, ease: 'power2.out' });
        });
        if (settings.autoRefresh) {
            if (autoRefreshInterval) clearInterval(autoRefreshInterval);
            autoRefreshInterval = setInterval(() => loadThreadPosts(board, threadId), 30000);
        }
    } catch (error) {
        console.error('Error loading thread:', error);
        let errorMessage = 'Unable to load thread. Please try again.';
        threadPosts.innerHTML = `
            <p class="error-message">${errorMessage}</p>
            <button class="jelly-button retry-button">Retry<span></span></button>
        `;
        const retryButton = threadPosts.querySelector('.retry-button');
        retryButton.addEventListener('click', () => loadThreadPosts(board, threadId));
        retryButton.classList.remove('inactive');
        loaderMessage.textContent = errorMessage;
    } finally {
        isLoading = false;
        loaderContainer.classList.remove('active');
    }
}

// Image modal for viewing pics
function openImageModal(src) {
    modalImage.src = src;
    imageModal.style.display = 'flex';
    gsap.fromTo(imageModal, { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.4, ease: 'power2.out' });
}

modalClose.addEventListener('click', () => {
    imageModal.style.display = 'none';
    modalImage.src = '';
});

imageModal.addEventListener('click', e => {
    if (e.target === imageModal) {
        imageModal.style.display = 'none';
        modalImage.src = '';
    }
});

// Settings popup logic, let’s make sure this actually works
settingsButton.addEventListener('click', () => {
    console.log('Settings button clicked'); // Debug to make sure it’s firing
    settingsPopup.style.display = 'block'; // Should show the popup
    settingsButton.classList.remove('inactive');
    gsap.fromTo(settingsPopup, { opacity: 0, y: -30 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' });
});

popupClose.addEventListener('click', () => {
    settingsPopup.style.display = 'none';
    settingsButton.classList.add('inactive');
});

settingsPopup.addEventListener('click', e => {
    if (e.target === settingsPopup) {
        settingsPopup.style.display = 'none';
        settingsButton.classList.add('inactive');
    }
});

// Settings toggles
document.getElementById('dark-mode').checked = settings.darkMode;
document.getElementById('dark-mode').addEventListener('change', e => {
    settings.darkMode = e.target.checked;
    document.body.classList.toggle('dark', settings.darkMode);
    localStorage.setItem('theme', settings.darkMode ? 'dark' : 'light');
});

document.getElementById('hide-nsfw').checked = settings.hideNSFW;
document.getElementById('hide-nsfw').addEventListener('change', e => {
    settings.hideNSFW = e.target.checked;
    localStorage.setItem('hideNSFW', settings.hideNSFW);
    if (boardData) renderBoards(boardData.boards);
});

document.getElementById('auto-refresh').checked = settings.autoRefresh;
document.getElementById('auto-refresh').addEventListener('change', e => {
    settings.autoRefresh = e.target.checked;
    localStorage.setItem('autoRefresh', settings.autoRefresh);
    if (!settings.autoRefresh && autoRefreshInterval) clearInterval(autoRefreshInterval);
    if (settings.autoRefresh && currentThread) loadThreadPosts(currentBoard, currentThread);
});

document.getElementById('hide-images').checked = settings.hideImages;
document.getElementById('hide-images').addEventListener('change', e => {
    settings.hideImages = e.target.checked;
    localStorage.setItem('hideImages', settings.hideImages);
    if (currentBoard) loadThreads(currentBoard);
    if (currentThread) loadThreadPosts(currentBoard, currentThread);
});

document.getElementById('board-sort').value = settings.boardSort;
document.getElementById('board-sort').addEventListener('change', e => {
    settings.boardSort = e.target.value;
    localStorage.setItem('boardSort', settings.boardSort);
    if (boardData) renderBoards(boardData.boards);
});

document.getElementById('board-filter').value = settings.boardFilter;
document.getElementById('board-filter').addEventListener('change', e => {
    settings.boardFilter = e.target.value;
    localStorage.setItem('boardFilter', settings.boardFilter);
    if (boardData) renderBoards(boardData.boards);
});

// Navigation stuff
backButton.addEventListener('click', () => {
    if (threadView.style.display === 'flex') {
        returnToThreadList();
    } else {
        returnToBoardList();
    }
});

loadMoreButton.addEventListener('click', () => loadThreads(currentBoard, true));

// Pull-to-refresh for mobile
let touchStartY = 0;
let isPulling = false;
document.addEventListener('touchstart', e => {
    touchStartY = e.touches[0].clientY;
    if (window.scrollY === 0 && (boardView.style.display === 'flex' || threadView.style.display === 'flex')) {
        isPulling = true;
    }
});

document.addEventListener('touchmove', e => {
    if (!isPulling) return;
    const touchY = e.touches[0].clientY;
    const pullDistance = touchY - touchStartY;
    if (pullDistance > 50) {
        pullRefresh.style.display = 'block';
        pullRefresh.style.transform = `translateY(${Math.min(pullDistance - 50, 50)}px)`;
    }
});

document.addEventListener('touchend', e => {
    if (isPulling && e.changedTouches[0].clientY - touchStartY > 100 && !isLoading) {
        if (boardView.style.display === 'flex') {
            loadThreads(currentBoard);
        } else if (threadView.style.display === 'flex') {
            loadThreadPosts(currentBoard, currentThread);
        }
    }
    isPulling = false;
    pullRefresh.style.display = 'none';
    pullRefresh.style.transform = 'translateY(0)';
});

// Keyboard navigation, makes it more accessible
document.addEventListener('keydown', e => {
    if (boardList.style.display !== 'none') {
        const boards = document.querySelectorAll('.board-item');
        if (e.key === 'ArrowDown') {
            const focused = document.activeElement;
            const next = focused.nextElementSibling || boards[0];
            if (next) next.focus();
        } else if (e.key === 'ArrowUp') {
            const focused = document.activeElement;
            const prev = focused.previousElementSibling || boards[boards.length - 1];
            if (prev) prev.focus();
        }
    } else if (boardView.style.display === 'flex') {
        const threads = document.querySelectorAll('.thread');
        if (e.key === 'ArrowDown') {
            const focused = document.activeElement;
            const next = focused.nextElementSibling || threads[0];
            if (next) next.focus();
        } else if (e.key === 'ArrowUp') {
            const focused = document.activeElement;
            const prev = focused.previousElementSibling || threads[threads.length - 1];
            if (prev) prev.focus();
        } else if (e.key === 'Backspace') {
            returnToBoardList();
        }
    } else if (threadView.style.display === 'flex') {
        if (e.key === 'Backspace') {
            returnToThreadList();
        }
    }
    if (e.key === 'Escape') {
        settingsPopup.style.display = 'none';
        imageModal.style.display = 'none';
    }
});

// Start the app
if (settings.darkMode) document.body.classList.add('dark');
loadBoards();
