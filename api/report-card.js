// /api/report-card.js - Real Estate Report Card data aggregator
// Pulls from: Census ACS, Realtor.com (RapidAPI), FRED/FHFA
// Deploy to Vercel. Env vars: CENSUS_API_KEY, RAPIDAPI_KEY, FRED_API_KEY

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

// ===== STATE FIPS CODES =====
const STATE_FIPS = {
  AL:'01',AK:'02',AZ:'04',AR:'05',CA:'06',CO:'08',CT:'09',DE:'10',DC:'11',FL:'12',
  GA:'13',HI:'15',ID:'16',IL:'17',IN:'18',IA:'19',KS:'20',KY:'21',LA:'22',ME:'23',
  MD:'24',MA:'25',MI:'26',MN:'27',MS:'28',MO:'29',MT:'30',NE:'31',NV:'32',NH:'33',
  NJ:'34',NM:'35',NY:'36',NC:'37',ND:'38',OH:'39',OK:'40',OR:'41',PA:'42',RI:'44',
  SC:'45',SD:'46',TN:'47',TX:'48',UT:'49',VT:'50',VA:'51',WA:'53',WV:'54',WI:'55',WY:'56'
};

const STATE_ABBREVS = {};
Object.keys(STATE_FIPS).forEach(k => { STATE_ABBREVS[STATE_FIPS[k]] = k; });

const FRED_STATE_SERIES = {
  AL:'ALSTHPI',AK:'AKSTHPI',AZ:'AZSTHPI',AR:'ARSTHPI',CA:'CASTHPI',CO:'COSTHPI',
  CT:'CTSTHPI',DE:'DESTHPI',DC:'DCSTHPI',FL:'FLSTHPI',GA:'GASTHPI',HI:'HISTHPI',
  ID:'IDSTHPI',IL:'ILSTHPI',IN:'INSTHPI',IA:'IASTHPI',KS:'KSSTHPI',KY:'KYSTHPI',
  LA:'LASTHPI',ME:'MESTHPI',MD:'MDSTHPI',MA:'MASTHPI',MI:'MISTHPI',MN:'MNSTHPI',
  MS:'MSSTHPI',MO:'MOSTHPI',MT:'MTSTHPI',NE:'NESTHPI',NV:'NVSTHPI',NH:'NHSTHPI',
  NJ:'NJSTHPI',NM:'NMSTHPI',NY:'NYSTHPI',NC:'NCSTHPI',ND:'NDSTHPI',OH:'OHSTHPI',
  OK:'OKSTHPI',OR:'ORSTHPI',PA:'PASTHPI',RI:'RISTHPI',SC:'SCSTHPI',SD:'SDSTHPI',
  TN:'TNSTHPI',TX:'TXSTHPI',UT:'UTSTHPI',VT:'VTSTHPI',VA:'VASTHPI',WA:'WASTHPI',
  WV:'WVSTHPI',WI:'WISTHPI',WY:'WYSTHPI'
};

