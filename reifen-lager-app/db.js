/**
 * YK Reifen & Felgen Pro – Lokale Dual-Storage Datenbankschicht (IndexedDB + LocalStorage Auto-Sync)
 * Garantiert, dass jede Änderung (Anlegen, Bearbeiten, Löschen, Bestandsbuchung) sofort
 * dauerhaft auf dem Smartphone gespeichert wird – auch beim direkten Öffnen aus WhatsApp / lokalen Dateien.
 */

const DB_NAME = 'YKReifenLagerDB';
const DB_VERSION = 1;
const LS_PREFIX = 'YK_REIFEN_PRO_V1_';
const STORES = ['inventory', 'quotes', 'customers', 'services', 'settings', 'history'];

const DEFAULT_COMPANY_SETTINGS = {
  key: 'company',
  companyName: 'YK Reifen & Felgen Performance',
  ownerName: 'Y. K.',
  street: 'Industriestraße 24',
  zip: '80939',
  city: 'München',
  phone: '+49 170 1234567',
  email: 'info@yk-reifen.de',
  website: 'www.yk-reifen.de',
  taxNumber: '143/123/45678',
  vatId: 'DE123456789',
  taxMode: 'regular', // 'regular' (19% MwSt.) | 'kleinunternehmer' (§ 19 UStG) | 'diff' (§ 25a UStG)
  vatRate: 19,
  bankName: 'Sparkasse',
  iban: 'DE89 3704 0044 0532 0130 00',
  bic: 'COBADEFFXXX',
  paymentTerms: 'Zahlbar sofort bei Abholung oder Montage in bar, per EC-Karte oder Überweisung.',
  quotePrefix: 'ANG-2026-',
  nextQuoteNum: 103,
  quoteIntroText: 'Vielen Dank für Ihre Anfrage. Gerne unterbreiten wir Ihnen folgendes freibleibendes Angebot für Reifen, Felgen und Werkstattleistungen:',
  quoteFooterText: 'Alle angebotenen Reifen und Felgen wurden fachmännisch geprüft. Dieses Angebot ist 14 Tage gültig. Wir freuen uns auf Ihren Auftrag!',
  logoDataUrl: window.YK_EMBEDDED_LOGO || 'assets/logo.jpg',
  accentTheme: 'orange', // 'orange' (#FF6B00) | 'gold' (#D4AF37) | 'yellow' (#FFB800)
  defaultHalls: ['Halle 1', 'Halle 2', 'Kellerlager', 'Container A', 'Verkaufsraum']
};

