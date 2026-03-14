// Welcome page logic for GForm to GPT
document.addEventListener('DOMContentLoaded', () => {
  // Initialize Typed.js for the main title
  if (typeof Typed !== 'undefined') {
    new Typed('#hero-title', {
      strings: ['GForm to GPT'],
      typeSpeed: 60,
      showCursor: false,
      onComplete: () => {
        // Hero subtitle animation
        new Typed('#typed', {
          strings: [
            'Automate Google Forms with Neural Intelligence.',
            'Seamless support for ChatGPT, Claude, and Gemini.',
            'Bypass detection with Human-Mimetic Typing.',
            'The future of productivity is here.'
          ],
          typeSpeed: 40,
          backSpeed: 20,
          backDelay: 2000,
          loop: true
        });
        
        // Capability section title animation
        new Typed('#feat-title', {
          strings: ['Intelligent Automation', 'Neural Efficiency', 'Extreme Productivity'],
          typeSpeed: 50,
          backSpeed: 30,
          backDelay: 3000,
          loop: true
        });
      }
    });
  }

  // Scroll down functionality
  const scrollDownBtn = document.querySelector('.scroll-down');
  if (scrollDownBtn) {
    scrollDownBtn.addEventListener('click', () => {
      const mainContainer = document.querySelector('.main-container');
      if (mainContainer) {
        mainContainer.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }

  // Intersection Observer for scroll animations
  const revealElements = document.querySelectorAll('.reveal');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('active');
      }
    });
  }, { threshold: 0.15 });

  revealElements.forEach(el => observer.observe(el));

  // Handle deep links from URL hash
  const hash = window.location.hash;
  if (hash) {
    const el = document.querySelector(hash);
    if (el) {
      setTimeout(() => {
        el.scrollIntoView({ behavior: 'smooth' });
      }, 500);
    }
  }
});