// ===== HELPER: Fetch with timeout =====
async function fetchWithTimeout(url, options = {}, timeout = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// ===== CENSUS ACS DATA =====
async function fetchCensusData(zip, censusKey) {
  // Try multiple ACS years in case latest isn't available
  const years = ['2023', '2022', '2021'];
  
  const coreVars = [
    'B01003_001E',  // total pop
    'B25003_001E',  // total occupied housing
    'B25003_002E',  // owner occupied
    'B25003_003E',  // renter occupied
    'B19013_001E',  // median household income
    'B25077_001E',  // median home value
    'B25064_001E'   // median gross rent
  ].join(',');

  const ageVars = [
    'B01001_007E','B01001_008E','B01001_009E','B01001_010E',
    'B01001_011E','B01001_012E','B01001_013E',
    'B01001_014E','B01001_015E',
    'B01001_016E','B01001_017E',
    'B01001_018E','B01001_019E','B01001_020E','B01001_021E','B01001_022E','B01001_023E','B01001_024E','B01001_025E',
    'B01001_031E','B01001_032E','B01001_033E','B01001_034E',
    'B01001_035E','B01001_036E','B01001_037E',
    'B01001_038E','B01001_039E',
    'B01001_040E','B01001_041E',
    'B01001_042E','B01001_043E','B01001_044E','B01001_045E','B01001_046E','B01001_047E','B01001_048E','B01001_049E'
  ].join(',');

  let coreData = null;
  let ageData = null;
  let usedYear = null;

  // Try each year for core data
  for (const year of years) {
    try {
      const url = `https://api.census.gov/data/${year}/acs/acs5?get=${coreVars}&for=zip%20code%20tabulation%20area:${zip}&key=${censusKey}`;
      const res = await fetchWithTimeout(url, {}, 12000);
      if (!res.ok) {
        console.error(`Census ${year} core: HTTP ${res.status}`);
        continue;
      }
      const text = await res.text();
      if (!text || text.includes('error')) {
        console.error(`Census ${year} core error response:`, text.substring(0, 200));
        continue;
      }
      const data = JSON.parse(text);
      if (data && data.length >= 2) {
        coreData = data;
        usedYear = year;
        break;
      }
    } catch (e) {
      console.error(`Census ${year} core error:`, e.message);
    }
  }

  if (!coreData) return { _error: 'Census core data unavailable for zip ' + zip };

  // Fetch age data separately (less critical)
  try {
    const url = `https://api.census.gov/data/${usedYear}/acs/acs5?get=${ageVars}&for=zip%20code%20tabulation%20area:${zip}&key=${censusKey}`;
    const res = await fetchWithTimeout(url, {}, 12000);
    if (res.ok) {
      const data = await res.json();
      if (data && data.length >= 2) ageData = data;
    }
  } catch (e) {
    console.error('Census age data error:', e.message);
  }

  // Parse core data
  const headers = coreData[0];
  const values = coreData[1];
  const obj = {};
  headers.forEach((h, i) => { obj[h] = parseInt(values[i]) || 0; });

  const totalPop = obj['B01003_001E'] || 0;
  const totalOccupied = obj['B25003_001E'] || 0;
  const ownerOccupied = obj['B25003_002E'] || 0;
  const renterOccupied = obj['B25003_003E'] || 0;
  const medianIncome = obj['B19013_001E'] || 0;
  const medianHomeValue = obj['B25077_001E'] || 0;
  const medianRent = obj['B25064_001E'] || 0;

  // Parse age data if available
  let demographics = null;
  if (ageData) {
    const aHeaders = ageData[0];
    const aValues = ageData[1];
    const aObj = {};
    aHeaders.forEach((h, i) => { aObj[h] = parseInt(aValues[i]) || 0; });

    const age18_26 = (aObj['B01001_007E']||0)+(aObj['B01001_008E']||0)+(aObj['B01001_009E']||0)+(aObj['B01001_010E']||0)
                   + (aObj['B01001_031E']||0)+(aObj['B01001_032E']||0)+(aObj['B01001_033E']||0)+(aObj['B01001_034E']||0);
    const age27_35 = (aObj['B01001_011E']||0)+(aObj['B01001_012E']||0)
                   + (aObj['B01001_035E']||0)+(aObj['B01001_036E']||0);
    const age36_44 = (aObj['B01001_013E']||0)+(aObj['B01001_014E']||0)
                   + (aObj['B01001_037E']||0)+(aObj['B01001_038E']||0);
    const age45_54 = (aObj['B01001_015E']||0)+(aObj['B01001_016E']||0)
                   + (aObj['B01001_039E']||0)+(aObj['B01001_040E']||0);
    const age55plus = (aObj['B01001_017E']||0)+(aObj['B01001_018E']||0)+(aObj['B01001_019E']||0)
                    + (aObj['B01001_020E']||0)+(aObj['B01001_021E']||0)+(aObj['B01001_022E']||0)
                    + (aObj['B01001_023E']||0)+(aObj['B01001_024E']||0)+(aObj['B01001_025E']||0)
                    + (aObj['B01001_041E']||0)+(aObj['B01001_042E']||0)+(aObj['B01001_043E']||0)
                    + (aObj['B01001_044E']||0)+(aObj['B01001_045E']||0)+(aObj['B01001_046E']||0)
                    + (aObj['B01001_047E']||0)+(aObj['B01001_048E']||0)+(aObj['B01001_049E']||0);

    demographics = { '18-26': age18_26, '27-35': age27_35, '36-44': age36_44, '45-54': age45_54, '55+': age55plus };
  }

  // Affordability index
  const monthlyPayment = medianHomeValue > 0 ? (medianHomeValue * 0.8) * (0.065 / 12) / (1 - Math.pow(1 + 0.065/12, -360)) : 0;
  const requiredIncome = monthlyPayment > 0 ? (monthlyPayment * 12) / 0.28 : 0;
  const affordabilityIndex = requiredIncome > 0 ? Math.round((medianIncome / requiredIncome) * 100) : 0;
  const renterAffordPct = affordabilityIndex >= 100 ? 15 : Math.max(3, Math.round(affordabilityIndex * 0.12));

  return {
    _year: usedYear,
    population: totalPop,
    totalHousing: totalOccupied,
    ownerOccupied,
    renterOccupied,
    ownerPct: totalOccupied > 0 ? Math.round((ownerOccupied / totalOccupied) * 100) : 0,
    renterPct: totalOccupied > 0 ? Math.round((renterOccupied / totalOccupied) * 100) : 0,
    medianIncome,
    medianHomeValue,
    medianRent,
    affordabilityIndex,
    renterAffordPct,
    demographics
  };
}

// ===== NATIONAL MEDIAN INCOME (for comparison) =====
async function fetchNationalIncome(censusKey) {
  const url = `https://api.census.gov/data/2022/acs/acs5?get=B19013_001E&for=us:1&key=${censusKey}`;
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return 80610; // fallback
    const data = await res.json();
    return parseInt(data[1][0]) || 80610;
  } catch (e) {
    return 80610; // fallback national median
  }
}

