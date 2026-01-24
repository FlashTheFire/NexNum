/**
 * Generate Unified Countries Metadata
 * Merges ISO-3166 data with coordinates and translates to all supported languages
 * 
 * Usage: npx tsx scripts/generate-countries-metadata.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// Supported languages
const LANGUAGES = ['en', 'ar', 'es', 'fr', 'hi', 'pt', 'ru', 'tr', 'zh'];

// ISO-3166 data source (pre-downloaded)
const ISO_DATA_URL = 'https://raw.githubusercontent.com/lukes/ISO-3166-Countries-with-Regional-Codes/master/all/all.json';

// Coordinates data source (pre-downloaded)
const COORDS_DATA_URL = 'https://gist.githubusercontent.com/liampmccabe/98e4f541f83191ccad12/raw/af13f3acf5e7b0a3bf81ef49debb19944d2c599d/countries';

interface ISOCountry {
    'name': string;
    'alpha-2': string;
    'alpha-3'?: string;
    'region': string | null;
    'sub-region': string | null;
    'intermediate-region'?: string;
}

interface CoordinatesEntry {
    country: string;
    latitude: number;
    longitude: number;
    name: string;
}

interface CountryMetadata {
    code: string;
    name: Record<string, string>;
    region: string;
    subRegion: string;
    latitude: number;
    longitude: number;
}

// Country name translations - manually curated for common countries
// For a real app, you'd use a translation service or i18n library
const COUNTRY_TRANSLATIONS: Record<string, Record<string, string>> = {
    "United States of America": {
        "en": "United States",
        "ar": "الولايات المتحدة",
        "es": "Estados Unidos",
        "fr": "États-Unis",
        "hi": "संयुक्त राज्य अमेरिका",
        "pt": "Estados Unidos",
        "ru": "Соединённые Штаты",
        "tr": "Amerika Birleşik Devletleri",
        "zh": "美国"
    },
    "United Kingdom of Great Britain and Northern Ireland": {
        "en": "United Kingdom",
        "ar": "المملكة المتحدة",
        "es": "Reino Unido",
        "fr": "Royaume-Uni",
        "hi": "यूनाइटेड किंगडम",
        "pt": "Reino Unido",
        "ru": "Великобритания",
        "tr": "Birleşik Krallık",
        "zh": "英国"
    },
    "Germany": {
        "en": "Germany",
        "ar": "ألمانيا",
        "es": "Alemania",
        "fr": "Allemagne",
        "hi": "जर्मनी",
        "pt": "Alemanha",
        "ru": "Германия",
        "tr": "Almanya",
        "zh": "德国"
    },
    "France": {
        "en": "France",
        "ar": "فرنسا",
        "es": "Francia",
        "fr": "France",
        "hi": "फ्रांस",
        "pt": "França",
        "ru": "Франция",
        "tr": "Fransa",
        "zh": "法国"
    },
    "China": {
        "en": "China",
        "ar": "الصين",
        "es": "China",
        "fr": "Chine",
        "hi": "चीन",
        "pt": "China",
        "ru": "Китай",
        "tr": "Çin",
        "zh": "中国"
    },
    "Japan": {
        "en": "Japan",
        "ar": "اليابان",
        "es": "Japón",
        "fr": "Japon",
        "hi": "जापान",
        "pt": "Japão",
        "ru": "Япония",
        "tr": "Japonya",
        "zh": "日本"
    },
    "India": {
        "en": "India",
        "ar": "الهند",
        "es": "India",
        "fr": "Inde",
        "hi": "भारत",
        "pt": "Índia",
        "ru": "Индия",
        "tr": "Hindistan",
        "zh": "印度"
    },
    "Brazil": {
        "en": "Brazil",
        "ar": "البرازيل",
        "es": "Brasil",
        "fr": "Brésil",
        "hi": "ब्राज़ील",
        "pt": "Brasil",
        "ru": "Бразилия",
        "tr": "Brezilya",
        "zh": "巴西"
    },
    "Russian Federation": {
        "en": "Russia",
        "ar": "روسيا",
        "es": "Rusia",
        "fr": "Russie",
        "hi": "रूस",
        "pt": "Rússia",
        "ru": "Россия",
        "tr": "Rusya",
        "zh": "俄罗斯"
    },
    "Australia": {
        "en": "Australia",
        "ar": "أستراليا",
        "es": "Australia",
        "fr": "Australie",
        "hi": "ऑस्ट्रेलिया",
        "pt": "Austrália",
        "ru": "Австралия",
        "tr": "Avustralya",
        "zh": "澳大利亚"
    },
    "Canada": {
        "en": "Canada",
        "ar": "كندا",
        "es": "Canadá",
        "fr": "Canada",
        "hi": "कनाडा",
        "pt": "Canadá",
        "ru": "Канада",
        "tr": "Kanada",
        "zh": "加拿大"
    },
    "Spain": {
        "en": "Spain",
        "ar": "إسبانيا",
        "es": "España",
        "fr": "Espagne",
        "hi": "स्पेन",
        "pt": "Espanha",
        "ru": "Испания",
        "tr": "İspanya",
        "zh": "西班牙"
    },
    "Italy": {
        "en": "Italy",
        "ar": "إيطاليا",
        "es": "Italia",
        "fr": "Italie",
        "hi": "इटली",
        "pt": "Itália",
        "ru": "Италия",
        "tr": "İtalya",
        "zh": "意大利"
    },
    "Mexico": {
        "en": "Mexico",
        "ar": "المكسيك",
        "es": "México",
        "fr": "Mexique",
        "hi": "मेक्सिको",
        "pt": "México",
        "ru": "Мексика",
        "tr": "Meksika",
        "zh": "墨西哥"
    },
    "South Africa": {
        "en": "South Africa",
        "ar": "جنوب أفريقيا",
        "es": "Sudáfrica",
        "fr": "Afrique du Sud",
        "hi": "दक्षिण अफ्रीका",
        "pt": "África do Sul",
        "ru": "Южная Африка",
        "tr": "Güney Afrika",
        "zh": "南非"
    },
    "Korea, Republic of": {
        "en": "South Korea",
        "ar": "كوريا الجنوبية",
        "es": "Corea del Sur",
        "fr": "Corée du Sud",
        "hi": "दक्षिण कोरिया",
        "pt": "Coreia do Sul",
        "ru": "Южная Корея",
        "tr": "Güney Kore",
        "zh": "韩国"
    },
    "Netherlands, Kingdom of the": {
        "en": "Netherlands",
        "ar": "هولندا",
        "es": "Países Bajos",
        "fr": "Pays-Bas",
        "hi": "नीदरलैंड",
        "pt": "Países Baixos",
        "ru": "Нидерланды",
        "tr": "Hollanda",
        "zh": "荷兰"
    },
    "Saudi Arabia": {
        "en": "Saudi Arabia",
        "ar": "المملكة العربية السعودية",
        "es": "Arabia Saudita",
        "fr": "Arabie Saoudite",
        "hi": "सऊदी अरब",
        "pt": "Arábia Saudita",
        "ru": "Саудовская Аравия",
        "tr": "Suudi Arabistan",
        "zh": "沙特阿拉伯"
    },
    "United Arab Emirates": {
        "en": "UAE",
        "ar": "الإمارات العربية المتحدة",
        "es": "Emiratos Árabes Unidos",
        "fr": "Émirats arabes unis",
        "hi": "संयुक्त अरब अमीरात",
        "pt": "Emirados Árabes Unidos",
        "ru": "ОАЭ",
        "tr": "Birleşik Arap Emirlikleri",
        "zh": "阿联酋"
    },
    "Indonesia": {
        "en": "Indonesia",
        "ar": "إندونيسيا",
        "es": "Indonesia",
        "fr": "Indonésie",
        "hi": "इंडोनेशिया",
        "pt": "Indonésia",
        "ru": "Индонезия",
        "tr": "Endonezya",
        "zh": "印度尼西亚"
    },
    "Türkiye": {
        "en": "Turkey",
        "ar": "تركيا",
        "es": "Turquía",
        "fr": "Turquie",
        "hi": "तुर्की",
        "pt": "Turquia",
        "ru": "Турция",
        "tr": "Türkiye",
        "zh": "土耳其"
    },
    "Pakistan": {
        "en": "Pakistan",
        "ar": "باكستان",
        "es": "Pakistán",
        "fr": "Pakistan",
        "hi": "पाकिस्तान",
        "pt": "Paquistão",
        "ru": "Пакистан",
        "tr": "Pakistan",
        "zh": "巴基斯坦"
    },
    "Bangladesh": {
        "en": "Bangladesh",
        "ar": "بنغلاديش",
        "es": "Bangladés",
        "fr": "Bangladesh",
        "hi": "बांग्लादेश",
        "pt": "Bangladexe",
        "ru": "Бангладеш",
        "tr": "Bangladeş",
        "zh": "孟加拉国"
    },
    "Nigeria": {
        "en": "Nigeria",
        "ar": "نيجيريا",
        "es": "Nigeria",
        "fr": "Nigéria",
        "hi": "नाइजीरिया",
        "pt": "Nigéria",
        "ru": "Нигерия",
        "tr": "Nijerya",
        "zh": "尼日利亚"
    },
    "Egypt": {
        "en": "Egypt",
        "ar": "مصر",
        "es": "Egipto",
        "fr": "Égypte",
        "hi": "मिस्र",
        "pt": "Egito",
        "ru": "Египет",
        "tr": "Mısır",
        "zh": "埃及"
    },
    "Poland": {
        "en": "Poland",
        "ar": "بولندا",
        "es": "Polonia",
        "fr": "Pologne",
        "hi": "पोलैंड",
        "pt": "Polónia",
        "ru": "Польша",
        "tr": "Polonya",
        "zh": "波兰"
    },
    "Argentina": {
        "en": "Argentina",
        "ar": "الأرجنتين",
        "es": "Argentina",
        "fr": "Argentine",
        "hi": "अर्जेंटीना",
        "pt": "Argentina",
        "ru": "Аргентина",
        "tr": "Arjantin",
        "zh": "阿根廷"
    },
    "Thailand": {
        "en": "Thailand",
        "ar": "تايلاند",
        "es": "Tailandia",
        "fr": "Thaïlande",
        "hi": "थाईलैंड",
        "pt": "Tailândia",
        "ru": "Таиланд",
        "tr": "Tayland",
        "zh": "泰国"
    },
    "Viet Nam": {
        "en": "Vietnam",
        "ar": "فيتنام",
        "es": "Vietnam",
        "fr": "Viêt Nam",
        "hi": "वियतनाम",
        "pt": "Vietnã",
        "ru": "Вьетнам",
        "tr": "Vietnam",
        "zh": "越南"
    },
    "Philippines": {
        "en": "Philippines",
        "ar": "الفلبين",
        "es": "Filipinas",
        "fr": "Philippines",
        "hi": "फिलीपींस",
        "pt": "Filipinas",
        "ru": "Филиппины",
        "tr": "Filipinler",
        "zh": "菲律宾"
    },
    "Malaysia": {
        "en": "Malaysia",
        "ar": "ماليزيا",
        "es": "Malasia",
        "fr": "Malaisie",
        "hi": "मलेशिया",
        "pt": "Malásia",
        "ru": "Малайзия",
        "tr": "Malezya",
        "zh": "马来西亚"
    },
    "Singapore": {
        "en": "Singapore",
        "ar": "سنغافورة",
        "es": "Singapur",
        "fr": "Singapour",
        "hi": "सिंगापुर",
        "pt": "Singapura",
        "ru": "Сингапур",
        "tr": "Singapur",
        "zh": "新加坡"
    },
    "Ukraine": {
        "en": "Ukraine",
        "ar": "أوكرانيا",
        "es": "Ucrania",
        "fr": "Ukraine",
        "hi": "यूक्रेन",
        "pt": "Ucrânia",
        "ru": "Украина",
        "tr": "Ukrayna",
        "zh": "乌克兰"
    },
    "Iran, Islamic Republic of": {
        "en": "Iran",
        "ar": "إيران",
        "es": "Irán",
        "fr": "Iran",
        "hi": "ईरान",
        "pt": "Irã",
        "ru": "Иран",
        "tr": "İran",
        "zh": "伊朗"
    },
    "Morocco": {
        "en": "Morocco",
        "ar": "المغرب",
        "es": "Marruecos",
        "fr": "Maroc",
        "hi": "मोरक्को",
        "pt": "Marrocos",
        "ru": "Марокко",
        "tr": "Fas",
        "zh": "摩洛哥"
    },
    "Austria": {
        "en": "Austria",
        "ar": "النمسا",
        "es": "Austria",
        "fr": "Autriche",
        "hi": "ऑस्ट्रिया",
        "pt": "Áustria",
        "ru": "Австрия",
        "tr": "Avusturya",
        "zh": "奥地利"
    },
    "Belgium": {
        "en": "Belgium",
        "ar": "بلجيكا",
        "es": "Bélgica",
        "fr": "Belgique",
        "hi": "बेल्जियम",
        "pt": "Bélgica",
        "ru": "Бельгия",
        "tr": "Belçika",
        "zh": "比利时"
    },
    "Switzerland": {
        "en": "Switzerland",
        "ar": "سويسرا",
        "es": "Suiza",
        "fr": "Suisse",
        "hi": "स्विट्जरलैंड",
        "pt": "Suíça",
        "ru": "Швейцария",
        "tr": "İsviçre",
        "zh": "瑞士"
    },
    "Sweden": {
        "en": "Sweden",
        "ar": "السويد",
        "es": "Suecia",
        "fr": "Suède",
        "hi": "स्वीडन",
        "pt": "Suécia",
        "ru": "Швеция",
        "tr": "İsveç",
        "zh": "瑞典"
    },
    "Norway": {
        "en": "Norway",
        "ar": "النرويج",
        "es": "Noruega",
        "fr": "Norvège",
        "hi": "नॉर्वे",
        "pt": "Noruega",
        "ru": "Норвегия",
        "tr": "Norveç",
        "zh": "挪威"
    },
    "Denmark": {
        "en": "Denmark",
        "ar": "الدنمارك",
        "es": "Dinamarca",
        "fr": "Danemark",
        "hi": "डेनमार्क",
        "pt": "Dinamarca",
        "ru": "Дания",
        "tr": "Danimarka",
        "zh": "丹麦"
    },
    "Finland": {
        "en": "Finland",
        "ar": "فنلندا",
        "es": "Finlandia",
        "fr": "Finlande",
        "hi": "फ़िनलैंड",
        "pt": "Finlândia",
        "ru": "Финляндия",
        "tr": "Finlandiya",
        "zh": "芬兰"
    },
    "Portugal": {
        "en": "Portugal",
        "ar": "البرتغال",
        "es": "Portugal",
        "fr": "Portugal",
        "hi": "पुर्तगाल",
        "pt": "Portugal",
        "ru": "Португалия",
        "tr": "Portekiz",
        "zh": "葡萄牙"
    },
    "Greece": {
        "en": "Greece",
        "ar": "اليونان",
        "es": "Grecia",
        "fr": "Grèce",
        "hi": "यूनान",
        "pt": "Grécia",
        "ru": "Греция",
        "tr": "Yunanistan",
        "zh": "希腊"
    },
    "Israel": {
        "en": "Israel",
        "ar": "إسرائيل",
        "es": "Israel",
        "fr": "Israël",
        "hi": "इज़राइल",
        "pt": "Israel",
        "ru": "Израиль",
        "tr": "İsrail",
        "zh": "以色列"
    },
    "New Zealand": {
        "en": "New Zealand",
        "ar": "نيوزيلندا",
        "es": "Nueva Zelanda",
        "fr": "Nouvelle-Zélande",
        "hi": "न्यूज़ीलैंड",
        "pt": "Nova Zelândia",
        "ru": "Новая Зеландия",
        "tr": "Yeni Zelanda",
        "zh": "新西兰"
    },
    "Ireland": {
        "en": "Ireland",
        "ar": "أيرلندا",
        "es": "Irlanda",
        "fr": "Irlande",
        "hi": "आयरलैंड",
        "pt": "Irlanda",
        "ru": "Ирландия",
        "tr": "İrlanda",
        "zh": "爱尔兰"
    },
    "Hong Kong": {
        "en": "Hong Kong",
        "ar": "هونغ كونغ",
        "es": "Hong Kong",
        "fr": "Hong Kong",
        "hi": "हांगकांग",
        "pt": "Hong Kong",
        "ru": "Гонконг",
        "tr": "Hong Kong",
        "zh": "香港"
    },
    "Taiwan, Province of China": {
        "en": "Taiwan",
        "ar": "تايوان",
        "es": "Taiwán",
        "fr": "Taïwan",
        "hi": "ताइवान",
        "pt": "Taiwan",
        "ru": "Тайвань",
        "tr": "Tayvan",
        "zh": "台湾"
    },
    "Czechia": {
        "en": "Czech Republic",
        "ar": "التشيك",
        "es": "República Checa",
        "fr": "Tchéquie",
        "hi": "चेक गणराज्य",
        "pt": "Chéquia",
        "ru": "Чехия",
        "tr": "Çekya",
        "zh": "捷克"
    },
    "Romania": {
        "en": "Romania",
        "ar": "رومانيا",
        "es": "Rumania",
        "fr": "Roumanie",
        "hi": "रोमानिया",
        "pt": "Romênia",
        "ru": "Румыния",
        "tr": "Romanya",
        "zh": "罗马尼亚"
    },
    "Hungary": {
        "en": "Hungary",
        "ar": "المجر",
        "es": "Hungría",
        "fr": "Hongrie",
        "hi": "हंगरी",
        "pt": "Hungria",
        "ru": "Венгрия",
        "tr": "Macaristan",
        "zh": "匈牙利"
    },
    "Chile": {
        "en": "Chile",
        "ar": "تشيلي",
        "es": "Chile",
        "fr": "Chili",
        "hi": "चिली",
        "pt": "Chile",
        "ru": "Чили",
        "tr": "Şili",
        "zh": "智利"
    },
    "Colombia": {
        "en": "Colombia",
        "ar": "كولومبيا",
        "es": "Colombia",
        "fr": "Colombie",
        "hi": "कोलंबिया",
        "pt": "Colômbia",
        "ru": "Колумбия",
        "tr": "Kolombiya",
        "zh": "哥伦比亚"
    },
    "Peru": {
        "en": "Peru",
        "ar": "بيرو",
        "es": "Perú",
        "fr": "Pérou",
        "hi": "पेरू",
        "pt": "Peru",
        "ru": "Перу",
        "tr": "Peru",
        "zh": "秘鲁"
    },
};

function getTranslatedName(isoName: string): Record<string, string> {
    // Check if we have a manual translation
    if (COUNTRY_TRANSLATIONS[isoName]) {
        return COUNTRY_TRANSLATIONS[isoName];
    }

    // Default: use English name for all languages
    const names: Record<string, string> = {};
    for (const lang of LANGUAGES) {
        names[lang] = isoName;
    }
    return names;
}

async function main() {
    console.log('🌍 Generating Unified Countries Metadata...\n');

    // Fetch ISO data
    console.log('📥 Fetching ISO-3166 data...');
    const isoResponse = await fetch(ISO_DATA_URL);
    const isoData: ISOCountry[] = await isoResponse.json();
    console.log(`   Found ${isoData.length} countries`);

    // Fetch coordinates data
    console.log('📥 Fetching coordinates data...');
    const coordsResponse = await fetch(COORDS_DATA_URL);
    const coordsData: CoordinatesEntry[] = await coordsResponse.json();
    console.log(`   Found ${coordsData.length} coordinate entries`);

    // Create a map for easy lookup
    const coordsMap = new Map<string, CoordinatesEntry>();
    for (const entry of coordsData) {
        coordsMap.set(entry.country.toUpperCase(), entry);
    }

    // Merge data
    console.log('\n🔄 Merging data...');
    const countries: CountryMetadata[] = [];

    for (const iso of isoData) {
        const code = iso['alpha-2'].toUpperCase();
        const coords = coordsMap.get(code);

        const country: CountryMetadata = {
            code,
            name: getTranslatedName(iso.name),
            region: iso.region || 'Other',
            subRegion: iso['sub-region'] || '',
            latitude: coords?.latitude || 0,
            longitude: coords?.longitude || 0,
        };

        countries.push(country);
    }

    // Sort by code
    countries.sort((a, b) => a.code.localeCompare(b.code));

    // Write output
    const outputPath = path.join(process.cwd(), 'src', 'data', 'countries-metadata.json');
    fs.writeFileSync(outputPath, JSON.stringify(countries, null, 2));

    console.log(`\n✅ Generated ${countries.length} countries`);
    console.log(`📁 Saved to: ${outputPath}`);

    // Stats
    const withCoords = countries.filter(c => c.latitude !== 0 || c.longitude !== 0).length;
    const withTranslations = countries.filter(c => c.name.en !== c.name.ar).length;
    console.log(`\n📊 Stats:`);
    console.log(`   - Countries with coordinates: ${withCoords}/${countries.length}`);
    console.log(`   - Countries with translations: ${withTranslations}/${countries.length}`);
}

main().catch(console.error);
