import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Chinese translations
import zhCommon from './zh/common.json';
import zhNav from './zh/nav.json';
import zhStatus from './zh/status.json';
import zhDashboard from './zh/dashboard.json';
import zhArtworks from './zh/artworks.json';
import zhEditions from './zh/editions.json';
import zhLocations from './zh/locations.json';
import zhChat from './zh/chat.json';
import zhSettings from './zh/settings.json';
import zhImport from './zh/import.json';
import zhTrash from './zh/trash.json';
import zhExport from './zh/export.json';
import zhHistory from './zh/history.json';
import zhEditionDetail from './zh/editionDetail.json';
import zhArtworkDetail from './zh/artworkDetail.json';
import zhLinks from './zh/links.json';
import zhPublicView from './zh/publicView.json';

// English translations
import enCommon from './en/common.json';
import enNav from './en/nav.json';
import enStatus from './en/status.json';
import enDashboard from './en/dashboard.json';
import enArtworks from './en/artworks.json';
import enEditions from './en/editions.json';
import enLocations from './en/locations.json';
import enChat from './en/chat.json';
import enSettings from './en/settings.json';
import enImport from './en/import.json';
import enTrash from './en/trash.json';
import enExport from './en/export.json';
import enHistory from './en/history.json';
import enEditionDetail from './en/editionDetail.json';
import enArtworkDetail from './en/artworkDetail.json';
import enLinks from './en/links.json';
import enPublicView from './en/publicView.json';

const resources = {
  zh: {
    common: zhCommon,
    nav: zhNav,
    status: zhStatus,
    dashboard: zhDashboard,
    artworks: zhArtworks,
    editions: zhEditions,
    locations: zhLocations,
    chat: zhChat,
    settings: zhSettings,
    import: zhImport,
    trash: zhTrash,
    export: zhExport,
    history: zhHistory,
    editionDetail: zhEditionDetail,
    artworkDetail: zhArtworkDetail,
    links: zhLinks,
    publicView: zhPublicView,
  },
  en: {
    common: enCommon,
    nav: enNav,
    status: enStatus,
    dashboard: enDashboard,
    artworks: enArtworks,
    editions: enEditions,
    locations: enLocations,
    chat: enChat,
    settings: enSettings,
    import: enImport,
    trash: enTrash,
    export: enExport,
    history: enHistory,
    editionDetail: enEditionDetail,
    artworkDetail: enArtworkDetail,
    links: enLinks,
    publicView: enPublicView,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'zh',
    defaultNS: 'common',
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },
    interpolation: {
      escapeValue: false, // React already escapes
    },
  });

export default i18n;