// ===== REALTOR.COM MARKET DATA =====
async function fetchRealtorData(zip, rapidApiKey) {
  try {
    const url = `https://realty-in-us.p.rapidapi.com/properties/v3/list`;
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RapidAPI-Key': rapidApiKey,
        'X-RapidAPI-Host': 'realty-in-us.p.rapidapi.com'
      },
      body: JSON.stringify({
        limit: 200,
        offset: 0,
        postal_code: zip,
        status: ['for_sale'],
        sort: { direction: 'desc', field: 'list_date' },
        results: ['total', 'properties.list_price', 'properties.list_date', 'properties.description.beds', 'properties.description.baths', 'properties.description.sqft', 'properties.location.address']
      })
    }, 15000);
    
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`Realtor API ${res.status}:`, errText.substring(0, 300));
      return { _error: `Realtor API HTTP ${res.status}` };
    }
    const raw = await res.text();
    let data;
    try { data = JSON.parse(raw); } catch (e) {
      console.error('Realtor parse error:', raw.substring(0, 300));
      return { _error: 'JSON parse failed' };
    }
    
    const totalListings = data?.data?.home_search?.total || 0;
    const properties = data?.data?.home_search?.properties || [];
    
    let prices = [];
    let doms = [];
    
    properties.forEach(p => {
      // Try multiple price field paths
      const price = p.list_price || p.price || p.description?.list_price || 0;
      if (price && price > 0) prices.push(price);
      
      // Try multiple date field paths
      const listDate = p.list_date || p.description?.list_date || null;
      if (listDate) {
        const dom = Math.floor((Date.now() - new Date(listDate).getTime()) / (1000*60*60*24));
        if (dom >= 0 && dom < 1000) doms.push(dom);
      }
    });

    const median = arr => {
      if (arr.length === 0) return null;
      const sorted = arr.slice().sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
    };

    return {
      activeListings: totalListings,
      medianListPrice: median(prices),
      medianDom: median(doms),
      newListings: doms.filter(d => d <= 5).length,
      sampleSize: properties.length,
      pricesFound: prices.length,
      domsFound: doms.length,
      _sampleProperty: properties[0] ? JSON.stringify(properties[0]).substring(0, 500) : null
    };
  } catch (e) {
    console.error('Realtor API error:', e.message);
    return { _error: e.message };
  }
}

