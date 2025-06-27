/**
 * Loading screen for NASA NICER website
 */

class LoadingScreen {
  constructor() {
    this.createLoadingScreen();
    this.init();
  }

  createLoadingScreen() {
    const loadingHTML = `
      <div id="loading-screen" class="loading-screen">
        <div class="loading-content">
          <div class="loading-logo">
            <i class="fas fa-satellite"></i>
          </div>
          <div class="loading-text">
            <h2>NASA NICER</h2>
            <p>Loading mission data platform...</p>
          </div>
          <div class="loading-progress">
            <div class="progress-bar">
              <div class="progress-fill"></div>
            </div>
            <div class="loading-percentage">0%</div>
          </div>
          <div class="loading-stars">
            <div class="star"></div>
            <div class="star"></div>
            <div class="star"></div>
            <div class="star"></div>
            <div class="star"></div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('afterbegin', loadingHTML);
    this.addLoadingStyles();
  }

  addLoadingStyles() {
    const styles = `
      .loading-screen {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #16213e 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        transition: opacity 0.5s ease;
      }

      .loading-content {
        text-align: center;
        color: white;
        max-width: 400px;
        width: 90%;
      }

      .loading-logo {
        font-size: 4rem;
        color: #fbbf24;
        margin-bottom: 2rem;
        animation: float 3s ease-in-out infinite;
      }

      .loading-text h2 {
        font-size: 2.5rem;
        font-weight: 900;
        margin: 0 0 0.5rem 0;
        background: linear-gradient(45deg, white, #fbbf24, #c0c0c0);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }

      .loading-text p {
        font-size: 1.125rem;
        margin: 0 0 2rem 0;
        opacity: 0.8;
      }

      .loading-progress {
        margin-bottom: 2rem;
      }

      .progress-bar {
        width: 100%;
        height: 4px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 2px;
        overflow: hidden;
        margin-bottom: 1rem;
      }

      .progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #3b82f6, #fbbf24);
        width: 0%;
        transition: width 0.3s ease;
        animation: shimmer 2s infinite;
      }

      .loading-percentage {
        font-size: 1rem;
        opacity: 0.7;
      }

      .loading-stars {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
      }

      .star {
        position: absolute;
        width: 2px;
        height: 2px;
        background: white;
        border-radius: 50%;
        animation: twinkle 4s infinite;
      }

      .star:nth-child(1) {
        top: 20%;
        left: 20%;
        animation-delay: 0s;
      }

      .star:nth-child(2) {
        top: 30%;
        right: 20%;
        animation-delay: 1s;
      }

      .star:nth-child(3) {
        bottom: 30%;
        left: 30%;
        animation-delay: 2s;
      }

      .star:nth-child(4) {
        bottom: 20%;
        right: 30%;
        animation-delay: 3s;
      }

      .star:nth-child(5) {
        top: 50%;
        left: 50%;
        animation-delay: 1.5s;
      }

      @keyframes float {
        0%, 100% {
          transform: translateY(0px);
        }
        50% {
          transform: translateY(-20px);
        }
      }

      @keyframes shimmer {
        0% {
          background-position: -200px 0;
        }
        100% {
          background-position: 200px 0;
        }
      }

      @keyframes twinkle {
        0%, 100% {
          opacity: 0.3;
          transform: scale(1);
        }
        50% {
          opacity: 1;
          transform: scale(1.2);
        }
      }

      .loading-screen.fade-out {
        opacity: 0;
        pointer-events: none;
      }
    `;

    const styleSheet = document.createElement('style');
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
  }

  init() {
    this.simulateLoading();
  }

  simulateLoading() {
    const progressFill = document.querySelector('.progress-fill');
    const percentage = document.querySelector('.loading-percentage');
    let progress = 0;

    const loadingSteps = [
      { percent: 20, text: 'Initializing NICER systems...' },
      { percent: 40, text: 'Loading X-ray data...' },
      { percent: 60, text: 'Preparing visualizations...' },
      { percent: 80, text: 'Synchronizing instruments...' },
      { percent: 100, text: 'Ready for exploration!' },
    ];

    let stepIndex = 0;
    const loadingText = document.querySelector('.loading-text p');

    const updateProgress = () => {
      if (stepIndex < loadingSteps.length) {
        const step = loadingSteps[stepIndex];
        const targetProgress = step.percent;

        const animateProgress = () => {
          if (progress < targetProgress) {
            progress += 1;
            progressFill.style.width = progress + '%';
            percentage.textContent = progress + '%';

            if (progress === targetProgress) {
              loadingText.textContent = step.text;
              stepIndex++;
              setTimeout(updateProgress, 600);
            } else {
              requestAnimationFrame(animateProgress);
            }
          }
        };

        animateProgress();
      } else {
        setTimeout(() => this.hideLoadingScreen(), 800);
      }
    };

    setTimeout(updateProgress, 500);
  }

  hideLoadingScreen() {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
      loadingScreen.classList.add('fade-out');
      setTimeout(() => {
        loadingScreen.remove();
      }, 500);
    }
  }
}

// Initialize loading screen only on interactive plots pages
if (document.readyState === 'loading') {
  // Check if we're on an interactive plots page
  document.addEventListener('DOMContentLoaded', function () {
    if (
      window.location.pathname.includes('/plots/') ||
      document.querySelector('#plot-graph') ||
      document.querySelector('.plot-container')
    ) {
      new LoadingScreen();
    }
  });
} else {
  // If DOM is already loaded, check if we're on plots page
  if (
    window.location.pathname.includes('/plots/') ||
    document.querySelector('#plot-graph') ||
    document.querySelector('.plot-container')
  ) {
    new LoadingScreen();
  } else {
    console.log('Not on plots page, skipping loading screen');
  }
}
