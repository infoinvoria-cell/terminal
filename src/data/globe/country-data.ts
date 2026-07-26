export interface CountryEntry {
  iso: string;
  name: string;
  normalizedName: string; // lowercase, matches countryNameOf() output
  flag: string;
  capital: string;
  region: string;
  indexAssetId?: string;  // asset ID in our system
  indexSymbol?: string;   // Yahoo Finance ticker
  currencySymbol?: string; // Yahoo Finance FX ticker vs USD
  currencyCode?: string;
}

export const COUNTRY_DATA: CountryEntry[] = [
  { iso: "US", name: "United States", normalizedName: "united states", flag: "🇺🇸", capital: "Washington D.C.", region: "North America", indexAssetId: "sp500_idx", indexSymbol: "^GSPC", currencyCode: "USD" },
  { iso: "GB", name: "United Kingdom", normalizedName: "united kingdom", flag: "🇬🇧", capital: "London", region: "Europe", indexAssetId: "ukx", indexSymbol: "^FTSE", currencySymbol: "GBPUSD=X", currencyCode: "GBP" },
  { iso: "DE", name: "Germany", normalizedName: "germany", flag: "🇩🇪", capital: "Berlin", region: "Europe", indexAssetId: "dax_idx", indexSymbol: "^GDAXI", currencySymbol: "EURUSD=X", currencyCode: "EUR" },
  { iso: "FR", name: "France", normalizedName: "france", flag: "🇫🇷", capital: "Paris", region: "Europe", indexAssetId: "cac40_idx", indexSymbol: "^FCHI", currencySymbol: "EURUSD=X", currencyCode: "EUR" },
  { iso: "JP", name: "Japan", normalizedName: "japan", flag: "🇯🇵", capital: "Tokyo", region: "Asia Pacific", indexAssetId: "nikkei_idx", indexSymbol: "^N225", currencySymbol: "JPY=X", currencyCode: "JPY" },
  { iso: "CN", name: "China", normalizedName: "china", flag: "🇨🇳", capital: "Beijing", region: "Asia Pacific", indexSymbol: "000001.SS", currencySymbol: "CNY=X", currencyCode: "CNY" },
  { iso: "IN", name: "India", normalizedName: "india", flag: "🇮🇳", capital: "New Delhi", region: "Asia Pacific", indexSymbol: "^BSESN", currencySymbol: "INR=X", currencyCode: "INR" },
  { iso: "BR", name: "Brazil", normalizedName: "brazil", flag: "🇧🇷", capital: "Brasília", region: "South America", indexSymbol: "^BVSP", currencySymbol: "BRL=X", currencyCode: "BRL" },
  { iso: "CA", name: "Canada", normalizedName: "canada", flag: "🇨🇦", capital: "Ottawa", region: "North America", indexSymbol: "^GSPTSE", currencySymbol: "CAD=X", currencyCode: "CAD" },
  { iso: "AU", name: "Australia", normalizedName: "australia", flag: "🇦🇺", capital: "Canberra", region: "Asia Pacific", indexAssetId: "asx200_idx", indexSymbol: "^AXJO", currencySymbol: "AUDUSD=X", currencyCode: "AUD" },
  { iso: "KR", name: "South Korea", normalizedName: "south korea", flag: "🇰🇷", capital: "Seoul", region: "Asia Pacific", indexSymbol: "^KS11", currencySymbol: "KRW=X", currencyCode: "KRW" },
  { iso: "RU", name: "Russia", normalizedName: "russia", flag: "🇷🇺", capital: "Moscow", region: "Europe", indexSymbol: "IMOEX.ME", currencySymbol: "RUB=X", currencyCode: "RUB" },
  { iso: "MX", name: "Mexico", normalizedName: "mexico", flag: "🇲🇽", capital: "Mexico City", region: "North America", indexSymbol: "^MXX", currencySymbol: "MXN=X", currencyCode: "MXN" },
  { iso: "IT", name: "Italy", normalizedName: "italy", flag: "🇮🇹", capital: "Rome", region: "Europe", indexAssetId: "mib_idx", indexSymbol: "FTSEMIB.MI", currencySymbol: "EURUSD=X", currencyCode: "EUR" },
  { iso: "ES", name: "Spain", normalizedName: "spain", flag: "🇪🇸", capital: "Madrid", region: "Europe", indexAssetId: "ibex_idx", indexSymbol: "^IBEX", currencySymbol: "EURUSD=X", currencyCode: "EUR" },
  { iso: "NL", name: "Netherlands", normalizedName: "netherlands", flag: "🇳🇱", capital: "Amsterdam", region: "Europe", indexSymbol: "^AEX", currencySymbol: "EURUSD=X", currencyCode: "EUR" },
  { iso: "CH", name: "Switzerland", normalizedName: "switzerland", flag: "🇨🇭", capital: "Bern", region: "Europe", indexSymbol: "^SSMI", currencySymbol: "CHF=X", currencyCode: "CHF" },
  { iso: "SE", name: "Sweden", normalizedName: "sweden", flag: "🇸🇪", capital: "Stockholm", region: "Europe", indexSymbol: "^OMX", currencySymbol: "SEK=X", currencyCode: "SEK" },
  { iso: "NO", name: "Norway", normalizedName: "norway", flag: "🇳🇴", capital: "Oslo", region: "Europe", currencySymbol: "NOK=X", currencyCode: "NOK" },
  { iso: "PL", name: "Poland", normalizedName: "poland", flag: "🇵🇱", capital: "Warsaw", region: "Europe", indexSymbol: "^WIG20", currencySymbol: "PLN=X", currencyCode: "PLN" },
  { iso: "TR", name: "Turkey", normalizedName: "turkey", flag: "🇹🇷", capital: "Ankara", region: "Europe", indexSymbol: "XU100.IS", currencySymbol: "TRY=X", currencyCode: "TRY" },
  { iso: "SA", name: "Saudi Arabia", normalizedName: "saudi arabia", flag: "🇸🇦", capital: "Riyadh", region: "Middle East", indexSymbol: "^TASI.SR", currencyCode: "SAR" },
  { iso: "AE", name: "UAE", normalizedName: "united arab emirates", flag: "🇦🇪", capital: "Abu Dhabi", region: "Middle East", indexSymbol: "^DFMGI", currencyCode: "AED" },
  { iso: "ZA", name: "South Africa", normalizedName: "south africa", flag: "🇿🇦", capital: "Pretoria", region: "Africa", indexSymbol: "^JN0U.JO", currencySymbol: "ZAR=X", currencyCode: "ZAR" },
  { iso: "NG", name: "Nigeria", normalizedName: "nigeria", flag: "🇳🇬", capital: "Abuja", region: "Africa", currencyCode: "NGN" },
  { iso: "TW", name: "Taiwan", normalizedName: "taiwan", flag: "🇹🇼", capital: "Taipei", region: "Asia Pacific", indexSymbol: "^TWII", currencySymbol: "TWD=X", currencyCode: "TWD" },
  { iso: "SG", name: "Singapore", normalizedName: "singapore", flag: "🇸🇬", capital: "Singapore", region: "Asia Pacific", indexSymbol: "^STI", currencySymbol: "SGD=X", currencyCode: "SGD" },
  { iso: "HK", name: "Hong Kong", normalizedName: "hong kong", flag: "🇭🇰", capital: "Hong Kong", region: "Asia Pacific", indexAssetId: "hsi_idx", indexSymbol: "^HSI", currencyCode: "HKD" },
  { iso: "ID", name: "Indonesia", normalizedName: "indonesia", flag: "🇮🇩", capital: "Jakarta", region: "Asia Pacific", indexSymbol: "^JKSE", currencySymbol: "IDR=X", currencyCode: "IDR" },
  { iso: "TH", name: "Thailand", normalizedName: "thailand", flag: "🇹🇭", capital: "Bangkok", region: "Asia Pacific", indexSymbol: "^SET.BK", currencySymbol: "THB=X", currencyCode: "THB" },
  { iso: "MY", name: "Malaysia", normalizedName: "malaysia", flag: "🇲🇾", capital: "Kuala Lumpur", region: "Asia Pacific", currencySymbol: "MYR=X", currencyCode: "MYR" },
  { iso: "PH", name: "Philippines", normalizedName: "philippines", flag: "🇵🇭", capital: "Manila", region: "Asia Pacific", currencySymbol: "PHP=X", currencyCode: "PHP" },
  { iso: "PK", name: "Pakistan", normalizedName: "pakistan", flag: "🇵🇰", capital: "Islamabad", region: "Asia Pacific", currencyCode: "PKR" },
  { iso: "EG", name: "Egypt", normalizedName: "egypt", flag: "🇪🇬", capital: "Cairo", region: "Africa", currencyCode: "EGP" },
  { iso: "AR", name: "Argentina", normalizedName: "argentina", flag: "🇦🇷", capital: "Buenos Aires", region: "South America", indexSymbol: "^MERV", currencyCode: "ARS" },
  { iso: "UA", name: "Ukraine", normalizedName: "ukraine", flag: "🇺🇦", capital: "Kyiv", region: "Europe", currencyCode: "UAH" },
  { iso: "IL", name: "Israel", normalizedName: "israel", flag: "🇮🇱", capital: "Jerusalem", region: "Middle East", indexSymbol: "^TA35", currencySymbol: "ILS=X", currencyCode: "ILS" },
  { iso: "IR", name: "Iran", normalizedName: "iran", flag: "🇮🇷", capital: "Tehran", region: "Middle East", currencyCode: "IRR" },
  { iso: "AT", name: "Austria", normalizedName: "austria", flag: "🇦🇹", capital: "Vienna", region: "Europe", currencySymbol: "EURUSD=X", currencyCode: "EUR" },
  { iso: "BE", name: "Belgium", normalizedName: "belgium", flag: "🇧🇪", capital: "Brussels", region: "Europe", currencySymbol: "EURUSD=X", currencyCode: "EUR" },
  { iso: "DK", name: "Denmark", normalizedName: "denmark", flag: "🇩🇰", capital: "Copenhagen", region: "Europe", currencySymbol: "DKK=X", currencyCode: "DKK" },
  { iso: "PT", name: "Portugal", normalizedName: "portugal", flag: "🇵🇹", capital: "Lisbon", region: "Europe", currencySymbol: "EURUSD=X", currencyCode: "EUR" },
  { iso: "GR", name: "Greece", normalizedName: "greece", flag: "🇬🇷", capital: "Athens", region: "Europe", currencySymbol: "EURUSD=X", currencyCode: "EUR" },
  { iso: "QA", name: "Qatar", normalizedName: "qatar", flag: "🇶🇦", capital: "Doha", region: "Middle East", currencyCode: "QAR" },
  { iso: "VE", name: "Venezuela", normalizedName: "venezuela", flag: "🇻🇪", capital: "Caracas", region: "South America", currencyCode: "VEF" },
  { iso: "CL", name: "Chile", normalizedName: "chile", flag: "🇨🇱", capital: "Santiago", region: "South America", currencyCode: "CLP" },
  { iso: "CO", name: "Colombia", normalizedName: "colombia", flag: "🇨🇴", capital: "Bogotá", region: "South America", currencyCode: "COP" },
];

export const COUNTRY_BY_ISO = new Map<string, CountryEntry>(COUNTRY_DATA.map((c) => [c.iso, c]));
export const COUNTRY_BY_NAME = new Map<string, CountryEntry>(COUNTRY_DATA.map((c) => [c.normalizedName, c]));

export function lookupCountryByName(name: string): CountryEntry | undefined {
  const lower = name.toLowerCase().trim();
  return COUNTRY_BY_NAME.get(lower);
}