const DEFAULT_SERVICES = [
  {
    id: 'srv-radwechsel',
    category: 'Montage & Wechsel',
    title: 'Radwechsel am Fahrzeug (Satz 4 Kompletträder umstecken)',
    description: 'Demontage, Montage am Fahrzeug, Luftdruckprüfung & Anziehen mit Drehmoment',
    unit: 'Satz (4 Stk.)',
    defaultQty: 1,
    priceNet: 29.41,
    priceGross: 35.00
  },
  {
    id: 'srv-montage-stahl',
    category: 'Montage & Wechsel',
    title: 'Reifenmontage & Auswuchten auf Stahlfelge (bis 17 Zoll)',
    description: 'Reifen ab-/aufziehen, neues Gummiventil & elektronisches Auswuchten',
    unit: 'Stück',
    defaultQty: 4,
    priceNet: 12.61,
    priceGross: 15.00
  },
  {
    id: 'srv-montage-alu-17',
    category: 'Montage & Wechsel',
    title: 'Reifenmontage & Auswuchten auf Alufelge (bis 17 Zoll)',
    description: 'Schonende Montage auf Leichtmetallfelge inkl. Klebegewichten & Auswuchten',
    unit: 'Stück',
    defaultQty: 4,
    priceNet: 15.97,
    priceGross: 19.00
  },
  {
    id: 'srv-montage-alu-18',
    category: 'Montage & Wechsel',
    title: 'Reifenmontage & Auswuchten auf Alufelge (18 bis 20 Zoll)',
    description: 'Montage für große Leichtmetallfelgen inkl. schwarzen/silbernen Klebegewichten',
    unit: 'Stück',
    defaultQty: 4,
    priceNet: 19.33,
    priceGross: 23.00
  },
  {
    id: 'srv-montage-runflat',
    category: 'Montage & Wechsel',
    title: 'Zuschlag Runflat- / UHP-Niederquerschnitt-Montage',
    description: 'Mehraufwand für verstärkte Seitenwand (RFT / SSR / ROF) oder Querschnitt ≤ 35',
    unit: 'Stück',
    defaultQty: 4,
    priceNet: 5.04,
    priceGross: 6.00
  },
  {
    id: 'srv-wuchten-einzeln',
    category: 'Auswuchten & Ventile',
    title: 'Räder elektronisch auswuchten (inkl. Gewichte)',
    description: 'Feinwuchten bestehender Kompletträder inkl. Klebe- oder Schlaggewichten',
    unit: 'Stück',
    defaultQty: 4,
    priceNet: 8.40,
    priceGross: 10.00
  },
  {
    id: 'srv-ventil-metall',
    category: 'Auswuchten & Ventile',
    title: 'Metall-/Aluventil Hochgeschwindigkeit (schwarz/silber)',
    description: 'Hochwertiges Schraubventil für Alufelgen',
    unit: 'Stück',
    defaultQty: 4,
    priceNet: 4.20,
    priceGross: 5.00
  },
  {
    id: 'srv-rdks-service',
    category: 'Auswuchten & Ventile',
    title: 'RDKS / TPMS-Sensoren prüfen, programmieren & anlernen',
    description: 'Diagnose der Reifendrucksensoren und Anlernen am Fahrzeugsteuergerät',
    unit: 'Satz (4 Stk.)',
    defaultQty: 1,
    priceNet: 21.01,
    priceGross: 25.00
  },
  {
    id: 'srv-entsorgung-pkw',
    category: 'Entsorgung',
    title: 'Altreifen-Entsorgung PKW (ohne Felge)',
    description: 'Fachgerechte und zertifizierte Altreifenentsorgung',
    unit: 'Stück',
    defaultQty: 4,
    priceNet: 3.78,
    priceGross: 4.50
  },
  {
    id: 'srv-entsorgung-suv',
    category: 'Entsorgung',
    title: 'Altreifen-Entsorgung SUV / Transporter / C-Reifen',
    description: 'Fachgerechte Entsorgung für Groß- und Transporterreifen',
    unit: 'Stück',
    defaultQty: 4,
    priceNet: 5.46,
    priceGross: 6.50
  },
  {
    id: 'srv-einlagerung-std',
    category: 'Einlagerung & Pflege',
    title: 'Räder-Einlagerung (1 Saison / 4 Räder)',
    description: 'Fachgerechte Lagerung im Reifenhotel inkl. Profiltiefen- & Sichtprüfung',
    unit: 'Satz / Saison',
    defaultQty: 1,
    priceNet: 37.82,
    priceGross: 45.00
  },
  {
    id: 'srv-einlagerung-komfort',
    category: 'Einlagerung & Pflege',
    title: 'Komfort-Einlagerung inkl. Räderwäsche & Wuchtprüfung',
    description: 'Saison-Einlagerung (4 Räder) inkl. schonender Felgen-/Reifenreinigung',
    unit: 'Satz / Saison',
    defaultQty: 1,
    priceNet: 54.62,
    priceGross: 65.00
  },
  {
    id: 'srv-raederwaesche',
    category: 'Einlagerung & Pflege',
    title: 'Professionelle Felgen- & Räderwäsche (Satz 4 Stück)',
    description: 'Reinigung von Bremsstaub, Salz und Verschmutzungen vor Lagerung/Montage',
    unit: 'Satz (4 Stk.)',
    defaultQty: 1,
    priceNet: 21.01,
    priceGross: 25.00
  },
  {
    id: 'srv-reparatur',
    category: 'Reparatur & Sonstiges',
    title: 'Reifenreparatur (Vulkanisieren / Kombi-Reparaturkörper)',
    description: 'Fachgerechte Instandsetzung eines Laufflächen-Stichschadens inkl. Wuchten',
    unit: 'Stück',
    defaultQty: 1,
    priceNet: 29.41,
    priceGross: 35.00
  },
  {
    id: 'srv-versand',
    category: 'Reparatur & Sonstiges',
    title: 'Versand & Spezialverpackung (Satz 4 Reifen / Kompletträder)',
    description: 'Versicherter Speditions-/Paketversand inkl. Kartonage & Kantenschutz',
    unit: 'Pauschal',
    defaultQty: 1,
    priceNet: 49.58,
    priceGross: 59.00
  }
];

