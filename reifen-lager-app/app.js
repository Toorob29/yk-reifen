/**
 * YK Reifen & Felgen Pro – Hauptanwendungslogik
 * Steuert Lagerbestand, Smart-Parser, Angebotserstellung (inkl. Montage, Entsorgung, Einlagerung),
 * Kundenstammdaten, Firmendaten (mit YK-Logo), Etikettendruck & DIN-A4-Angebotsdruck.
 */

class YKReifenApp {
  constructor() {
    this.inventory = [];
    this.quotes = [];
    this.customers = [];
    this.services = [];
    this.history = [];
    this.company = { ...window.DEFAULT_COMPANY_SETTINGS };

    // Aktive Filter
    this.activeTab = 'inventory';
    this.catFilter = 'all';
    this.searchQuery = '';
    this.quoteStatusFilter = 'all';

    // Formular-Zwischenspeicher
    this.currentFormCategory = 'tire';
    this.currentItemFlags = [];
    this.currentItemPhotos = [];
    this.currentQuoteItems = [];
    this.currentCustomerVehicles = [];
  }

  async init() {
    window.onYKAutoSave = () => {
      const badge = document.getElementById('autoSaveBadge');
      if (badge) {
        const timeStr = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        badge.textContent = `✓ Automatisch gespeichert (${timeStr})`;
      }
    };
    await window.YKDB.init();
    await this.reloadAllData();
    this.populateBrandDatalists();
    this.applyCompanyBranding();
    this.renderAll();

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  async reloadAllData() {
    const [inv, quo, cust, srv, hist, comp] = await Promise.all([
      window.YKDB.getAll('inventory'),
      window.YKDB.getAll('quotes'),
      window.YKDB.getAll('customers'),
      window.YKDB.getAll('services'),
      window.YKDB.getAll('history'),
      window.YKDB.get('settings', 'company')
    ]);
    this.inventory = inv;
    this.quotes = quo.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    this.customers = cust.sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));
    this.services = srv;
    this.history = hist.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
    if (comp) {
      this.company = { ...window.DEFAULT_COMPANY_SETTINGS, ...comp };
    }
  }

  populateBrandDatalists() {
    const tList = document.getElementById('tireBrandsList');
    if (tList) {
      tList.innerHTML = window.YKParser.COMMON_TIRE_BRANDS.map(b => `<option value="${b}"></option>`).join('');
    }
    const rList = document.getElementById('rimBrandsList');
    if (rList) {
      rList.innerHTML = window.YKParser.COMMON_RIM_BRANDS.map(b => `<option value="${b}"></option>`).join('');
    }
  }

  getDefaultLogo() {
    return window.YK_EMBEDDED_LOGO || 'assets/logo.jpg';
  }

  applyCompanyBranding() {
    const theme = this.company.accentTheme || 'orange';
    document.documentElement.setAttribute('data-accent', theme);

    const rawLogo = this.company.logoDataUrl;
    const logoUrl = (!rawLogo || rawLogo === 'assets/logo.jpg') ? this.getDefaultLogo() : rawLogo;
    const headerLogo = document.getElementById('headerLogoImg');
    if (headerLogo) headerLogo.src = logoUrl;
    const settingsLogo = document.getElementById('settingsLogoPreview');
    if (settingsLogo) settingsLogo.src = logoUrl;

    const headerName = document.getElementById('headerCompanyName');
    if (headerName) {
      headerName.textContent = this.company.companyName || 'YK Reifen & Felgen';
    }
  }

  async setAccentTheme(theme) {
    this.company.accentTheme = theme;
    document.documentElement.setAttribute('data-accent', theme);
    await window.YKDB.put('settings', this.company);
    const names = { orange: 'Sportliches Orange (#FF6B00)', gold: 'YK Metallic-Gold (#D4AF37)', yellow: 'Performance-Gelb (#FFB800)' };
    this.showToast(`Design-Akzent gewechselt: ${names[theme] || theme}`);
  }

  switchTab(tabName) {
    this.activeTab = tabName;
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
    const targetSec = document.getElementById(`view-${tabName}`);
    if (targetSec) targetSec.classList.add('active');

    document.querySelectorAll('.nav-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    if (tabName === 'locations') this.renderLocationsAndStats();
    if (tabName === 'settings') this.renderSettings();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  renderAll() {
    this.populateSubfilters();
    this.renderInventory();
    this.renderQuotes();
    this.renderCustomers();
    this.renderLocationsAndStats();
    this.renderSettings();
  }

  /* ==========================================================================
     TAB 1: LAGERBESTAND (SUCHE, FILTER, KARTEN)
     ========================================================================== */

  populateSubfilters() {
    const diameters = new Set();
    const pcds = new Set();
    const halls = new Set();

    this.inventory.forEach(item => {
      const d = item.tireDiameter || item.rimDiameter;
      if (d) diameters.add(String(d));
      if (item.rimPcd) pcds.add(item.rimPcd);
      if (item.locHall) halls.add(item.locHall);
    });

    const diaSel = document.getElementById('filterDiameter');
    if (diaSel) {
      const prev = diaSel.value;
      const sorted = Array.from(diameters).sort((a, b) => parseFloat(a) - parseFloat(b));
      diaSel.innerHTML = `<option value="all">Zollgröße: Alle</option>` +
        sorted.map(d => `<option value="${d}">${d} Zoll</option>`).join('');
      if (sorted.includes(prev)) diaSel.value = prev;
    }

    const pcdSel = document.getElementById('filterPcd');
    if (pcdSel) {
      const prev = pcdSel.value;
      const sorted = Array.from(pcds).sort();
      pcdSel.innerHTML = `<option value="all">Lochkreis: Alle</option>` +
        sorted.map(p => `<option value="${p}">LK ${p}</option>`).join('');
      if (sorted.includes(prev)) pcdSel.value = prev;
    }

    const hallSel = document.getElementById('filterHall');
    if (hallSel) {
      const prev = hallSel.value;
      const sorted = Array.from(halls).sort();
      hallSel.innerHTML = `<option value="all">Lagerort: Alle</option>` +
        sorted.map(h => `<option value="${h}">${h}</option>`).join('');
      if (sorted.includes(prev)) hallSel.value = prev;
    }
  }

  onSearchInput(val) {
    this.searchQuery = val.trim();
    const clearBtn = document.getElementById('searchClearBtn');
    if (clearBtn) clearBtn.style.display = this.searchQuery ? 'block' : 'none';
    this.renderInventory();
  }

  clearSearch() {
    const inp = document.getElementById('invSearchInput');
    if (inp) inp.value = '';
    this.onSearchInput('');
  }

  setCategoryFilter(cat) {
    this.catFilter = cat;
    document.querySelectorAll('#categoryFilterRow .chip').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.cat === cat);
    });
    this.renderInventory();
  }

  toggleWarnFilter() {
    const sel = document.getElementById('filterWarning');
    if (!sel) return;
    sel.value = sel.value === 'any_warn' ? 'all' : 'any_warn';
    this.renderInventory();
  }

  getItemWarnings(item) {
    const warnings = [];
    const tread = window.YKParser.analyzeTread(item);
    const dot = window.YKParser.analyzeDOT(item.dot);
    const qty = Number(item.quantity) || 0;
    const min = Number(item.minStock) || 0;

    if (tread.hasValue && tread.min < 4.0) {
      warnings.push({ type: 'low_tread', text: `Profil ${tread.label}`, level: tread.status });
    }
    if (dot.valid && dot.ageYears >= 6) {
      warnings.push({ type: 'old_dot', text: dot.shortLabel, level: dot.status });
    }
    if (min > 0 && qty < min) {
      warnings.push({ type: 'low_stock', text: `Bestand ${qty}/${min}`, level: 'danger' });
    }
    return warnings;
  }

  renderInventory() {
    // KPIs aktualisieren
    let totalPieces = 0;
    let tirePosts = 0;
    let rimWheelPosts = 0;
    let warnPosts = 0;

    this.inventory.forEach(item => {
      totalPieces += Number(item.quantity) || 0;
      if (item.category === 'tire') tirePosts++;
      if (item.category === 'rim' || item.category === 'wheel') rimWheelPosts++;
      if (this.getItemWarnings(item).length > 0) warnPosts++;
    });

    document.getElementById('kpiTotalQty').textContent = `${totalPieces} Stk.`;
    document.getElementById('kpiTireCount').textContent = tirePosts;
    document.getElementById('kpiRimWheelCount').textContent = rimWheelPosts;
    document.getElementById('kpiWarnCount').textContent = warnPosts;

    // Filter anwenden
    const seasonFilter = document.getElementById('filterSeason')?.value || 'all';
    const diaFilter = document.getElementById('filterDiameter')?.value || 'all';
    const pcdFilter = document.getElementById('filterPcd')?.value || 'all';
    const hallFilter = document.getElementById('filterHall')?.value || 'all';
    const warnFilter = document.getElementById('filterWarning')?.value || 'all';
    const sortOrder = document.getElementById('sortOrder')?.value || 'updated_desc';

    const queryTokens = this.searchQuery
      .toLowerCase()
      .replace(/[\/\-]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);

    const filtered = this.inventory.filter(item => {
      if (this.catFilter !== 'all' && item.category !== this.catFilter) return false;
      if (seasonFilter !== 'all' && item.season !== seasonFilter) return false;
      if (diaFilter !== 'all') {
        const itemDia = String(item.tireDiameter || item.rimDiameter || '');
        if (itemDia !== diaFilter) return false;
      }
      if (pcdFilter !== 'all' && item.rimPcd !== pcdFilter) return false;
      if (hallFilter !== 'all' && item.locHall !== hallFilter) return false;

      if (warnFilter !== 'all') {
        const warns = this.getItemWarnings(item);
        if (warnFilter === 'any_warn' && warns.length === 0) return false;
        if (warnFilter !== 'any_warn' && !warns.some(w => w.type === warnFilter)) return false;
      }

      if (queryTokens.length > 0) {
        const searchIndex = window.YKParser.buildSearchIndex(item);
        const matchesAll = queryTokens.every(tok => searchIndex.includes(tok));
        if (!matchesAll) return false;
      }
      return true;
    });

    // Sortieren
    filtered.sort((a, b) => {
      if (sortOrder === 'size_asc') {
        return (Number(a.tireWidth || a.rimWidth) || 0) - (Number(b.tireWidth || b.rimWidth) || 0);
      }
      if (sortOrder === 'inch_asc') {
        return (Number(a.tireDiameter || a.rimDiameter) || 0) - (Number(b.tireDiameter || b.rimDiameter) || 0);
      }
      if (sortOrder === 'qty_desc') {
        return (Number(b.quantity) || 0) - (Number(a.quantity) || 0);
      }
      if (sortOrder === 'price_asc') {
        return (Number(a.priceSale) || 0) - (Number(b.priceSale) || 0);
      }
      return (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '');
    });

    const grid = document.getElementById('inventoryGrid');
    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="form-section" style="grid-column: 1 / -1; text-align: center; padding: 36px 20px;">
          <div style="font-size: 2rem; margin-bottom: 8px;">🔍</div>
          <div style="font-weight: 800; font-size: 1.05rem; margin-bottom: 6px;">Keine passenden Reifen oder Felgen gefunden</div>
          <div style="color: var(--text-secondary); font-size: 0.86rem; margin-bottom: 14px;">
            Passe deine Suchbegriffe oder Filter an oder lege einen neuen Lagerartikel an.
          </div>
          <button class="btn btn-primary" onclick="app.openItemModal()">+ Neuen Artikel anlegen</button>
        </div>
      `;
      return;
    }

    grid.innerHTML = filtered.map(item => this.renderInventoryCardHTML(item)).join('');
  }

  renderInventoryCardHTML(item) {
    const catMeta = {
      tire: { label: 'Reifen', icon: '#icon-tire' },
      rim: { label: item.rimType === 'steel' ? 'Stahlfelge' : (item.rimType === 'forged' ? 'Schmiedefelge' : 'Alufelge'), icon: '#icon-rim' },
      wheel: { label: 'Komplettrad', icon: '#icon-wheel' },
      accessory: { label: 'Zubehör', icon: '#icon-wrench-gear' }
    }[item.category] || { label: 'Artikel', icon: '#icon-tire' };

    const seasonMap = {
      summer: { text: '☀️ Sommer', cls: 'summer' },
      winter: { text: '❄️ Winter', cls: 'winter' },
      allseason: { text: '🌦️ Allwetter', cls: 'allseason' },
      semislick: { text: '🏁 Semi-Slick', cls: 'summer' },
      offroad: { text: '⛰️ Offroad', cls: 'allseason' }
    };
    const showSeason = (item.category === 'tire' || item.category === 'wheel') && item.season && seasonMap[item.season];

    const headline = window.YKParser.getPrimaryHeadline(item);
    const brandTitle = item.category === 'rim'
      ? `${item.rimBrand || ''} ${item.rimModel || ''}`.trim()
      : `${item.brand || ''} ${item.model || ''}`.trim();

    const dotInfo = window.YKParser.analyzeDOT(item.dot);
    const treadInfo = window.YKParser.analyzeTread(item);
    const locBadge = window.YKParser.formatLocationBadge(item);

    const loadKg = window.YKParser.getLoadIndexInfo(item.loadIndex);
    const speedKmh = window.YKParser.getSpeedIndexInfo(item.speedIndex);

    // Zusatz-Spezifikationszeile (z.B. Felgendaten beim Komplettrad oder Traglast/Speed-Details)
    const subSpecs = [];
    if (item.category === 'wheel') {
      const rSpec = window.YKParser.formatRimSpec(item);
      if (rSpec) subSpecs.push(`⚙️ ${item.rimBrand || ''} ${item.rimModel || ''} (${rSpec})`.trim());
    }
    if (loadKg || speedKmh) {
      subSpecs.push(`Traglast: ${loadKg || '–'} · Speed: ${speedKmh || '–'}`);
    }
    if (item.kbaNumber) {
      subSpecs.push(`📋 ${item.kbaNumber}`);
    }
    if (item.tpmsType === 'active') {
      subSpecs.push(`📡 Aktiv-RDKS verbaut`);
    }

    const condLabels = {
      neu: '🌟 Neu',
      neuwertig: '✨ Neuwertig',
      gut: '👍 Gebraucht (Gut)',
      spuren: '⚠️ Gebraucht (Spuren)',
      defekt: '❌ Prüfen'
    };

    const qty = Number(item.quantity) || 0;
    const minStock = Number(item.minStock) || 0;
    const isLowStock = minStock > 0 && qty < minStock;
    const priceSale = Number(item.priceSale) || 0;
    const totalSetPrice = priceSale * (qty > 0 ? qty : 4);

    const photosHTML = Array.isArray(item.photos) && item.photos.length > 0
      ? `<div class="card-photos-strip">${item.photos.map(src => `<img src="${src}" class="card-photo-thumb" alt="Foto" onclick="app.viewPhotoLightbox('${item.id}')" />`).join('')}</div>`
      : '';

    return `
      <article class="inv-card" data-season="${item.season || ''}">
        <div class="inv-card-top">
          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            <span class="cat-pill"><svg><use href="${catMeta.icon}"></use></svg> ${catMeta.label}</span>
            ${showSeason ? `<span class="season-pill ${seasonMap[item.season].cls}">${seasonMap[item.season].text}</span>` : ''}
            ${item.isStaggered ? `<span class="cat-pill" style="color:var(--accent);">🔀 Mischbereifung</span>` : ''}
          </div>
          <span class="sku-tag">${item.sku || ''}</span>
        </div>

        <div>
          <div class="inv-size-headline">${this.escapeHTML(headline)}</div>
          <div class="inv-brand-line">
            <span>${this.escapeHTML(brandTitle || 'Marke nicht angegeben')}</span>
            <span style="font-size:0.76rem; color:var(--text-secondary);">${condLabels[item.condition] || ''}</span>
          </div>
        </div>

        ${subSpecs.length > 0 ? `<div class="inv-subspec">${this.escapeHTML(subSpecs.join('  |  '))}</div>` : ''}

        <div class="spec-badges-grid">
          ${(item.category === 'tire' || item.category === 'wheel') ? `
            <div class="spec-box">
              <span class="spec-box-label">Profiltiefe</span>
              <span class="spec-box-val">
                <span class="dot-indicator ${treadInfo.status}"></span>
                ${treadInfo.label}
              </span>
            </div>
            <div class="spec-box">
              <span class="spec-box-label">DOT / Alter</span>
              <span class="spec-box-val">
                <span class="dot-indicator ${dotInfo.status}"></span>
                ${dotInfo.valid ? dotInfo.shortLabel : this.escapeHTML(dotInfo.label)}
              </span>
            </div>
          ` : `
            <div class="spec-box">
              <span class="spec-box-label">Lochkreis &amp; Nabe</span>
              <span class="spec-box-val">${this.escapeHTML(item.rimPcd || '–')} · ML ${this.escapeHTML(item.rimCenterBore || '–')}</span>
            </div>
            <div class="spec-box">
              <span class="spec-box-label">Einpresstiefe</span>
              <span class="spec-box-val">ET ${this.escapeHTML(item.rimEt ?? '–')}</span>
            </div>
          `}
          <div class="spec-box" style="grid-column: 1 / -1;">
            <span class="spec-box-label">Lagerort (Halle · Regal · Fach)</span>
            <span class="spec-box-val">📍 ${this.escapeHTML(locBadge)}</span>
          </div>
        </div>

        ${item.vehicleFitment ? `<div style="font-size:0.76rem; color:var(--text-secondary);">🚗 Passend: ${this.escapeHTML(item.vehicleFitment)}</div>` : ''}
        ${item.damageNotes ? `<div style="font-size:0.75rem; color:#CBD5E1; background:rgba(255,255,255,0.03); padding:5px 8px; border-radius:7px;">ℹ️ ${this.escapeHTML(item.damageNotes)}</div>` : ''}
        ${photosHTML}

        <div class="inv-card-footer">
          <div>
            <div style="font-size:0.68rem; color:var(--text-secondary); margin-bottom:2px;">Bestand ${isLowStock ? '⚠️' : ''}</div>
            <div class="qty-stepper">
              <button class="qty-btn" onclick="app.adjustStock('${item.id}', -1)" title="1 Stück ausbuchen">−</button>
              <span class="qty-display ${isLowStock ? 'low-stock' : ''}">${qty} Stk.</span>
              <button class="qty-btn" onclick="app.adjustStock('${item.id}', 1)" title="1 Stück einbuchen">+</button>
            </div>
          </div>

          <div class="price-tag-block">
            <div class="price-main">${priceSale.toFixed(2).replace('.', ',')} € <span style="font-size:0.72rem; font-weight:600; color:var(--text-secondary);">/ Stk.</span></div>
            <div class="price-sub">${qty > 1 ? `Gesamt (${qty}x): ${(priceSale * qty).toFixed(2).replace('.', ',')} €` : `Satz (4x): ${totalSetPrice.toFixed(2).replace('.', ',')} €`}</div>
          </div>
        </div>

        <div class="card-actions-bar">
          <button class="btn btn-primary btn-sm" onclick="app.createQuoteFromItem('${item.id}')" title="Sofort Angebot mit diesem Artikel erstellen">
            <svg><use href="#icon-quote"></use></svg> Angebot
          </button>
          <button class="btn btn-secondary btn-sm" onclick="app.printItemLabel('${item.id}')" title="Lager-Etikett mit QR-Code drucken">
            <svg><use href="#icon-tag"></use></svg> Etikett
          </button>
          <button class="btn btn-secondary btn-sm btn-icon" onclick="app.openItemModal('${item.id}')" title="Bearbeiten">
            <svg><use href="#icon-edit"></use></svg>
          </button>
          <button class="btn btn-ghost btn-sm btn-icon" onclick="app.duplicateItem('${item.id}')" title="Duplizieren">
            <svg><use href="#icon-copy"></use></svg>
          </button>
          <button class="btn btn-ghost btn-sm btn-icon" onclick="app.deleteItem('${item.id}')" title="Löschen">
            <svg><use href="#icon-trash"></use></svg>
          </button>
        </div>
      </article>
    `;
  }

  async adjustStock(itemId, delta) {
    const item = this.inventory.find(x => x.id === itemId);
    if (!item) return;
    const oldQty = Number(item.quantity) || 0;
    const newQty = Math.max(0, oldQty + delta);
    item.quantity = newQty;
    item.updatedAt = new Date().toISOString();

    await window.YKDB.put('inventory', item);
    const headline = window.YKParser.getPrimaryHeadline(item);
    await window.YKDB.logHistory(
      delta > 0 ? 'Einbuchung' : 'Ausbuchung',
      `${item.brand || item.rimBrand || ''} ${headline}`.trim(),
      `${delta > 0 ? '+' : ''}${delta} Stk. (Neu: ${newQty} Stk.)`,
      window.YKParser.formatLocationBadge(item)
    );
    await this.reloadAllData();
    this.renderInventory();
    this.showToast(`Bestand angepasst: ${newQty} Stück`);
  }

  /* ==========================================================================
     MODAL 1: ARTIKEL ANLEGEN / BEARBEITEN & SMART-PARSER
     ========================================================================== */

  setFormCategory(cat) {
    this.currentFormCategory = cat;
    document.querySelectorAll('[data-formcat]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.formcat === cat);
    });

    const tireSec = document.getElementById('sectionTireSpecs');
    const rimSec = document.getElementById('sectionRimSpecs');
    const stagSec = document.getElementById('sectionStaggered');
    const customTitleWrap = document.getElementById('customTitleWrap');

    if (cat === 'tire') {
      tireSec.style.display = 'block';
      rimSec.style.display = 'none';
      stagSec.style.display = 'block';
      customTitleWrap.style.display = 'none';
    } else if (cat === 'rim') {
      tireSec.style.display = 'none';
      rimSec.style.display = 'block';
      stagSec.style.display = 'block';
      customTitleWrap.style.display = 'none';
    } else if (cat === 'wheel') {
      tireSec.style.display = 'block';
      rimSec.style.display = 'block';
      stagSec.style.display = 'block';
      customTitleWrap.style.display = 'none';
    } else {
      tireSec.style.display = 'none';
      rimSec.style.display = 'none';
      stagSec.style.display = 'none';
      customTitleWrap.style.display = 'block';
    }
  }

  setField(fieldId, val, syncDia = false) {
    const el = document.getElementById(fieldId);
    if (el) {
      el.value = val;
      if (syncDia) this.syncDiameter(val, 'tire');
    }
  }

  syncDiameter(val, source) {
    if (this.currentFormCategory === 'wheel') {
      if (source === 'tire') {
        document.getElementById('itemRimDiameter').value = val;
      } else {
        document.getElementById('itemTireDiameter').value = val;
      }
    }
  }

  toggleTreadMode(isIndividual) {
    document.getElementById('treadSingleWrap').style.display = isIndividual ? 'none' : 'block';
    document.getElementById('treadIndividualWrap').style.display = isIndividual ? 'grid' : 'none';
  }

  toggleStaggeredFields(isStaggered) {
    document.getElementById('staggeredFieldsWrap').style.display = isStaggered ? 'grid' : 'none';
  }

  toggleTireFlag(flag) {
    const idx = this.currentItemFlags.indexOf(flag);
    if (idx >= 0) {
      this.currentItemFlags.splice(idx, 1);
    } else {
      this.currentItemFlags.push(flag);
    }
    this.renderTireFlagsUI();
  }

  renderTireFlagsUI() {
    document.querySelectorAll('#tireFlagsRow .chip').forEach(btn => {
      btn.classList.toggle('active', this.currentItemFlags.includes(btn.dataset.flag));
    });
  }

  updateSpecHints() {
    const li = document.getElementById('itemLoadIndex')?.value || '';
    const si = document.getElementById('itemSpeedIndex')?.value || '';
    const dot = document.getElementById('itemDot')?.value || '';

    document.getElementById('loadIndexHint').textContent = window.YKParser.getLoadIndexInfo(li);
    document.getElementById('speedIndexHint').textContent = window.YKParser.getSpeedIndexInfo(si);
    const dotInfo = window.YKParser.analyzeDOT(dot);
    document.getElementById('dotAgeHint').textContent = dotInfo.valid ? `KW ${dotInfo.week}/${dotInfo.year} (${dotInfo.ageYears} J.)` : '';
  }

  applySmartParser() {
    const raw = document.getElementById('smartParserInput')?.value || '';
    if (!raw.trim()) {
      this.showToast('Bitte zuerst eine Reifen- oder Felgenbezeichnung eingeben');
      return;
    }

    const tireParsed = window.YKParser.parseTireInput(raw);
    const rimParsed = window.YKParser.parseRimInput(raw);

    let appliedCount = 0;

    if (tireParsed.tireWidth) { document.getElementById('itemTireWidth').value = tireParsed.tireWidth; appliedCount++; }
    if (tireParsed.tireAspect) { document.getElementById('itemTireAspect').value = tireParsed.tireAspect; appliedCount++; }
    if (tireParsed.tireConstruction) { document.getElementById('itemTireConstruction').value = tireParsed.tireConstruction; }
    if (tireParsed.tireDiameter) {
      document.getElementById('itemTireDiameter').value = tireParsed.tireDiameter;
      this.syncDiameter(tireParsed.tireDiameter, 'tire');
      appliedCount++;
    }
    if (tireParsed.loadIndex) { document.getElementById('itemLoadIndex').value = tireParsed.loadIndex; appliedCount++; }
    if (tireParsed.speedIndex) { document.getElementById('itemSpeedIndex').value = tireParsed.speedIndex; appliedCount++; }
    if (tireParsed.dot) { document.getElementById('itemDot').value = tireParsed.dot; appliedCount++; }
    if (tireParsed.oeKey) { document.getElementById('itemOeKey').value = tireParsed.oeKey; }
    if (tireParsed.season) { document.getElementById('itemSeason').value = tireParsed.season; }
    if (tireParsed.brand) { document.getElementById('itemBrand').value = tireParsed.brand; }
    if (tireParsed.model) { document.getElementById('itemModel').value = tireParsed.model; }
    if (Array.isArray(tireParsed.flags) && tireParsed.flags.length > 0) {
      tireParsed.flags.forEach(f => {
        if (!this.currentItemFlags.includes(f)) this.currentItemFlags.push(f);
      });
      this.renderTireFlagsUI();
    }

    if (rimParsed.rimWidth) { document.getElementById('itemRimWidth').value = rimParsed.rimWidth; appliedCount++; }
    if (rimParsed.rimDiameter) {
      document.getElementById('itemRimDiameter').value = rimParsed.rimDiameter;
      this.syncDiameter(rimParsed.rimDiameter, 'rim');
      appliedCount++;
    }
    if (rimParsed.rimEt !== undefined) { document.getElementById('itemRimEt').value = rimParsed.rimEt; appliedCount++; }
    if (rimParsed.rimPcd) { document.getElementById('itemRimPcd').value = rimParsed.rimPcd; appliedCount++; }
    if (rimParsed.rimCenterBore) { document.getElementById('itemRimCenterBore').value = rimParsed.rimCenterBore; appliedCount++; }
    if (rimParsed.rimHump) { document.getElementById('itemRimHump').value = rimParsed.rimHump; }
    if (rimParsed.kbaNumber) { document.getElementById('itemKbaNumber').value = rimParsed.kbaNumber; }

    // Automatisch passende Kategorie wählen, falls sowohl Reifen als auch Felge erkannt wurden
    if (tireParsed.tireWidth && rimParsed.rimWidth) {
      this.setFormCategory('wheel');
    } else if (rimParsed.rimWidth && !tireParsed.tireWidth && this.currentFormCategory === 'tire') {
      this.setFormCategory('rim');
    }

    this.updateSpecHints();
    this.showToast(appliedCount > 0 ? `⚡ Smart-Parser: ${appliedCount} technische Werte übernommen!` : 'Keine Standardmaße erkannt – bitte Format prüfen');
  }

  openItemModal(itemId = null) {
    const form = document.getElementById('itemForm');
    form.reset();
    document.getElementById('smartParserInput').value = '';
    this.currentItemFlags = [];
    this.currentItemPhotos = [];

    if (itemId) {
      const item = this.inventory.find(x => x.id === itemId);
      if (!item) return;
      document.getElementById('itemModalTitle').textContent = '✏️ Lager-Artikel bearbeiten';
      document.getElementById('itemId').value = item.id;
      this.setFormCategory(item.category || 'tire');

      document.getElementById('itemSku').value = item.sku || '';
      document.getElementById('itemCustomTitle').value = item.customTitle || '';
      document.getElementById('itemBrand').value = item.brand || '';
      document.getElementById('itemModel').value = item.model || '';
      document.getElementById('itemSeason').value = item.season || 'summer';
      document.getElementById('itemTireWidth').value = item.tireWidth || '';
      document.getElementById('itemTireAspect').value = item.tireAspect || '';
      document.getElementById('itemTireConstruction').value = item.tireConstruction || 'R';
      document.getElementById('itemTireDiameter').value = item.tireDiameter || '';
      document.getElementById('itemLoadIndex').value = item.loadIndex || '';
      document.getElementById('itemSpeedIndex').value = item.speedIndex || '';
      document.getElementById('itemDot').value = item.dot || '';
      document.getElementById('itemOeKey').value = item.oeKey || '';

      const isIndTread = item.treadMode === 'individual';
      document.getElementById('itemTreadIndividualToggle').checked = isIndTread;
      this.toggleTreadMode(isIndTread);
      document.getElementById('itemTreadDepth').value = item.treadDepth || '';
      document.getElementById('itemTreadVL').value = item.treadVL || '';
      document.getElementById('itemTreadVR').value = item.treadVR || '';
      document.getElementById('itemTreadHL').value = item.treadHL || '';
      document.getElementById('itemTreadHR').value = item.treadHR || '';

      this.currentItemFlags = Array.isArray(item.tireFlags) ? [...item.tireFlags] : [];
      this.renderTireFlagsUI();

      // Felgenfelder
      document.getElementById('itemRimType').value = item.rimType || 'alu';
      document.getElementById('itemRimBrand').value = item.rimBrand || '';
      document.getElementById('itemRimModel').value = item.rimModel || '';
      document.getElementById('itemKbaNumber').value = item.kbaNumber || '';
      document.getElementById('itemRimWidth').value = item.rimWidth || '';
      document.getElementById('itemRimDiameter').value = item.rimDiameter || '';
      document.getElementById('itemRimEt').value = item.rimEt ?? '';
      document.getElementById('itemRimPcd').value = item.rimPcd || '';
      document.getElementById('itemRimCenterBore').value = item.rimCenterBore || '';
      document.getElementById('itemRimHump').value = item.rimHump || 'H2';
      document.getElementById('itemRimColor').value = item.rimColor || '';
      document.getElementById('itemTpmsType').value = item.tpmsType || 'none';

      // Mischbereifung
      const isStag = Boolean(item.isStaggered);
      document.getElementById('itemStaggeredToggle').checked = isStag;
      this.toggleStaggeredFields(isStag);
      document.getElementById('itemRearTireWidth').value = item.rearTireWidth || '';
      document.getElementById('itemRearTireAspect').value = item.rearTireAspect || '';
      document.getElementById('itemRearTireDiameter').value = item.rearTireDiameter || '';
      document.getElementById('itemRearLoadIndex').value = item.rearLoadIndex || '';
      document.getElementById('itemRearSpeedIndex').value = item.rearSpeedIndex || '';
      document.getElementById('itemRearRimWidth').value = item.rearRimWidth || '';
      document.getElementById('itemRearRimEt').value = item.rearRimEt ?? '';

      // Bestand & Lagerort
      document.getElementById('itemQuantity').value = item.quantity ?? 4;
      document.getElementById('itemMinStock').value = item.minStock ?? 4;
      document.getElementById('itemCondition').value = item.condition || 'gut';
      document.getElementById('itemLocHall').value = item.locHall || '';
      document.getElementById('itemLocShelf').value = item.locShelf || '';
      document.getElementById('itemLocSlot').value = item.locSlot || '';
      document.getElementById('itemPricePurchase').value = item.pricePurchase ?? '';
      document.getElementById('itemPriceSale').value = item.priceSale ?? '';
      document.getElementById('itemVehicleFitment').value = item.vehicleFitment || '';
      document.getElementById('itemDamageNotes').value = item.damageNotes || '';

      this.currentItemPhotos = Array.isArray(item.photos) ? [...item.photos] : [];
    } else {
      document.getElementById('itemModalTitle').textContent = '➕ Neuen Lager-Artikel anlegen';
      document.getElementById('itemId').value = '';
      this.setFormCategory('tire');
      this.toggleTreadMode(false);
      this.toggleStaggeredFields(false);
      this.renderTireFlagsUI();
      const nextNum = String(this.inventory.length + 1).padStart(3, '0');
      document.getElementById('itemSku').value = `YK-${nextNum}`;
    }

    this.updateSpecHints();
    this.renderItemPhotosPreview();
    document.getElementById('modal-item').classList.add('open');
  }

  async onAddItemPhotos(event) {
    const files = Array.from(event.target.files || []);
    for (const file of files) {
      if (this.currentItemPhotos.length >= 4) break;
      const dataUrl = await window.YKCompressImage(file, 900, 0.78);
      this.currentItemPhotos.push(dataUrl);
    }
    this.renderItemPhotosPreview();
  }

  renderItemPhotosPreview() {
    const wrap = document.getElementById('itemPhotosPreview');
    if (!wrap) return;
    wrap.innerHTML = this.currentItemPhotos.map((src, idx) => `
      <div style="position:relative;">
        <img src="${src}" class="card-photo-thumb" alt="Vorschau" />
        <button type="button" onclick="app.removeItemPhoto(${idx})" style="position:absolute;top:-5px;right:-5px;background:#EF4444;color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:11px;cursor:pointer;">✕</button>
      </div>
    `).join('');
  }

  removeItemPhoto(idx) {
    this.currentItemPhotos.splice(idx, 1);
    this.renderItemPhotosPreview();
  }

  async saveItem(event) {
    event.preventDefault();
    const existingId = document.getElementById('itemId').value;
    const isNew = !existingId;
    const id = existingId || ('inv-' + Date.now());

    const isIndTread = document.getElementById('itemTreadIndividualToggle').checked;
    const itemData = {
      id,
      sku: document.getElementById('itemSku').value.trim() || `YK-${Date.now().toString().slice(-4)}`,
      category: this.currentFormCategory,
      customTitle: document.getElementById('itemCustomTitle').value.trim(),
      brand: document.getElementById('itemBrand').value.trim(),
      model: document.getElementById('itemModel').value.trim(),
      season: document.getElementById('itemSeason').value,
      tireWidth: document.getElementById('itemTireWidth').value.trim(),
      tireAspect: document.getElementById('itemTireAspect').value.trim(),
      tireConstruction: document.getElementById('itemTireConstruction').value,
      tireDiameter: document.getElementById('itemTireDiameter').value.trim(),
      loadIndex: document.getElementById('itemLoadIndex').value.trim(),
      speedIndex: document.getElementById('itemSpeedIndex').value,
      dot: document.getElementById('itemDot').value.trim(),
      oeKey: document.getElementById('itemOeKey').value.trim(),
      treadMode: isIndTread ? 'individual' : 'single',
      treadDepth: document.getElementById('itemTreadDepth').value.trim(),
      treadVL: document.getElementById('itemTreadVL').value.trim(),
      treadVR: document.getElementById('itemTreadVR').value.trim(),
      treadHL: document.getElementById('itemTreadHL').value.trim(),
      treadHR: document.getElementById('itemTreadHR').value.trim(),
      tireFlags: [...this.currentItemFlags],

      rimType: document.getElementById('itemRimType').value,
      rimBrand: document.getElementById('itemRimBrand').value.trim(),
      rimModel: document.getElementById('itemRimModel').value.trim(),
      kbaNumber: document.getElementById('itemKbaNumber').value.trim(),
      rimWidth: document.getElementById('itemRimWidth').value.trim(),
      rimFlange: 'J',
      rimDiameter: document.getElementById('itemRimDiameter').value.trim(),
      rimEt: document.getElementById('itemRimEt').value.trim(),
      rimPcd: document.getElementById('itemRimPcd').value.trim(),
      rimCenterBore: document.getElementById('itemRimCenterBore').value.trim(),
      rimHump: document.getElementById('itemRimHump').value,
      rimColor: document.getElementById('itemRimColor').value.trim(),
      tpmsType: document.getElementById('itemTpmsType').value,

      isStaggered: document.getElementById('itemStaggeredToggle').checked,
      rearTireWidth: document.getElementById('itemRearTireWidth').value.trim(),
      rearTireAspect: document.getElementById('itemRearTireAspect').value.trim(),
      rearTireDiameter: document.getElementById('itemRearTireDiameter').value.trim(),
      rearLoadIndex: document.getElementById('itemRearLoadIndex').value.trim(),
      rearSpeedIndex: document.getElementById('itemRearSpeedIndex').value.trim(),
      rearRimWidth: document.getElementById('itemRearRimWidth').value.trim(),
      rearRimEt: document.getElementById('itemRearRimEt').value.trim(),

      quantity: Number(document.getElementById('itemQuantity').value) || 0,
      minStock: Number(document.getElementById('itemMinStock').value) || 0,
      condition: document.getElementById('itemCondition').value,
      locHall: document.getElementById('itemLocHall').value.trim(),
      locShelf: document.getElementById('itemLocShelf').value.trim(),
      locSlot: document.getElementById('itemLocSlot').value.trim(),
      pricePurchase: parseFloat(document.getElementById('itemPricePurchase').value) || 0,
      priceSale: parseFloat(document.getElementById('itemPriceSale').value) || 0,
      vehicleFitment: document.getElementById('itemVehicleFitment').value.trim(),
      damageNotes: document.getElementById('itemDamageNotes').value.trim(),
      photos: [...this.currentItemPhotos],
      createdAt: isNew ? new Date().toISOString() : (this.inventory.find(x => x.id === id)?.createdAt || new Date().toISOString()),
      updatedAt: new Date().toISOString()
    };

    await window.YKDB.put('inventory', itemData);
    await window.YKDB.logHistory(
      isNew ? 'Neu angelegt' : 'Bearbeitet',
      `${itemData.brand || itemData.rimBrand || ''} ${window.YKParser.getPrimaryHeadline(itemData)}`.trim(),
      `${itemData.quantity} Stk.`,
      window.YKParser.formatLocationBadge(itemData)
    );
    await this.reloadAllData();
    this.closeModal('modal-item');
    this.renderAll();
    this.showToast(isNew ? '✅ Neuer Artikel im Lager gespeichert!' : '✅ Änderungen gespeichert!');
  }

  async duplicateItem(itemId) {
    const orig = this.inventory.find(x => x.id === itemId);
    if (!orig) return;
    const copy = {
      ...orig,
      id: 'inv-' + Date.now(),
      sku: `${orig.sku || 'YK'}-KOPIE`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await window.YKDB.put('inventory', copy);
    await this.reloadAllData();
    this.renderAll();
    this.showToast('📋 Artikel dupliziert');
  }

  async deleteItem(itemId) {
    const item = this.inventory.find(x => x.id === itemId);
    if (!item) return;
    if (!confirm(`Möchtest du "${window.YKParser.getPrimaryHeadline(item)}" wirklich aus dem Bestand löschen?`)) return;
    await window.YKDB.delete('inventory', itemId);
    await window.YKDB.logHistory('Gelöscht', window.YKParser.getPrimaryHeadline(item), `0 Stk.`, '');
    await this.reloadAllData();
    this.renderAll();
    this.showToast('🗑️ Artikel gelöscht');
  }

  /* ==========================================================================
     LAGER-ETIKETT DRUCKANSICHT (MIT QR-CODE & YK-LOGO)
     ========================================================================== */
  printItemLabel(itemId) {
    const item = this.inventory.find(x => x.id === itemId);
    if (!item) return;
    const headline = window.YKParser.getPrimaryHeadline(item);
    const dotInfo = window.YKParser.analyzeDOT(item.dot);
    const treadInfo = window.YKParser.analyzeTread(item);
    const loc = window.YKParser.formatLocationBadge(item);
    const qrSvg = window.YKParser.generateMatrixCodeSVG(item.sku || item.id, 84);
    const rawLogo = this.company.logoDataUrl;
    const logoUrl = (!rawLogo || rawLogo === 'assets/logo.jpg') ? this.getDefaultLogo() : rawLogo;

    document.getElementById('printModalTitle').textContent = `🏷️ Lager-Etikett: ${headline}`;
    document.getElementById('printModalBody').innerHTML = `
      <div class="label-sheet">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #111318; padding-bottom:10px; margin-bottom:12px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <img src="${logoUrl}" alt="YK Logo" style="width:48px;height:48px;object-fit:cover;border-radius:8px;" />
            <div>
              <div style="font-weight:800; font-size:1rem;">${this.escapeHTML(this.company.companyName)}</div>
              <div style="font-size:0.75rem; color:#4B5563;">Art.-Nr.: <strong>${this.escapeHTML(item.sku || item.id)}</strong></div>
            </div>
          </div>
          <div>${qrSvg}</div>
        </div>

        <div style="font-size:1.45rem; font-weight:900; margin-bottom:4px;">${this.escapeHTML(headline)}</div>
        <div style="font-size:1rem; font-weight:700; color:#374151; margin-bottom:12px;">
          ${this.escapeHTML(`${item.brand || item.rimBrand || ''} ${item.model || item.rimModel || ''}`.trim())}
        </div>

        <table style="width:100%; border-collapse:collapse; font-size:0.86rem; margin-bottom:12px;">
          <tr>
            <td style="padding:5px; border:1px solid #D1D5DB;"><strong>Menge:</strong> ${item.quantity} Stück</td>
            <td style="padding:5px; border:1px solid #D1D5DB;"><strong>DOT:</strong> ${this.escapeHTML(dotInfo.label)}</td>
          </tr>
          <tr>
            <td style="padding:5px; border:1px solid #D1D5DB;"><strong>Profiltiefe:</strong> ${treadInfo.label}</td>
            <td style="padding:5px; border:1px solid #D1D5DB;"><strong>Lagerplatz:</strong> ${this.escapeHTML(loc)}</td>
          </tr>
        </table>

        ${item.vehicleFitment ? `<div style="font-size:0.8rem;"><strong>Fahrzeug/Info:</strong> ${this.escapeHTML(item.vehicleFitment)}</div>` : ''}
      </div>
    `;
    document.getElementById('modal-print').classList.add('open');
  }

  /* ==========================================================================
     TAB 2: ANGEBOTSERSTELLUNG & DIENSTLEISTUNGEN (MONTAGE, ENTSORGUNG, EINLAGERUNG)
     ========================================================================== */

  setQuoteStatusFilter(status) {
    this.quoteStatusFilter = status;
    document.querySelectorAll('#quoteStatusFilterRow .chip').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.qstatus === status);
    });
    this.renderQuotes();
  }

  calculateQuoteSummary(quote) {
    const items = quote.items || [];
    let sumGrossBeforeOverall = 0;
    items.forEach(pos => {
      const qty = Number(pos.qty) || 0;
      const unitGross = Number(pos.unitPriceGross) || 0;
      const disc = Number(pos.discountPercent) || 0;
      const lineGross = qty * unitGross * (1 - disc / 100);
      sumGrossBeforeOverall += lineGross;
    });

    const overallDisc = Number(quote.overallDiscountEuro) || 0;
    const totalGross = Math.max(0, sumGrossBeforeOverall - overallDisc);
    const taxMode = quote.taxMode || this.company.taxMode || 'regular';
    const vatRate = Number(quote.vatRate) || 19;

    let totalNet = totalGross;
    let vatAmount = 0;
    if (taxMode === 'regular') {
      totalNet = totalGross / (1 + vatRate / 100);
      vatAmount = totalGross - totalNet;
    }

    return {
      subtotalGross: sumGrossBeforeOverall,
      overallDisc,
      totalNet,
      vatAmount,
      totalGross,
      taxMode,
      vatRate
    };
  }

  renderQuotes() {
    const openQuotesCount = this.quotes.filter(q => q.status === 'open' || q.status === 'draft').length;
    const badge = document.getElementById('navQuoteBadge');
    if (badge) {
      badge.style.display = openQuotesCount > 0 ? 'inline-block' : 'none';
      badge.textContent = openQuotesCount;
    }

    const filtered = this.quotes.filter(q => {
      if (this.quoteStatusFilter !== 'all' && q.status !== this.quoteStatusFilter) return false;
      return true;
    });

    const container = document.getElementById('quotesListContainer');
    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="form-section" style="text-align:center; padding:32px;">
          <div style="font-weight:800; margin-bottom:6px;">Noch keine Angebote in dieser Ansicht</div>
          <button class="btn btn-primary btn-sm" onclick="app.openQuoteModal()">+ Neues Angebot erstellen</button>
        </div>
      `;
      return;
    }

    const statusLabels = {
      draft: '📝 Entwurf',
      open: '📨 Offen / Versendet',
      accepted: '✅ Angenommen',
      rejected: '❌ Abgelehnt'
    };

    container.innerHTML = filtered.map(q => {
      const calc = this.calculateQuoteSummary(q);
      const custName = q.customerSnapshot?.name || 'Barverkauf / Kunde';
      const posPreview = (q.items || []).map(i => `${i.qty}x ${i.title}`).join(' · ');

      return `
        <div class="quote-card">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-weight:800; font-size:1rem; color:var(--accent);">${this.escapeHTML(q.quoteNumber)}</span>
              <span class="cat-pill">${this.escapeHTML(q.docType || 'Angebot')}</span>
              <span class="quote-status ${q.status}">${statusLabels[q.status] || q.status}</span>
            </div>
            <div style="font-size:0.8rem; color:var(--text-secondary);">Datum: ${this.formatDateDE(q.date)}</div>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
            <div>
              <div style="font-weight:700; font-size:0.98rem;">👤 ${this.escapeHTML(custName)}</div>
              ${q.vehicleInfo ? `<div style="font-size:0.8rem; color:var(--text-secondary);">🚗 ${this.escapeHTML(q.vehicleInfo)}</div>` : ''}
              <div style="font-size:0.78rem; color:#CBD5E1; margin-top:4px;">${this.escapeHTML(posPreview)}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:1.2rem; font-weight:800; color:var(--text-primary);">${calc.totalGross.toFixed(2).replace('.', ',')} €</div>
              <div style="font-size:0.72rem; color:var(--text-secondary);">
                ${calc.taxMode === 'regular' ? `inkl. ${calc.vatAmount.toFixed(2).replace('.', ',')} € MwSt.` : 'gem. § 19 / § 25a UStG'}
              </div>
            </div>
          </div>

          <div style="display:flex; gap:8px; flex-wrap:wrap; padding-top:8px; border-top:1px solid var(--border-subtle);">
            <button class="btn btn-primary btn-sm" onclick="app.previewQuoteA4('${q.id}')">
              <svg><use href="#icon-print"></use></svg> DIN-A4 Druck / PDF
            </button>
            <button class="btn btn-secondary btn-sm" onclick="app.openQuoteModal('${q.id}')">
              <svg><use href="#icon-edit"></use></svg> Bearbeiten
            </button>
            ${q.status !== 'accepted' ? `
              <button class="btn btn-secondary btn-sm" onclick="app.acceptQuoteAndDeductStock('${q.id}')">
                ✅ Als angenommen markieren
              </button>
            ` : ''}
            <button class="btn btn-ghost btn-sm" onclick="app.deleteQuote('${q.id}')">
              <svg><use href="#icon-trash"></use></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  createQuoteFromItem(itemId) {
    const item = this.inventory.find(x => x.id === itemId);
    if (!item) return;
    this.openQuoteModal(null, item);
  }

  createQuoteForCustomer(customerId) {
    this.openQuoteModal(null, null, customerId);
  }

  openQuoteModal(quoteId = null, prefillItem = null, prefillCustomerId = null) {
    const custSelect = document.getElementById('quoteCustomerSelect');
    custSelect.innerHTML = `<option value="">– Kunde aus Stammdaten wählen oder unten eintragen –</option>` +
      this.customers.map(c => {
        const label = c.companyName ? `${c.companyName} (${c.firstName} ${c.lastName})` : `${c.firstName} ${c.lastName}`;
        return `<option value="${c.id}">${this.escapeHTML(c.customerNumber)} · ${this.escapeHTML(label)}</option>`;
      }).join('');

    // Lagerbestand-Dropdown im Angebots-Editor füllen
    const invSelect = document.getElementById('quoteAddInvSelect');
    invSelect.innerHTML = this.inventory.map(item => {
      const head = window.YKParser.getPrimaryHeadline(item);
      const brand = item.brand || item.rimBrand || '';
      const price = (Number(item.priceSale) || 0).toFixed(2).replace('.', ',');
      return `<option value="${item.id}">${this.escapeHTML(brand)} ${this.escapeHTML(head)} (${item.quantity} Stk. · ${price} €/Stk.)</option>`;
    }).join('');

    // Dienstleistungs-Schnellwahl rendern
    const srvPicker = document.getElementById('quoteServicePicker');
    srvPicker.innerHTML = this.services.map(srv => `
      <button type="button" class="service-pick-btn" onclick="app.addQuoteServiceItem('${srv.id}')">
        <div style="font-weight:700; font-size:0.8rem; color:var(--text-primary);">+ ${this.escapeHTML(srv.title)}</div>
        <div style="font-size:0.72rem; color:var(--accent); font-weight:700;">
          ${srv.defaultQty}x ${srv.unit} · ${Number(srv.priceGross).toFixed(2).replace('.', ',')} €
        </div>
      </button>
    `).join('');

    const today = new Date().toISOString().split('T')[0];
    const validDate = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];

    if (quoteId) {
      const q = this.quotes.find(x => x.id === quoteId);
      if (!q) return;
      document.getElementById('quoteModalTitle').textContent = `✏️ ${q.docType || 'Angebot'} ${q.quoteNumber} bearbeiten`;
      document.getElementById('quoteId').value = q.id;
      document.getElementById('quoteDocType').value = q.docType || 'Angebot';
      document.getElementById('quoteNumber').value = q.quoteNumber;
      document.getElementById('quoteStatus').value = q.status || 'open';
      document.getElementById('quoteDate').value = q.date || today;
      document.getElementById('quoteValidUntil').value = q.validUntil || validDate;
      document.getElementById('quoteCustomerSelect').value = q.customerId || '';
      document.getElementById('quoteCustName').value = q.customerSnapshot?.name || '';
      document.getElementById('quoteCustStreet').value = q.customerSnapshot?.street || '';
      document.getElementById('quoteCustZipCity').value = q.customerSnapshot?.zipCity || '';
      document.getElementById('quoteCustPhone').value = q.customerSnapshot?.phone || '';
      document.getElementById('quoteVehicleInfo').value = q.vehicleInfo || '';
      document.getElementById('quoteOverallDiscount').value = q.overallDiscountEuro || 0;
      document.getElementById('quoteTaxMode').value = q.taxMode || this.company.taxMode || 'regular';
      document.getElementById('quoteNotes').value = q.notes || '';
      this.currentQuoteItems = JSON.parse(JSON.stringify(q.items || []));
    } else {
      document.getElementById('quoteModalTitle').textContent = '➕ Neues Angebot erstellen';
      document.getElementById('quoteId').value = '';
      document.getElementById('quoteDocType').value = 'Angebot';
      const prefix = this.company.quotePrefix || 'ANG-2026-';
      const nextNum = this.company.nextQuoteNum || (101 + this.quotes.length);
      document.getElementById('quoteNumber').value = `${prefix}${nextNum}`;
      document.getElementById('quoteStatus').value = 'open';
      document.getElementById('quoteDate').value = today;
      document.getElementById('quoteValidUntil').value = validDate;
      document.getElementById('quoteCustomerSelect').value = '';
      document.getElementById('quoteCustName').value = '';
      document.getElementById('quoteCustStreet').value = '';
      document.getElementById('quoteCustZipCity').value = '';
      document.getElementById('quoteCustPhone').value = '';
      document.getElementById('quoteVehicleInfo').value = '';
      document.getElementById('quoteOverallDiscount').value = 0;
      document.getElementById('quoteTaxMode').value = this.company.taxMode || 'regular';
      document.getElementById('quoteNotes').value = 'Inklusive Sichtprüfung und Einstellung des Reifendrucks.';
      this.currentQuoteItems = [];

      if (prefillItem) {
        this.pushInventoryItemToQuote(prefillItem);
      }
      if (prefillCustomerId) {
        document.getElementById('quoteCustomerSelect').value = prefillCustomerId;
        this.onSelectQuoteCustomer(prefillCustomerId);
      }
    }

    this.renderQuoteItemsEditor();
    document.getElementById('modal-quote').classList.add('open');
  }

  onSelectQuoteCustomer(custId) {
    const c = this.customers.find(x => x.id === custId);
    if (!c) return;
    const fullName = c.companyName ? `${c.companyName} (${c.firstName} ${c.lastName})` : `${c.firstName} ${c.lastName}`;
    document.getElementById('quoteCustName').value = fullName;
    document.getElementById('quoteCustStreet').value = c.street || '';
    document.getElementById('quoteCustZipCity').value = `${c.zip || ''} ${c.city || ''}`.trim();
    document.getElementById('quoteCustPhone').value = c.phone || c.email || '';
    if (Array.isArray(c.vehicles) && c.vehicles.length > 0) {
      const v = c.vehicles[0];
      document.getElementById('quoteVehicleInfo').value = `${v.makeModel} · Kennzeichen: ${v.licensePlate}`;
    }
  }

  pushInventoryItemToQuote(item) {
    const headline = window.YKParser.getPrimaryHeadline(item);
    const brand = item.brand || item.rimBrand || '';
    const dotInfo = window.YKParser.analyzeDOT(item.dot);
    const treadInfo = window.YKParser.analyzeTread(item);
    const details = [];
    if (dotInfo.valid) details.push(dotInfo.label);
    if (treadInfo.hasValue) details.push(`Profil ${treadInfo.label}`);
    if (item.kbaNumber) details.push(item.kbaNumber);

    this.currentQuoteItems.push({
      id: 'qi-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
      type: 'inventory',
      inventoryId: item.id,
      title: `${brand} ${item.model || item.rimModel || ''} · ${headline}`.replace(/\s+/g, ' ').trim(),
      subtitle: details.join(' · '),
      qty: Math.min(4, Number(item.quantity) || 4),
      unit: 'Stück',
      unitPriceGross: Number(item.priceSale) || 0,
      discountPercent: 0
    });
  }

  addQuoteInventoryItem() {
    const invId = document.getElementById('quoteAddInvSelect')?.value;
    const item = this.inventory.find(x => x.id === invId);
    if (!item) return;
    this.pushInventoryItemToQuote(item);
    this.renderQuoteItemsEditor();
    this.showToast('📦 Lagerartikel ins Angebot übernommen');
  }

  addQuoteServiceItem(srvId) {
    const srv = this.services.find(x => x.id === srvId);
    if (!srv) return;
    this.currentQuoteItems.push({
      id: 'qi-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
      type: 'service',
      serviceId: srv.id,
      title: srv.title,
      subtitle: srv.description || '',
      qty: Number(srv.defaultQty) || 1,
      unit: srv.unit || 'Stück',
      unitPriceGross: Number(srv.priceGross) || 0,
      discountPercent: 0
    });
    this.renderQuoteItemsEditor();
    this.showToast(`🔧 "${srv.title}" eingefügt`);
  }

  addQuoteCustomItem() {
    this.currentQuoteItems.push({
      id: 'qi-' + Date.now(),
      type: 'custom',
      title: 'Sonderposition / Arbeitspauschale',
      subtitle: '',
      qty: 1,
      unit: 'Pauschal',
      unitPriceGross: 25.00,
      discountPercent: 0
    });
    this.renderQuoteItemsEditor();
  }

  removeQuoteItem(idx) {
    this.currentQuoteItems.splice(idx, 1);
    this.renderQuoteItemsEditor();
  }

  updateQuoteItemField(idx, field, val) {
    if (!this.currentQuoteItems[idx]) return;
    this.currentQuoteItems[idx][field] = (field === 'qty' || field === 'unitPriceGross' || field === 'discountPercent')
      ? parseFloat(val) || 0
      : val;
    this.recalcQuoteTotals();
  }

  renderQuoteItemsEditor() {
    const container = document.getElementById('quoteItemsContainer');
    if (this.currentQuoteItems.length === 0) {
      container.innerHTML = `<div style="color:var(--text-secondary); font-size:0.84rem; text-align:center; padding:12px;">Noch keine Positionen im Angebot. Wähle oben einen Lagerartikel oder tippe auf eine Dienstleistung (z.B. Montage, Entsorgung, Einlagerung).</div>`;
      this.recalcQuoteTotals();
      return;
    }

    container.innerHTML = this.currentQuoteItems.map((pos, idx) => `
      <div class="quote-pos-row">
        <div style="display:flex; flex-direction:column; gap:5px;">
          <input type="text" class="form-control" value="${this.escapeHTML(pos.title)}" oninput="app.updateQuoteItemField(${idx}, 'title', this.value)" placeholder="Positionsbezeichnung" />
          <input type="text" class="form-control" style="font-size:0.78rem; padding:6px 9px;" value="${this.escapeHTML(pos.subtitle || '')}" oninput="app.updateQuoteItemField(${idx}, 'subtitle', this.value)" placeholder="Zusatztext / DOT / Beschreibung" />
        </div>
        <button type="button" class="btn btn-ghost btn-icon" onclick="app.removeQuoteItem(${idx})" title="Position entfernen">✕</button>
        <div class="quote-pos-controls">
          <div>
            <label class="form-label">Menge (${this.escapeHTML(pos.unit || 'Stk.')})</label>
            <input type="number" class="form-control" step="1" min="1" value="${pos.qty}" oninput="app.updateQuoteItemField(${idx}, 'qty', this.value)" />
          </div>
          <div>
            <label class="form-label">Einzelpreis (€)</label>
            <input type="number" class="form-control" step="0.50" min="0" value="${pos.unitPriceGross}" oninput="app.updateQuoteItemField(${idx}, 'unitPriceGross', this.value)" />
          </div>
          <div>
            <label class="form-label">Rabatt (%)</label>
            <input type="number" class="form-control" step="1" min="0" max="100" value="${pos.discountPercent || 0}" oninput="app.updateQuoteItemField(${idx}, 'discountPercent', this.value)" />
          </div>
        </div>
      </div>
    `).join('');

    this.recalcQuoteTotals();
  }

  recalcQuoteTotals() {
    const tempQuote = {
      items: this.currentQuoteItems,
      overallDiscountEuro: parseFloat(document.getElementById('quoteOverallDiscount')?.value) || 0,
      taxMode: document.getElementById('quoteTaxMode')?.value || 'regular',
      vatRate: 19
    };
    const calc = this.calculateQuoteSummary(tempQuote);
    const disp = document.getElementById('quoteLiveTotalDisplay');
    if (disp) {
      disp.textContent = `${calc.totalGross.toFixed(2).replace('.', ',')} €`;
    }
  }

  async saveQuote(event) {
    event.preventDefault();
    if (this.currentQuoteItems.length === 0) {
      this.showToast('⚠️ Bitte mindestens eine Position zum Angebot hinzufügen');
      return;
    }

    const existingId = document.getElementById('quoteId').value;
    const isNew = !existingId;
    const id = existingId || ('quo-' + Date.now());

    const quoteData = {
      id,
      quoteNumber: document.getElementById('quoteNumber').value.trim(),
      docType: document.getElementById('quoteDocType').value,
      status: document.getElementById('quoteStatus').value,
      date: document.getElementById('quoteDate').value,
      validUntil: document.getElementById('quoteValidUntil').value,
      customerId: document.getElementById('quoteCustomerSelect').value,
      customerSnapshot: {
        name: document.getElementById('quoteCustName').value.trim(),
        street: document.getElementById('quoteCustStreet').value.trim(),
        zipCity: document.getElementById('quoteCustZipCity').value.trim(),
        phone: document.getElementById('quoteCustPhone').value.trim()
      },
      vehicleInfo: document.getElementById('quoteVehicleInfo').value.trim(),
      items: [...this.currentQuoteItems],
      overallDiscountEuro: parseFloat(document.getElementById('quoteOverallDiscount').value) || 0,
      taxMode: document.getElementById('quoteTaxMode').value,
      vatRate: 19,
      notes: document.getElementById('quoteNotes').value.trim(),
      stockDeducted: false,
      createdAt: isNew ? new Date().toISOString() : (this.quotes.find(x => x.id === id)?.createdAt || new Date().toISOString())
    };

    await window.YKDB.put('quotes', quoteData);
    if (isNew) {
      this.company.nextQuoteNum = (Number(this.company.nextQuoteNum) || 101) + 1;
      await window.YKDB.put('settings', this.company);
    }

    await this.reloadAllData();
    this.closeModal('modal-quote');
    this.switchTab('quotes');
    this.renderQuotes();
    this.showToast('✅ Angebot gespeichert!');
  }

  async acceptQuoteAndDeductStock(quoteId) {
    const q = this.quotes.find(x => x.id === quoteId);
    if (!q) return;
    q.status = 'accepted';

    const invItems = (q.items || []).filter(i => i.type === 'inventory' && i.inventoryId);
    if (invItems.length > 0 && !q.stockDeducted) {
      const shouldDeduct = confirm('Angebot als "Angenommen" markiert! Sollen die enthaltenen Reifen/Felgen direkt vom Lagerbestand abgebucht werden?');
      if (shouldDeduct) {
        for (const pos of invItems) {
          const stockItem = this.inventory.find(x => x.id === pos.inventoryId);
          if (stockItem) {
            stockItem.quantity = Math.max(0, (Number(stockItem.quantity) || 0) - (Number(pos.qty) || 0));
            await window.YKDB.put('inventory', stockItem);
            await window.YKDB.logHistory('Angebot angenommen', pos.title, `-${pos.qty} Stk. (${q.quoteNumber})`, '');
          }
        }
        q.stockDeducted = true;
      }
    }

    await window.YKDB.put('quotes', q);
    await this.reloadAllData();
    this.renderAll();
    this.showToast(`✅ ${q.quoteNumber} angenommen!`);
  }

  async deleteQuote(quoteId) {
    if (!confirm('Dieses Dokument wirklich löschen?')) return;
    await window.YKDB.delete('quotes', quoteId);
    await this.reloadAllData();
    this.renderQuotes();
    this.showToast('🗑️ Angebot gelöscht');
  }

  previewQuoteA4(quoteId) {
    const q = this.quotes.find(x => x.id === quoteId);
    if (!q) return;
    const calc = this.calculateQuoteSummary(q);
    const c = this.company;
    const rawLogo = c.logoDataUrl;
    const logoUrl = (!rawLogo || rawLogo === 'assets/logo.jpg') ? this.getDefaultLogo() : rawLogo;

    const rowsHTML = (q.items || []).map((pos, i) => {
      const qty = Number(pos.qty) || 0;
      const unitGross = Number(pos.unitPriceGross) || 0;
      const disc = Number(pos.discountPercent) || 0;
      const lineTotal = qty * unitGross * (1 - disc / 100);
      return `
        <tr>
          <td>${i + 1}</td>
          <td>
            <div style="font-weight:700;">${this.escapeHTML(pos.title)}</div>
            ${pos.subtitle ? `<div style="font-size:0.75rem; color:#4B5563;">${this.escapeHTML(pos.subtitle)}</div>` : ''}
          </td>
          <td>${qty} ${this.escapeHTML(pos.unit || 'Stk.')}</td>
          <td style="text-align:right;">${unitGross.toFixed(2).replace('.', ',')} €</td>
          <td style="text-align:right;">${disc > 0 ? `-${disc}%` : '–'}</td>
          <td style="text-align:right; font-weight:700;">${lineTotal.toFixed(2).replace('.', ',')} €</td>
        </tr>
      `;
    }).join('');

    let taxNoteHTML = '';
    if (calc.taxMode === 'kleinunternehmer') {
      taxNoteHTML = `<div style="font-size:0.78rem; color:#4B5563; margin-top:8px;">Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).</div>`;
    } else if (calc.taxMode === 'diff') {
      taxNoteHTML = `<div style="font-size:0.78rem; color:#4B5563; margin-top:8px;">Gebrauchtgegenstände / Sonderregelung: Differenzbesteuerung gemäß § 25a UStG.</div>`;
    }

    document.getElementById('printModalTitle').textContent = `📄 ${q.docType || 'Angebot'} ${q.quoteNumber}`;
    document.getElementById('printModalBody').innerHTML = `
      <div class="print-preview-container">
        <div class="a4-header">
          <div>
            <div style="font-size:1.35rem; font-weight:900; color:#111318;">${this.escapeHTML(c.companyName)}</div>
            <div style="font-size:0.84rem; color:#374151;">Inh. ${this.escapeHTML(c.ownerName)}</div>
            <div style="font-size:0.82rem; color:#4B5563; margin-top:4px;">
              ${this.escapeHTML(c.street)} · ${this.escapeHTML(c.zip)} ${this.escapeHTML(c.city)}<br/>
              Tel.: ${this.escapeHTML(c.phone)} · E-Mail: ${this.escapeHTML(c.email)}
            </div>
          </div>
          <img src="${logoUrl}" class="a4-company-logo" alt="YK Firmenlogo" />
        </div>

        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:20px; margin-bottom:18px;">
          <div>
            <div class="a4-sender-line">${this.escapeHTML(c.companyName)} · ${this.escapeHTML(c.street)} · ${this.escapeHTML(c.zip)} ${this.escapeHTML(c.city)}</div>
            <div style="font-weight:700; font-size:0.96rem;">${this.escapeHTML(q.customerSnapshot?.name || '')}</div>
            <div>${this.escapeHTML(q.customerSnapshot?.street || '')}</div>
            <div>${this.escapeHTML(q.customerSnapshot?.zipCity || '')}</div>
            ${q.customerSnapshot?.phone ? `<div style="font-size:0.8rem; color:#4B5563; margin-top:3px;">Kontakt: ${this.escapeHTML(q.customerSnapshot.phone)}</div>` : ''}
          </div>
          <div style="text-align:right; font-size:0.84rem;">
            <div><strong>Nr.:</strong> ${this.escapeHTML(q.quoteNumber)}</div>
            <div><strong>Datum:</strong> ${this.formatDateDE(q.date)}</div>
            ${q.validUntil ? `<div><strong>Gültig bis:</strong> ${this.formatDateDE(q.validUntil)}</div>` : ''}
          </div>
        </div>

        <div class="a4-doc-title">${this.escapeHTML(q.docType || 'Angebot')} ${this.escapeHTML(q.quoteNumber)}</div>
        ${q.vehicleInfo ? `<div style="background:#F3F4F6; padding:7px 10px; border-radius:6px; font-size:0.85rem; margin-bottom:10px;"><strong>Fahrzeug / Zuordnung:</strong> ${this.escapeHTML(q.vehicleInfo)}</div>` : ''}
        <p style="font-size:0.85rem; color:#374151; margin-bottom:12px;">${this.escapeHTML(c.quoteIntroText || '')}</p>

        <table class="a4-table">
          <thead>
            <tr>
              <th style="width:36px;">Pos.</th>
              <th>Bezeichnung / Reifen- &amp; Felgenspezifikation / Leistung</th>
              <th style="width:85px;">Menge</th>
              <th style="width:95px; text-align:right;">Einzelpreis</th>
              <th style="width:65px; text-align:right;">Rabatt</th>
              <th style="width:105px; text-align:right;">Gesamt</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHTML}
          </tbody>
        </table>

        <div class="a4-totals-box">
          ${calc.overallDisc > 0 ? `
            <div class="a4-totals-row">
              <span>Zwischensumme:</span>
              <span>${calc.subtotalGross.toFixed(2).replace('.', ',')} €</span>
            </div>
            <div class="a4-totals-row">
              <span>Pauschal-Nachlass:</span>
              <span>-${calc.overallDisc.toFixed(2).replace('.', ',')} €</span>
            </div>
          ` : ''}
          ${calc.taxMode === 'regular' ? `
            <div class="a4-totals-row">
              <span>Nettobetrag:</span>
              <span>${calc.totalNet.toFixed(2).replace('.', ',')} €</span>
            </div>
            <div class="a4-totals-row">
              <span>zzgl. ${calc.vatRate} % MwSt.:</span>
              <span>${calc.vatAmount.toFixed(2).replace('.', ',')} €</span>
            </div>
          ` : ''}
          <div class="a4-totals-row grand">
            <span>Gesamtbetrag:</span>
            <span>${calc.totalGross.toFixed(2).replace('.', ',')} €</span>
          </div>
        </div>

        ${taxNoteHTML}
        ${q.notes ? `<div style="margin-top:14px; font-size:0.84rem;"><strong>Hinweis / Vereinbarung:</strong> ${this.escapeHTML(q.notes)}</div>` : ''}
        <div style="margin-top:10px; font-size:0.82rem; color:#374151;">${this.escapeHTML(c.paymentTerms || '')}</div>
        <div style="margin-top:6px; font-size:0.82rem; color:#374151;">${this.escapeHTML(c.quoteFooterText || '')}</div>

        <div class="a4-footer">
          <div>
            <strong>${this.escapeHTML(c.companyName)}</strong><br/>
            ${this.escapeHTML(c.street)}<br/>
            ${this.escapeHTML(c.zip)} ${this.escapeHTML(c.city)}
          </div>
          <div>
            <strong>Kontakt &amp; Steuer</strong><br/>
            Tel.: ${this.escapeHTML(c.phone)}<br/>
            St.-Nr.: ${this.escapeHTML(c.taxNumber)} · USt-IdNr.: ${this.escapeHTML(c.vatId)}
          </div>
          <div>
            <strong>Bankverbindung</strong><br/>
            ${this.escapeHTML(c.bankName)}<br/>
            IBAN: ${this.escapeHTML(c.iban)}<br/>
            BIC: ${this.escapeHTML(c.bic)}
          </div>
        </div>
      </div>
    `;
    document.getElementById('modal-print').classList.add('open');
  }

  /* ==========================================================================
     TAB 3: KUNDENSTAMMDATEN & KUNDENFAHRZEUGE
     ========================================================================== */

  renderCustomers() {
    const q = (document.getElementById('customerSearchInput')?.value || '').trim().toLowerCase();
    const filtered = this.customers.filter(c => {
      if (!q) return true;
      const vehStr = (c.vehicles || []).map(v => `${v.makeModel} ${v.licensePlate} ${v.tireSpec}`).join(' ');
      const full = `${c.customerNumber} ${c.companyName} ${c.firstName} ${c.lastName} ${c.phone} ${c.email} ${c.city} ${vehStr}`.toLowerCase();
      return full.includes(q);
    });

    const container = document.getElementById('customersListContainer');
    if (filtered.length === 0) {
      container.innerHTML = `<div class="form-section" style="grid-column:1/-1; text-align:center;">Keine Kunden gefunden.</div>`;
      return;
    }

    container.innerHTML = filtered.map(c => {
      const custQuotes = this.quotes.filter(quo => quo.customerId === c.id);
      const cleanPhone = (c.phone || '').replace(/[^+\d]/g, '');
      const waPhone = cleanPhone.replace(/^\+/, '');

      return `
        <div class="inv-card">
          <div class="inv-card-top">
            <span class="cat-pill">${c.type === 'business' ? '🏢 Firmenkunde' : '👤 Privatkunde'}</span>
            <span class="sku-tag">${this.escapeHTML(c.customerNumber)}</span>
          </div>

          <div>
            <div class="inv-size-headline">${this.escapeHTML(c.companyName || `${c.firstName} ${c.lastName}`)}</div>
            ${c.companyName ? `<div style="font-size:0.86rem; color:var(--text-secondary);">Ansprechpartner: ${this.escapeHTML(c.firstName)} ${this.escapeHTML(c.lastName)}</div>` : ''}
            <div style="font-size:0.82rem; color:var(--text-secondary); margin-top:4px;">
              📍 ${this.escapeHTML(c.street || '')}, ${this.escapeHTML(c.zip || '')} ${this.escapeHTML(c.city || '')}
            </div>
          </div>

          ${Array.isArray(c.vehicles) && c.vehicles.length > 0 ? `
            <div style="display:flex; flex-direction:column; gap:5px;">
              ${c.vehicles.map(v => `
                <div class="inv-subspec">
                  🚗 <strong>${this.escapeHTML(v.makeModel)}</strong> · Kennz.: <strong>${this.escapeHTML(v.licensePlate)}</strong>
                  ${v.tireSpec ? `<br/><span style="font-size:0.74rem;">🛞 ${this.escapeHTML(v.tireSpec)}</span>` : ''}
                </div>
              `).join('')}
            </div>
          ` : ''}

          ${c.notes ? `<div style="font-size:0.76rem; color:var(--text-secondary);">ℹ️ ${this.escapeHTML(c.notes)}</div>` : ''}

          <div style="font-size:0.76rem; color:var(--accent); font-weight:700;">
            📄 ${custQuotes.length} Angebot(e) / Aufträge gespeichert
          </div>

          <div class="card-actions-bar" style="margin-top:auto;">
            <button class="btn btn-primary btn-sm" onclick="app.createQuoteForCustomer('${c.id}')">
              + Angebot
            </button>
            ${cleanPhone ? `
              <a class="btn btn-secondary btn-sm" href="tel:${cleanPhone}">📞 Anruf</a>
              <a class="btn btn-secondary btn-sm" href="https://wa.me/${waPhone}" target="_blank" rel="noopener">💬 WhatsApp</a>
            ` : ''}
            <button class="btn btn-secondary btn-sm btn-icon" onclick="app.openCustomerModal('${c.id}')">
              <svg><use href="#icon-edit"></use></svg>
            </button>
            <button class="btn btn-ghost btn-sm btn-icon" onclick="app.deleteCustomer('${c.id}')">
              <svg><use href="#icon-trash"></use></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  openCustomerModal(custId = null) {
    document.getElementById('customerForm').reset();
    if (custId) {
      const c = this.customers.find(x => x.id === custId);
      if (!c) return;
      document.getElementById('custId').value = c.id;
      document.getElementById('custNumber').value = c.customerNumber || '';
      document.getElementById('custType').value = c.type || 'private';
      document.getElementById('custCompany').value = c.companyName || '';
      document.getElementById('custFirstName').value = c.firstName || '';
      document.getElementById('custLastName').value = c.lastName || '';
      document.getElementById('custStreet').value = c.street || '';
      document.getElementById('custZip').value = c.zip || '';
      document.getElementById('custCity').value = c.city || '';
      document.getElementById('custPhone').value = c.phone || '';
      document.getElementById('custEmail').value = c.email || '';
      document.getElementById('custNotes').value = c.notes || '';
      this.currentCustomerVehicles = JSON.parse(JSON.stringify(c.vehicles || []));
    } else {
      document.getElementById('custId').value = '';
      document.getElementById('custNumber').value = `KD-${1001 + this.customers.length}`;
      this.currentCustomerVehicles = [{ id: 'v-' + Date.now(), makeModel: '', licensePlate: '', tireSpec: '' }];
    }
    this.renderCustomerVehiclesEditor();
    document.getElementById('modal-customer').classList.add('open');
  }

  addCustomerVehicleRow() {
    this.currentCustomerVehicles.push({
      id: 'v-' + Date.now(),
      makeModel: '',
      licensePlate: '',
      tireSpec: ''
    });
    this.renderCustomerVehiclesEditor();
  }

  removeCustomerVehicleRow(idx) {
    this.currentCustomerVehicles.splice(idx, 1);
    this.renderCustomerVehiclesEditor();
  }

  updateCustomerVehicleField(idx, field, val) {
    if (this.currentCustomerVehicles[idx]) {
      this.currentCustomerVehicles[idx][field] = val;
    }
  }

  renderCustomerVehiclesEditor() {
    const wrap = document.getElementById('custVehiclesContainer');
    wrap.innerHTML = this.currentCustomerVehicles.map((v, idx) => `
      <div style="display:grid; grid-template-columns: 1.3fr 1fr 1.2fr auto; gap:6px; align-items:center;">
        <input type="text" class="form-control" placeholder="Fahrzeug (z.B. VW Golf 8)" value="${this.escapeHTML(v.makeModel)}" oninput="app.updateCustomerVehicleField(${idx}, 'makeModel', this.value)" />
        <input type="text" class="form-control" placeholder="Kennz. (M-AB 123)" value="${this.escapeHTML(v.licensePlate)}" oninput="app.updateCustomerVehicleField(${idx}, 'licensePlate', this.value)" />
        <input type="text" class="form-control" placeholder="Reifengröße / LK" value="${this.escapeHTML(v.tireSpec)}" oninput="app.updateCustomerVehicleField(${idx}, 'tireSpec', this.value)" />
        <button type="button" class="btn btn-ghost btn-icon" onclick="app.removeCustomerVehicleRow(${idx})">✕</button>
      </div>
    `).join('');
  }

  async saveCustomer(event) {
    event.preventDefault();
    const existingId = document.getElementById('custId').value;
    const id = existingId || ('cust-' + Date.now());
    const custData = {
      id,
      customerNumber: document.getElementById('custNumber').value.trim() || `KD-${Date.now().toString().slice(-4)}`,
      type: document.getElementById('custType').value,
      companyName: document.getElementById('custCompany').value.trim(),
      firstName: document.getElementById('custFirstName').value.trim(),
      lastName: document.getElementById('custLastName').value.trim(),
      street: document.getElementById('custStreet').value.trim(),
      zip: document.getElementById('custZip').value.trim(),
      city: document.getElementById('custCity').value.trim(),
      phone: document.getElementById('custPhone').value.trim(),
      email: document.getElementById('custEmail').value.trim(),
      notes: document.getElementById('custNotes').value.trim(),
      vehicles: this.currentCustomerVehicles.filter(v => v.makeModel || v.licensePlate),
      createdAt: new Date().toISOString()
    };

    await window.YKDB.put('customers', custData);
    await this.reloadAllData();
    this.closeModal('modal-customer');
    this.renderCustomers();
    this.showToast('✅ Kunde gespeichert!');
  }

  async deleteCustomer(custId) {
    if (!confirm('Kunden wirklich löschen?')) return;
    await window.YKDB.delete('customers', custId);
    await this.reloadAllData();
    this.renderCustomers();
    this.showToast('🗑️ Kunde gelöscht');
  }

  /* ==========================================================================
     TAB 4: LAGERORTE, STATISTIK & WARN-CENTER
     ========================================================================== */

  renderLocationsAndStats() {
    let totalPurchaseVal = 0;
    let totalSaleVal = 0;
    let totalUnits = 0;
    const allWarnings = [];
    const locationMap = {};

    this.inventory.forEach(item => {
      const q = Number(item.quantity) || 0;
      totalUnits += q;
      totalPurchaseVal += q * (Number(item.pricePurchase) || 0);
      totalSaleVal += q * (Number(item.priceSale) || 0);

      const warns = this.getItemWarnings(item);
      if (warns.length > 0) {
        allWarnings.push({ item, warns });
      }

      const hall = item.locHall || 'Unzugeordnet';
      const shelf = item.locShelf || 'Allgemein';
      if (!locationMap[hall]) locationMap[hall] = {};
      if (!locationMap[hall][shelf]) locationMap[hall][shelf] = [];
      locationMap[hall][shelf].push(item);
    });

    const kpiStrip = document.getElementById('dashboardKpiStrip');
    if (kpiStrip) {
      kpiStrip.innerHTML = `
        <div class="kpi-mini">
          <span class="kpi-mini-label">Gesamtbestand (Einheiten)</span>
          <span class="kpi-mini-val">${totalUnits} Stk.</span>
        </div>
        <div class="kpi-mini">
          <span class="kpi-mini-label">Lagerposten (Sätze/Artikel)</span>
          <span class="kpi-mini-val">${this.inventory.length}</span>
        </div>
        <div class="kpi-mini">
          <span class="kpi-mini-label">Einkaufswert (EK Gesamt)</span>
          <span class="kpi-mini-val">${totalPurchaseVal.toFixed(2).replace('.', ',')} €</span>
        </div>
        <div class="kpi-mini">
          <span class="kpi-mini-label">Verkaufswert (VK Gesamt)</span>
          <span class="kpi-mini-val" style="color:var(--accent);">${totalSaleVal.toFixed(2).replace('.', ',')} €</span>
        </div>
      `;
    }

    const warnContainer = document.getElementById('warningsListContainer');
    if (warnContainer) {
      if (allWarnings.length === 0) {
        warnContainer.innerHTML = `<div style="color:var(--status-ok); font-weight:600;">✅ Alles im grünen Bereich – keine kritischen Profiltiefen, alten DOTs oder Unterbestände.</div>`;
      } else {
        warnContainer.innerHTML = allWarnings.map(({ item, warns }) => `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid var(--border-subtle); gap:10px; flex-wrap:wrap;">
            <div>
              <div style="font-weight:700;">${this.escapeHTML(window.YKParser.getPrimaryHeadline(item))} (${this.escapeHTML(item.brand || item.rimBrand || '')})</div>
              <div style="font-size:0.76rem; color:var(--text-secondary);">📍 ${this.escapeHTML(window.YKParser.formatLocationBadge(item))}</div>
            </div>
            <div style="display:flex; gap:6px; align-items:center;">
              ${warns.map(w => `<span class="season-pill" style="background:var(--status-warn-bg); color:var(--status-warn);">${this.escapeHTML(w.text)}</span>`).join('')}
              <button class="btn btn-secondary btn-sm" onclick="app.openItemModal('${item.id}')">Prüfen</button>
            </div>
          </div>
        `).join('');
      }
    }

    const locTree = document.getElementById('locationsTreeContainer');
    if (locTree) {
      locTree.innerHTML = Object.keys(locationMap).sort().map(hall => {
        const shelves = locationMap[hall];
        return `
          <div style="margin-bottom:14px;">
            <div style="font-weight:800; color:var(--accent); font-size:0.95rem; margin-bottom:6px;">🏢 ${this.escapeHTML(hall)}</div>
            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:8px;">
              ${Object.keys(shelves).sort().map(shelf => `
                <div style="background:var(--bg-input); border:1px solid var(--border-subtle); border-radius:10px; padding:10px;">
                  <div style="font-weight:700; font-size:0.84rem; margin-bottom:6px;">🗄️ ${this.escapeHTML(shelf)} (${shelves[shelf].length} Posten)</div>
                  ${shelves[shelf].map(it => `
                    <div style="font-size:0.78rem; padding:4px 0; border-top:1px solid var(--border-subtle); display:flex; justify-content:space-between;">
                      <span><strong>${this.escapeHTML(it.locSlot || '–')}:</strong> ${this.escapeHTML(window.YKParser.getPrimaryHeadline(it))}</span>
                      <span style="color:var(--accent); font-weight:700;">${it.quantity}x</span>
                    </div>
                  `).join('')}
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }).join('');
    }

    const histContainer = document.getElementById('historyListContainer');
    if (histContainer) {
      const recent = this.history.slice(0, 15);
      histContainer.innerHTML = recent.length === 0
        ? `<div style="color:var(--text-secondary); font-size:0.82rem;">Noch keine Buchungen protokolliert.</div>`
        : recent.map(h => `
          <div style="display:flex; justify-content:space-between; font-size:0.8rem; padding:6px 0; border-bottom:1px solid var(--border-subtle);">
            <span><strong>${this.escapeHTML(h.action)}:</strong> ${this.escapeHTML(h.itemTitle)}</span>
            <span style="color:var(--text-secondary);">${this.escapeHTML(h.deltaStr)} · ${new Date(h.timestamp).toLocaleString('de-DE')}</span>
          </div>
        `).join('');
    }
  }

  /* ==========================================================================
     TAB 5: FIRMENDATEN (YK-LOGO), DIENSTLEISTUNGSKATALOG & BACKUP
     ========================================================================== */

  renderSettings() {
    const c = this.company;
    document.getElementById('compName').value = c.companyName || '';
    document.getElementById('compOwner').value = c.ownerName || '';
    document.getElementById('compStreet').value = c.street || '';
    document.getElementById('compZip').value = c.zip || '';
    document.getElementById('compCity').value = c.city || '';
    document.getElementById('compPhone').value = c.phone || '';
    document.getElementById('compEmail').value = c.email || '';
    document.getElementById('compWebsite').value = c.website || '';
    document.getElementById('compTaxNumber').value = c.taxNumber || '';
    document.getElementById('compVatId').value = c.vatId || '';
    document.getElementById('compTaxMode').value = c.taxMode || 'regular';
    document.getElementById('compQuotePrefix').value = c.quotePrefix || 'ANG-2026-';
    document.getElementById('compBank').value = c.bankName || '';
    document.getElementById('compIban').value = c.iban || '';
    document.getElementById('compBic').value = c.bic || '';
    document.getElementById('compPaymentTerms').value = c.paymentTerms || '';
    document.getElementById('compQuoteIntro').value = c.quoteIntroText || '';
    document.getElementById('compQuoteFooter').value = c.quoteFooterText || '';

    const srvContainer = document.getElementById('servicesCatalogContainer');
    if (srvContainer) {
      srvContainer.innerHTML = `
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:8px;">
          ${this.services.map(srv => `
            <div style="background:var(--bg-input); border:1px solid var(--border-subtle); border-radius:10px; padding:10px; display:flex; justify-content:space-between; align-items:center; gap:8px;">
              <div>
                <div style="font-size:0.68rem; color:var(--accent); font-weight:700; text-transform:uppercase;">${this.escapeHTML(srv.category)}</div>
                <div style="font-weight:700; font-size:0.85rem;">${this.escapeHTML(srv.title)}</div>
                <div style="font-size:0.76rem; color:var(--text-secondary);">${Number(srv.priceGross).toFixed(2).replace('.', ',')} € / ${this.escapeHTML(srv.unit)} (Std.: ${srv.defaultQty}x)</div>
              </div>
              <div style="display:flex; gap:4px;">
                <button class="btn btn-ghost btn-sm btn-icon" onclick="app.openServiceModal('${srv.id}')"><svg><use href="#icon-edit"></use></svg></button>
                <button class="btn btn-ghost btn-sm btn-icon" onclick="app.deleteService('${srv.id}')"><svg><use href="#icon-trash"></use></svg></button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }
  }

  async onUploadCompanyLogo(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const dataUrl = await window.YKCompressImage(file, 500, 0.85);
    this.company.logoDataUrl = dataUrl;
    await window.YKDB.put('settings', this.company);
    this.applyCompanyBranding();
    this.showToast('✅ Firmenlogo aktualisiert');
  }

  async resetCompanyLogo() {
    this.company.logoDataUrl = 'assets/logo.jpg';
    await window.YKDB.put('settings', this.company);
    this.applyCompanyBranding();
    this.showToast('✅ Auf originales YK-Firmenlogo zurückgesetzt');
  }

  async saveCompanySettings(event) {
    event.preventDefault();
    this.company = {
      ...this.company,
      key: 'company',
      companyName: document.getElementById('compName').value.trim(),
      ownerName: document.getElementById('compOwner').value.trim(),
      street: document.getElementById('compStreet').value.trim(),
      zip: document.getElementById('compZip').value.trim(),
      city: document.getElementById('compCity').value.trim(),
      phone: document.getElementById('compPhone').value.trim(),
      email: document.getElementById('compEmail').value.trim(),
      website: document.getElementById('compWebsite').value.trim(),
      taxNumber: document.getElementById('compTaxNumber').value.trim(),
      vatId: document.getElementById('compVatId').value.trim(),
      taxMode: document.getElementById('compTaxMode').value,
      quotePrefix: document.getElementById('compQuotePrefix').value.trim(),
      bankName: document.getElementById('compBank').value.trim(),
      iban: document.getElementById('compIban').value.trim(),
      bic: document.getElementById('compBic').value.trim(),
      paymentTerms: document.getElementById('compPaymentTerms').value.trim(),
      quoteIntroText: document.getElementById('compQuoteIntro').value.trim(),
      quoteFooterText: document.getElementById('compQuoteFooter').value.trim()
    };
    await window.YKDB.put('settings', this.company);
    this.applyCompanyBranding();
    this.showToast('💾 Firmendaten gespeichert!');
  }

  openServiceModal(srvId = null) {
    document.getElementById('serviceForm').reset();
    if (srvId) {
      const srv = this.services.find(x => x.id === srvId);
      if (!srv) return;
      document.getElementById('srvId').value = srv.id;
      document.getElementById('srvCategory').value = srv.category || 'Montage & Wechsel';
      document.getElementById('srvTitle').value = srv.title || '';
      document.getElementById('srvDesc').value = srv.description || '';
      document.getElementById('srvUnit').value = srv.unit || 'Stück';
      document.getElementById('srvDefaultQty').value = srv.defaultQty || 4;
      document.getElementById('srvPriceGross').value = srv.priceGross || 0;
    } else {
      document.getElementById('srvId').value = '';
    }
    document.getElementById('modal-service').classList.add('open');
  }

  async saveService(event) {
    event.preventDefault();
    const existingId = document.getElementById('srvId').value;
    const id = existingId || ('srv-' + Date.now());
    const priceGross = parseFloat(document.getElementById('srvPriceGross').value) || 0;
    const srvData = {
      id,
      category: document.getElementById('srvCategory').value,
      title: document.getElementById('srvTitle').value.trim(),
      description: document.getElementById('srvDesc').value.trim(),
      unit: document.getElementById('srvUnit').value.trim() || 'Stück',
      defaultQty: Number(document.getElementById('srvDefaultQty').value) || 1,
      priceGross,
      priceNet: Math.round((priceGross / 1.19) * 100) / 100
    };
    await window.YKDB.put('services', srvData);
    await this.reloadAllData();
    this.closeModal('modal-service');
    this.renderSettings();
    this.showToast('✅ Dienstleistung gespeichert');
  }

  async deleteService(srvId) {
    if (!confirm('Dienstleistung aus dem Katalog löschen?')) return;
    await window.YKDB.delete('services', srvId);
    await this.reloadAllData();
    this.renderSettings();
  }

  /* ==========================================================================
     CSV-EXPORT & JSON-KOMPLETT-BACKUP
     ========================================================================== */

  exportInventoryCSV() {
    const headers = [
      'Artikel-Nr.', 'Kategorie', 'Marke', 'Modell', 'Größe/Spezifikation',
      'Reifenbreite', 'Querschnitt', 'Zoll', 'Traglast', 'Speed', 'DOT', 'Profiltiefe (mm)',
      'Felgenbreite (J)', 'ET', 'Lochkreis', 'Mittenloch', 'KBA-Nr.',
      'Bestand (Stk.)', 'Lagerort', 'Zustand', 'EK (€)', 'VK (€)'
    ];
    const rows = this.inventory.map(it => {
      const tread = window.YKParser.analyzeTread(it);
      return [
        it.sku || '',
        it.category || '',
        it.brand || it.rimBrand || '',
        it.model || it.rimModel || '',
        window.YKParser.getPrimaryHeadline(it),
        it.tireWidth || '',
        it.tireAspect || '',
        it.tireDiameter || it.rimDiameter || '',
        it.loadIndex || '',
        it.speedIndex || '',
        it.dot || '',
        tread.hasValue ? tread.avg : '',
        it.rimWidth || '',
        it.rimEt ?? '',
        it.rimPcd || '',
        it.rimCenterBore || '',
        it.kbaNumber || '',
        it.quantity ?? 0,
        window.YKParser.formatLocationBadge(it),
        it.condition || '',
        (Number(it.pricePurchase) || 0).toFixed(2).replace('.', ','),
        (Number(it.priceSale) || 0).toFixed(2).replace('.', ',')
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(';');
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `YK_Lagerbestand_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast('📊 CSV-Bestandsliste für Excel exportiert');
  }

  async exportJSONBackup() {
    const backup = await window.YKDB.exportFullBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `YK_Komplett_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast('📦 Komplett-Backup (.json) heruntergeladen');
  }

  async importJSONBackup(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      await window.YKDB.importFullBackup(parsed);
      await this.reloadAllData();
      this.applyCompanyBranding();
      this.renderAll();
      this.showToast('✅ Backup erfolgreich wiederhergestellt!');
    } catch (err) {
      alert('Fehler beim Importieren der Backup-Datei: ' + err.message);
    }
  }

  async confirmResetDemoData() {
    if (!confirm('Möchtest du alle Daten auf den ursprünglichen Beispiel-Datenbestand zurücksetzen?')) return;
    await window.YKDB.resetDemoData();
    await this.reloadAllData();
    this.applyCompanyBranding();
    this.renderAll();
    this.showToast('🔄 Beispieldaten wiederhergestellt');
  }

  /* ==========================================================================
     HILFSFUNKTIONEN
     ========================================================================== */

  viewPhotoLightbox(itemId) {
    const item = this.inventory.find(x => x.id === itemId);
    if (!item || !Array.isArray(item.photos) || item.photos.length === 0) return;
    document.getElementById('printModalTitle').textContent = `📷 Fotos: ${window.YKParser.getPrimaryHeadline(item)}`;
    document.getElementById('printModalBody').innerHTML = `
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:12px;">
        ${item.photos.map(src => `<img src="${src}" style="width:100%; border-radius:12px; border:1px solid rgba(255,255,255,0.2);" alt="Artikel-Foto" />`).join('')}
      </div>
    `;
    document.getElementById('modal-print').classList.add('open');
  }

  closeModal(modalId) {
    document.getElementById(modalId)?.classList.remove('open');
  }

  formatDateDE(isoDate) {
    if (!isoDate) return '–';
    const parts = String(isoDate).split('-');
    if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
    return isoDate;
  }

  escapeHTML(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  showToast(msg) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => {
      el.remove();
    }, 2800);
  }
}

const app = new YKReifenApp();
window.app = app;
window.addEventListener('DOMContentLoaded', () => app.init());
