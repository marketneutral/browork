export const APP_NAME = import.meta.env.VITE_APP_NAME || "#opentowork";

// Override favicon if VITE_FAVICON_URL is set
const faviconUrl = import.meta.env.VITE_FAVICON_URL;
if (faviconUrl) {
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (link) link.href = faviconUrl;
}
