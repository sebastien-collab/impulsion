/**
 * IMPULSION — Tech Stack Detection Definitions
 * Detection rules for CMS, frameworks, CDN, and tools.
 * Used by: content.js (DOM scan), injected.js (globals), service-worker.js (aggregation)
 */
(function(root) {
  'use strict';

  root.IMPULSION_TECHSTACK = {

    // ─── CMS / Platforms ─────────────────────────────────────
    cms: [
      {
        name: 'WordPress', color: '#21759B', icon: 'WP',
        detect: {
          meta: [{ name: 'generator', pattern: /WordPress/i }],
          scriptSrc: [/\/wp-content\//, /\/wp-includes\//],
          linkHref: [/\/wp-content\/themes\//, /\/wp-content\/plugins\//],
          htmlAttr: [{ selector: 'link[href*="wp-content"]' }],
          globals: []
        }
      },
      {
        name: 'Shopify', color: '#96BF48', icon: 'S',
        detect: {
          meta: [{ name: 'generator', pattern: /Shopify/i }],
          scriptSrc: [/cdn\.shopify\.com/],
          linkHref: [/cdn\.shopify\.com/],
          globals: ['Shopify']
        }
      },
      {
        name: 'Wix', color: '#0C6EFC', icon: 'Wix',
        detect: {
          meta: [{ name: 'generator', pattern: /Wix/i }],
          scriptSrc: [/static\.wixstatic\.com/, /parastorage\.com/],
          globals: ['wixBiSession']
        }
      },
      {
        name: 'Squarespace', color: '#121212', icon: 'Sq',
        detect: {
          meta: [{ name: 'generator', pattern: /Squarespace/i }],
          scriptSrc: [/squarespace\.com\/universal/, /static1\.squarespace\.com/],
          htmlAttr: [{ selector: '[data-squarespace-cacheversion]' }]
        }
      },
      {
        name: 'Webflow', color: '#4353FF', icon: 'Wf',
        detect: {
          meta: [{ name: 'generator', pattern: /Webflow/i }],
          scriptSrc: [/assets\.website-files\.com/, /webflow\.com/],
          htmlAttr: [{ selector: 'html[data-wf-site]' }]
        }
      },
      {
        name: 'PrestaShop', color: '#DF0067', icon: 'PS',
        detect: {
          meta: [{ name: 'generator', pattern: /PrestaShop/i }],
          scriptSrc: [/\/modules\/.*prestashop/i, /prestashop/i]
        }
      },
      {
        name: 'Magento', color: '#F26322', icon: 'Mg',
        detect: {
          scriptSrc: [/\/static\/frontend\/Magento/, /mage\/cookies/],
          htmlAttr: [{ selector: '[data-mage-init]' }]
        }
      }
    ],

    // ─── JS Frameworks ──────────────────────────────────────
    js_framework: [
      {
        name: 'React', color: '#61DAFB', icon: 'R',
        detect: {
          scriptSrc: [/unpkg\.com\/react/, /cdnjs\.cloudflare\.com\/.*react/],
          htmlAttr: [{ selector: '[data-reactroot]' }, { selector: '#__next' }],
          globals: ['React', '__REACT_DEVTOOLS_GLOBAL_HOOK__']
        }
      },
      {
        name: 'Next.js', color: '#000000', icon: 'Nx',
        detect: {
          scriptSrc: [/_next\/static/],
          htmlAttr: [{ selector: 'script#__NEXT_DATA__' }],
          globals: ['__NEXT_DATA__']
        }
      },
      {
        name: 'Vue.js', color: '#4FC08D', icon: 'V',
        detect: {
          scriptSrc: [/unpkg\.com\/vue/, /cdn\.jsdelivr\.net\/.*vue/, /vuejs\.org/],
          htmlAttr: [{ selector: '[data-v-]' }],
          globals: ['Vue', '__VUE__']
        }
      },
      {
        name: 'Nuxt', color: '#00DC82', icon: 'Nu',
        detect: {
          scriptSrc: [/_nuxt\//],
          htmlAttr: [{ selector: 'script#__NUXT_DATA__' }],
          globals: ['__NUXT__', '$nuxt']
        }
      },
      {
        name: 'Angular', color: '#DD0031', icon: 'Ng',
        detect: {
          scriptSrc: [/angular/],
          htmlAttr: [{ selector: '[ng-version]', attr: 'ng-version' }, { selector: '[ng-app]' }],
          globals: ['ng', 'getAllAngularRootElements']
        }
      },
      {
        name: 'Svelte', color: '#FF3E00', icon: 'Sv',
        detect: {
          htmlAttr: [{ selector: '[class*="svelte-"]' }]
        }
      },
      {
        name: 'Gatsby', color: '#663399', icon: 'Gy',
        detect: {
          scriptSrc: [/gatsby/],
          htmlAttr: [{ selector: '#___gatsby' }],
          globals: ['___gatsby']
        }
      },
      {
        name: 'jQuery', color: '#0769AD', icon: 'jQ',
        detect: {
          scriptSrc: [/jquery[\.\-]/, /code\.jquery\.com/],
          globals: ['jQuery']
        }
      }
    ],

    // ─── CSS Frameworks ─────────────────────────────────────
    css_framework: [
      {
        name: 'Tailwind CSS', color: '#06B6D4', icon: 'Tw',
        detect: {
          linkHref: [/tailwind/],
          scriptSrc: [/tailwindcss/]
        }
      },
      {
        name: 'Bootstrap', color: '#7952B3', icon: 'Bs',
        detect: {
          scriptSrc: [/bootstrap/],
          linkHref: [/bootstrap/]
        }
      },
      {
        name: 'Material UI', color: '#007FFF', icon: 'MU',
        detect: {
          htmlAttr: [{ selector: '[class*="MuiButton"]' }, { selector: '[class*="css-"][class*="Mui"]' }]
        }
      },
      {
        name: 'Bulma', color: '#00D1B2', icon: 'Bu',
        detect: {
          linkHref: [/bulma/]
        }
      }
    ],

    // ─── CDN / Infrastructure ───────────────────────────────
    cdn: [
      {
        name: 'Cloudflare', color: '#F38020', icon: 'CF',
        detect: {
          scriptSrc: [/cdnjs\.cloudflare\.com/],
          globals: ['__CF']
        }
      },
      {
        name: 'Vercel', color: '#000000', icon: 'Vc',
        detect: {
          scriptSrc: [/vercel/],
          htmlAttr: [{ selector: 'script#__NEXT_DATA__' }]
        }
      },
      {
        name: 'Netlify', color: '#00C7B7', icon: 'Nl',
        detect: {
          scriptSrc: [/netlify/],
          linkHref: [/netlify/]
        }
      },
      {
        name: 'AWS CloudFront', color: '#FF9900', icon: 'AWS',
        detect: {
          scriptSrc: [/cloudfront\.net/]
        }
      }
    ],

    // ─── Tools & Services ───────────────────────────────────
    tool: [
      {
        name: 'HubSpot', color: '#FF7A59', icon: 'HS',
        detect: {
          scriptSrc: [/js\.hs-scripts\.com/, /js\.hubspot\.com/, /js\.hscollectedforms\.net/],
          globals: ['_hsq', 'hubspot']
        }
      },
      {
        name: 'Intercom', color: '#6AFDEF', icon: 'Ic',
        detect: {
          scriptSrc: [/widget\.intercom\.io/],
          globals: ['Intercom']
        }
      },
      {
        name: 'Hotjar', color: '#FD3A5C', icon: 'Hj',
        detect: {
          scriptSrc: [/static\.hotjar\.com/],
          globals: ['hj', '_hjSettings']
        }
      },
      {
        name: 'reCAPTCHA', color: '#4285F4', icon: 'rC',
        detect: {
          scriptSrc: [/google\.com\/recaptcha/, /gstatic\.com\/recaptcha/]
        }
      },
      {
        name: 'Stripe', color: '#635BFF', icon: 'St',
        detect: {
          scriptSrc: [/js\.stripe\.com/],
          globals: ['Stripe']
        }
      },
      {
        name: 'Crisp', color: '#4B68FF', icon: 'Cr',
        detect: {
          scriptSrc: [/client\.crisp\.chat/],
          globals: ['$crisp', 'CRISP_WEBSITE_ID']
        }
      },
      {
        name: 'Drift', color: '#0176FF', icon: 'Dr',
        detect: {
          scriptSrc: [/js\.driftt\.com/, /drift\.com/],
          globals: ['drift', 'driftt']
        }
      },
      {
        name: 'Google Maps', color: '#34A853', icon: 'GM',
        detect: {
          scriptSrc: [/maps\.googleapis\.com/, /maps\.google\.com/]
        }
      },
      {
        name: 'Cookiebot', color: '#00A8E1', icon: 'Cb',
        detect: {
          scriptSrc: [/consent\.cookiebot\.com/],
          globals: ['Cookiebot']
        }
      },
      {
        name: 'OneTrust', color: '#1F6338', icon: 'OT',
        detect: {
          scriptSrc: [/cdn\.cookielaw\.org/, /onetrust\.com/],
          globals: ['OneTrust']
        }
      }
    ]
  };

})(typeof window !== 'undefined' ? window : self);