const SEED_INVENTORY = [
  {
    id: 'inv-101',
    sku: 'YK-R-001',
    category: 'tire',
    brand: 'Continental',
    model: 'WinterContact TS 870 P',
    season: 'winter',
    tireWidth: '225',
    tireAspect: '45',
    tireConstruction: 'R',
    tireDiameter: '18',
    loadIndex: '95',
    speedIndex: 'V',
    dot: '3624',
    treadMode: 'individual',
    treadDepth: '7.8',
    treadVL: '8.0',
    treadVR: '8.0',
    treadHL: '7.6',
    treadHR: '7.6',
    tireFlags: ['XL', 'M+S', '3PMSF', 'FSL'],
    oeKey: 'MO',
    euFuel: 'C',
    euWet: 'B',
    euNoise: '70',
    isStaggered: false,
    quantity: 4,
    minStock: 4,
    unit: 'Stück',
    condition: 'neuwertig',
    damageNotes: 'Kaum gefahren (ca. 2.500 km), gleichmäßiges Laufbild ohne Schäden.',
    locHall: 'Halle 1',
    locShelf: 'Regal A',
    locSlot: 'Fach 02',
    pricePurchase: 95.00,
    priceSale: 139.00,
    vehicleFitment: 'Mercedes C-Klasse W205/W206, BMW 3er G20, Audi A4',
    notes: 'Top-Winterreifensatz mit Felgenschutzrippe',
    photos: [],
    createdAt: '2026-10-15T10:00:00Z',
    updatedAt: '2026-10-28T14:30:00Z'
  },
  {
    id: 'inv-102',
    sku: 'YK-K-002',
    category: 'wheel',
    brand: 'Michelin',
    model: 'Pilot Sport 4S',
    season: 'summer',
    tireWidth: '225',
    tireAspect: '40',
    tireConstruction: 'ZR',
    tireDiameter: '19',
    loadIndex: '93',
    speedIndex: 'Y',
    dot: '1823',
    treadMode: 'individual',
    treadDepth: '6.5',
    treadVL: '6.8',
    treadVR: '6.7',
    treadHL: '6.1',
    treadHR: '6.2',
    tireFlags: ['XL', 'FSL'],
    oeKey: '*',
    isStaggered: true,
    rearTireWidth: '255',
    rearTireAspect: '35',
    rearTireConstruction: 'ZR',
    rearTireDiameter: '19',
    rearLoadIndex: '96',
    rearSpeedIndex: 'Y',
    rimType: 'alu',
    rimBrand: 'BMW M-Performance',
    rimModel: 'Styling M791 Doppelspeiche',
    kbaNumber: 'OEM 8089892 / 8089893',
    rimWidth: '8.0',
    rimFlange: 'J',
    rimDiameter: '19',
    rimHump: 'EH2+',
    rimEt: '27',
    rimPcd: '5x112',
    rimCenterBore: '66.6',
    rearRimWidth: '8.5',
    rearRimFlange: 'J',
    rearRimDiameter: '19',
    rearRimEt: '40',
    rimColor: 'Schwarz Hochglanz / Bicolor',
    tpmsType: 'active',
    hasCenterCaps: true,
    hasBolts: false,
    quantity: 4,
    minStock: 4,
    unit: 'Stück',
    condition: 'gut',
    damageNotes: 'Original RDKS-Sensoren verbaut. Alle 4 Felgen ohne Bordsteinschäden.',
    locHall: 'Halle 1',
    locShelf: 'Regal B',
    locSlot: 'Fach 01',
    pricePurchase: 1150.00,
    priceSale: 420.00,
    vehicleFitment: 'BMW 3er G20 / G21, BMW 4er G22 / G23',
    notes: 'Mischbereifung VA 225/40 R19 auf 8Jx19 ET27 / HA 255/35 R19 auf 8.5Jx19 ET40',
    photos: [],
    createdAt: '2026-10-18T09:15:00Z',
    updatedAt: '2026-10-29T11:20:00Z'
  },
  {
    id: 'inv-103',
    sku: 'YK-F-003',
    category: 'rim',
    brand: 'BBS',
    model: 'CH-R Motorsport',
    rimType: 'alu',
    rimBrand: 'BBS',
    rimModel: 'CH-R (CH104)',
    kbaNumber: 'KBA 47692',
    rimWidth: '8.5',
    rimFlange: 'J',
    rimDiameter: '19',
    rimHump: 'H2',
    rimEt: '48',
    rimPcd: '5x112',
    rimCenterBore: '57.1',
    rimColor: 'Satin Schwarz mit Edelstahl-Anfahrschutz',
    tpmsType: 'none',
    hasCenterCaps: true,
    hasBolts: true,
    isStaggered: false,
    quantity: 4,
    minStock: 4,
    unit: 'Stück',
    condition: 'neu',
    damageNotes: 'Originalverpackt inkl. BBS-Nabenkappen und Radschrauben-Kit.',
    locHall: 'Verkaufsraum',
    locShelf: 'Wanddisplay 1',
    locSlot: 'Platz A',
    pricePurchase: 290.00,
    priceSale: 389.00,
    vehicleFitment: 'VW Golf 7/8 GTI & R, Audi S3 8V/8Y, Cupra Leon, Skoda Octavia RS',
    notes: 'Mit ABE / Teilegutachten KBA 47692',
    photos: [],
    createdAt: '2026-10-20T16:00:00Z',
    updatedAt: '2026-10-30T08:00:00Z'
  },
  {
    id: 'inv-104',
    sku: 'YK-R-004',
    category: 'tire',
    brand: 'Goodyear',
    model: 'Vector 4Seasons Gen-3',
    season: 'allseason',
    tireWidth: '205',
    tireAspect: '55',
    tireConstruction: 'R',
    tireDiameter: '16',
    loadIndex: '94',
    speedIndex: 'V',
    dot: '4225',
    treadMode: 'single',
    treadDepth: '8.2',
    tireFlags: ['XL', 'M+S', '3PMSF'],
    oeKey: '',
    euFuel: 'B',
    euWet: 'B',
    euNoise: '70',
    isStaggered: false,
    quantity: 8,
    minStock: 4,
    unit: 'Stück',
    condition: 'neu',
    damageNotes: 'Neuware ab Lager',
    locHall: 'Halle 2',
    locShelf: 'Regal C',
    locSlot: 'Fach 05',
    pricePurchase: 68.00,
    priceSale: 98.50,
    vehicleFitment: 'VW Golf, Touran, Passat, Audi A3, Ford Focus, Skoda Octavia',
    notes: 'Bestseller Ganzjahresreifen mit Schneeflockensymbol (3PMSF)',
    photos: [],
    createdAt: '2026-10-22T12:00:00Z',
    updatedAt: '2026-10-30T15:00:00Z'
  },
  {
    id: 'inv-105',
    sku: 'YK-R-005',
    category: 'tire',
    brand: 'Pirelli',
    model: 'Sottozero 3 Winter',
    season: 'winter',
    tireWidth: '245',
    tireAspect: '45',
    tireConstruction: 'R',
    tireDiameter: '18',
    loadIndex: '100',
    speedIndex: 'V',
    dot: '3819',
    treadMode: 'individual',
    treadDepth: '3.4',
    treadVL: '3.6',
    treadVR: '3.5',
    treadHL: '3.2',
    treadHR: '3.3',
    tireFlags: ['XL', 'Runflat', 'M+S', '3PMSF'],
    oeKey: 'MOE',
    isStaggered: false,
    quantity: 2,
    minStock: 4,
    unit: 'Stück',
    condition: 'spuren',
    damageNotes: 'Restprofil knapp unter 4mm, DOT aus 2019 – als Übergangs- oder Exportreifen.',
    locHall: 'Kellerlager',
    locShelf: 'Regal D',
    locSlot: 'Fach 09',
    pricePurchase: 20.00,
    priceSale: 45.00,
    vehicleFitment: 'Mercedes E-Klasse W213, BMW 5er G30',
    notes: 'Hinweis: Unter Mindestbestand (2/4) & DOT > 6 Jahre',
    photos: [],
    createdAt: '2026-10-10T10:00:00Z',
    updatedAt: '2026-10-25T10:00:00Z'
  }
];

