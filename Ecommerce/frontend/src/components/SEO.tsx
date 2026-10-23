import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export interface SEOProps {
  title?: string;
  description?: string;
  canonical?: string;
  image?: string;
  type?: 'website' | 'article' | 'product';
  noindex?: boolean;
  structuredData?: Record<string, unknown> | null;
}

const DEFAULT_TITLE = 'THANGAM STORES — Authentic Natural Healthcare & Herbal Remedies';
const DEFAULT_DESC = 'Shop authentic herbal and Ayurvedic formulations, pure extracts, vitality tonics, and natural health remedies at THANGAM STORES with in-store Click & Collect pickup.';
const DEFAULT_IMAGE = 'https://ecommerce-storefront-client.vercel.app/og-image.jpg';
const BASE_URL = 'https://ecommerce-storefront-client.vercel.app';

export function SEO({
  title,
  description,
  canonical,
  image,
  type = 'website',
  noindex = false,
  structuredData,
}: SEOProps) {
  const location = useLocation();

  useEffect(() => {
    // 1. Title
    const formattedTitle = title
      ? `${title} — THANGAM STORES`
      : DEFAULT_TITLE;
    document.title = formattedTitle;

    // Helper to get or create meta tag
    const setMetaTag = (attribute: 'name' | 'property', value: string, content: string) => {
      let tag = document.querySelector(`meta[${attribute}="${value}"]`) as HTMLMetaElement | null;
      if (!tag) {
        tag = document.createElement('meta');
        tag.setAttribute(attribute, value);
        document.head.appendChild(tag);
      }
      tag.setAttribute('content', content);
    };

    // Helper to set or create link tag
    const setLinkTag = (rel: string, href: string) => {
      let link = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement('link');
        link.setAttribute('rel', rel);
        document.head.appendChild(link);
      }
      link.setAttribute('href', href);
    };

    const activeDesc = description || DEFAULT_DESC;
    const activeImage = image || DEFAULT_IMAGE;
    const activeCanonical = canonical || `${BASE_URL}${location.pathname === '/' ? '' : location.pathname}`;

    // 2. Standard Meta
    setMetaTag('name', 'description', activeDesc);
    setLinkTag('canonical', activeCanonical);

    // 3. Robots
    setMetaTag('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow');

    // 4. Open Graph
    setMetaTag('property', 'og:title', formattedTitle);
    setMetaTag('property', 'og:description', activeDesc);
    setMetaTag('property', 'og:type', type);
    setMetaTag('property', 'og:url', activeCanonical);
    setMetaTag('property', 'og:image', activeImage);
    setMetaTag('property', 'og:site_name', 'THANGAM STORES');

    // 5. Twitter Card
    setMetaTag('name', 'twitter:card', 'summary_large_image');
    setMetaTag('name', 'twitter:title', formattedTitle);
    setMetaTag('name', 'twitter:description', activeDesc);
    setMetaTag('name', 'twitter:image', activeImage);

    // 6. Dynamic JSON-LD Structured Data
    const scriptId = 'dynamic-seo-jsonld';
    let scriptTag = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (structuredData) {
      if (!scriptTag) {
        scriptTag = document.createElement('script');
        scriptTag.id = scriptId;
        scriptTag.type = 'application/ld+json';
        document.head.appendChild(scriptTag);
      }
      scriptTag.textContent = JSON.stringify(structuredData);
    } else if (scriptTag) {
      scriptTag.remove();
    }

    return () => {
      // Cleanup dynamic JSON-LD on unmount
      const existing = document.getElementById(scriptId);
      if (existing) existing.remove();
    };
  }, [title, description, canonical, image, type, noindex, structuredData, location.pathname]);

  return null;
}
