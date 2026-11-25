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

const CSS = `
.o_main_navbar { display: none !important; }
#gv-home { position: fixed; inset: 0; z-index: 1040; overflow-y: auto; -webkit-overflow-scrolling: touch;
  background: #F6F7FB; color: #151826; font-family: -apple-system, system-ui, sans-serif;
  padding: 18px 16px 40px; opacity: 0; transform: translateY(8px); transition: opacity .18s ease, transform .18s ease; }
#gv-home.gv-visibile { opacity: 1; transform: none; }
#gv-home .gv-cerca { display: flex; align-items: center; gap: 8px; background: #FFFFFF; border: 1px solid #E1E4EE;
  border-radius: 14px; padding: 0 14px; margin-bottom: 18px; box-shadow: 0 1px 2px rgba(20,24,40,.04); }
#gv-home .gv-cerca input { flex: 1; border: 0; outline: 0; background: transparent; font-size: 17px; padding: 13px 0; color: inherit; }
#gv-home .gv-griglia { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px 8px; }
#gv-home .gv-app { display: flex; flex-direction: column; align-items: center; gap: 7px; background: none; border: 0;
  padding: 0; color: inherit; -webkit-tap-highlight-color: transparent; }
#gv-home .gv-app:active .gv-icona { transform: scale(.92); }
#gv-home .gv-icona { width: 62px; height: 62px; border-radius: 17px; display: flex; align-items: center; justify-content: center;
  background: #FFFFFF; box-shadow: 0 2px 6px rgba(20,24,40,.10), 0 0 0 1px rgba(20,24,40,.04); overflow: hidden; transition: transform .12s ease; }
#gv-home .gv-icona { padding: 9px; box-sizing: border-box; }
#gv-home .gv-icona img { width: 100%; height: 100%; object-fit: contain; border-radius: 9px; }
#gv-home .gv-icona i { font-size: 28px; }
#gv-home .gv-nome { font-size: 12px; line-height: 1.2; text-align: center; max-width: 78px; overflow: hidden;
  -webkit-hyphens: auto; hyphens: auto; overflow-wrap: anywhere;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
#gv-home .gv-vuoto { text-align: center; color: #8A90A3; margin-top: 40px; font-size: 15px; }
@media (prefers-color-scheme: dark) {
  /* Sfondo scuro con texture: grana fine, puntini leggeri e due aloni dei colori
     dell'app (viola in alto, verde in basso). Sta in ::before, fermo mentre la
     griglia scorre; niente immagini da scaricare. */
  #gv-home { background: #0A0C13; color: #F2F3F8; }
  #gv-home::before { content: ''; position: fixed; inset: 0; z-index: -1; pointer-events: none;
    background:
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)' opacity='.11'/%3E%3C/svg%3E"),
      radial-gradient(rgba(255,255,255,.06) 1px, transparent 1.4px),
      radial-gradient(110% 65% at 0% 0%, rgba(138,63,209,.42), transparent 62%),
      radial-gradient(70% 45% at 100% 8%, rgba(90,110,255,.14), transparent 60%),
      radial-gradient(95% 60% at 100% 100%, rgba(31,187,103,.20), transparent 65%),
      linear-gradient(180deg, #10131F 0%, #0A0C13 55%, #08090F 100%);
    background-size: 180px 180px, 22px 22px, auto, auto, auto, auto; }
  #gv-home .gv-cerca { background: rgba(255,255,255,.06); border-color: rgba(255,255,255,.10);
    -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); box-shadow: 0 8px 24px rgba(0,0,0,.25); }
  #gv-home .gv-icona { background: #FFFFFF; box-shadow: 0 6px 18px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.08); }
  #gv-home .gv-nome { color: #E7E9F2; }
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
  function nascondi() {
    var home = document.getElementById('gv-home');
    if (home) { home.classList.remove('gv-visibile'); setTimeout(function () { home.style.display = 'none'; }, 180); }
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
