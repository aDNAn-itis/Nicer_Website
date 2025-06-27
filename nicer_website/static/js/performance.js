/**
 * Performance optimization utilities for NASA NICER website
 */

class PerformanceOptimizer {
  constructor() {
    this.init();
  }

  init() {
    this.optimizeImages();
    this.setupLazyLoading();
    this.preloadCriticalResources();
    this.setupServiceWorker();
    this.monitorPerformance();
  }

  optimizeImages() {
    // Add loading="lazy" to images that aren't immediately visible
    const images = document.querySelectorAll('img:not([loading])');
    images.forEach((img, index) => {
      if (index > 2) {
        // First 3 images load immediately
        img.loading = 'lazy';
      }
    });
  }

  setupLazyLoading() {
    // Lazy load non-critical content
    const lazyElements = document.querySelectorAll('[data-lazy]');

    if ('IntersectionObserver' in window) {
      const lazyObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const element = entry.target;
            const src = element.dataset.lazy;

            if (element.tagName === 'IMG') {
              element.src = src;
            } else if (element.tagName === 'DIV') {
              element.style.backgroundImage = `url(${src})`;
            }

            element.removeAttribute('data-lazy');
            lazyObserver.unobserve(element);
          }
        });
      });

      lazyElements.forEach((el) => lazyObserver.observe(el));
    }
  }

  preloadCriticalResources() {
    // Preload critical fonts and CSS
    const criticalResources = [
      {
        href: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;900&display=swap',
        as: 'style',
      },
      { href: '/static/css/main.css', as: 'style' },
    ];

    criticalResources.forEach((resource) => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.href = resource.href;
      link.as = resource.as;
      if (resource.as === 'style') {
        link.onload = () => {
          link.rel = 'stylesheet';
        };
      }
      document.head.appendChild(link);
    });
  }

  setupServiceWorker() {
    // Register service worker for offline functionality
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/static/js/sw.js')
          .then((registration) => {
            console.log('SW registered: ', registration);
          })
          .catch((registrationError) => {
            console.log('SW registration failed: ', registrationError);
          });
      });
    }
  }

  monitorPerformance() {
    // Monitor and report performance metrics
    if ('performance' in window) {
      window.addEventListener('load', () => {
        setTimeout(() => {
          const perfData = performance.getEntriesByType('navigation')[0];
          const metrics = {
            loadTime: perfData.loadEventEnd - perfData.loadEventStart,
            domContentLoaded:
              perfData.domContentLoadedEventEnd -
              perfData.domContentLoadedEventStart,
            totalTime: perfData.loadEventEnd - perfData.fetchStart,
          };

          console.log('Performance Metrics:', metrics);

          // You can send these metrics to an analytics service
          // this.sendMetrics(metrics);
        }, 0);
      });
    }
  }

  // Utility to defer non-critical JavaScript
  static deferScript(src, callback) {
    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    if (callback) script.onload = callback;
    document.head.appendChild(script);
  }

  // Utility to preload a resource
  static preloadResource(href, as, type = null) {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.href = href;
    link.as = as;
    if (type) link.type = type;
    document.head.appendChild(link);
  }
}

// Initialize performance optimizer
document.addEventListener('DOMContentLoaded', () => {
  new PerformanceOptimizer();
});

// Export for use in other modules
window.PerformanceOptimizer = PerformanceOptimizer;