// ===== FHFA APPRECIATION DATA =====
async function fetchAppreciation(stateCode, fredKey) {
  const seriesId = FRED_STATE_SERIES[stateCode];
  if (!seriesId) return null;

  try {
    // Get enough history for 10yr calculation
    const url = `${FRED_BASE}?series_id=${seriesId}&api_key=${fredKey}&file_type=json&sort_order=desc&observation_start=2010-01-01`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`FRED ${res.status}`);
    const data = await res.json();
    const obs = data.observations || [];
    if (obs.length < 2) return null;

    // Calculate annualized appreciation rates
    const latest = parseFloat(obs[0].value);
    const calcRate = (quartersBack) => {
      if (obs.length <= quartersBack) return null;
      const prev = parseFloat(obs[quartersBack].value);
      if (!prev) return null;
      const years = quartersBack / 4;
      return Math.round((Math.pow(latest / prev, 1 / years) - 1) * 10000) / 100;
    };

    // 5-year forecast based on historical trend
    const rate5yr = calcRate(20); // 5 years of quarters
    const rate10yr = calcRate(40); // 10 years
    const rate1yr = calcRate(4); // 1 year

    // Build 5-year forecast using average of 5yr and 1yr rates
    const forecastRate = rate5yr || rate1yr || 3.5;
    const forecast = [];
    // We don't have the actual home price for this zip, so we return rates
    // The frontend will apply them to the median home value

    return {
      oneYear: rate1yr,
      fiveYear: rate5yr,
      tenYear: rate10yr,
      forecastAnnualRate: Math.round(forecastRate * 100) / 100,
      latestHPI: latest,
      latestDate: obs[0].date,
      // Return quarterly history for chart
      history: obs.slice(0, 40).map(o => ({
        date: o.date,
        value: parseFloat(o.value)
      })).reverse()
    };
  } catch (e) {
    console.error('FHFA error:', e.message);
    return null;
  }
}

// ===== BUILDING & HOUSING (Census by ZIP) =====
async function fetchHousingSupply(zip, censusKey, stateFips) {
  const vars = [
    'B25034_002E','B25034_003E','B25034_004E',
    'B25001_001E','B25002_002E','B25002_003E',
    'B23025_003E','B23025_005E'
  ].join(',');

  const years = ['2023','2022','2021'];
  let result = null;

  // Zip-level ACS data
  for (const year of years) {
    try {
      const url = `https://api.census.gov/data/${year}/acs/acs5?get=${vars}&for=zip%20code%20tabulation%20area:${zip}&key=${censusKey}`;
      const res = await fetchWithTimeout(url, {}, 12000);
      if (!res.ok) continue;
      const data = await res.json();
      if (!data || data.length < 2) continue;

      const h = data[0];
      const v = data[1];
      const obj = {};
      h.forEach((k, i) => { obj[k] = parseInt(v[i]) || 0; });

      const totalUnits = obj['B25001_001E'] || 0;
      const occupied = obj['B25002_002E'] || 0;
      const vacant = obj['B25002_003E'] || 0;
      const builtRecent = obj['B25034_002E'] || 0;
      const built2010s = obj['B25034_003E'] || 0;
      const built2000s = obj['B25034_004E'] || 0;
      const laborForce = obj['B23025_003E'] || 0;
      const unemployed = obj['B23025_005E'] || 0;
      const unemploymentRate = laborForce > 0 ? Math.round((unemployed / laborForce) * 1000) / 10 : null;
      const vacancyRate = totalUnits > 0 ? Math.round((vacant / totalUnits) * 1000) / 10 : null;

      result = {
        totalUnits, occupied, vacant, vacancyRate,
        builtRecent, built2010s, built2000s,
        builtSource: 'Census ACS survey estimate',
        laborForce, unemployed, unemploymentRate,
        _year: year
      };
      break;
    } catch (e) {
      console.error(`Housing supply ${year} error:`, e.message);
    }
  }

  // Also try to get county-level building permits (more accurate)
  // Use Census geocoder to find county FIPS from zip
  try {
    const geoUrl = `https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=${zip}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;
    const geoRes = await fetchWithTimeout(geoUrl, {}, 8000);
    if (geoRes.ok) {
      const geoData = await geoRes.json();
      const match = geoData?.result?.addressMatches?.[0];
      const countyFips = match?.geographies?.Counties?.[0]?.GEOID;
      const countyName = match?.geographies?.Counties?.[0]?.BASENAME;

      if (countyFips && result) {
        result.countyFips = countyFips;
        result.countyName = countyName;

        // Pull county-level BPS data from ACS (actual permits data)
        // B25034 at county level is more robust than zip level
        try {
          const stFips = countyFips.substring(0, 2);
          const coFips = countyFips.substring(2, 5);
          const bpsUrl = `https://api.census.gov/data/2023/acs/acs5?get=B25034_002E,B25034_003E,B25034_004E,NAME&for=county:${coFips}&in=state:${stFips}&key=${censusKey}`;
          const bpsRes = await fetchWithTimeout(bpsUrl, {}, 8000);
          if (bpsRes.ok) {
            const bpsData = await bpsRes.json();
            if (bpsData && bpsData.length >= 2) {
              result.countyBuiltRecent = parseInt(bpsData[1][0]) || 0;
              result.countyBuilt2010s = parseInt(bpsData[1][1]) || 0;
              result.countyBuilt2000s = parseInt(bpsData[1][2]) || 0;
            }
          }
        } catch (e) {
          console.error('County BPS error:', e.message);
        }
      }
    }
  } catch (e) {
    console.error('Geocoder error:', e.message);
  }

  return result;
}

