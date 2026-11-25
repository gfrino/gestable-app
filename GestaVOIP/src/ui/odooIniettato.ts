/**
 * JavaScript che l'app mette dentro la pagina di Odoo.
 *
 * - PRIMA del caricamento: il softphone web di VOIP AI non deve collegarsi a
 *   Twilio dentro l'app (il telefono e' l'app: sarebbe un secondo telefono
 *   sullo stesso iPhone). I WebSocket verso twilio.com restano finti e muti:
 *   nessun errore a video, nessuna registrazione.
 * - DOPO: niente barra in alto di Odoo (le sue funzioni sono nel menu e nella
 *   barra dell'app) e la home: la griglia delle app di questo Odoo, presa dal
 *   menu di Odoo stesso, con icone e ricerca.
 *
 * Funziona su Odoo 17 e 19: usa il servizio menu del client web
 * (odoo.__WOWL_DEBUG__) e, se non c'e', i link classici /web#menu_id=.
 */

import { lingua, t } from '../i18n'
import { APP_NATIVE } from '../odoo/capacita'

export const PRIMA_DEL_CARICAMENTO = `
(function () {
  window.__GESTAVOIP__ = true;
  var Vero = window.WebSocket;
  if (!Vero || Vero.__gestavoip) { return; }
  function Muto() {
    this.readyState = 0; this.url = ''; this.protocol = ''; this.extensions = ''; this.bufferedAmount = 0;
    this.binaryType = 'blob';
  }
  Muto.prototype.send = function () {};
  Muto.prototype.close = function () { this.readyState = 3; };
  Muto.prototype.addEventListener = function () {};
  Muto.prototype.removeEventListener = function () {};
  Muto.prototype.dispatchEvent = function () { return false; };
  function Filtrato(url, protocolli) {
    if (/twilio\\.com/i.test(String(url))) { return new Muto(); }
    return protocolli === undefined ? new Vero(url) : new Vero(url, protocolli);
  }
  Filtrato.prototype = Vero.prototype;
  Filtrato.CONNECTING = 0; Filtrato.OPEN = 1; Filtrato.CLOSING = 2; Filtrato.CLOSED = 3;
  Filtrato.__gestavoip = true;
  window.WebSocket = Filtrato;
})();
true;
`

/**
 * Sfondo «Aurora» della griglia delle app, scuro e chiaro: lo stesso testo CSS
 * vale per la pagina (qui) e per la barra dell'app sopra
 * (experimental_backgroundImage in VistaOdoo), che cosi' continuano senza stacco.
 */
export const AURORA_CHIARA =
  'radial-gradient(80% 55% at 15% 10%, #E2D3F6 0%, transparent 70%), ' +
  'radial-gradient(75% 55% at 90% 95%, #CDEEDD 0%, transparent 70%), ' +
  'linear-gradient(180deg, #F6F3FC 0%, #EEF2F8 100%)'

export const AURORA =
  'radial-gradient(80% 55% at 15% 10%, #6A4BB0 0%, transparent 70%), ' +
  'radial-gradient(75% 55% at 90% 95%, #1F7A5C 0%, transparent 70%), ' +
  'linear-gradient(180deg, #2C3159 0%, #232846 100%)'

