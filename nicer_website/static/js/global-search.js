/**
 * Global search functionality for NASA NICER website
 */

class GlobalSearch {
  constructor() {
    this.searchData = [];
    this.searchIndex = null;
    this.init();
  }

  init() {
    this.createSearchModal();
    this.setupKeyboardShortcuts();
    this.buildSearchIndex();
  }

  createSearchModal() {
    const modalHTML = `
      <div id="search-modal" class="search-modal">
        <div class="search-modal-overlay" onclick="closeSearchModal()"></div>
        <div class="search-modal-content">
          <div class="search-header">
            <div class="search-input-container">
              <i class="fas fa-search"></i>
              <input 
                type="text" 
                id="global-search-input" 
                placeholder="Search NICER data, documentation, and features..."
                autocomplete="off"
              >
              <kbd class="search-shortcut">ESC</kbd>
            </div>
          </div>
          <div class="search-results" id="search-results">
            <div class="search-suggestions">
              <div class="suggestion-category">
                <h4>Quick Actions</h4>
                <div class="suggestions">
                  <a href="/plots/" class="suggestion-item">
                    <i class="fas fa-chart-line"></i>
                    <span>Interactive Analysis</span>
                  </a>
                  <a href="/manager/" class="suggestion-item">
                    <i class="fas fa-database"></i>
                    <span>Browse Data Archive</span>
                  </a>
                  <a href="/about/" class="suggestion-item">
                    <i class="fas fa-info-circle"></i>
                    <span>About NICER Mission</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    this.addSearchStyles();
    this.setupSearchInput();
  }

  addSearchStyles() {
    const styles = `
      .search-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 10000;
        display: none;
        align-items: flex-start;
        justify-content: center;
        padding-top: 10vh;
      }

      .search-modal.active {
        display: flex;
      }