const SEED_CUSTOMERS = [
  {
    id: 'cust-101',
    customerNumber: 'KD-1001',
    type: 'private',
    companyName: '',
    firstName: 'Markus',
    lastName: 'Schneider',
    street: 'Leopoldstraße 88',
    zip: '80802',
    city: 'München',
    phone: '+49 171 9876543',
    email: 'm.schneider@example.de',
    vatId: '',
    notes: 'Stammkunde, bevorzugt Continental oder Michelin. Einlagerungskunde seit 2024.',
    vehicles: [
      {
        id: 'veh-1',
        makeModel: 'BMW 330i Touring (G21)',
        licensePlate: 'M-MS 330',
        tireSpec: '225/45 R18 · LK 5x112',
        vin: 'WBA6K510X0F123456'
      },
      {
        id: 'veh-2',
        makeModel: 'VW Golf 8 GTI',
        licensePlate: 'M-GT 888',
        tireSpec: '225/40 R18 · LK 5x112',
        vin: ''
      }
    ],
    createdAt: '2026-10-12T09:00:00Z'
  },
  {
    id: 'cust-102',
    customerNumber: 'KD-1002',
    type: 'business',
    companyName: 'Autohaus & Fuhrpark Weber GmbH',
    firstName: 'Thomas',
    lastName: 'Weber',
    street: 'Gewerbering 12',
    zip: '85748',
    city: 'Garching',
    phone: '+49 89 3216549',
    email: 'disposition@fuhrpark-weber.de',
    vatId: 'DE298765432',
    notes: 'B2B-Kunde (12 Flottenfahrzeuge). Benötigt regelmäßig Allwetter- und Winterreifen inkl. Montage.',
    vehicles: [
      {
        id: 'veh-3',
        makeModel: 'Mercedes-Benz C 220d T-Modell (W206)',
        licensePlate: 'M-FW 220',
        tireSpec: '225/45 R18 · LK 5x112',
        vin: ''
      }
    ],
    createdAt: '2026-10-14T11:30:00Z'
  }
];

