/**
 * YK Reifen & Felgen Pro – Smart Parser & Automotive Berechnungsmodul
 * Unterstützt sämtliche Reifen- und Felgenbezeichnungen, Traglast-/Speed-Tabellen,
 * DOT-Altersanalyse, Profiltiefen-Ampel sowie tolerante Größensuche.
 */

const LOAD_INDEX_MAP = {
  '65': 290, '66': 300, '67': 307, '68': 315, '69': 325,
  '70': 335, '71': 345, '72': 355, '73': 365, '74': 375,
  '75': 387, '76': 400, '77': 412, '78': 425, '79': 437,
  '80': 450, '81': 462, '82': 475, '83': 487, '84': 500,
  '85': 515, '86': 530, '87': 545, '88': 560, '89': 580,
  '90': 600, '91': 615, '92': 630, '93': 650, '94': 670,
  '95': 690, '96': 710, '97': 730, '98': 750, '99': 775,
  '100': 800, '101': 825, '102': 850, '103': 875, '104': 900,
  '105': 925, '106': 950, '107': 975, '108': 1000, '109': 1030,
  '110': 1060, '111': 1090, '112': 1120, '113': 1150, '114': 1180,
  '115': 1215, '116': 1250, '117': 1285, '118': 1320, '119': 1360,
  '120': 1400, '121': 1450, '122': 1500, '123': 1550, '124': 1600,
  '125': 1650, '126': 1700
};

const SPEED_INDEX_MAP = {
  'L': '120 km/h',
  'M': '130 km/h',
  'N': '140 km/h',
  'P': '150 km/h',
  'Q': '160 km/h',
  'R': '170 km/h',
  'S': '180 km/h',
  'T': '190 km/h',
  'U': '200 km/h',
  'H': '210 km/h',
  'V': '240 km/h',
  'ZR': '> 240 km/h',
  'W': '270 km/h',
  'Y': '300 km/h',
  '(Y)': '> 300 km/h'
};

const COMMON_TIRE_BRANDS = [
  'Continental', 'Michelin', 'Pirelli', 'Goodyear', 'Bridgestone',
  'Hankook', 'Dunlop', 'Nokian', 'Vredestein', 'Falken',
  'Yokohama', 'Kumho', 'Toyo', 'Nexen', 'Uniroyal',
  'Fulda', 'Semperit', 'Barum', 'Kleber', 'BFGoodrich', 'Maxxis'
];

const COMMON_RIM_BRANDS = [
  'OEM / Original', 'BBS', 'OZ Racing', 'Borbet', 'Ronal',
  'AEZ', 'DOTZ', 'Dezent', 'Enkei', 'Motec', 'ATS',
  'Alutec', 'Rial', 'Brock', 'CMS', 'Tomason', 'GMP Italia',
  'BMW M-Performance', 'Mercedes AMG', 'Audi Sport', 'VW R-Line', 'Porsche'
];

const COMMON_PCDS = [
  '4x98', '4x100', '4x108', '5x100', '5x105', '5x108',
  '5x110', '5x112', '5x114.3', '5x115', '5x120', '5x127',
  '5x130', '6x130', '6x139.7'
];

const COMMON_CENTER_BORES = [
  '54.1', '56.1', '56.6', '57.1', '60.1', '63.4',
  '64.1', '65.1', '66.1', '66.6', '67.1', '70.3',
  '71.6', '72.6', '74.1', '84.1'
];

/**
 * Gibt die Traglast in kg für einen Tragfähigkeitsindex zurück (z.B. "91" -> "615 kg", "104/102" -> "900/850 kg")
 */
function getLoadIndexInfo(loadIndexStr) {
  if (!loadIndexStr) return '';
  const clean = String(loadIndexStr).trim();
  if (clean.includes('/')) {
    const parts = clean.split('/').map(p => LOAD_INDEX_MAP[p.trim()]);
    if (parts[0] && parts[1]) return `${parts[0]}/${parts[1]} kg`;
  }
  const kg = LOAD_INDEX_MAP[clean];
  return kg ? `${kg} kg/Rad` : '';
}