const CSS = `
.o_main_navbar { display: none !important; }
#gv-home { position: fixed; inset: 0; z-index: 1040; overflow-y: auto; -webkit-overflow-scrolling: touch;
  background: #EEF2F8; color: #151826; font-family: -apple-system, system-ui, sans-serif;
  padding: 18px 16px 40px; opacity: 0; transform: translateY(8px); transition: opacity .18s ease, transform .18s ease; }
#gv-home.gv-visibile { opacity: 1; transform: none; }
/* Il riquadro parte sopra la pagina quanto e' alta la barra dell'app (--gv-alto):
   la stessa sfumatura disegnata dall'app dietro la barra continua qui senza stacco. */
#gv-home::before { content: ''; position: fixed; left: 0; right: 0; bottom: 0;
  top: calc(-1 * var(--gv-alto, 0px)); z-index: -1; pointer-events: none;
  background: ${AURORA_CHIARA}; }
#gv-home .gv-cerca { display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,.72); border: 1px solid rgba(255,255,255,.95);
  -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px);
  border-radius: 14px; padding: 0 14px; margin-bottom: 18px; box-shadow: 0 6px 20px rgba(60,40,120,.08); }
#gv-home .gv-cerca input { flex: 1; border: 0; outline: 0; background: transparent; font-size: 17px; padding: 13px 0; color: inherit; }
#gv-home .gv-griglia { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px 8px; }
#gv-home .gv-app { display: flex; flex-direction: column; align-items: center; gap: 7px; background: none; border: 0;
  padding: 0; color: inherit; -webkit-tap-highlight-color: transparent; }
#gv-home .gv-app:active .gv-icona { transform: scale(.92); }
#gv-home .gv-icona { width: 62px; height: 62px; border-radius: 17px; display: flex; align-items: center; justify-content: center;
  background: #FFFFFF; box-shadow: 0 6px 16px rgba(60,40,120,.12), 0 0 0 1px rgba(20,24,40,.04); overflow: hidden; transition: transform .12s ease; }
#gv-home .gv-icona { padding: 9px; box-sizing: border-box; }
#gv-home .gv-icona img { width: 100%; height: 100%; object-fit: contain; border-radius: 9px; }
#gv-home .gv-icona i { font-size: 28px; }
#gv-home .gv-nome { font-size: 12px; line-height: 1.2; text-align: center; max-width: 78px; overflow: hidden;
  -webkit-hyphens: auto; hyphens: auto; overflow-wrap: anywhere;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
#gv-home .gv-vuoto { text-align: center; color: #8A90A3; margin-top: 40px; font-size: 15px; }
@media (prefers-color-scheme: dark) {
  /* Sfondo «Aurora»: blu notte non troppo scuro con un alone viola in alto e uno
     verde in basso (i colori dell'app). Sta in ::before, fermo mentre la griglia
     scorre; niente immagini da scaricare. */
  #gv-home { background: #232846; color: #F2F3F8; }
  #gv-home::before { background: ${AURORA}; }
  #gv-home .gv-cerca { background: rgba(255,255,255,.12); border-color: rgba(255,255,255,.18);
    -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); box-shadow: 0 8px 24px rgba(0,0,0,.18); }
  #gv-home .gv-cerca input::placeholder { color: rgba(255,255,255,.6); }
  #gv-home .gv-icona { background: #FFFFFF; box-shadow: 0 6px 16px rgba(0,0,0,.30), 0 0 0 1px rgba(255,255,255,.10); }
  #gv-home .gv-nome { color: #F2F3F8; }
  #gv-home .gv-vuoto { color: rgba(255,255,255,.7); }
}
`