const SEED_QUOTES = [
  {
    id: 'quo-101',
    quoteNumber: 'ANG-2026-101',
    docType: 'Angebot',
    status: 'open',
    date: '2026-10-30',
    validUntil: '2026-11-13',
    customerId: 'cust-101',
    customerSnapshot: {
      customerNumber: 'KD-1001',
      name: 'Markus Schneider',
      street: 'Leopoldstraße 88',
      zipCity: '80802 München',
      phone: '+49 171 9876543',
      email: 'm.schneider@example.de'
    },
    vehicleInfo: 'BMW 330i Touring (G21) · Kennzeichen: M-MS 330',
    items: [
      {
        id: 'qi-1',
        type: 'inventory',
        inventoryId: 'inv-101',
        title: 'Continental WinterContact TS 870 P · 225/45 R18 95V XL',
        subtitle: 'Winterreifen (M+S, 3PMSF, FSL, MO) · DOT 3624 · Profil 7,6–8,0 mm · Lager: Halle 1 · Regal A · Fach 02',
        qty: 4,
        unit: 'Stück',
        unitPriceGross: 139.00,
        discountPercent: 0
      },
      {
        id: 'qi-2',
        type: 'service',
        serviceId: 'srv-montage-alu-18',
        title: 'Reifenmontage & Auswuchten auf Alufelge (18 bis 20 Zoll)',
        subtitle: 'Schonende Montage inkl. schwarzen/silbernen Klebegewichten',
        qty: 4,
        unit: 'Stück',
        unitPriceGross: 23.00,
        discountPercent: 0
      },
      {
        id: 'qi-3',
        type: 'service',
        serviceId: 'srv-entsorgung-pkw',
        title: 'Altreifen-Entsorgung PKW (ohne Felge)',
        subtitle: 'Fachgerechte und zertifizierte Altreifenentsorgung',
        qty: 4,
        unit: 'Stück',
        unitPriceGross: 4.50,
        discountPercent: 0
      },
      {
        id: 'qi-4',
        type: 'service',
        serviceId: 'srv-einlagerung-std',
        title: 'Räder-Einlagerung (1 Saison / 4 Räder)',
        subtitle: 'Fachgerechte Lagerung der Sommerräder inkl. Sichtprüfung',
        qty: 1,
        unit: 'Satz / Saison',
        unitPriceGross: 45.00,
        discountPercent: 0
      }
    ],
    overallDiscountEuro: 0,
    taxMode: 'regular',
    vatRate: 19,
    notes: 'Inklusive RDKS-Funktionsprüfung und Einstellung des Reifendrucks nach Herstellervorgabe.',
    stockDeducted: false,
    createdAt: '2026-10-30T14:00:00Z'
  },
  {
    id: 'quo-102',
    quoteNumber: 'ANG-2026-102',
    docType: 'Auftragsbestätigung',
    status: 'accepted',
    date: '2026-10-31',
    validUntil: '2026-11-14',
    customerId: 'cust-102',
    customerSnapshot: {
      customerNumber: 'KD-1002',
      name: 'Autohaus & Fuhrpark Weber GmbH (z. Hd. Thomas Weber)',
      street: 'Gewerbering 12',
      zipCity: '85748 Garching',
      phone: '+49 89 3216549',
      email: 'disposition@fuhrpark-weber.de'
    },
    vehicleInfo: 'Mercedes-Benz C 220d T-Modell · Kennzeichen: M-FW 220',
    items: [
      {
        id: 'qi-5',
        type: 'inventory',
        inventoryId: 'inv-104',
        title: 'Goodyear Vector 4Seasons Gen-3 · 205/55 R16 94V XL',
        subtitle: 'Allwetterreifen (3PMSF, M+S) · DOT 4225 · Neuware (8,2 mm)',
        qty: 4,
        unit: 'Stück',
        unitPriceGross: 98.50,
        discountPercent: 5
      },
      {
        id: 'qi-6',
        type: 'service',
        serviceId: 'srv-montage-alu-17',
        title: 'Reifenmontage & Auswuchten auf Alufelge (bis 17 Zoll)',
        subtitle: 'Montage auf Leichtmetallfelge inkl. Klebegewichten & Auswuchten',
        qty: 4,
        unit: 'Stück',
        unitPriceGross: 19.00,
        discountPercent: 0
      }
    ],
    overallDiscountEuro: 0,
    taxMode: 'regular',
    vatRate: 19,
    notes: 'Montagetermin vereinbart für Dienstag, 09:30 Uhr.',
    stockDeducted: true,
    createdAt: '2026-10-31T10:15:00Z'
  }
];

