// Static hosting cannot create a file for every newly approved cheese.
// Preserve incoming pretty links by opening the shared live detail page.
const cheesePath = window.location.pathname.match(/^\/cheese\/([^/]+)\/?$/);
if (cheesePath && cheesePath[1] !== 'index.html') {
  try {
    const slug = decodeURIComponent(cheesePath[1]);
    window.location.replace(`/cheese/?slug=${encodeURIComponent(slug)}`);
  } catch {
    // Malformed URLs retain the regular not-found page.
  }
}
