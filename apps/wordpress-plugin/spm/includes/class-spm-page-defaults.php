<?php
if (!defined('ABSPATH')) exit;

/**
 * Suggested page titles and URL slugs per language, so the setup wizard can
 * fill in a multilingual site without the admin translating anything. Every
 * value stays editable in the wizard; unknown languages fall back to English.
 */
class SPM_Page_Defaults {
    // lang => [listings slug, detail slug, wishlist slug, listings title, detail title, wishlist title, map title]
    private static $table = [
        'en' => ['properties', 'property', 'wishlist', 'Properties', 'Property Detail', 'Wishlist', 'Map Search'],
        'es' => ['propiedades', 'propiedad', 'favoritos', 'Propiedades', 'Detalle de la propiedad', 'Favoritos', 'Búsqueda en el mapa'],
        'de' => ['immobilien', 'immobilie', 'merkliste', 'Immobilien', 'Immobiliendetails', 'Merkliste', 'Kartensuche'],
        'fr' => ['proprietes', 'propriete', 'favoris', 'Propriétés', 'Détail du bien', 'Favoris', 'Recherche sur la carte'],
        'nl' => ['woningen', 'woning', 'favorieten', 'Woningen', 'Woningdetails', 'Favorieten', 'Zoeken op de kaart'],
        'it' => ['immobili', 'immobile', 'preferiti', 'Immobili', 'Dettagli immobile', 'Preferiti', 'Ricerca sulla mappa'],
        'pt' => ['imoveis', 'imovel', 'favoritos', 'Imóveis', 'Detalhes do imóvel', 'Favoritos', 'Pesquisa no mapa'],
        'sv' => ['bostader', 'bostad', 'favoriter', 'Bostäder', 'Bostadsdetaljer', 'Favoriter', 'Kartsök'],
        'nb' => ['eiendommer', 'eiendom', 'favoritter', 'Eiendommer', 'Eiendomsdetaljer', 'Favoritter', 'Kartsøk'],
        'da' => ['boliger', 'bolig', 'favoritter', 'Boliger', 'Boligdetaljer', 'Favoritter', 'Kortsøgning'],
        'fi' => ['kohteet', 'kohde', 'suosikit', 'Kohteet', 'Kohteen tiedot', 'Suosikit', 'Karttahaku'],
        'pl' => ['nieruchomosci', 'nieruchomosc', 'ulubione', 'Nieruchomości', 'Szczegóły nieruchomości', 'Ulubione', 'Wyszukiwanie na mapie'],
        'ru' => ['nedvizhimost', 'obekt', 'izbrannoe', 'Недвижимость', 'Объект недвижимости', 'Избранное', 'Поиск на карте'],
    ];

    private static $aliases = ['no' => 'nb', 'nn' => 'nb', 'pt-br' => 'pt', 'pt-pt' => 'pt', 'se' => 'sv'];

    private static function row($lang) {
        $lang = strtolower((string) $lang);
        $lang = self::$aliases[$lang] ?? $lang;
        if (!isset(self::$table[$lang])) {
            $short = substr($lang, 0, 2);
            $lang = isset(self::$table[$short]) ? $short : 'en';
        }
        return self::$table[$lang];
    }

    /** @return array{listings:string,detail:string,wishlist:string} */
    public static function slugs($lang) {
        $r = self::row($lang);
        return ['listings' => $r[0], 'detail' => $r[1], 'wishlist' => $r[2]];
    }

    /** @return array{listings:string,detail:string,wishlist:string,map:string} */
    public static function titles($lang) {
        $r = self::row($lang);
        return ['listings' => $r[3], 'detail' => $r[4], 'wishlist' => $r[5], 'map' => $r[6]];
    }

    /** True when the language has its own suggestions (not the English fallback). */
    public static function knows($lang) {
        $lang = strtolower((string) $lang);
        $lang = self::$aliases[$lang] ?? $lang;
        return isset(self::$table[$lang]) || isset(self::$table[substr($lang, 0, 2)]);
    }
}
