const SITE_NAVIGATION = [
  { href: '/#why', label: 'Why By the Whey', section: 'home' },
  { href: '/catalog/', label: 'Catalog', section: 'catalog' },
  { href: '/guidelines/', label: 'Community', section: 'community' },
  { href: '/manage/', label: 'Catalog Studio', section: 'studio' },
];

const FOOTER_NAVIGATION = [
  { href: '/catalog/', label: 'Catalog' },
  { href: '/manage/', label: 'Catalog Studio' },
  { href: '/privacy/', label: 'Privacy' },
  { href: '/terms/', label: 'Terms' },
  { href: '/guidelines/', label: 'Guidelines' },
  { href: '/support/', label: 'Support' },
  { href: '/delete-account/', label: 'Delete Account' },
];

function currentSection(pathname) {
  if (pathname.startsWith('/catalog/') || pathname.startsWith('/cheese/')) return 'catalog';
  if (pathname.startsWith('/guidelines/')) return 'community';
  if (pathname.startsWith('/manage/')) return 'studio';
  if (pathname === '/' || pathname === '/index.html') return 'home';
  return '';
}

function wordmark() {
  const link = document.createElement('a');
  link.className = 'wordmark';
  link.href = '/';
  link.setAttribute('aria-label', 'By the Whey home');
  link.innerHTML = `
    <img class="wordmark-mark" src="/assets/by-the-whey-character.png?v=20260819-art-r2" alt="">
    <span><strong>By the Whey</strong><small>Built by The Curd Nerd</small></span>
  `;
  return link;
}

function navigationLink({ href, label, section }, activeSection) {
  const link = document.createElement('a');
  link.href = href;
  link.textContent = label;
  if (section && section === activeSection) link.setAttribute('aria-current', 'page');
  return link;
}

function renderHeader() {
  let header = document.querySelector('.site-header');
  if (!header) {
    header = document.createElement('header');
    header.className = 'site-header';
    document.body.prepend(header);
  }

  // Catalog Studio owns this account control. Moving the existing element keeps
  // its authentication state and event listeners intact.
  const account = header.querySelector('[data-account]');
  account?.remove();

  const container = document.createElement('div');
  container.className = 'shell nav';
  container.append(wordmark());

  const toggle = document.createElement('button');
  toggle.className = 'menu-toggle';
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'site-navigation');
  toggle.textContent = 'Menu';
  container.append(toggle);

  const menu = document.createElement('nav');
  menu.className = 'nav-links';
  menu.id = 'site-navigation';
  menu.setAttribute('aria-label', 'Main navigation');
  const activeSection = currentSection(window.location.pathname);
  SITE_NAVIGATION.forEach((item) => menu.append(navigationLink(item, activeSection)));

  const beta = document.createElement('a');
  beta.className = 'nav-cta';
  beta.href = 'mailto:support@thecurdnerd.com?subject=Join%20the%20By%20the%20Whey%20beta';
  beta.textContent = 'Join the beta';
  menu.append(beta);
  if (account) menu.append(account);

  container.append(menu);
  header.replaceChildren(container);

  const closeMenu = () => {
    toggle.setAttribute('aria-expanded', 'false');
    menu.removeAttribute('data-open');
  };
  toggle.addEventListener('click', () => {
    const willOpen = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(willOpen));
    menu.toggleAttribute('data-open', willOpen);
  });
  menu.addEventListener('click', (event) => {
    if (event.target.closest('a')) closeMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMenu();
      toggle.focus();
    }
  });
  document.addEventListener('click', (event) => {
    if (!container.contains(event.target)) closeMenu();
  });
}

function renderFooter() {
  let footer = document.querySelector('.site-footer');
  if (!footer) {
    footer = document.createElement('footer');
    footer.className = 'site-footer';
    document.body.append(footer);
  }

  const shell = document.createElement('div');
  shell.className = 'shell';
  const grid = document.createElement('div');
  grid.className = 'footer-grid';
  grid.append(wordmark());

  const links = document.createElement('nav');
  links.className = 'footer-links';
  links.setAttribute('aria-label', 'Website, legal, and support links');
  FOOTER_NAVIGATION.forEach((item) => links.append(navigationLink(item, '')));
  grid.append(links);

  const copyright = document.createElement('p');
  copyright.className = 'copyright';
  copyright.textContent = `© ${new Date().getFullYear()} The Curd Nerd LLC. By the Whey is currently in beta.`;
  shell.append(grid, copyright);
  footer.replaceChildren(shell);
}

renderHeader();
renderFooter();
