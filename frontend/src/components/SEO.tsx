import { useEffect } from 'react';
import { ROBOTS_NOINDEX, SITE_URL } from '../../seo.config';

type SEOProps = {
  title: string;
  description: string;
  path: string;
  robots?: string;
};

function canonicalFor(path: string) {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

function setHeadAttribute(
  selector: string,
  createElement: () => HTMLMetaElement | HTMLLinkElement,
  attributeName: 'content' | 'href',
  value: string,
  records: Array<{
    element: HTMLMetaElement | HTMLLinkElement;
    attributeName: 'content' | 'href';
    previousValue: string | null;
    created: boolean;
  }>,
) {
  let element = document.head.querySelector(selector) as HTMLMetaElement | HTMLLinkElement | null;
  const created = !element;

  if (!element) {
    element = createElement();
    document.head.appendChild(element);
  }

  records.push({
    element,
    attributeName,
    previousValue: element.getAttribute(attributeName),
    created,
  });
  element.setAttribute(attributeName, value);
}

export function SEO({ title, description, path, robots }: SEOProps) {
  useEffect(() => {
    const previousTitle = document.title;
    const url = canonicalFor(path);
    const records: Array<{
      element: HTMLMetaElement | HTMLLinkElement;
      attributeName: 'content' | 'href';
      previousValue: string | null;
      created: boolean;
    }> = [];

    document.title = title;

    setHeadAttribute(
      'meta[name="description"]',
      () => {
        const meta = document.createElement('meta');
        meta.setAttribute('name', 'description');
        return meta;
      },
      'content',
      description,
      records,
    );

    setHeadAttribute(
      'link[rel="canonical"]',
      () => {
        const link = document.createElement('link');
        link.setAttribute('rel', 'canonical');
        return link;
      },
      'href',
      url,
      records,
    );

    setHeadAttribute(
      'meta[property="og:title"]',
      () => {
        const meta = document.createElement('meta');
        meta.setAttribute('property', 'og:title');
        return meta;
      },
      'content',
      title,
      records,
    );

    setHeadAttribute(
      'meta[property="og:description"]',
      () => {
        const meta = document.createElement('meta');
        meta.setAttribute('property', 'og:description');
        return meta;
      },
      'content',
      description,
      records,
    );

    setHeadAttribute(
      'meta[property="og:url"]',
      () => {
        const meta = document.createElement('meta');
        meta.setAttribute('property', 'og:url');
        return meta;
      },
      'content',
      url,
      records,
    );

    if (robots) {
      setHeadAttribute(
        'meta[name="robots"]',
        () => {
          const meta = document.createElement('meta');
          meta.setAttribute('name', 'robots');
          return meta;
        },
        'content',
        robots,
        records,
      );
    }

    return () => {
      document.title = previousTitle;

      records.reverse().forEach(({ element, attributeName, previousValue, created }) => {
        if (created) {
          element.remove();
          return;
        }

        if (previousValue === null) {
          element.removeAttribute(attributeName);
        } else {
          element.setAttribute(attributeName, previousValue);
        }
      });
    };
  }, [description, path, robots, title]);

  return null;
}

export function RobotsMeta({ content = ROBOTS_NOINDEX }: { content?: string }) {
  useEffect(() => {
    const records: Array<{
      element: HTMLMetaElement | HTMLLinkElement;
      attributeName: 'content' | 'href';
      previousValue: string | null;
      created: boolean;
    }> = [];

    setHeadAttribute(
      'meta[name="robots"]',
      () => {
        const meta = document.createElement('meta');
        meta.setAttribute('name', 'robots');
        return meta;
      },
      'content',
      content,
      records,
    );

    return () => {
      records.reverse().forEach(({ element, attributeName, previousValue, created }) => {
        if (created) {
          element.remove();
          return;
        }

        if (previousValue === null) {
          element.removeAttribute(attributeName);
        } else {
          element.setAttribute(attributeName, previousValue);
        }
      });
    };
  }, [content]);

  return null;
}
