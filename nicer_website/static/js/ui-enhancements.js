/**
 * Enhanced UI interactions for NASA NICER website
 * Provides smooth animations and improved user experience
 */

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', function () {
  initializeEnhancements();
});

function initializeEnhancements() {
  // Add smooth fade-in animations
  setupScrollAnimations();

  // Enhanced navigation
  setupNavigationEnhancements();

  // Add loading states for buttons
  setupButtonEnhancements();

  // Initialize tooltips
  setupTooltips();

  // Add keyboard shortcuts
  setupKeyboardShortcuts();
}

/**
 * Setup scroll-triggered animations
 */
function setupScrollAnimations() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('fade-in');

          // Add staggered animation for grid items
          if (entry.target.classList.contains('grid')) {
            const children = entry.target.children;
            Array.from(children).forEach((child, index) => {
              setTimeout(() => {
                child.classList.add('fade-in');
              }, index * 100);
            });
          }
        }
      });
    },
    {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px',
    },
  );

  // Observe elements for animation
  document
    .querySelectorAll('.card, .feature, .stat-card, .grid')
    .forEach((el) => {
      observer.observe(el);
    });
}

/**
 * Enhanced navigation with active states
 */
function setupNavigationEnhancements() {
  const navLinks = document.querySelectorAll('.nav-link');
  const currentPath = window.location.pathname;

  navLinks.forEach((link) => {
    // Highlight active navigation item
    if (link.getAttribute('href') === currentPath) {
      link.classList.add('active');
    }

    // Add ripple effect on click
    link.addEventListener('click', function (e) {
      createRippleEffect(e, this);
    });
  });
}

/**
 * Create ripple effect for buttons and links
 */
function createRippleEffect(event, element) {
  const ripple = document.createElement('span');
  const rect = element.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const x = event.clientX - rect.left - size / 2;
  const y = event.clientY - rect.top - size / 2;

  ripple.style.cssText = `
    position: absolute;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.3);
    transform: scale(0);
    animation: ripple 0.6s linear;
    width: ${size}px;
    height: ${size}px;
    left: ${x}px;
    top: ${y}px;
    pointer-events: none;
  `;

  element.style.position = 'relative';
  element.style.overflow = 'hidden';
  element.appendChild(ripple);

  setTimeout(() => {
    ripple.remove();
  }, 600);
}

/**
 * Enhanced button interactions
 */
function setupButtonEnhancements() {
  const buttons = document.querySelectorAll('.btn, button');

  buttons.forEach((button) => {
    // Add loading state for buttons with data-loading attribute
    button.addEventListener('click', function () {
      if (this.dataset.loading === 'true') {
        showButtonLoading(this);
      }
    });

    // Add hover sound effect (optional)
    button.addEventListener('mouseenter', function () {
      this.style.transform = 'translateY(-2px)';
    });

    button.addEventListener('mouseleave', function () {
      this.style.transform = 'translateY(0)';
    });
  });
}

/**
 * Show loading state for button
 */
function showButtonLoading(button) {
  const originalText = button.innerHTML;
  const originalWidth = button.offsetWidth;

  button.style.width = originalWidth + 'px';
  button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
  button.disabled = true;

  // Store original state for restoration
  button.dataset.originalText = originalText;

  // Auto-restore after 3 seconds if not manually restored
  setTimeout(() => {
    if (button.dataset.originalText) {
      restoreButtonState(button);
    }
  }, 3000);
}

/**
 * Restore button to original state
 */
function restoreButtonState(button) {
  if (button.dataset.originalText) {
    button.innerHTML = button.dataset.originalText;
    button.disabled = false;
    button.style.width = 'auto';
    delete button.dataset.originalText;
  }
}

/**
 * Setup tooltips for elements with title attributes
 */