// ===== ZIP TO STATE LOOKUP =====
function zipToState(zip) {
  const z = parseInt(zip);
  // Common zip prefix ranges to state mapping
  const ranges = [
    [0,599,'CT'],[600,699,'CT'],[700,999,'MA'],[1000,2799,'MA'],[2800,2999,'RI'],
    [3000,3899,'NH'],[3900,4999,'ME'],[5000,5999,'VT'],[6000,6999,'CT'],
    [7000,8999,'NJ'],[10000,14999,'NY'],[15000,19699,'PA'],[19700,19999,'DE'],
    [20000,20599,'DC'],[20600,21999,'MD'],[22000,24699,'VA'],[24700,26899,'WV'],
    [27000,28999,'NC'],[29000,29999,'SC'],[30000,31999,'GA'],[32000,34999,'FL'],
    [35000,36999,'AL'],[37000,38599,'TN'],[38600,39799,'MS'],[40000,42799,'KY'],
    [43000,45999,'OH'],[46000,47999,'IN'],[48000,49999,'MI'],[50000,52899,'IA'],
    [53000,54999,'WI'],[55000,56799,'MN'],[57000,57799,'SD'],[58000,58899,'ND'],
    [59000,59999,'MT'],[60000,62999,'IL'],[63000,65899,'MO'],[66000,67999,'KS'],
    [68000,69399,'NE'],[70000,71499,'LA'],[71600,72999,'AR'],[73000,74999,'OK'],
    [75000,79999,'TX'],[80000,81699,'CO'],[82000,83199,'WY'],[83200,83899,'ID'],
    [84000,84799,'UT'],[85000,86599,'AZ'],[87000,88499,'NM'],[88900,89899,'NV'],
    [90000,96199,'CA'],[96700,96899,'HI'],[97000,97999,'OR'],[98000,99499,'WA'],
    [99500,99999,'AK']
  ];
  for (const [lo, hi, st] of ranges) {
    if (z >= lo && z <= hi) return st;
  }
  return 'OH'; // fallback
}

