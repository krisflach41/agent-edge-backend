// /api/report-card.js - Neighborhood Blueprint data aggregator
// Data Sources: Census ACS, FRED/FHFA, Realtor.com (RapidAPI), Geocodio, BLS, HUD FMR,
//               Walk Score, FEMA NFHL, NCES CCD Schools, OpenStreetMap Parks
// Env vars: CENSUS_API_KEY, RAPIDAPI_KEY, FRED_API_KEY, GEOCODIO_API_KEY, BLS_API_KEY, HUD_API_KEY, WALKSCORE_API_KEY

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

// ===== GEOCODIO: Zip to City, County, State, FIPS, Lat/Lon =====
async function fetchGeoData(zip, geocodioKey) {
  try {
    const url = `https://api.geocod.io/v1.7/geocode?q=${zip}&api_key=${geocodioKey}&fields=census2020`;
    const res = await fetchWithTimeout(url, {}, 8000);
    if (!res.ok) {
      console.error('Geocodio HTTP ' + res.status);
      return null;
    }
    const data = await res.json();
    const result = data?.results?.[0];
    if (!result) return null;

    const comp = result.address_components || {};
    const loc = result.location || {};
    const census = result.fields?.census2020 || {};

    return {
      city: comp.city || '',
      county: comp.county || '',
      state: comp.state || '',
      stateCode: comp.state || '',
      latitude: loc.lat || null,
      longitude: loc.lng || null,
      countyFips: census.county_fips || null,
      stateFips: census.state_fips || null,
      fullFips: census.full_fips || null,
      source: 'Geocodio'
    };
  } catch (e) {
    console.error('Geocodio error:', e.message);
    return null;
  }
}

