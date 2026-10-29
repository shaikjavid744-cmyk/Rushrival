// Localization table. English is complete; other languages translate the core menu/onboarding strings
// and fall back to English per missing key.
const en = {
  welcome: "Welcome to Rush Rivals!",
  welcomeSub: "Dodge trains, ride the roofs and grab every coin.",
  chooseLanguage: "Choose your language",
  ageTitle: "How old are you?",
  ageSub: "We use this to keep the game safe. Nothing leaves your device.",
  under13: "Under 13",
  over13: "13 or older",
  termsTitle: "Terms & Privacy",
  termsBody: "Rush Rivals stores your progress on this device only. No account, no tracking, no ads in this version. By continuing you accept the Terms of Service and Privacy Policy.",
  accept: "Accept & Continue",
  nameTitle: "Pick a runner name",
  howTitle: "How to play",
  giftTitle: "Welcome gift!",
  claim: "Claim",
  continue: "Continue",
  letsGo: "Let's Run!",
  play: "Play",
  missions: "Missions",
  daily: "Daily",
  shop: "Shop",
  characters: "Characters",
  boards: "Boards",
  worlds: "Worlds",
  leaderboard: "Leaderboard",
  settings: "Settings",
  inbox: "Inbox",
  events: "Events",
  account: "Account",
  best: "BEST",
};
export type StringKey = keyof typeof en;
type Table = Partial<Record<StringKey, string>>;

const hi: Table = { welcome: "Rush Rivals में आपका स्वागत है!", chooseLanguage: "अपनी भाषा चुनें", continue: "जारी रखें", claim: "प्राप्त करें", accept: "स्वीकार करें और जारी रखें", giftTitle: "स्वागत उपहार!", play: "खेलें", missions: "मिशन", daily: "दैनिक", shop: "दुकान", characters: "किरदार", boards: "बोर्ड", worlds: "दुनिया", leaderboard: "लीडरबोर्ड", settings: "सेटिंग्स", inbox: "इनबॉक्स", events: "इवेंट", account: "खाता", best: "सर्वश्रेष्ठ" };
const bn: Table = { welcome: "Rush Rivals-এ স্বাগতম!", chooseLanguage: "আপনার ভাষা বেছে নিন", continue: "চালিয়ে যান", claim: "সংগ্রহ করুন", accept: "সম্মত ও চালিয়ে যান", giftTitle: "স্বাগত উপহার!", play: "খেলুন", missions: "মিশন", daily: "দৈনিক", shop: "দোকান", characters: "চরিত্র", boards: "বোর্ড", worlds: "জগৎ", leaderboard: "লিডারবোর্ড", settings: "সেটিংস", inbox: "ইনবক্স", events: "ইভেন্ট", account: "অ্যাকাউন্ট", best: "সেরা" };
const ta: Table = { welcome: "Rush Rivals-க்கு வரவேற்கிறோம்!", chooseLanguage: "உங்கள் மொழியைத் தேர்ந்தெடுக்கவும்", continue: "தொடரவும்", claim: "பெறுக", accept: "ஏற்று தொடரவும்", giftTitle: "வரவேற்பு பரிசு!", play: "விளையாடு", missions: "பணிகள்", daily: "தினசரி", shop: "கடை", characters: "கதாபாத்திரங்கள்", boards: "பலகைகள்", worlds: "உலகங்கள்", leaderboard: "தரவரிசை", settings: "அமைப்புகள்", inbox: "இன்பாக்ஸ்", events: "நிகழ்வுகள்", account: "கணக்கு", best: "சிறந்தது" };
const te: Table = { welcome: "Rush Rivals కు స్వాగతం!", chooseLanguage: "మీ భాషను ఎంచుకోండి", continue: "కొనసాగించు", claim: "పొందండి", accept: "అంగీకరించి కొనసాగించు", giftTitle: "స్వాగత బహుమతి!", play: "ఆడండి", missions: "మిషన్లు", daily: "రోజువారీ", shop: "దుకాణం", characters: "పాత్రలు", boards: "బోర్డులు", worlds: "ప్రపంచాలు", leaderboard: "లీడర్‌బోర్డ్", settings: "సెట్టింగ్‌లు", inbox: "ఇన్‌బాక్స్", events: "ఈవెంట్‌లు", account: "ఖాతా", best: "ఉత్తమం" };
const kn: Table = { welcome: "Rush Rivals ಗೆ ಸ್ವಾಗತ!", chooseLanguage: "ನಿಮ್ಮ ಭಾಷೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ", continue: "ಮುಂದುವರಿಸಿ", claim: "ಪಡೆಯಿರಿ", accept: "ಒಪ್ಪಿ ಮುಂದುವರಿಸಿ", giftTitle: "ಸ್ವಾಗತ ಉಡುಗೊರೆ!", play: "ಆಡಿ", missions: "ಮಿಷನ್‌ಗಳು", daily: "ದೈನಂದಿನ", shop: "ಅಂಗಡಿ", characters: "ಪಾತ್ರಗಳು", boards: "ಬೋರ್ಡ್‌ಗಳು", worlds: "ಲೋಕಗಳು", leaderboard: "ಲೀಡರ್‌ಬೋರ್ಡ್", settings: "ಸೆಟ್ಟಿಂಗ್‌ಗಳು", inbox: "ಇನ್‌ಬಾಕ್ಸ್", events: "ಈವೆಂಟ್‌ಗಳು", account: "ಖಾತೆ", best: "ಅತ್ಯುತ್ತಮ" };
const ml: Table = { welcome: "Rush Rivals-ലേക്ക് സ്വാഗതം!", chooseLanguage: "നിങ്ങളുടെ ഭാഷ തിരഞ്ഞെടുക്കുക", continue: "തുടരുക", claim: "നേടുക", accept: "അംഗീകരിച്ച് തുടരുക", giftTitle: "സ്വാഗത സമ്മാനം!", play: "കളിക്കുക", missions: "ദൗത്യങ്ങൾ", daily: "ദിവസേന", shop: "കട", characters: "കഥാപാത്രങ്ങൾ", boards: "ബോർഡുകൾ", worlds: "ലോകങ്ങൾ", leaderboard: "ലീഡർബോർഡ്", settings: "ക്രമീകരണങ്ങൾ", inbox: "ഇൻബോക്സ്", events: "ഇവന്റുകൾ", account: "അക്കൗണ്ട്", best: "മികച്ചത്" };

const tables: Record<string, Table> = { en, hi, bn, ta, te, kn, ml };

/** REQ-43 language list (storyboard order). */
export const LANGUAGES = [
  { id: "en", label: "English" },
  { id: "hi", label: "हिन्दी" },
  { id: "bn", label: "বাংলা" },
  { id: "ta", label: "தமிழ்" },
  { id: "te", label: "తెలుగు" },
  { id: "kn", label: "ಕನ್ನಡ" },
  { id: "ml", label: "മലയാളം" },
];

export function t(key: StringKey, lang = "en"): string {
  return tables[lang]?.[key] ?? en[key];
}

/** Every key in every language resolves to a non-empty string (fallback to English). */
export function missingKeys(lang: string): StringKey[] {
  return (Object.keys(en) as StringKey[]).filter((k) => !tables[lang]?.[k]);
}