/** I testi della home sono nella lingua dell'app al momento in cui si costruisce lo script. */
export function dopoIlCaricamento(): string {
  const testi = { lingua: lingua(), cerca: t('accesso.cercaApp'), vuoto: t('accesso.nessunaApp') }
  return `
(function () {
  var NATIVE = ${JSON.stringify(APP_NATIVE)};
  var TESTI = ${JSON.stringify(testi)};
  if (!document.getElementById('gv-stile')) {
    var st = document.createElement('style'); st.id = 'gv-stile'; st.textContent = ${JSON.stringify(CSS)};
    (document.head || document.documentElement).appendChild(st);
  }
  function servizioMenu() {
    try { return window.odoo.__WOWL_DEBUG__.root.env.services.menu; } catch (e) { return null; }
  }
  function icona(app) {
    var d = app.webIconData;
    if (d) {
      if (d.indexOf('data:') !== 0) {
        var tipo = app.webIconDataMimetype || (/^(PHN2|PD94)/.test(d) ? 'image/svg+xml' : 'image/png');
        d = 'data:' + tipo + ';base64,' + d;
      }
      return { img: d };
    }
    var p = (app.webIcon || '').split(',');
    if (p.length === 2) { return { img: '/' + p[0] + '/' + p[1] }; }
    if (p.length === 3) { return { fa: p[0], colore: p[1], sfondo: p[2] }; }
    return { fa: 'fa-cube', colore: '#7E3FC0', sfondo: '#F3EAFB' };
  }
  function apri(app) {
    nascondi();
    var svc = servizioMenu();
    if (svc && svc.selectMenu) {
      try { svc.selectMenu(app); return; } catch (e) {}
    }
    var u = new URL('/web#menu_id=' + app.id + (app.actionID ? '&action=' + app.actionID : ''), window.location.origin);
    if (u.pathname === window.location.pathname) { window.location.hash = u.hash; window.location.reload(); }
    else { window.location.href = u.href; }
  }
  function disegna(home, apps, filtro) {
    var griglia = home.querySelector('.gv-griglia');
    griglia.innerHTML = '';
    var f = (filtro || '').trim().toLowerCase();
    // Calendario, Contatti e Discuss hanno le loro schermate nell'app: fuori
    // dalla griglia, ma si trovano ancora cercandoli per nome.
    var scelte = apps.filter(function (a) {
      if (!f) { return NATIVE.indexOf(a.xmlid) === -1; }
      return String(a.name).toLowerCase().indexOf(f) !== -1;
    });
    home.querySelector('.gv-vuoto').style.display = scelte.length ? 'none' : 'block';
    scelte.forEach(function (app) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'gv-app';
      var box = document.createElement('div'); box.className = 'gv-icona';
      var ic = icona(app);
      if (ic.img) { var im = document.createElement('img'); im.src = ic.img; im.alt = ''; box.appendChild(im); }
      else { var i = document.createElement('i'); i.className = 'fa ' + ic.fa; i.style.color = ic.colore; box.style.background = ic.sfondo; box.appendChild(i); }
      var n = document.createElement('div'); n.className = 'gv-nome'; n.textContent = app.name;
      b.appendChild(box); b.appendChild(n);
      b.addEventListener('click', function () { apri(app); });
      griglia.appendChild(b);
    });
  }
  // Dice all'app se la griglia e' a vista (la barra sopra prende lo stesso sfondo).
  function avvisa(visibile) {
    try { window.ReactNativeWebView.postMessage(visibile ? 'gv-home:1' : 'gv-home:0'); } catch (e) {}
  }
  function nascondi() {
    var home = document.getElementById('gv-home');
    if (home) { home.classList.remove('gv-visibile'); setTimeout(function () { home.style.display = 'none'; }, 180); }
    avvisa(false);
  }
  function mostra(tentativo) {
    var svc = servizioMenu();
    var apps = svc && svc.getApps ? svc.getApps() : null;
    if (!apps || !apps.length) {
      if ((tentativo || 0) < 40) { setTimeout(function () { mostra((tentativo || 0) + 1); }, 250); }
      return;
    }
    var home = document.getElementById('gv-home');
    if (!home) {
      home = document.createElement('div'); home.id = 'gv-home';
      home.innerHTML = '<div class="gv-cerca"><i class="fa fa-search" style="opacity:.45"></i>' +
        '<input type="search" autocomplete="off" enterkeyhint="search"></div>' +
        '<div class="gv-griglia"></div><div class="gv-vuoto" style="display:none"></div>';
      document.body.appendChild(home);
      home.querySelector('input').addEventListener('input', function (ev) { disegna(home, servizioMenu().getApps(), ev.target.value); });
    }
    // Testi nella lingua dell'app (vedi dopoIlCaricamento).
    home.lang = TESTI.lingua;
    home.querySelector('.gv-vuoto').textContent = TESTI.vuoto;
    var campo = home.querySelector('input'); campo.value = ''; campo.placeholder = TESTI.cerca;
    disegna(home, apps, '');
    home.style.display = 'block';
    home.scrollTop = 0;
    requestAnimationFrame(function () { home.classList.add('gv-visibile'); });
    avvisa(true);
  }
  window.__gvHome = mostra;
  window.__gvNascondiHome = nascondi;
  window.__gvPannello = function () {
    nascondi();
    var t = document.querySelector('.o_mobile_menu_toggle');
    if (t) { t.click(); }
  };
})();
true;
`
}

/** Comandi per la pagina, da passare a injectJavaScript. */
export const MOSTRA_HOME = 'window.__gvHome && window.__gvHome(); true;'
export const APRI_PANNELLO = 'window.__gvPannello && window.__gvPannello(); true;'

export function vaiA(percorso: string): string {
  // Stesso percorso e hash diverso (/web#...): il client di Odoo non ricarica da
  // solo, quindi si ricarica la pagina; percorso diverso: basta navigare.
  return `(function () {
    window.__gvNascondiHome && window.__gvNascondiHome();
    var u = new URL(${JSON.stringify(percorso)}, window.location.origin);
    if (u.pathname === window.location.pathname) { window.location.hash = u.hash; window.location.reload(); }
    else { window.location.href = u.href; }
  })(); true;`
}