function setupTooltips() {
  const elementsWithTooltips = document.querySelectorAll('[title]');

  elementsWithTooltips.forEach((element) => {
    const tooltipText = element.getAttribute('title');
    element.removeAttribute('title'); // Remove default tooltip

    const tooltip = document.createElement('div');
    tooltip.className = 'custom-tooltip';
    tooltip.textContent = tooltipText;
    tooltip.style.cssText = `
      position: absolute;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 0.5rem 1rem;
      border-radius: 0.5rem;
      font-size: 0.875rem;
      white-space: nowrap;
      z-index: 1000;
      pointer-events: none;
      opacity: 0;
      transform: translateY(10px);
      transition: all 0.2s ease;
    `;

    document.body.appendChild(tooltip);

    element.addEventListener('mouseenter', function (e) {
      const rect = element.getBoundingClientRect();
      tooltip.style.left =
        rect.left + rect.width / 2 - tooltip.offsetWidth / 2 + 'px';
      tooltip.style.top = rect.top - tooltip.offsetHeight - 10 + 'px';
      tooltip.style.opacity = '1';
      tooltip.style.transform = 'translateY(0)';
    });

    element.addEventListener('mouseleave', function () {
      tooltip.style.opacity = '0';
      tooltip.style.transform = 'translateY(10px)';
    });
  });
}

/**
 * Setup keyboard shortcuts
 */
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', function (e) {
    // Ctrl/Cmd + K for search (if search exists)
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      const searchInput = document.querySelector(
        'input[type="search"], input[name="search"]',
      );
      if (searchInput) {
        searchInput.focus();
      }
    }

    // Escape to close modals or clear selections
    if (e.key === 'Escape') {
      const activeModal = document.querySelector('.modal.active');
      if (activeModal) {
        activeModal.classList.remove('active');
      }
    }
  });
}

/**
 * Utility function to show notifications
 */
function showNotification(message, type = 'info', duration = 3000) {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.innerHTML = `
    <div class="notification-content">
      <i class="fas fa-${getNotificationIcon(type)}"></i>
      <span>${message}</span>
      <button class="notification-close" onclick="this.parentElement.parentElement.remove()">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `;

  notification.style.cssText = `
    position: fixed;
    top: 14px;
    right: 14px;
    background: white;
    border-radius: 0.5rem;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
    padding: 0.7rem 1.05rem;
    max-width: 400px;
    z-index: 10000;
    transform: translateX(100%);
    transition: transform 0.3s ease;
    border-left: 3px solid ${getNotificationColor(type)};
  `;

  document.body.appendChild(notification);

  // Trigger animation
  setTimeout(() => {
    notification.style.transform = 'translateX(0)';
  }, 100);

  // Auto remove
  setTimeout(() => {
    notification.style.transform = 'translateX(100%)';
    setTimeout(() => notification.remove(), 300);
  }, duration);
}

function getNotificationIcon(type) {
  const icons = {
    success: 'check-circle',
    error: 'exclamation-circle',
    warning: 'exclamation-triangle',
    info: 'info-circle',
  };
  return icons[type] || 'info-circle';
}

function getNotificationColor(type) {
  const colors = {
    success: '#10b981',
    error: '#ef4444',
    warning: '#f59e0b',
    info: '#3b82f6',
  };
  return colors[type] || '#3b82f6';
}

// Add CSS for animations
const style = document.createElement('style');
style.textContent = `
  @keyframes ripple {
    to {
      transform: scale(4);
      opacity: 0;
    }
  }
  
  .fade-in {
    animation: fadeInUp 0.6s ease-out forwards;
  }
  
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .notification {
    max-width: 280px;
  }
  .notification-content {
    font-size: 0.7rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .notification i, .notification-close i, .notification-close {
    font-size: 0.7rem;
  }

  .notification-close {
    background: none;
    border: none;
    cursor: pointer;
    color: #6b7280;
    margin-left: auto;
  }
  
  .notification-close:hover {
    color: #374151;
  }
`;
document.head.appendChild(style);

// Export functions for global use
window.NICEREnhancements = {
  showNotification,
  showButtonLoading,
  restoreButtonState,
  createRippleEffect,
};
