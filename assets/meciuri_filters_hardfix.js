// BetAnalytics Pro - hardfix filtre Meciuri
// Loaded after the app. It restores filter interaction even if the native renderer misses change events.
(function(){
  'use strict';
  if(window.__baMeciuriFiltersHardfixV1) return;
  window.__baMeciuriFiltersHardfixV1 = true;

  var scheduled = 0;
  var renderBusy = false;
  var lastSig = '';
  var CARD_SELECTOR = '.mx21-match-card,.match-card,.match-card-pro,.match-item,.card[data-match-id],.card.match,.matches-grid > .card,#matches-container > .card,#matches-grid > article,#matches-container > article';
  var ROOT_SELECTOR = '#tab-meciuri,#meciuri,#matches-screen,#matches-section,.matches-section,.meciuri-section,main,body';

  function byId(id){ return document.getElementById(id); }
  function clean(s){ return String(s == null ? '' : s).replace(/\s+/g,' ').trim(); }
  function lower(s){ return clean(s).toLowerCase(); }
  function norm(s){ return lower(s).normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
  function isAll(v){ v = norm(v); return !v || v === 'all' || v === 'toate' || v === 'oricand' || v === 'orice' || v === 'verdict' || v === 'ora'; }
  function val(id){ var el = byId(id); return el ? clean(el.value || el.getAttribute('data-value') || '') : ''; }
  function num(id){ var n = parseFloat(String(val(id)).replace(',', '.')); return isFinite(n) ? n : 0; }
  function selectedText(id){ var el = byId(id); if(!el) return ''; if(el.selectedIndex >= 0 && el.options && el.options[el.selectedIndex]) return clean(el.options[el.selectedIndex].textContent); return clean(el.textContent); }
  function root(){ return document.querySelector('#tab-meciuri') || document.querySelector(ROOT_SELECTOR) || document.body; }
  function getCards(){
    var r = root();
    var cards = Array.prototype.slice.call(r.querySelectorAll(CARD_SELECTOR));
    if(!cards.length){
      cards = Array.prototype.slice.call(r.querySelectorAll('article,.card')).filter(function(c){
        var t = norm(c.textContent || '');
        return /\bvs\b|\bmeci\b|\bprob\b|\bcota\b|over|under|btts|pauza|final/.test(t) && t.length > 60;
      });
    }
    return cards.filter(function(c){ return !c.closest('.filter-panel,.mx21-filter-panel,.filters,.tabs,.bottom-nav,.header,.modal,.overlay'); });
  }
  function controls(){
    var ids = ['match-league-filter','match-date-filter','match-market-filter','match-pro-mode','match-pro-filter','match-pro-confidence-filter','match-verdict-filter','match-time-sort','match-sort-filter','match-kickoff-filter','match-league-confidence-filter','match-min-prob','match-min-edge','match-min-smart'];
    return ids.map(byId).filter(Boolean);
  }
  function ensureOptions(){
    var m = byId('match-market-filter');
    if(m && !Array.prototype.some.call(m.options || [], function(o){ return o.value === 'Over 2.5G' || /2\.5/.test(o.textContent || ''); })){
      var o = document.createElement('option'); o.value = 'Over 2.5G'; o.textContent = 'Over 2.5G'; m.appendChild(o);
    }
  }
  function normalizeValues(){
    [['match-date-filter', {'':'all','toate':'all','24h':'1','48h':'2','7d':'7'}], ['match-kickoff-filter', {'':'all','oricand':'all'}], ['match-verdict-filter', {'':'all','verdict':'all','toate':'all','pariaza':'bet','risc':'risk','evita':'avoid'}], ['match-pro-mode', {'':'all','toate':'all'}], ['match-pro-filter', {'':'all','toate':'all'}], ['match-league-confidence-filter', {'':'all','toate':'all'}]].forEach(function(pair){
      var el = byId(pair[0]); if(!el) return; var v = String(el.value || '').toLowerCase(); if(pair[1].hasOwnProperty(v)) el.value = pair[1][v]; if(/h$/.test(el.value)) el.value = el.value.replace(/h$/, '');
    });
  }
  function readState(){
    normalizeValues();
    return {
      league: val('match-league-filter'), leagueText: selectedText('match-league-filter'),
      period: val('match-date-filter'), market: val('match-market-filter'), marketText: selectedText('match-market-filter'),
      pro: val('match-pro-mode') || val('match-pro-filter'), proText: selectedText('match-pro-mode') || selectedText('match-pro-filter'),
      verdict: val('match-verdict-filter'), verdictText: selectedText('match-verdict-filter'),
      kickoff: val('match-kickoff-filter'), leagueConf: val('match-league-confidence-filter'), leagueConfText: selectedText('match-league-confidence-filter'),
      minProb: num('match-min-prob'), minEdge: num('match-min-edge'), minSmart: num('match-min-smart'),
      sort: val('match-time-sort') || val('match-sort-filter')
    };
  }
  function stateSig(s){ return JSON.stringify(s); }
  function txt(card){ return norm(card.getAttribute('data-filter-text') || card.textContent || ''); }
  function attr(card,n){ return norm(card.getAttribute('data-'+n) || card.dataset && card.dataset[n] || ''); }
  function matchLeague(card,s,t){ if(isAll(s.league)) return true; var needle = norm(s.leagueText || s.league); if(!needle || needle === 'toate ligile') return true; return t.indexOf(needle) >= 0 || attr(card,'league').indexOf(needle) >= 0; }
  function canonicalMarket(s){ var m = norm(s.marketText || s.market); if(isAll(m) || m === 'toate pietele') return ''; if(/1\.5/.test(m)) return '1.5'; if(/2\.5/.test(m)) return '2.5'; if(/3\.5/.test(m)) return '3.5'; if(/btts|ambele/.test(m)) return 'btts'; if(/1x|x2|12|dnb|pauza|final|cornere|carton/.test(m)) return m; if(/over|peste/.test(m)) return 'over'; if(/under|sub/.test(m)) return 'under'; return m; }
  function matchMarket(card,s,t){ var m = canonicalMarket(s); if(!m) return true; var c = t + ' ' + attr(card,'market') + ' ' + attr(card,'markets'); if(m === 'btts') return /btts|ambele/.test(c); if(m === '1.5') return /1\.5|peste 1 5|over 1 5|over 1\.5|peste 1\.5/.test(c); if(m === '2.5') return /2\.5|peste 2 5|over 2 5|over 2\.5|peste 2\.5/.test(c); if(m === '3.5') return /3\.5|sub 3 5|under 3 5|under 3\.5|sub 3\.5/.test(c); return c.indexOf(m) >= 0; }
  function matchPro(card,s,t){ if(isAll(s.pro)) return true; var p = norm(s.proText || s.pro); if(!p || p === 'toate') return true; if(/value/.test(p)) return /value|edge|ev\+|\+\d/.test(t); if(/safe|sigur/.test(p)) return /safe|sigur|low risk|verde|strong/.test(t); if(/top|elite|strong/.test(p)) return /top|elite|strong|premium|gold/.test(t); return t.indexOf(p) >= 0; }
  function matchVerdict(card,s,t){ if(isAll(s.verdict)) return true; var v = norm(s.verdictText || s.verdict); if(!v) return true; if(/bet|pariaza|joaca/.test(v)) return /bet|pariaza|joaca|value|safe|strong|elite/.test(t); if(/risk|risc/.test(v)) return /risk|risc|atentie|medium/.test(t); if(/avoid|evita/.test(v)) return /avoid|evita|no bet/.test(t); return t.indexOf(v) >= 0; }
  function matchLeagueConf(card,s,t){ if(isAll(s.leagueConf)) return true; var v = norm(s.leagueConfText || s.leagueConf); if(!v || v === 'toate') return true; if(v === 's' || /foarte/.test(v)) return /liga confidence\s*s|\bs\b|foarte/.test(t); if(v === 'a') return /liga confidence\s*a|\ba\b/.test(t); if(v === 'b') return /liga confidence\s*b|\bb\b/.test(t); return t.indexOf(v) >= 0; }
  function numbers(t){ var out = []; var re = /(\d+(?:[\.,]\d+)?)\s*%/g, m; while((m = re.exec(t))) out.push(parseFloat(m[1].replace(',', '.'))); return out; }
  function matchMinProb(card,s,t){ if(!s.minProb) return true; var ds = parseFloat(card.dataset && (card.dataset.prob || card.dataset.probability) || ''); if(isFinite(ds)) return ds >= s.minProb; var ns = numbers(t); return !ns.length || Math.max.apply(null, ns) >= s.minProb; }
  function matchMinEdge(card,s,t){ if(!s.minEdge) return true; var ds = parseFloat(card.dataset && card.dataset.edge || ''); if(isFinite(ds)) return ds >= s.minEdge; var m = t.match(/edge[^0-9+\-]*(\+?\-?\d+(?:[\.,]\d+)?)/); if(m) return parseFloat(m[1].replace(',', '.')) >= s.minEdge; return true; }
  function matchMinSmart(card,s,t){ if(!s.minSmart) return true; var ds = parseFloat(card.dataset && (card.dataset.smart || card.dataset.smartScore) || ''); if(isFinite(ds)) return ds >= s.minSmart; var m = t.match(/smart[^0-9]*(\d+(?:[\.,]\d+)?)/); if(m) return parseFloat(m[1].replace(',', '.')) >= s.minSmart; return true; }
  function matchKickoff(card,s,t){ if(isAll(s.kickoff)) return true; var h = parseFloat(String(s.kickoff).replace(',', '.')); if(!isFinite(h) || h <= 0) return true; var iso = card.getAttribute('data-start') || card.getAttribute('data-date') || card.dataset && (card.dataset.start || card.dataset.date || card.dataset.kickoff) || '';
    var dt = iso ? new Date(iso) : null;
    if(dt && isFinite(dt.getTime())) return dt.getTime() <= Date.now() + h*3600000;
    return true;
  }
  function periodOk(card,s,t){ if(isAll(s.period)) return true; var p = String(s.period || '').toLowerCase(); var days = parseFloat(p); if(!isFinite(days) || days <= 0) return true; var iso = card.getAttribute('data-start') || card.getAttribute('data-date') || card.dataset && (card.dataset.start || card.dataset.date) || '';
    var dt = iso ? new Date(iso) : null; if(dt && isFinite(dt.getTime())) return dt.getTime() <= Date.now() + days*86400000;
    if(days <= 1) return /azi|today/.test(t) || !/maine|poimaine|tomorrow/.test(t);
    return true;
  }
  function show(card,yes){
    if(yes){ card.classList.remove('ba-filter-hidden'); card.style.removeProperty('display'); card.removeAttribute('aria-hidden'); }
    else { card.classList.add('ba-filter-hidden'); card.style.setProperty('display','none','important'); card.setAttribute('aria-hidden','true'); }
  }
  function updateCounters(visible,total){
    ['matches-count','meciuri-count','mx21-count','match-count','filtered-count'].forEach(function(id){ var el=byId(id); if(el) el.textContent = String(visible); });
    var badge = document.querySelector('[data-ba-filter-count]') || byId('ba-filter-count-badge');
    if(!badge){
      var panel = document.querySelector('#tab-meciuri .mx21-filters,#tab-meciuri .filter-panel,#tab-meciuri .filters');
      if(panel){ badge = document.createElement('div'); badge.id='ba-filter-count-badge'; badge.setAttribute('data-ba-filter-count',''); badge.style.cssText='font:700 11px JetBrains Mono,monospace;color:#2BE5C5;margin:6px 2px;'; panel.appendChild(badge); }
    }
    if(badge) badge.textContent = visible + ' / ' + total + ' meciuri afișate';
  }
  function applyDomFilters(){
    var s = readState();
    var cards = getCards();
    var visible = 0;
    cards.forEach(function(card){
      var t = txt(card);
      var ok = matchLeague(card,s,t) && periodOk(card,s,t) && matchMarket(card,s,t) && matchPro(card,s,t) && matchVerdict(card,s,t) && matchLeagueConf(card,s,t) && matchMinProb(card,s,t) && matchMinEdge(card,s,t) && matchMinSmart(card,s,t) && matchKickoff(card,s,t);
      show(card,ok); if(ok) visible++;
    });
    if(cards.length) updateCounters(visible,cards.length);
    lastSig = stateSig(s);
  }
  function callNativeRender(){
    if(renderBusy) return;
    if(typeof window.renderMatches !== 'function') return;
    renderBusy = true;
    try{ window.renderMatches(); }catch(e){ try{ console.warn('[BA filters hardfix] renderMatches failed', e); }catch(_){} }
    setTimeout(function(){ renderBusy = false; applyDomFilters(); }, 90);
  }
  function schedule(forceNative){
    if(scheduled) clearTimeout(scheduled);
    scheduled = setTimeout(function(){
      scheduled = 0; ensureOptions(); normalizeValues();
      var sig = stateSig(readState());
      if(forceNative || sig !== lastSig) callNativeRender();
      setTimeout(applyDomFilters, 120);
      setTimeout(applyDomFilters, 400);
    }, 40);
  }
  function resetFilters(){
    controls().forEach(function(el){
      if(el.tagName === 'SELECT') el.value = 'all';
      else if(/min/i.test(el.id || '')) el.value = '0';
      else if(el.type === 'checkbox' || el.type === 'radio') el.checked = false;
    });
    schedule(true);
  }
  function install(){
    ensureOptions(); normalizeValues();
    var css = document.getElementById('ba-meciuri-hardfix-css');
    if(!css){ css = document.createElement('style'); css.id = 'ba-meciuri-hardfix-css'; css.textContent = '#tab-meciuri select,#tab-meciuri input,#tab-meciuri button{pointer-events:auto!important;touch-action:manipulation!important}.ba-filter-hidden{display:none!important}'; document.head.appendChild(css); }
    document.addEventListener('change', function(ev){ if(ev.target && (ev.target.closest && ev.target.closest('#tab-meciuri,.meciuri-section,.matches-section'))) schedule(true); }, true);
    document.addEventListener('input', function(ev){ if(ev.target && (ev.target.closest && ev.target.closest('#tab-meciuri,.meciuri-section,.matches-section'))) schedule(false); }, true);
    document.addEventListener('click', function(ev){
      var hit = ev.target && ev.target.closest && ev.target.closest('.mx21-chip,.mx21-mode-btn,.mx21-filter-btn,.filter-btn,.ba-market-chip,[data-filter],[data-value],button');
      if(hit && (hit.closest('#tab-meciuri,.meciuri-section,.matches-section') || /reset|sterge|curata|toate/i.test(hit.textContent || ''))) setTimeout(function(){ schedule(true); }, 80);
      if(hit && /reset|sterge|curata/i.test(hit.textContent || '')) setTimeout(resetFilters, 20);
    }, true);
    window.BA_FIX_MECIURI_FILTERS = function(){ schedule(true); return 'BA filters hardfix: refresh requested'; };
    schedule(false);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
  [300,800,1600,3000,6000,10000].forEach(function(t){ setTimeout(function(){ install(); schedule(false); }, t); });
})();
