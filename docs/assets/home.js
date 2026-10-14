function initializeAccordion() {
  const panels = [...document.querySelectorAll('.taste-panel')];
  if (!panels.length) return;
  const activate = (panel) => panels.forEach((item) => item.classList.toggle('is-active', item === panel));
  panels.forEach((panel) => {
    panel.addEventListener('mouseenter', () => activate(panel));
    panel.addEventListener('focus', () => activate(panel));
    panel.addEventListener('click', () => activate(panel));
    panel.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(panel); }
    });
  });
}

function splitRevealCopy() {
  const copy = document.querySelector('[data-reveal-copy]');
  if (!copy) return [];
  const words = copy.textContent.trim().split(/\s+/);
  copy.replaceChildren(...words.flatMap((word, index) => {
    const span = document.createElement('span');
    span.className = 'reveal-word';
    span.textContent = word;
    return index === words.length - 1 ? [span] : [span, document.createTextNode(' ')];
  }));
  return [...copy.querySelectorAll('.reveal-word')];
}

function initializeMotion() {
  const words = splitRevealCopy();
  if (!window.gsap || !window.ScrollTrigger) return;
  gsap.registerPlugin(ScrollTrigger);
  const media = gsap.matchMedia();

  media.add('(prefers-reduced-motion: no-preference)', () => {
    gsap.from('[data-hero-copy] > *', { y: 36, opacity: 0, duration: 1, stagger: .09, ease: 'power3.out' });
    gsap.from('[data-hero-art]', { scale: .84, opacity: 0, duration: 1.2, ease: 'power3.out' });
    const ticker = document.querySelector('[data-marquee]');
    if (ticker) gsap.to(ticker, { xPercent: -50, duration: 28, repeat: -1, ease: 'none' });

    gsap.from('[data-gallery-panel]', {
      y: 32,
      opacity: 0,
      duration: .8,
      stagger: .08,
      ease: 'power3.out',
      scrollTrigger: { trigger: '.memory-gallery', start: 'top 82%', once: true }
    });

    gsap.utils.toArray('.bento-card, .memory-intro > *, .ritual-heading > *, .home-cta-inner > *').forEach((item) => {
      gsap.from(item, {
        y: 24,
        opacity: 0,
        duration: .72,
        ease: 'power3.out',
        scrollTrigger: { trigger: item, start: 'top 88%', once: true }
      });
    });

    if (words.length) gsap.to(words, { opacity: 1, stagger: .08, ease: 'none', scrollTrigger: { trigger: '[data-reveal-copy]', start: 'top 78%', end: 'bottom 40%', scrub: true } });
  });

  media.add('(prefers-reduced-motion: reduce)', () => {
    gsap.set('[data-hero-copy], [data-hero-art], [data-gallery-panel]', { clearProps: 'all' });
    gsap.set(words, { opacity: 1 });
  });
}

initializeAccordion();
initializeMotion();
