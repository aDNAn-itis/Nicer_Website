/**
 * Dark theme support for NASA NICER website
 */

class ThemeManager {
  constructor() {
    this.darkMode = localStorage.getItem('darkMode') === 'true';
    this.init();
  }

  init() {
    // Apply saved theme
    if (this.darkMode) {
      document.documentElement.classList.add('dark');
    }

    // Create theme toggle button
    this.createThemeToggle();

    // Add CSS variables for dark mode
    this.addDarkModeStyles();
  }

  createThemeToggle() {
    const themeToggle = document.createElement('button');
    themeToggle.className = 'theme-toggle';
    themeToggle.innerHTML = this.darkMode
      ? '<i class="fas fa-sun"></i>'
      : '<i class="fas fa-moon"></i>';
    themeToggle.title = this.darkMode
      ? 'Switch to light mode'
      : 'Switch to dark mode';

    themeToggle.style.cssText = `
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      width: 3.5rem;
      height: 3.5rem;
      border-radius: 50%;
      border: none;
      background: var(--nicer-light-blue);
      color: white;
      font-size: 1.25rem;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      transition: all 0.3s ease;
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    themeToggle.addEventListener('click', () => this.toggleTheme());
    themeToggle.addEventListener('mouseenter', () => {
      themeToggle.style.transform = 'scale(1.1)';
      themeToggle.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.2)';
    });
    themeToggle.addEventListener('mouseleave', () => {
      themeToggle.style.transform = 'scale(1)';
      themeToggle.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
    });

    document.body.appendChild(themeToggle);
    this.toggleButton = themeToggle;
  }

  toggleTheme() {
    this.darkMode = !this.darkMode;
    localStorage.setItem('darkMode', this.darkMode);

    if (this.darkMode) {
      document.documentElement.classList.add('dark');
      this.toggleButton.innerHTML = '<i class="fas fa-sun"></i>';
      this.toggleButton.title = 'Switch to light mode';
    } else {
      document.documentElement.classList.remove('dark');
      this.toggleButton.innerHTML = '<i class="fas fa-moon"></i>';
      this.toggleButton.title = 'Switch to dark mode';
    }

    // Trigger a custom event for other components to listen to
    window.dispatchEvent(
      new CustomEvent('themeChanged', {
        detail: { darkMode: this.darkMode },
      }),
    );
  }

  addDarkModeStyles() {
    const darkModeCSS = `
      :root.dark {
        --bg-primary: #0f172a;
        --bg-secondary: #1e293b;
        --text-primary: #f1f5f9;
        --text-secondary: #cbd5e1;
        --border-color: #334155;
        --hover-color: #2d3b50;
        --header-bg: #1e293b;
        --alternate-row: #334155;
      }

      .dark .hero {
        background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%);
      }

      .dark .card {
        background: var(--bg-secondary);
        border-color: var(--border-color);
        color: var(--text-primary);
      }

      .dark .navbar {
        background: rgba(15, 23, 42, 0.95);
        border-bottom-color: var(--border-color);
      }

      .dark .footer {
        background: var(--bg-primary);
      }

      .dark .stats-section {
        background: var(--bg-primary);
      }

      .dark .stat-card {
        background: var(--bg-secondary);
        border-color: var(--border-color);
        color: var(--text-primary);
      }

      .dark .feature-image {
        background: linear-gradient(135deg, #1e293b, #334155);
      }

      .dark table {
        background: var(--bg-secondary);
      }

      .dark td, .dark th {
        border-color: var(--border-color);
        color: var(--text-primary);
      }

      .dark input {
        background: var(--bg-secondary);
        border-color: var(--border-color);
        color: var(--text-primary);
      }

      .dark button {
        background: var(--bg-secondary);
        border-color: var(--border-color);
        color: var(--text-primary);
      }
    `;

    const style = document.createElement('style');
    style.textContent = darkModeCSS;
    document.head.appendChild(style);
  }
}

// Initialize theme manager when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new ThemeManager();
});