class YKDatabase {
  constructor() {
    this.db = null;
    this.initialized = false;
  }

  getKeyField(storeName) {
    return storeName === 'settings' ? 'key' : 'id';
  }

  readLocalStore(storeName) {
    try {
      const raw = localStorage.getItem(LS_PREFIX + storeName);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  writeLocalStore(storeName, itemsArray) {
    try {
      localStorage.setItem(LS_PREFIX + storeName, JSON.stringify(itemsArray));
      localStorage.setItem(LS_PREFIX + 'lastSavedAt', new Date().toISOString());
      if (typeof window.onYKAutoSave === 'function') {
        window.onYKAutoSave();
      }
    } catch {
      // Falls LocalStorage-Quota durch viele Fotos voll ist, sichert IndexedDB weiter
    }
  }

  async init() {
    if (this.initialized) return;
    try {
      this.db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          STORES.forEach(st => {
            if (!db.objectStoreNames.contains(st)) {
              db.createObjectStore(st, { keyPath: this.getKeyField(st) });
            }
          });
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
      });
    } catch {
      this.db = null; // Fallback auf reinen LocalStorage (z.B. in eingeschränkten Datei-Viewern)
    }

    this.initialized = true;
    await this.ensureSeedData();
  }

  async ensureSeedData() {
    // Prüfe sowohl in IndexedDB als auch in LocalStorage, ob bereits initialisiert wurde
    const lsSeeded = localStorage.getItem(LS_PREFIX + 'seeded_v1') === 'true';
    const idbSeeded = await this._rawGet('settings', 'seeded_v1');

    if (!lsSeeded && !idbSeeded) {
      // Allererstes Öffnen der App überhaupt -> Grunddaten einmalig anlegen
      await this.put('settings', DEFAULT_COMPANY_SETTINGS);
      for (const srv of DEFAULT_SERVICES) await this.put('services', srv);
      for (const item of SEED_INVENTORY) await this.put('inventory', item);
      for (const c of SEED_CUSTOMERS) await this.put('customers', c);
      for (const q of SEED_QUOTES) await this.put('quotes', q);
      await this.put('settings', { key: 'seeded_v1', value: true });
      try { localStorage.setItem(LS_PREFIX + 'seeded_v1', 'true'); } catch {}
    } else {
      // Bereits initialisiert: Wenn der Nutzer Artikel/Kunden/Angebote löscht, bleiben sie dauerhaft gelöscht!
      try { localStorage.setItem(LS_PREFIX + 'seeded_v1', 'true'); } catch {}
      const company = await this.get('settings', 'company');
      if (!company) {
        await this.put('settings', DEFAULT_COMPANY_SETTINGS);
      }
    }
  }