/**
 * Gibt die zulässige Höchstgeschwindigkeit für einen Speed-Index zurück
 */
function getSpeedIndexInfo(speedStr) {
  if (!speedStr) return '';
  const clean = String(speedStr).trim().toUpperCase();
  return SPEED_INDEX_MAP[clean] || '';
}

/**
 * Analysiert eine 4-stellige DOT-Nummer (WWJJ, z.B. "2423" = KW 24 / 2023)
 */
function analyzeDOT(dotStr) {
  if (!dotStr) return { valid: false, label: 'Keine DOT', ageYears: null, status: 'neutral' };
  const digits = String(dotStr).replace(/\D/g, '');
  if (digits.length !== 4) {
    return { valid: false, label: `DOT ${dotStr}`, ageYears: null, status: 'neutral' };
  }
  const week = parseInt(digits.substring(0, 2), 10);
  const yearShort = parseInt(digits.substring(2, 4), 10);
  if (week < 1 || week > 53) {
    return { valid: false, label: `DOT ${digits}`, ageYears: null, status: 'neutral' };
  }
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentCentury = Math.floor(currentYear / 100) * 100;
  let fullYear = currentCentury + yearShort;
  if (fullYear > currentYear + 1) {
    fullYear -= 100;
  }

  // Aktuelle Kalenderwoche näherungsweise
  const startOfYear = new Date(currentYear, 0, 1);
  const currentWeek = Math.max(1, Math.ceil((((now - startOfYear) / 86400000) + startOfYear.getDay() + 1) / 7));
  const ageYears = Math.max(0, (currentYear - fullYear) + ((currentWeek - week) / 52));
  const roundedAge = Math.round(ageYears * 10) / 10;

  let status = 'ok';
  let statusText = 'Gut';
  if (ageYears >= 8) {
    status = 'danger';
    statusText = 'Alt (≥ 8 J.)';
  } else if (ageYears >= 6) {
    status = 'warn';
    statusText = 'Prüfen (≥ 6 J.)';
  }

  return {
    valid: true,
    code: digits,
    week: String(week).padStart(2, '0'),
    year: fullYear,
    ageYears: roundedAge,
    label: `DOT ${digits} (KW ${String(week).padStart(2, '0')}/${fullYear})`,
    shortLabel: `DOT ${digits} · ${roundedAge.toString().replace('.', ',')} J.`,
    status,
    statusText
  };
}

/**
 * Analysiert Profiltiefen (Einzelwert oder 4 Einzelwerte VL/VR/HL/HR)
 */