// ===== CENSUS ACS DATA =====
async function fetchCensusData(zip, censusKey) {
  const years = ['2023', '2022', '2021'];

  const coreVars = [
    'B01003_001E',  // total pop
    'B25003_001E',  // total occupied housing
    'B25003_002E',  // owner occupied
    'B25003_003E',  // renter occupied
    'B19013_001E',  // median household income
    'B25077_001E',  // median home value
    'B25064_001E',  // median gross rent
    'B25001_001E',  // total housing units
    'B25002_002E',  // occupied
    'B25002_003E'   // vacant
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

  for (const year of years) {
    try {
      const url = `https://api.census.gov/data/${year}/acs/acs5?get=${coreVars}&for=zip%20code%20tabulation%20area:${zip}&key=${censusKey}`;
      const res = await fetchWithTimeout(url, {}, 12000);
      if (!res.ok) continue;
      const text = await res.text();
      if (!text || text.includes('error')) continue;
      const data = JSON.parse(text);
      if (data && data.length >= 2) {
        coreData = data;
        usedYear = year;
        break;
      }
    } catch (e) {
      console.error('Census ' + year + ' error:', e.message);
    }
  }

  if (!coreData) return { _error: 'Census data unavailable for zip ' + zip };

  try {
    const url = `https://api.census.gov/data/${usedYear}/acs/acs5?get=${ageVars}&for=zip%20code%20tabulation%20area:${zip}&key=${censusKey}`;
    const res = await fetchWithTimeout(url, {}, 12000);
    if (res.ok) {
      const data = await res.json();
      if (data && data.length >= 2) ageData = data;
    }
  } catch (e) {
    console.error('Census age error:', e.message);
  }

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
  const totalUnits = obj['B25001_001E'] || 0;
  const occupied = obj['B25002_002E'] || 0;
  const vacant = obj['B25002_003E'] || 0;
  const vacancyRate = totalUnits > 0 ? Math.round((vacant / totalUnits) * 1000) / 10 : null;

  let demographics = null;
  if (ageData) {
    const aH = ageData[0];
    const aV = ageData[1];
    const aObj = {};
    aH.forEach((h, i) => { aObj[h] = parseInt(aV[i]) || 0; });

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

  const monthlyPayment = medianHomeValue > 0 ? (medianHomeValue * 0.8) * (0.065 / 12) / (1 - Math.pow(1 + 0.065/12, -360)) : 0;
  const requiredIncome = monthlyPayment > 0 ? (monthlyPayment * 12) / 0.28 : 0;
  const affordabilityIndex = requiredIncome > 0 ? Math.round((medianIncome / requiredIncome) * 100) : 0;
  const renterAffordPct = affordabilityIndex >= 100 ? 15 : Math.max(3, Math.round(affordabilityIndex * 0.12));

  return {
    _year: usedYear,
    population: totalPop,
    totalHousing: totalOccupied,
    totalUnits,
    occupied,
    vacant,
    vacancyRate,
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

// ===== NATIONAL MEDIAN INCOME =====
async function fetchNationalIncome(censusKey) {
  const url = `https://api.census.gov/data/2022/acs/acs5?get=B19013_001E&for=us:1&key=${censusKey}`;
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return 80610;
    const data = await res.json();
    return parseInt(data[1][0]) || 80610;
  } catch (e) {
    return 80610;
  }
}

// ===== REALTOR.COM MARKET DATA (fixed DOM) =====
async function fetchRealtorData(zip, rapidApiKey) {
  try {
    const url = 'https://realty-in-us.p.rapidapi.com/properties/v3/list';
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
        results: [
          'total',
          'properties.list_price',
          'properties.list_date',
          'properties.days_on_market',
          'properties.description.beds',
          'properties.description.baths',
          'properties.description.sqft',
          'properties.description.days_on_market',
          'properties.location.address'
        ]
      })
    }, 15000);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('Realtor API ' + res.status + ':', errText.substring(0, 300));
      return { _error: 'Realtor API HTTP ' + res.status };
    }
    const raw = await res.text();
    let data;
    try { data = JSON.parse(raw); } catch (e) {
      return { _error: 'JSON parse failed' };
    }

    const totalListings = data?.data?.home_search?.total || 0;
    const properties = data?.data?.home_search?.properties || [];

    let prices = [];
    let doms = [];

    properties.forEach(p => {
      const price = p.list_price || p.price || p.description?.list_price || 0;
      if (price && price > 0) prices.push(price);

      // Try actual DOM field first, then calculate from list_date
      const domValue = p.days_on_market || p.description?.days_on_market || null;
      if (domValue != null && domValue >= 0 && domValue < 1000) {
        doms.push(domValue);
      } else {
        const listDate = p.list_date || p.description?.list_date || null;
        if (listDate) {
          const dom = Math.floor((Date.now() - new Date(listDate).getTime()) / (1000*60*60*24));
          if (dom >= 0 && dom < 1000) doms.push(dom);
        }
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
      avgDom: doms.length > 0 ? Math.round(doms.reduce((a, b) => a + b, 0) / doms.length) : null,
      newListings: doms.filter(d => d <= 5).length,
      sampleSize: properties.length,
      pricesFound: prices.length,
      domsFound: doms.length,
      _source: 'Realtor.com via RapidAPI'
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
    const url = FRED_BASE + '?series_id=' + seriesId + '&api_key=' + fredKey + '&file_type=json&sort_order=desc&observation_start=2010-01-01';
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error('FRED ' + res.status);
    const data = await res.json();
    const obs = data.observations || [];
    if (obs.length < 2) return null;

    const latest = parseFloat(obs[0].value);
    const calcRate = (quartersBack) => {
      if (obs.length <= quartersBack) return null;
      const prev = parseFloat(obs[quartersBack].value);
      if (!prev) return null;
      const years = quartersBack / 4;
      return Math.round((Math.pow(latest / prev, 1 / years) - 1) * 10000) / 100;
    };

    const rate5yr = calcRate(20);
    const rate10yr = calcRate(40);
    const rate1yr = calcRate(4);
    const forecastRate = rate5yr || rate1yr || 3.5;

    return {
      oneYear: rate1yr,
      fiveYear: rate5yr,
      tenYear: rate10yr,
      forecastAnnualRate: Math.round(forecastRate * 100) / 100,
      latestHPI: latest,
      latestDate: obs[0].date,
      history: obs.slice(0, 40).map(o => ({
        date: o.date,
        value: parseFloat(o.value)
      })).reverse(),
      _source: 'FHFA House Price Index via FRED (state-level, quarterly)'
    };
  } catch (e) {
    console.error('FHFA error:', e.message);
    return null;
  }
}

// ===== HUD SOCDS BUILDING PERMITS (actual permits, not survey estimates) =====
async function fetchBuildingPermits(countyFips) {
  if (!countyFips) return null;

  try {
    // Query the HUD ArcGIS feature service for building permits by county
    const url = 'https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/Residential_Construction_Permits_by_County/FeatureServer/0/query?where=cnty%3D%27' + countyFips + '%27&outFields=*&orderByFields=year+DESC&resultRecordCount=10&f=json';
    const res = await fetchWithTimeout(url, {}, 10000);
    if (!res.ok) {
      console.error('HUD permits HTTP ' + res.status);
      return null;
    }
    const data = await res.json();
    const features = data?.features || [];

    if (features.length === 0) {
      // Try alternate field name
      const url2 = 'https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/Residential_Construction_Permits_by_County/FeatureServer/0/query?where=fips%3D%27' + countyFips + '%27&outFields=*&orderByFields=year+DESC&resultRecordCount=10&f=json';
      const res2 = await fetchWithTimeout(url2, {}, 10000);
      if (res2.ok) {
        const data2 = await res2.json();
        if (data2?.features?.length > 0) return processPermitData(data2.features);
      }
      return null;
    }

    return processPermitData(features);
  } catch (e) {
    console.error('HUD permits error:', e.message);
    return null;
  }
}

function processPermitData(features) {
  const years = {};
  features.forEach(f => {
    const a = f.attributes || f;
    const yr = a.year || a.Year || a.YEAR;
    if (yr) {
      years[yr] = {
        year: yr,
        singleFamily: a.units_1unit || a['1_unit_units'] || 0,
        total: a.total_units || a.totalunits || 0
      };
    }
  });

  const sorted = Object.values(years).sort((a, b) => b.year - a.year);

  let since2020 = 0, period2010s = 0, period2000s = 0;
  sorted.forEach(y => {
    if (y.year >= 2020) since2020 += y.total;
    else if (y.year >= 2010) period2010s += y.total;
    else if (y.year >= 2000) period2000s += y.total;
  });

  return {
    since2020,
    period2010s,
    period2000s,
    annualData: sorted.slice(0, 5),
    latestYear: sorted[0]?.year || null,
    latestTotal: sorted[0]?.total || 0,
    _source: 'Census Bureau Building Permits Survey via HUD SOCDS (actual permits issued)'
  };
}

// ===== BLS EMPLOYMENT DATA (monthly, county-level) =====
async function fetchBLSEmployment(countyFips, blsKey) {
  if (!countyFips || !blsKey) return null;

  try {
    const fips5 = countyFips.padStart(5, '0');
    const rateId = 'LAUCN' + fips5 + '0000000003';
    const unemployedId = 'LAUCN' + fips5 + '0000000004';
    const laborForceId = 'LAUCN' + fips5 + '0000000006';

    const currentYear = new Date().getFullYear();
    const startYear = currentYear - 2;

    const payload = {
      seriesid: [rateId, unemployedId, laborForceId],
      startyear: String(startYear),
      endyear: String(currentYear),
      registrationkey: blsKey
    };

    const res = await fetchWithTimeout('https://api.bls.gov/publicAPI/v2/timeseries/data/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }, 12000);

    if (!res.ok) {
      console.error('BLS HTTP ' + res.status);
      return null;
    }

    const data = await res.json();
    if (data.status !== 'REQUEST_SUCCEEDED') {
      console.error('BLS status:', data.status, data.message);
      return null;
    }

    const series = data.Results?.series || [];
    let rate = null, unemployed = null, laborForce = null;
    let monthlyTrend = [];

    series.forEach(s => {
      const latest = s.data?.[0];
      if (!latest) return;

      if (s.seriesID === rateId) {
        rate = parseFloat(latest.value);
        monthlyTrend = s.data.slice(0, 12).map(d => ({
          year: d.year,
          month: d.periodName,
          rate: parseFloat(d.value)
        })).reverse();
      }
      if (s.seriesID === unemployedId) unemployed = parseInt(latest.value);
      if (s.seriesID === laborForceId) laborForce = parseInt(latest.value);
    });

    return {
      unemploymentRate: rate,
      unemployed,
      laborForce,
      monthlyTrend,
      latestMonth: series[0]?.data?.[0]?.periodName || null,
      latestYear: series[0]?.data?.[0]?.year || null,
      _source: 'Bureau of Labor Statistics LAUS (county-level, monthly)'
    };
  } catch (e) {
    console.error('BLS error:', e.message);
    return null;
  }
}

// ===== HUD FAIR MARKET RENTS (by zip code, bedroom breakdown) =====
async function fetchHUDRents(zip, hudKey) {
  if (!hudKey) return null;

  try {
    const url = 'https://www.huduser.gov/hudapi/public/fmr/data/' + zip;
    const res = await fetchWithTimeout(url, {
      headers: { 'Authorization': 'Bearer ' + hudKey }
    }, 10000);

    if (!res.ok) {
      console.error('HUD FMR HTTP ' + res.status);
      return null;
    }

    const data = await res.json();
    const fmrData = data?.data;
    if (!fmrData) return null;

    const basicdata = fmrData.basicdata;
    let zipRents = null;
    let msaRents = null;

    if (Array.isArray(basicdata)) {
      basicdata.forEach(row => {
        if (row.zip_code === zip) zipRents = row;
        if (row.zip_code === 'MSA level') msaRents = row;
      });
    } else if (basicdata) {
      msaRents = basicdata;
    }

    const rents = zipRents || msaRents || basicdata;
    if (!rents) return null;

    return {
      efficiency: parseFloat(rents['Efficiency']) || null,
      oneBed: parseFloat(rents['One-Bedroom']) || null,
      twoBed: parseFloat(rents['Two-Bedroom']) || null,
      threeBed: parseFloat(rents['Three-Bedroom']) || null,
      fourBed: parseFloat(rents['Four-Bedroom']) || null,
      metroName: fmrData.metro_name || null,
      areaName: fmrData.area_name || null,
      year: fmrData.year || rents.year || null,
      isZipLevel: !!zipRents,
      _source: 'HUD Fair Market Rents (annual, ' + (zipRents ? 'zip-level' : 'metro-level') + ')'
    };
  } catch (e) {
    console.error('HUD FMR error:', e.message);
    return null;
  }
}

// ===== WALK SCORE API =====
async function fetchWalkScore(lat, lon, address, walkScoreKey) {
  if (!walkScoreKey || !lat || !lon) return null;

  try {
    const encoded = encodeURIComponent(address || `${lat},${lon}`);
    const url = `https://api.walkscore.com/score?format=json&address=${encoded}&lat=${lat}&lon=${lon}&transit=1&bike=1&wsapikey=${walkScoreKey}`;
    const res = await fetchWithTimeout(url, {}, 8000);
    if (!res.ok) {
      console.error('Walk Score HTTP ' + res.status);
      return null;
    }
    const data = await res.json();
    if (data.status !== 1) {
      console.error('Walk Score status:', data.status, data.description);
      return null;
    }

    const describeWalk = (s) => {
      if (s >= 90) return "Walker's Paradise";
      if (s >= 70) return 'Very Walkable';
      if (s >= 50) return 'Somewhat Walkable';
      if (s >= 25) return 'Car-Dependent';
      return 'Almost All Errands Require a Car';
    };
    const describeTransit = (s) => {
      if (s >= 90) return 'World-Class Transit';
      if (s >= 70) return 'Excellent Transit';
      if (s >= 50) return 'Good Transit';
      if (s >= 25) return 'Some Transit';
      return 'Minimal Transit';
    };
    const describeBike = (s) => {
      if (s >= 90) return "Biker's Paradise";
      if (s >= 70) return 'Very Bikeable';
      if (s >= 50) return 'Bikeable';
      return 'Somewhat Bikeable';
    };

    return {
      walkScore: data.walkscore || null,
      walkDescription: data.walkscore != null ? describeWalk(data.walkscore) : null,
      transitScore: data.transit?.score || null,
      transitDescription: data.transit?.score != null ? describeTransit(data.transit.score) : null,
      bikeScore: data.bike?.score || null,
      bikeDescription: data.bike?.score != null ? describeBike(data.bike.score) : null,
      _source: 'Walk Score API'
    };
  } catch (e) {
    console.error('Walk Score error:', e.message);
    return null;
  }
}

// ===== FEMA FLOOD ZONE =====
async function fetchFloodZone(lat, lon) {
  if (!lat || !lon) return null;

  const zoneDescriptions = {
    'A': { riskLevel: 'High', description: 'High-risk flood area within the 100-year floodplain. Flood insurance is federally required for mortgages.', requiresInsurance: true },
    'AE': { riskLevel: 'High', description: 'High-risk flood area with established base flood elevations. Flood insurance is federally required.', requiresInsurance: true },
    'AH': { riskLevel: 'High', description: 'High-risk area with shallow flooding (1–3 feet). Flood insurance is federally required.', requiresInsurance: true },
    'AO': { riskLevel: 'High', description: 'High-risk area with sheet flow flooding. Flood insurance is federally required.', requiresInsurance: true },
    'V': { riskLevel: 'Very High', description: 'Coastal high-risk area with wave action. Flood insurance is federally required.', requiresInsurance: true },
    'VE': { riskLevel: 'Very High', description: 'Coastal high-risk area with established base flood elevations and wave action. Flood insurance is federally required.', requiresInsurance: true },
    'X': { riskLevel: 'Minimal', description: 'Minimal flood risk — outside the 100-year and 500-year floodplains. Flood insurance is not federally required but recommended.', requiresInsurance: false },
    'D': { riskLevel: 'Undetermined', description: 'Flood risk undetermined — no flood hazard analysis has been conducted in this area.', requiresInsurance: false }
  };

  // Try multiple FEMA layers (28 = flood hazard zones, 14 = alternate)
  const layers = [28, 14];
  for (const layer of layers) {
    try {
      const url = `https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/${layer}/query?geometry=${lon},${lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=FLD_ZONE,ZONE_SUBTY,SFHA_TF&returnGeometry=false&f=json`;
      const res = await fetchWithTimeout(url, {}, 12000);
      if (!res.ok) {
        console.error('FEMA layer ' + layer + ' HTTP ' + res.status);
        continue;
      }
      const data = await res.json();
      if (data?.error) {
        console.error('FEMA error:', JSON.stringify(data.error).substring(0, 200));
        continue;
      }
      const features = data?.features || [];

      if (features.length === 0) {
        // No features = likely Zone X (minimal risk) — but only trust this if the API actually responded
        return { zone: 'X', riskLevel: 'Minimal', description: 'Minimal flood risk — outside the 100-year and 500-year floodplains. Flood insurance is not federally required but recommended.', requiresInsurance: false, _source: 'FEMA National Flood Hazard Layer' };
      }

      const attr = features[0].attributes || {};
      const zone = attr.FLD_ZONE || 'Unknown';
      const sfha = attr.SFHA_TF === 'T';
      const zoneBase = zone.replace(/[0-9]/g, '').trim();
      const info = zoneDescriptions[zoneBase] || zoneDescriptions[zone] || { riskLevel: sfha ? 'High' : 'Moderate', description: `Flood zone ${zone}. ${sfha ? 'Flood insurance is federally required.' : 'Flood insurance is recommended but not required.'}`, requiresInsurance: sfha };

      return {
        zone,
        riskLevel: info.riskLevel,
        description: info.description,
        requiresInsurance: info.requiresInsurance,
        _source: 'FEMA National Flood Hazard Layer'
      };
    } catch (e) {
      console.error('FEMA layer ' + layer + ' error:', e.message);
    }
  }

  return null;
}

// ===== NCES CCD NEARBY SCHOOLS (ArcGIS, free, no key) =====
async function fetchNearbySchools(lat, lon) {
  if (!lat || !lon) return null;

  const fields = 'NAME,STREET,CITY,STATE,ZIP,GSLO,GSHI,LEVEL_,ENROLLMENT,FT_TEACHER,LAT,LON,NMCNTY';
  const baseParams = `geometry=${lon},${lat}&geometryType=esriGeometryPoint&inSR=4326` +
    `&spatialRel=esriSpatialRelIntersects&distance=8047&units=esriSRUnit_Meter` +
    `&outFields=${fields}&returnGeometry=true&resultRecordCount=20&f=json`;

  // Try endpoints in order of reliability
  const endpoints = [
    // ArcGIS Online hosted — correct service names
    `https://services1.arcgis.com/Ua5sjt3LWTPigjyD/arcgis/rest/services/School_Characteristics_Current/FeatureServer/0/query?${baseParams}`,
    `https://services1.arcgis.com/Ua5sjt3LWTPigjyD/arcgis/rest/services/Public_School_Location_201819/FeatureServer/0/query?${baseParams}`,
    // NCES MapServer
    `https://nces.ed.gov/opengis/rest/services/K12_School_Locations/EDGE_GEOCODE_PUBLICSCH_2223/MapServer/0/query?${baseParams}`,
    `https://nces.ed.gov/opengis/rest/services/K12_School_Locations/EDGE_GEOCODE_PUBLICSCH_2122/MapServer/0/query?${baseParams}`
  ];

  for (const url of endpoints) {
    try {
      const res = await fetchWithTimeout(url, {}, 15000);
      if (!res.ok) {
        console.error('NCES endpoint ' + res.status + ': ' + url.substring(0, 80));
        continue;
      }
      const data = await res.json();
      if (data?.error) {
        console.error('NCES ArcGIS error:', JSON.stringify(data.error).substring(0, 200));
        continue;
      }
      if (data?.features?.length > 0) {
        console.log('NCES schools found: ' + data.features.length + ' from ' + url.substring(0, 60));
        return processSchoolData(data, lat, lon);
      }
    } catch (e) {
      console.error('NCES endpoint error:', e.message);
    }
  }

  return null;
}

function processSchoolData(data, originLat, originLon) {
  const features = data?.features || [];
  if (features.length === 0) return null;

  // Calculate distance using haversine
  function haversine(lat1, lon1, lat2, lon2) {
    const R = 3959; // miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  const gradeLabel = (lo, hi) => {
    if (!lo && !hi) return '';
    const l = (lo || 'PK').toString().toUpperCase();
    const h = (hi || '12').toString().toUpperCase();
    return `Grades ${l}–${h}`;
  };

  const levelLabel = (level) => {
    if (!level) return 'Public';
    const l = level.toString().toUpperCase();
    if (l.includes('ELEM') || l === '1') return 'Elementary';
    if (l.includes('MIDDLE') || l === '2') return 'Middle';
    if (l.includes('HIGH') || l === '3') return 'High School';
    if (l.includes('OTHER') || l === '4') return 'Other';
    return 'Public';
  };

  const schools = features.map(f => {
    const a = f.attributes || {};
    // Try attributes first, then geometry for lat/lon
    const sLat = a.LAT || a.LATITUDE || a.lat || (f.geometry?.y) || 0;
    const sLon = a.LON || a.LONGITUDE || a.lon || (f.geometry?.x) || 0;
    const dist = haversine(originLat, originLon, sLat, sLon);
    const enrollment = a.ENROLLMENT || a.TOTAL || a.MEMBER || 0;
    const teachers = a.FT_TEACHER || a.TEACHERS || 0;
    const ratio = (enrollment > 0 && teachers > 0) ? Math.round(enrollment / teachers) : null;
    const name = a.NAME || a.SCH_NAME || a.SCHNAM || 'Unknown';

    return {
      name,
      address: a.STREET || a.LSTREET1 || '',
      city: a.CITY || a.LCITY || '',
      state: a.STATE || a.LSTATE || '',
      zip: a.ZIP || a.LZIP || '',
      grades: gradeLabel(a.GSLO || a.G_LO_GR, a.GSHI || a.G_HI_GR),
      level: levelLabel(a.LEVEL_ || a.LEVEL || a.SCH_TYPE),
      enrollment,
      teachers: Math.round(teachers),
      studentTeacherRatio: ratio,
      distance: Math.round(dist * 10) / 10,
      lat: sLat,
      lon: sLon
    };
  }).filter(s => s.name !== 'Unknown' && s.distance < 10);

  // Sort by distance, take closest 8
  schools.sort((a, b) => a.distance - b.distance);
  const closest = schools.slice(0, 8);

  // Try to pick a mix: closest elementary, middle, high
  const picked = [];
  const byLevel = { Elementary: [], 'Middle': [], 'High School': [] };
  closest.forEach(s => {
    if (byLevel[s.level]) byLevel[s.level].push(s);
  });

  // Pick 1-2 from each level, sorted by distance
  ['Elementary', 'Middle', 'High School'].forEach(lvl => {
    const available = byLevel[lvl] || [];
    available.slice(0, 2).forEach(s => {
      if (picked.length < 6 && !picked.find(p => p.name === s.name)) picked.push(s);
    });
  });

  // Fill remaining with closest overall
  closest.forEach(s => {
    if (picked.length < 6 && !picked.find(p => p.name === s.name)) picked.push(s);
  });

  picked.sort((a, b) => a.distance - b.distance);

  return {
    schools: picked,
    totalFound: features.length,
    searchRadiusMiles: 5,
    _source: 'NCES Common Core of Data (public schools, ArcGIS)'
  };
}

// ===== OPENSTREETMAP PARKS & DOG PARKS (Overpass API, free, no key) =====
async function fetchNearbyParks(lat, lon) {
  if (!lat || !lon) return null;

  try {
    // Overpass QL: find parks and dog parks within 5km
    const query = `[out:json][timeout:15];(node["leisure"="park"](around:5000,${lat},${lon});way["leisure"="park"](around:5000,${lat},${lon});node["leisure"="dog_park"](around:5000,${lat},${lon});way["leisure"="dog_park"](around:5000,${lat},${lon}););out center tags;`;
    const url = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query);
    const res = await fetchWithTimeout(url, {}, 15000);
    if (!res.ok) {
      console.error('Overpass HTTP ' + res.status);
      return null;
    }
    const data = await res.json();
    const elements = data?.elements || [];

    if (elements.length === 0) return { parks: [], dogParks: [], _source: 'OpenStreetMap Overpass API' };

    function haversine(lat1, lon1, lat2, lon2) {
      const R = 3959;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    const seen = new Set();
    const parks = [];
    const dogParks = [];

    elements.forEach(el => {
      const tags = el.tags || {};
      const name = tags.name || tags['name:en'] || null;
      if (!name) return; // skip unnamed
      if (seen.has(name.toLowerCase())) return;
      seen.add(name.toLowerCase());

      const eLat = el.lat || el.center?.lat || 0;
      const eLon = el.lon || el.center?.lon || 0;
      if (!eLat || !eLon) return;

      const dist = haversine(lat, lon, eLat, eLon);
      const isDogPark = tags.leisure === 'dog_park' || (tags.dog === 'yes') || name.toLowerCase().includes('dog');

      const entry = {
        name,
        distance: Math.round(dist * 10) / 10,
        isDogPark,
        lat: eLat,
        lon: eLon
      };

      if (isDogPark) dogParks.push(entry);
      else parks.push(entry);
    });

    parks.sort((a, b) => a.distance - b.distance);
    dogParks.sort((a, b) => a.distance - b.distance);

    return {
      parks: parks.slice(0, 5),
      dogParks: dogParks.slice(0, 3),
      totalFound: parks.length + dogParks.length,
      _source: 'OpenStreetMap Overpass API'
    };
  } catch (e) {
    console.error('Overpass parks error:', e.message);
    return null;
  }
}

// ===== GEOCODIO SCHOOL DISTRICT (via fields=school) =====
async function fetchSchoolDistrict(zip, geocodioKey) {
  if (!geocodioKey) return null;

  try {
    const url = `https://api.geocod.io/v1.7/geocode?q=${zip}&api_key=${geocodioKey}&fields=school`;
    const res = await fetchWithTimeout(url, {}, 8000);
    if (!res.ok) return null;
    const data = await res.json();
    const school = data?.results?.[0]?.fields?.school_districts;
    if (!school) return null;

    return {
      unified: school.unified?.[0]?.name || null,
      elementary: school.elementary?.[0]?.name || null,
      secondary: school.secondary?.[0]?.name || null,
      _source: 'Geocodio school district lookup'
    };
  } catch (e) {
    console.error('School district error:', e.message);
    return null;
  }
}

// ===== ZIP TO STATE LOOKUP =====
function zipToState(zip) {
  const z = parseInt(zip);
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
  return 'OH';
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
  const geocodioKey = process.env.GEOCODIO_API_KEY;
  const blsKey = process.env.BLS_API_KEY;
  const hudKey = process.env.HUD_API_KEY;
  const walkScoreKey = process.env.WALKSCORE_API_KEY;

  if (!censusKey) return res.status(500).json({ error: 'CENSUS_API_KEY not configured' });
  if (!fredKey) return res.status(500).json({ error: 'FRED_API_KEY not configured' });

  const stateCode = zipToState(zip);

  // Phase 1: Get location data from Geocodio (needed for county FIPS)
  const geoData = geocodioKey ? await fetchGeoData(zip, geocodioKey) : null;

  // Build 5-digit county FIPS (with FCC fallback for ZIP-only geocodes)
  let fips5 = null;
  if (geoData?.fullFips) {
    fips5 = geoData.fullFips.substring(0, 5);
  } else if (geoData?.stateFips && geoData?.countyFips) {
    fips5 = (geoData.stateFips + geoData.countyFips).substring(0, 5);
  }

  // Fallback: use FCC Area API to get county FIPS from lat/lon
  if (!fips5 && geoData?.latitude && geoData?.longitude) {
    try {
      const fccUrl = `https://geo.fcc.gov/api/census/area?lat=${geoData.latitude}&lon=${geoData.longitude}&format=json`;
      const fccRes = await fetchWithTimeout(fccUrl, {}, 8000);
      if (fccRes.ok) {
        const fccData = await fccRes.json();
        const fccResult = fccData?.results?.[0];
        if (fccResult?.county_fips) {
          fips5 = fccResult.county_fips;
          if (geoData) {
            geoData.stateFips = fips5.substring(0, 2);
            geoData.countyFips = fips5;
          }
        }
      }
    } catch (e) {
      console.error('FCC fallback error:', e.message);
    }
  }

  // Phase 2: Fetch ALL data sources in parallel (combined for speed)
  const lat = geoData?.latitude;
  const lon = geoData?.longitude;
  const address = geoData ? `${geoData.city}, ${geoData.state} ${zip}` : zip;

  // Diagnostic wrapper to capture exact errors
  async function tryFetch(name, fn) {
    try {
      const result = await fn();
      return { _ok: true, data: result };
    } catch (e) {
      console.error(name + ' FAILED:', e.message);
      return { _ok: false, _error: e.message, _name: name, data: null };
    }
  }

  const results = await Promise.all([
    fetchCensusData(zip, censusKey),
    fetchNationalIncome(censusKey),
    rapidApiKey ? fetchRealtorData(zip, rapidApiKey) : null,
    fetchAppreciation(geoData?.stateCode || stateCode, fredKey),
    fips5 ? tryFetch('buildingPermits', () => fetchBuildingPermits(fips5)) : { _ok: true, data: null },
    (fips5 && blsKey) ? tryFetch('BLS', () => fetchBLSEmployment(fips5, blsKey)) : { _ok: true, data: null },
    hudKey ? tryFetch('HUD_FMR', () => fetchHUDRents(zip, hudKey)) : { _ok: true, data: null },
    walkScoreKey ? fetchWalkScore(lat, lon, address, walkScoreKey) : null,
    tryFetch('FEMA', () => fetchFloodZone(lat, lon)),
    tryFetch('NCES', () => fetchNearbySchools(lat, lon)),
    tryFetch('Overpass', () => fetchNearbyParks(lat, lon)),
    geocodioKey ? tryFetch('SchoolDistrict', () => fetchSchoolDistrict(zip, geocodioKey)) : { _ok: true, data: null }
  ]);

  const census = results[0];
  const nationalIncome = results[1];
  const realtor = results[2];
  const appreciation = results[3];
  const permits = results[4]?.data !== undefined ? results[4].data : results[4];
  const bls = results[5]?.data !== undefined ? results[5].data : results[5];
  const hudRents = results[6]?.data !== undefined ? results[6].data : results[6];
  const walkScore = results[7];
  const floodZone = results[8]?.data !== undefined ? results[8].data : results[8];
  const nearbySchools = results[9]?.data !== undefined ? results[9].data : results[9];
  const nearbyParks = results[10]?.data !== undefined ? results[10].data : results[10];
  const schoolDistrict = results[11]?.data !== undefined ? results[11].data : results[11];

  // Collect diagnostics for debugging
  const _diagnostics = results.map((r, i) => {
    if (r && r._ok === false) return { index: i, name: r._name, error: r._error };
    return null;
  }).filter(Boolean);

  // Calculate affordability trend
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
    state: geoData?.stateCode || stateCode,
    stateFips: geoData?.stateFips || STATE_FIPS[stateCode] || '39',

    // Location (from Geocodio)
    location: geoData ? {
      city: geoData.city,
      county: geoData.county,
      state: geoData.state,
      latitude: geoData.latitude,
      longitude: geoData.longitude,
      countyFips: fips5,
      _source: geoData.source
    } : null,

    censusYear: census?._year || null,

    // Demographics & Housing (Census ACS)
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

    // Housing Supply (Census ACS for units/vacancy)
    housingSupply: {
      totalUnits: census?.totalUnits || null,
      occupied: census?.occupied || null,
      vacant: census?.vacant || null,
      vacancyRate: census?.vacancyRate || null,
      _source: 'Census ACS (zip-level housing units)'
    },

    // Building Permits (HUD SOCDS - actual permits issued)
    buildingPermits: permits ? {
      since2020: permits.since2020,
      period2010s: permits.period2010s,
      period2000s: permits.period2000s,
      latestYear: permits.latestYear,
      latestTotal: permits.latestTotal,
      annualData: permits.annualData,
      countyName: geoData?.county || null,
      _source: permits._source
    } : null,

    // Market Data (Realtor.com)
    activeListings: realtor?.activeListings || null,
    medianListPrice: realtor?.medianListPrice || null,
    medianDom: realtor?.medianDom || null,
    avgDom: realtor?.avgDom || null,
    newListings: realtor?.newListings || null,

    // Appreciation (FHFA via FRED)
    appreciation: appreciation ? {
      oneYear: appreciation.oneYear,
      fiveYear: appreciation.fiveYear,
      tenYear: appreciation.tenYear,
      forecastAnnualRate: appreciation.forecastAnnualRate,
      history: appreciation.history,
      _source: appreciation._source
    } : null,

    // Employment (BLS LAUS - county-level, monthly)
    employment: bls ? {
      laborForce: bls.laborForce,
      unemployed: bls.unemployed,
      unemploymentRate: bls.unemploymentRate,
      monthlyTrend: bls.monthlyTrend,
      latestMonth: bls.latestMonth,
      latestYear: bls.latestYear,
      countyName: geoData?.county || null,
      _source: bls._source
    } : null,

    // HUD Fair Market Rents (by bedroom count)
    fairMarketRents: hudRents ? {
      efficiency: hudRents.efficiency,
      oneBed: hudRents.oneBed,
      twoBed: hudRents.twoBed,
      threeBed: hudRents.threeBed,
      fourBed: hudRents.fourBed,
      metroName: hudRents.metroName,
      year: hudRents.year,
      isZipLevel: hudRents.isZipLevel,
      _source: hudRents._source
    } : null,

    // ===== AROUND THIS HOME =====
    walkScore: walkScore || null,
    floodZone: floodZone || null,
    nearbySchools: nearbySchools || null,
    nearbyParks: nearbyParks || null,
    schoolDistrict: schoolDistrict || null,

    // Data Source Documentation
    dataSources: {
      demographics: 'U.S. Census Bureau ACS 5-Year Estimates (' + (census?._year || '2023') + ')',
      appreciation: 'Federal Housing Finance Agency HPI via FRED (state-level, quarterly)',
      listings: 'Realtor.com via RapidAPI (live data)',
      permits: permits ? 'Census Bureau Building Permits Survey via HUD SOCDS (actual permits issued, county-level)' : 'Not available',
      employment: bls ? 'Bureau of Labor Statistics LAUS (county-level, monthly)' : 'Census ACS (annual estimate)',
      rents: hudRents ? 'HUD Fair Market Rents (' + (hudRents.year || 'current') + ')' : 'Census ACS median rent',
      geocoding: geoData ? 'Geocodio' : 'Census zip-to-state lookup',
      walkability: walkScore ? 'Walk Score API' : 'Not available',
      floodZone: floodZone ? 'FEMA National Flood Hazard Layer' : 'Not available',
      schools: nearbySchools ? 'NCES Common Core of Data (public schools)' : 'Not available',
      parks: nearbyParks ? 'OpenStreetMap Overpass API' : 'Not available',
      schoolDistrict: schoolDistrict ? 'Geocodio school district lookup' : 'Not available'
    },

    fetchedAt: new Date().toISOString(),
    _diagnostics: _diagnostics.length > 0 ? _diagnostics : undefined
  };

  return res.status(200).json(result);
}