  async _rawGetAll(storeName) {
    if (!this.db) return null;
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  async _rawGet(storeName, key) {
    if (!this.db) return null;
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  async getAll(storeName) {
    await this.init();
    const lsData = this.readLocalStore(storeName);
    const idbData = await this._rawGetAll(storeName);

    // Wenn LocalStorage bereits Daten hat (auch ein bewusst geleertes Array []), ist es synchron auf dem neuesten Stand
    if (lsData !== null) {
      return lsData;
    }
    if (idbData !== null) {
      this.writeLocalStore(storeName, idbData);
      return idbData;
    }
    return [];
  }

  async get(storeName, key) {
    await this.init();
    const keyField = this.getKeyField(storeName);
    const all = await this.getAll(storeName);
    const found = all.find(x => x && x[keyField] === key);
    if (found) return found;
    return await this._rawGet(storeName, key);
  }

  async put(storeName, data) {
    await this.init();
    const keyField = this.getKeyField(storeName);
    const current = await this.getAll(storeName);
    const idx = current.findIndex(x => x && x[keyField] === data[keyField]);
    if (idx >= 0) {
      current[idx] = data;
    } else {
      current.push(data);
    }
    this.writeLocalStore(storeName, current);

    if (this.db) {
      await new Promise((resolve) => {
        try {
          const tx = this.db.transaction(storeName, 'readwrite');
          const req = tx.objectStore(storeName).put(data);
          req.onsuccess = () => resolve(true);
          req.onerror = () => resolve(false);
        } catch {
          resolve(false);
        }
      });
    }
    return data[keyField];
  }

  async delete(storeName, key) {
    await this.init();
    const keyField = this.getKeyField(storeName);
    const current = await this.getAll(storeName);
    const filtered = current.filter(x => x && x[keyField] !== key);
    this.writeLocalStore(storeName, filtered);

    if (this.db) {
      await new Promise((resolve) => {
        try {
          const tx = this.db.transaction(storeName, 'readwrite');
          const req = tx.objectStore(storeName).delete(key);
          req.onsuccess = () => resolve(true);
          req.onerror = () => resolve(false);
        } catch {
          resolve(false);
        }
      });
    }
    return true;
  }

  async clear(storeName) {
    await this.init();
    this.writeLocalStore(storeName, []);
    if (this.db) {
      await new Promise((resolve) => {
        try {
          const tx = this.db.transaction(storeName, 'readwrite');
          const req = tx.objectStore(storeName).clear();
          req.onsuccess = () => resolve(true);
          req.onerror = () => resolve(false);
        } catch {
          resolve(false);
        }
      });
    }
    return true;
  }

  async resetDemoData() {
    for (const st of STORES) {
      await this.clear(st);
    }
    await this.put('settings', DEFAULT_COMPANY_SETTINGS);
    for (const srv of DEFAULT_SERVICES) await this.put('services', srv);
    for (const item of SEED_INVENTORY) await this.put('inventory', item);
    for (const c of SEED_CUSTOMERS) await this.put('customers', c);
    for (const q of SEED_QUOTES) await this.put('quotes', q);
    await this.put('settings', { key: 'seeded_v1', value: true });
    try { localStorage.setItem(LS_PREFIX + 'seeded_v1', 'true'); } catch {}
  }

  async logHistory(action, itemTitle, deltaStr, details = '') {
    const entry = {
      id: 'hist-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      timestamp: new Date().toISOString(),
      action,
      itemTitle,
      deltaStr,
      details
    };
    await this.put('history', entry);
    return entry;
  }

  async exportFullBackup() {
    const [inventory, quotes, customers, services, settings, history] = await Promise.all([
      this.getAll('inventory'),
      this.getAll('quotes'),
      this.getAll('customers'),
      this.getAll('services'),
      this.getAll('settings'),
      this.getAll('history')
    ]);
    return {
      app: 'YK-Reifen-Felgen-Pro',
      version: 1,
      exportedAt: new Date().toISOString(),
      data: { inventory, quotes, customers, services, settings, history }
    };
  }

  async importFullBackup(backupObj) {
    if (!backupObj || !backupObj.data) {
      throw new Error('Ungültige Backup-Datei');
    }
    const { inventory = [], quotes = [], customers = [], services = [], settings = [], history = [] } = backupObj.data;
    for (const st of STORES) await this.clear(st);
    for (const x of inventory) await this.put('inventory', x);
    for (const x of quotes) await this.put('quotes', x);
    for (const x of customers) await this.put('customers', x);
    for (const x of services) await this.put('services', x);
    for (const x of settings) await this.put('settings', x);
    for (const x of history) await this.put('history', x);
    await this.put('settings', { key: 'seeded_v1', value: true });
    try { localStorage.setItem(LS_PREFIX + 'seeded_v1', 'true'); } catch {}
  }
}

/**
 * Komprimiert ein Foto via Canvas auf Smartphone-freundliche Größe (JPEG DataURL)
 */
function compressImageFile(file, maxWidth = 900, quality = 0.76) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

window.YKDB = new YKDatabase();
window.YKCompressImage = compressImageFile;
window.DEFAULT_COMPANY_SETTINGS = DEFAULT_COMPANY_SETTINGS;
window.DEFAULT_SERVICES = DEFAULT_SERVICES;