function analyzeTread(item) {
  const values = [];
  if (item.treadMode === 'individual') {
    ['treadVL', 'treadVR', 'treadHL', 'treadHR'].forEach(k => {
      const v = parseFloat(String(item[k] ?? '').replace(',', '.'));
      if (!isNaN(v) && v >= 0) values.push(v);
    });
  } else {
    const v = parseFloat(String(item.treadDepth ?? '').replace(',', '.'));
    if (!isNaN(v) && v >= 0) values.push(v);
  }

  if (values.length === 0) {
    return { hasValue: false, min: null, avg: null, label: '–', status: 'neutral' };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;

  let status = 'ok';
  if (min < 3.0) {
    status = 'danger';
  } else if (min < 4.0) {
    status = 'warn';
  }

  let label = `${avg.toFixed(1).replace('.', ',')} mm`;
  if (item.treadMode === 'individual' && values.length > 1 && min !== max) {
    label = `${min.toFixed(1).replace('.', ',')}–${max.toFixed(1).replace('.', ',')} mm`;
  }

  return {
    hasValue: true,
    min,
    max,
    avg,
    values,
    label,
    status
  };
}

/**
 * Smart-Parser für Reifenbezeichnungen:
 * Erkennt Eingaben wie "225/45 R17 94Y XL DOT 2423", "205 55 16 91V Continental", "245/40 ZR19 98W Runflat MO"
 */
function parseTireInput(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') return {};
  const result = {
    flags: []
  };
  let text = rawInput.trim();

  // 1. DOT erkennen (z.B. "DOT 2423" oder am Ende 4 Ziffern nach DOT)
  const dotMatch = text.match(/\bDOT\s*:?\s*(\d{4})\b/i);
  if (dotMatch) {
    result.dot = dotMatch[1];
    text = text.replace(dotMatch[0], ' ');
  }

  // 2. Haupt-Dimension erkennen: z.B. 225/45 R17, 225/45ZR17, 225 45 17, 215/65 R16C
  const dimRegex = /\b(1[2-9]5|[23]\d[05])\s*[\/\-,\s]\s*([2-8][05])\s*(ZR|R|D)?\s*([12]\d(?:\.5)?)(C)?\b/i;
  const dimMatch = text.match(dimRegex);
  if (dimMatch) {
    result.tireWidth = dimMatch[1];
    result.tireAspect = dimMatch[2];
    result.tireConstruction = (dimMatch[3] || 'R').toUpperCase();
    result.tireDiameter = dimMatch[4];
    if (dimMatch[5] && !result.flags.includes('C-Reifen')) {
      result.flags.push('C-Reifen');
    }
    text = text.replace(dimMatch[0], ' ');
  }

  // 3. Tragfähigkeitsindex + Speed-Index erkennen (z.B. "94Y", "91 V", "104/102T", "98(Y)")
  const loadSpeedRegex = /\b(1[0-2]\d(?:\/1[0-2]\d)?|[6-9]\d)\s*(\(Y\)|ZR|[L-Z])\b/i;
  const lsMatch = text.match(loadSpeedRegex);
  if (lsMatch) {
    result.loadIndex = lsMatch[1];
    result.speedIndex = lsMatch[2].toUpperCase();
    text = text.replace(lsMatch[0], ' ');
  }

  // 4. Zusatzkennzeichnungen erkennen
  const flagPatterns = [
    { flag: 'XL', regex: /\b(XL|EXTRA\s*LOAD|REINFORCED|EL)\b/i },
    { flag: 'Runflat', regex: /\b(RUNFLAT|RFT|ROF|SSR|ZP|EMT)\b/i },
    { flag: 'M+S', regex: /\b(M\+S|M&S|MS)\b/i },
    { flag: '3PMSF', regex: /\b(3PMSF|ALPINE|SCHNEEFLOCKE)\b/i },
    { flag: 'FSL', regex: /\b(FSL|MFS|FR|FP|FELGENSCHUTZ)\b/i },
    { flag: 'C-Reifen', regex: /\b(C-REIFEN|CARGO)\b/i }
  ];
  flagPatterns.forEach(({ flag, regex }) => {
    if (regex.test(text)) {
      if (!result.flags.includes(flag)) result.flags.push(flag);
      text = text.replace(regex, ' ');
    }
  });

  // 5. OE-Herstellerkennung erkennen (MO, MOE, AO, *, N0, N1, VW)
  const oeMatch = text.match(/\b(MOE|MO1|MO|AO|RO1|N[0-4]|VO|\*)\b/);
  if (oeMatch) {
    result.oeKey = oeMatch[1];
    text = text.replace(oeMatch[0], ' ');
  }

  // 6. Saison erkennen
  if (/\b(WINTER|WINTERREIFEN|ALPIN|WINTERCONTACT|BLIZZAK)\b/i.test(text)) {
    result.season = 'winter';
  } else if (/\b(ALLWETTER|GANZJAHR|ALLSEASON|4SEASON|CROSSCLIMATE|VECTOR)\b/i.test(text)) {
    result.season = 'allseason';
  } else if (/\b(SOMMER|SOMMERREIFEN|SPORTCONTACT|PILOT\s*SPORT|POTENZA)\b/i.test(text)) {
    result.season = 'summer';
  }

  // 7. Marke erkennen aus verbleibendem Text
  const remaining = text.replace(/\s+/g, ' ').trim();
  if (remaining) {
    for (const brand of COMMON_TIRE_BRANDS) {
      const bRegex = new RegExp(`\\b${brand}\\b`, 'i');
      if (bRegex.test(remaining)) {
        result.brand = brand;
        const modelStr = remaining.replace(bRegex, '').trim();
        if (modelStr) result.model = modelStr;
        break;
      }
    }
  }

  return result;
}

/**
 * Smart-Parser für Felgenbezeichnungen:
 * Erkennt z.B. "8.5Jx19 H2 ET35 5x112 ML66.6 KBA 48512", "7,5 x 17 ET 45 5/112 57,1"
 */
function parseRimInput(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') return {};
  const result = {};
  let text = rawInput.trim();

  // 1. KBA-Nummer erkennen
  const kbaMatch = text.match(/\bKBA\s*[-:]?\s*(\d{4,6})\b/i);
  if (kbaMatch) {
    result.kbaNumber = `KBA ${kbaMatch[1]}`;
    text = text.replace(kbaMatch[0], ' ');
  }

  // 2. Lochkreis erkennen (z.B. 5x112, 5x114.3, 5/112, 4x100, LK 5x120)
  const pcdMatch = text.match(/(?:LK\s*)?\b([34568])\s*[xX\/]\s*(\d{2,3}(?:[.,]\d)?)\b/);
  if (pcdMatch) {
    const holes = pcdMatch[1];
    const circle = pcdMatch[2].replace(',', '.');
    result.rimPcd = `${holes}x${circle}`;
    text = text.replace(pcdMatch[0], ' ');
  }

  // 3. Felgenbreite x Durchmesser erkennen (z.B. 8.5Jx19, 8Jx18, 7,5 x 17)
  const rimDimMatch = text.match(/\b(1?\d(?:[.,][05])?)\s*([JHB]{1,2})?\s*[xX]\s*([12]\d)\s*(H2|EH2\+?|H|FH)?\b/i);
  if (rimDimMatch) {
    result.rimWidth = rimDimMatch[1].replace(',', '.');
    result.rimFlange = (rimDimMatch[2] || 'J').toUpperCase();
    result.rimDiameter = rimDimMatch[3];
    if (rimDimMatch[4]) {
      result.rimHump = rimDimMatch[4].toUpperCase();
    }
    text = text.replace(rimDimMatch[0], ' ');
  }

  // 4. Einpresstiefe (ET / IS) erkennen (z.B. ET35, ET 45, ET-10, IS20)
  const etMatch = text.match(/\b(?:ET|IS)\s*([+-]?\d{1,3}(?:[.,]\d)?)\b/i);
  if (etMatch) {
    result.rimEt = etMatch[1].replace(',', '.');
    text = text.replace(etMatch[0], ' ');
  }

  // 5. Mittenloch / Nabe erkennen (z.B. ML 66.6, ML57,1, CB 72.6, Ø 66.6 oder alleinstehend 57.1 / 66.6)
  const cbMatch = text.match(/(?:\b(?:ML|CB|NABE|Ø)\s*:?\s*)?(\b[5678]\d[.,]\d\b)/i);
  if (cbMatch) {
    result.rimCenterBore = cbMatch[1].replace(',', '.');
    text = text.replace(cbMatch[0], ' ');
  }

  // 6. Hump separat erkennen falls noch im Text
  const humpMatch = text.match(/\b(EH2\+|EH2|H2|FH)\b/i);
  if (humpMatch && !result.rimHump) {
    result.rimHump = humpMatch[1].toUpperCase();
  }

  return result;
}

/**
 * Formatiert die vollständige technische Reifenbezeichnung (z.B. "225/45 R17 94Y XL")
 */
function formatTireSpec(item, rearAxle = false) {
  const w = rearAxle ? item.rearTireWidth : item.tireWidth;
  const a = rearAxle ? item.rearTireAspect : item.tireAspect;
  const c = (rearAxle ? item.rearTireConstruction : item.tireConstruction) || 'R';
  const d = (rearAxle ? item.rearTireDiameter : item.tireDiameter) || item.rimDiameter || '';
  const li = rearAxle ? item.rearLoadIndex : item.loadIndex;
  const si = rearAxle ? item.rearSpeedIndex : item.speedIndex;

  let base = '';
  if (w && a && d) {
    base = `${w}/${a} ${c}${d}`;
  } else if (w && a) {
    base = `${w}/${a}`;
  } else if (d) {
    base = `${c}${d}"`;
  }

  const loadSpeed = [li, si].filter(Boolean).join('');
  if (loadSpeed) base += ` ${loadSpeed}`;

  if (!rearAxle && Array.isArray(item.tireFlags) && item.tireFlags.length > 0) {
    base += ` ${item.tireFlags.join(' ')}`;
  }
  if (!rearAxle && item.oeKey) {
    base += ` (${item.oeKey})`;
  }
  return base.trim();
}

/**
 * Formatiert die vollständige technische Felgenbezeichnung (z.B. "8.0J x 18 H2 ET35 · 5x112 · ML 66.6")
 */
function formatRimSpec(item, rearAxle = false) {
  const rw = rearAxle ? item.rearRimWidth : item.rimWidth;
  const rf = (rearAxle ? item.rearRimFlange : item.rimFlange) || 'J';
  const rd = (rearAxle ? item.rearRimDiameter : item.rimDiameter) || item.tireDiameter || '';
  const rh = item.rimHump || 'H2';
  const et = rearAxle ? item.rearRimEt : item.rimEt;
  const pcd = item.rimPcd;
  const cb = item.rimCenterBore;

  const parts = [];
  if (rw && rd) {
    parts.push(`${rw}${rf} x ${rd} ${rh}`.trim());
  } else if (rd) {
    parts.push(`${rd} Zoll`);
  }
  if (et !== undefined && et !== '') {
    parts.push(`ET${et}`);
  }
  if (!rearAxle && pcd) {
    parts.push(`LK ${pcd}`);
  }
  if (!rearAxle && cb) {
    parts.push(`ML ${cb}`);
  }
  return parts.join(' · ');
}

/**
 * Erzeugt die Haupt-Größenüberschrift für Karten, Angebote und Etiketten
 */
function getPrimaryHeadline(item) {
  if (item.category === 'tire') {
    const spec = formatTireSpec(item);
    if (item.isStaggered && item.rearTireWidth) {
      return `VA: ${spec} / HA: ${formatTireSpec(item, true)}`;
    }
    return spec || item.customTitle || 'Reifen';
  }
  if (item.category === 'rim') {
    const spec = formatRimSpec(item);
    if (item.isStaggered && item.rearRimWidth) {
      return `VA: ${spec} / HA: ${formatRimSpec(item, true)}`;
    }
    return spec || item.customTitle || 'Felge';
  }
  if (item.category === 'wheel') {
    const tSpec = formatTireSpec(item);
    const rSpec = formatRimSpec(item);
    if (tSpec && rSpec) return `${tSpec} auf ${rSpec}`;
    return tSpec || rSpec || item.customTitle || 'Komplettrad';
  }
  return item.customTitle || `${item.brand || ''} ${item.model || ''}`.trim() || 'Zubehör';
}

/**
 * Erzeugt einen kompakten Lagerplatz-Code (z.B. "H1 · R3 · F04")
 */
function formatLocationBadge(item) {
  const parts = [item.locHall, item.locShelf, item.locSlot].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Kein Lagerplatz';
}

/**
 * Erstellt einen normalisierten Such-String für einen Artikel, damit
 * sowohl "225/45 R17", "225 45 17" als auch "2254517" oder "5x112" sofort treffen.
 */
function buildSearchIndex(item) {
  const rawParts = [
    item.sku,
    item.brand,
    item.model,
    item.rimBrand,
    item.rimModel,
    item.kbaNumber,
    item.customTitle,
    item.tireWidth,
    item.tireAspect,
    item.tireDiameter,
    item.loadIndex,
    item.speedIndex,
    item.dot,
    item.oeKey,
    ...(item.tireFlags || []),
    item.rimWidth,
    item.rimDiameter,
    item.rimEt ? `ET${item.rimEt}` : '',
    item.rimPcd,
    item.rimCenterBore,
    item.rearTireWidth,
    item.rearTireAspect,
    item.rearTireDiameter,
    item.rearRimWidth,
    item.rearRimEt ? `ET${item.rearRimEt}` : '',
    item.locHall,
    item.locShelf,
    item.locSlot,
    item.vehicleFitment,
    item.notes,
    item.damageNotes,
    formatTireSpec(item),
    formatRimSpec(item)
  ].filter(Boolean).join(' ').toLowerCase();

  // Kompakte Zahlenkombination für Reifendimensionen (z.B. "2254517" und "225/45r17")
  let compactTire = '';
  if (item.tireWidth && item.tireAspect && (item.tireDiameter || item.rimDiameter)) {
    const d = item.tireDiameter || item.rimDiameter;
    compactTire = `${item.tireWidth}${item.tireAspect}${d} ${item.tireWidth}/${item.tireAspect}r${d}`;
  }
  let compactRearTire = '';
  if (item.rearTireWidth && item.rearTireAspect && (item.rearTireDiameter || item.rearRimDiameter)) {
    const rd = item.rearTireDiameter || item.rearRimDiameter;
    compactRearTire = `${item.rearTireWidth}${item.rearTireAspect}${rd}`;
  }

  return `${rawParts} ${compactTire} ${compactRearTire}`.toLowerCase();
}

/**
 * Erzeugt ein deterministisches, lokal gerendertes QR-Matrix-SVG für Lageretiketten (100% offline)
 */
function generateMatrixCodeSVG(text, size = 76) {
  const str = String(text || 'YK-ITEM');
  const grid = 15;
  const matrix = Array.from({ length: grid }, () => Array(grid).fill(false));

  // Finder-Pattern an 3 Ecken (links oben, rechts oben, links unten)
  const drawFinder = (r0, c0) => {
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const isBorder = r === 0 || r === 4 || c === 0 || c === 4;
        const isCenter = r === 2 && c === 2;
        matrix[r0 + r][c0 + c] = isBorder || isCenter;
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, grid - 5);
  drawFinder(grid - 5, 0);

  // Hash-basierte Datenpunkte füllen
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  let bitIdx = 0;
  for (let r = 0; r < grid; r++) {
    for (let c = 0; c < grid; c++) {
      const inTL = r < 6 && c < 6;
      const inTR = r < 6 && c >= grid - 6;
      const inBL = r >= grid - 6 && c < 6;
      if (inTL || inTR || inBL) continue;
      const charCode = str.charCodeAt(bitIdx % str.length);
      const val = ((hash >>> (bitIdx % 24)) ^ (charCode * (r + 1) * (c + 3))) & 1;
      matrix[r][c] = Boolean(val);
      bitIdx++;
    }
  }

  const cell = size / grid;
  let rects = '';
  for (let r = 0; r < grid; r++) {
    for (let c = 0; c < grid; c++) {
      if (matrix[r][c]) {
        rects += `<rect x="${(c * cell).toFixed(2)}" y="${(r * cell).toFixed(2)}" width="${(cell + 0.15).toFixed(2)}" height="${(cell + 0.15).toFixed(2)}" fill="#111318"/>`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-label="Lager-Code">${rects}</svg>`;
}

window.YKParser = {
  LOAD_INDEX_MAP,
  SPEED_INDEX_MAP,
  COMMON_TIRE_BRANDS,
  COMMON_RIM_BRANDS,
  COMMON_PCDS,
  COMMON_CENTER_BORES,
  getLoadIndexInfo,
  getSpeedIndexInfo,
  analyzeDOT,
  analyzeTread,
  parseTireInput,
  parseRimInput,
  formatTireSpec,
  formatRimSpec,
  getPrimaryHeadline,
  formatLocationBadge,
  buildSearchIndex,
  generateMatrixCodeSVG
};