      .search-modal-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(4px);
      }

      .search-modal-content {
        position: relative;
        width: 90%;
        max-width: 600px;
        background: white;
        border-radius: 1rem;
        box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1);
        animation: searchModalIn 0.2s ease-out;
        max-height: 70vh;
        overflow: hidden;
      }

      @keyframes searchModalIn {
        from {
          opacity: 0;
          transform: translateY(-20px) scale(0.95);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      .search-header {
        padding: 1.5rem;
        border-bottom: 1px solid #e5e7eb;
      }

      .search-input-container {
        position: relative;
        display: flex;
        align-items: center;
      }

      .search-input-container .fas {
        position: absolute;
        left: 1rem;
        color: #6b7280;
        z-index: 1;
      }

      #global-search-input {
        width: 100%;
        padding: 1rem 1rem 1rem 3rem;
        padding-right: 4rem;
        border: 2px solid #e5e7eb;
        border-radius: 0.75rem;
        font-size: 1.125rem;
        background: #f9fafb;
        transition: all 0.2s ease;
      }

      #global-search-input:focus {
        outline: none;
        border-color: var(--nicer-light-blue, #3b82f6);
        background: white;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
      }

      .search-shortcut {
        position: absolute;
        right: 1rem;
        background: #e5e7eb;
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.75rem;
        color: #6b7280;
      }

      .search-results {
        max-height: 400px;
        overflow-y: auto;
        padding: 0;
      }

      .search-suggestions {
        padding: 1rem;
      }

      .suggestion-category h4 {
        color: #374151;
        font-size: 0.875rem;
        font-weight: 600;
        margin: 0 0 0.75rem 0;
        text-transform: uppercase;
        letter-spacing: 0.025em;
      }

      .suggestions {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      .suggestion-item {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem 1rem;
        border-radius: 0.5rem;
        text-decoration: none;
        color: #374151;
        transition: all 0.2s ease;
      }

      .suggestion-item:hover {
        background: #f3f4f6;
        color: var(--nicer-light-blue, #3b82f6);
        text-decoration: none;
      }

      .suggestion-item i {
        width: 1.25rem;
        color: var(--nicer-light-blue, #3b82f6);
      }

      .search-result-item {
        padding: 1rem 1.5rem;
        border-bottom: 1px solid #f3f4f6;
        cursor: pointer;
        transition: background 0.2s ease;
      }

      .search-result-item:hover {
        background: #f9fafb;
      }

      .search-result-item:last-child {
        border-bottom: none;
      }

      .result-title {
        font-weight: 600;
        color: #1f2937;
        margin-bottom: 0.25rem;
      }

      .result-description {
        color: #6b7280;
        font-size: 0.875rem;
        line-height: 1.4;
      }

      .result-path {
        color: var(--nicer-light-blue, #3b82f6);
        font-size: 0.75rem;
        margin-top: 0.25rem;
      }

      /* Dark mode support */
      .dark .search-modal-content {
        background: #1f2937;
        color: #f9fafb;
      }

      .dark .search-header {
        border-bottom-color: #374151;
      }

      .dark #global-search-input {
        background: #374151;
        border-color: #4b5563;
        color: #f9fafb;
      }

      .dark #global-search-input:focus {
        background: #4b5563;
      }

      .dark .suggestion-item {
        color: #d1d5db;
      }

      .dark .suggestion-item:hover {
        background: #374151;
      }

      .dark .search-result-item:hover {
        background: #374151;
      }
    `;

    const styleSheet = document.createElement('style');
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
  }

  setupSearchInput() {
    const searchInput = document.getElementById('global-search-input');
    const searchResults = document.getElementById('search-results');

    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      if (query.length > 2) {
        this.performSearch(query);
      } else {
        this.showDefaultSuggestions();
      }
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeSearchModal();
      }
    });
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + K to open search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        this.openSearchModal();
      }

      // Escape to close search
      if (e.key === 'Escape') {
        this.closeSearchModal();
      }
    });
  }

  buildSearchIndex() {
    // Build a searchable index of content
    this.searchData = [
      {
        title: 'Interactive Plots',
        description:
          'Analyze NICER data with interactive visualizations including light curves, spectra, and timing analysis.',
        url: '/plots/',
        category: 'Analysis Tools',
        keywords: [
          'plots',
          'analysis',
          'visualization',
          'light curve',
          'spectrum',
          'timing',
        ],
      },
      {
        title: 'Data Archive',
        description:
          'Browse and download NICER observation data from the comprehensive mission archive.',
        url: '/manager/',
        category: 'Data Access',
        keywords: [
          'data',
          'archive',
          'browse',
          'download',
          'observations',
          'files',
        ],
      },
      {
        title: 'About NICER',
        description:
          'Learn about the NICER mission, its scientific goals, and instrumental capabilities.',
        url: '/about/',
        category: 'Information',
        keywords: [
          'about',
          'mission',
          'science',
          'neutron stars',
          'x-ray',
          'timing',
        ],
      },
      {
        title: 'X-ray Timing Analysis',
        description:
          'Perform precise timing analysis of neutron star observations with microsecond accuracy.',
        url: '/plots/',
        category: 'Analysis',
        keywords: [
          'timing',
          'x-ray',
          'microsecond',
          'precision',
          'analysis',
          'neutron star',
        ],
      },
      {
        title: 'Spectral Analysis',
        description:
          'Study X-ray spectra to understand neutron star atmospheres and emission mechanisms.',
        url: '/plots/',
        category: 'Analysis',
        keywords: [
          'spectral',
          'spectrum',
          'energy',
          'atmosphere',
          'emission',
          'analysis',
        ],
      },
    ];
  }

  performSearch(query) {
    const results = this.searchData.filter((item) => {
      const searchText = (
        item.title +
        ' ' +
        item.description +
        ' ' +
        item.keywords.join(' ')
      ).toLowerCase();
      return searchText.includes(query.toLowerCase());
    });

    this.displayResults(results, query);
  }

  displayResults(results, query) {
    const searchResults = document.getElementById('search-results');

    if (results.length === 0) {
      searchResults.innerHTML = `
        <div class="search-suggestions">
          <div class="suggestion-category">
            <p style="text-align: center; color: #6b7280; padding: 2rem;">
              No results found for "${query}". Try different keywords or browse our sections.
            </p>
          </div>
        </div>
      `;
      return;
    }

    const resultsHTML = results
      .map(
        (result) => `
      <div class="search-result-item" onclick="window.location.href='${
        result.url
      }'">
        <div class="result-title">${this.highlightQuery(
          result.title,
          query,
        )}</div>
        <div class="result-description">${this.highlightQuery(
          result.description,
          query,
        )}</div>
        <div class="result-path">${result.category}</div>
      </div>
    `,
      )
      .join('');

    searchResults.innerHTML = `
      <div style="padding: 1rem 0;">
        ${resultsHTML}
      </div>
    `;
  }

  highlightQuery(text, query) {
    const regex = new RegExp(`(${query})`, 'gi');
    return text.replace(
      regex,
      '<mark style="background: #fef3c7; padding: 0.125rem;">$1</mark>',
    );
  }

  showDefaultSuggestions() {
    const searchResults = document.getElementById('search-results');
    searchResults.innerHTML = `
      <div class="search-suggestions">
        <div class="suggestion-category">
          <h4>Quick Actions</h4>
          <div class="suggestions">
            <a href="/plots/" class="suggestion-item">
              <i class="fas fa-chart-line"></i>
              <span>Interactive Analysis</span>
            </a>
            <a href="/manager/" class="suggestion-item">
              <i class="fas fa-database"></i>
              <span>Browse Data Archive</span>
            </a>
            <a href="/about/" class="suggestion-item">
              <i class="fas fa-info-circle"></i>
              <span>About NICER Mission</span>
            </a>
          </div>
        </div>
        <div class="suggestion-category">
          <h4>Popular Searches</h4>
          <div class="suggestions">
            <div class="suggestion-item" onclick="document.getElementById('global-search-input').value='light curve'; document.getElementById('global-search-input').dispatchEvent(new Event('input'));">
              <i class="fas fa-wave-square"></i>
              <span>Light Curve Analysis</span>
            </div>
            <div class="suggestion-item" onclick="document.getElementById('global-search-input').value='spectrum'; document.getElementById('global-search-input').dispatchEvent(new Event('input'));">
              <i class="fas fa-chart-area"></i>
              <span>Spectral Analysis</span>
            </div>
            <div class="suggestion-item" onclick="document.getElementById('global-search-input').value='timing'; document.getElementById('global-search-input').dispatchEvent(new Event('input'));">
              <i class="fas fa-clock"></i>
              <span>Timing Analysis</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  openSearchModal() {
    const modal = document.getElementById('search-modal');
    const input = document.getElementById('global-search-input');

    modal.classList.add('active');
    setTimeout(() => {
      input.focus();
    }, 100);

    this.showDefaultSuggestions();
  }

  closeSearchModal() {
    const modal = document.getElementById('search-modal');
    const input = document.getElementById('global-search-input');

    modal.classList.remove('active');
    input.value = '';
  }
}

// Global functions for modal control
window.openSearchModal = function () {
  if (window.globalSearch) {
    window.globalSearch.openSearchModal();
  }
};

window.closeSearchModal = function () {
  if (window.globalSearch) {
    window.globalSearch.closeSearchModal();
  }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.globalSearch = new GlobalSearch();
});