// ===== MAIN HANDLER =====
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { zip } = req.query;
  if (!zip || !/^\d{5}$/.test(zip)) {
    return res.status(400).json({ error: 'Valid 5-digit zip code required' });
  }

  const censusKey = process.env.CENSUS_API_KEY;
  const rapidApiKey = process.env.RAPIDAPI_KEY;
  const fredKey = process.env.FRED_API_KEY;

  if (!censusKey) return res.status(500).json({ error: 'CENSUS_API_KEY not configured' });
  if (!fredKey) return res.status(500).json({ error: 'FRED_API_KEY not configured' });

  const stateCode = zipToState(zip);
  const stateFips = STATE_FIPS[stateCode] || '39'; // default OH

  // Fetch all data sources in parallel
  const [census, nationalIncome, realtor, appreciation, housing] = await Promise.all([
    fetchCensusData(zip, censusKey),
    fetchNationalIncome(censusKey),
    rapidApiKey ? fetchRealtorData(zip, rapidApiKey) : null,
    fetchAppreciation(stateCode, fredKey),
    fetchHousingSupply(zip, censusKey, stateFips)
  ]);

  // Calculate affordability trend from HPI history + income
  let affordabilityHistory = null;
  if (appreciation?.history && census?.medianIncome) {
    const currentHPI = appreciation.history[appreciation.history.length - 1]?.value;
    const currentPrice = census.medianHomeValue || 373000;
    const income = census.medianIncome;
    affordabilityHistory = appreciation.history.filter((_, i) => i % 4 === 0).map(pt => {
      const ratio = currentHPI > 0 ? pt.value / currentHPI : 1;
      const estimatedPrice = currentPrice * ratio;
      const monthlyPmt = (estimatedPrice * 0.8) * (0.065 / 12) / (1 - Math.pow(1 + 0.065 / 12, -360));
      const reqIncome = (monthlyPmt * 12) / 0.28;
      const idx = reqIncome > 0 ? Math.round((income / reqIncome) * 100) : 0;
      return { date: pt.date, index: idx };
    });
  }

  // Build response
  const result = {
    zip,
    state: stateCode,
    stateFips,
    censusYear: census?._year || null,

    // Demographics & Housing
    population: census?.population || null,
    medianIncome: census?.medianIncome || null,
    nationalMedianIncome: nationalIncome,
    medianHomeValue: census?.medianHomeValue || null,
    medianRent: census?.medianRent || null,
    totalHousing: census?.totalHousing || null,
    ownerOccupied: census?.ownerOccupied || null,
    renterOccupied: census?.renterOccupied || null,
    ownerPct: census?.ownerPct || null,
    renterPct: census?.renterPct || null,
    affordabilityIndex: census?.affordabilityIndex || null,
    affordabilityHistory: affordabilityHistory,
    renterAffordPct: census?.renterAffordPct || null,
    demographics: census?.demographics || null,

    // Market Data (Realtor.com)
    activeListings: realtor?.activeListings || null,
    medianListPrice: realtor?.medianListPrice || null,
    medianDom: realtor?.medianDom || null,
    newListings: realtor?.newListings || null,

    // Appreciation (FHFA)
    appreciation: appreciation ? {
      oneYear: appreciation.oneYear,
      fiveYear: appreciation.fiveYear,
      tenYear: appreciation.tenYear,
      forecastAnnualRate: appreciation.forecastAnnualRate,
      history: appreciation.history
    } : null,

    // Housing Supply (zip level)
    housingSupply: housing ? {
      totalUnits: housing.totalUnits,
      occupied: housing.occupied,
      vacant: housing.vacant,
      vacancyRate: housing.vacancyRate,
      builtRecent: housing.builtRecent,
      built2010s: housing.built2010s,
      built2000s: housing.built2000s,
      builtSource: housing.builtSource,
      countyName: housing.countyName || null,
      countyBuiltRecent: housing.countyBuiltRecent || null,
      countyBuilt2010s: housing.countyBuilt2010s || null,
      countyBuilt2000s: housing.countyBuilt2000s || null
    } : null,

    // Employment (zip level)
    employment: housing ? {
      laborForce: housing.laborForce,
      unemployed: housing.unemployed,
      unemploymentRate: housing.unemploymentRate
    } : null,

    // Debug info (remove later)
    _debug: {
      censusError: census?._error || null,
      realtorError: realtor?._error || null,
      housingYear: housing?._year || null,
      realtorPricesFound: realtor?.pricesFound || 0,
      realtorDomsFound: realtor?.domsFound || 0,
      realtorSample: realtor?._sampleProperty || null,
      countyName: housing?.countyName || null
    },

    fetchedAt: new Date().toISOString()
  };

  return res.status(200).json(result);
}
