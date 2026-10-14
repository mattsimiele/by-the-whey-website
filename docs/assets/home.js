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

    document.querySelectorAll('[data-gallery-panel]').forEach((panel) => {
      gsap.fromTo(panel, { scale: .84, opacity: .35 }, { scale: 1, opacity: 1, ease: 'none', scrollTrigger: { trigger: panel, start: 'top 88%', end: 'center 46%', scrub: true } });
      gsap.to(panel, { opacity: .22, ease: 'none', scrollTrigger: { trigger: panel, start: 'bottom 34%', end: 'bottom top', scrub: true } });
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
