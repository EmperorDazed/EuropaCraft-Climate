/* ==========================================================
   EuropaCraft Climate Engine v3
   Geography + regional climate refinements

   Map:
   26°W to 52°E
   30°N to 74°N

   This is BASE CLIMATE.

   It does NOT represent today's air mass.
   Dynamic weather is handled by europacraft-weather-v1.js.
========================================================== */

(function (global) {

"use strict";


const DEG =
    Math.PI /
    180;


const BOUNDS = {

    west:
        -26,

    east:
        52,

    south:
        30,

    north:
        74

};


const TYPES = [

    "Atlantic",

    "Polar Maritime",

    "Arctic Maritime",

    "Greenland Ice-Sheet",

    "North Sea",

    "Baltic Maritime",

    "Mediterranean",

    "Black Sea",

    "Caspian Maritime",

    "North African",

    "Eurasian Continental",

    "British Landmass",

    "Iberian Interior",

    "West-Central European",

    "Central / Eastern European",

    "Scandinavian Interior",

    "Balkan Modified",

    "Anatolian Interior"

];


/* ==========================================================
   BASIC FUNCTIONS
========================================================== */

function clamp(
    value,
    minimum,
    maximum
) {

    return Math.max(
        minimum,
        Math.min(
            maximum,
            value
        )
    );

}


function smoothstep(
    minimum,
    maximum,
    value
) {

    if (
        minimum ===
        maximum
    ) {

        return (
            value >=
            maximum
                ? 1
                : 0
        );

    }


    let x =
        clamp(
            (
                value -
                minimum
            ) /
            (
                maximum -
                minimum
            ),
            0,
            1
        );


    return (
        x *
        x *
        (
            3 -
            2 *
            x
        )
    );

}


function haversineKm(
    latitude1,
    longitude1,
    latitude2,
    longitude2
) {

    const p1 =
        latitude1 *
        DEG;


    const p2 =
        latitude2 *
        DEG;


    const latitudeDifference =
        (
            latitude2 -
            latitude1
        ) *
        DEG;


    const longitudeDifference =
        (
            longitude2 -
            longitude1
        ) *
        DEG;


    const a =

        Math.sin(
            latitudeDifference /
            2
        ) ** 2 +

        Math.cos(
            p1
        ) *

        Math.cos(
            p2
        ) *

        Math.sin(
            longitudeDifference /
            2
        ) ** 2;


    return (

        6371.0088 *

        2 *

        Math.atan2(
            Math.sqrt(a),
            Math.sqrt(
                1 -
                a
            )
        )

    );

}


function gaussian(
    latitude,
    longitude,
    centreLatitude,
    centreLongitude,
    radiusKm
) {

    const distance =
        haversineKm(
            latitude,
            longitude,
            centreLatitude,
            centreLongitude
        );


    return Math.exp(

        -0.5 *

        (
            distance /
            radiusKm
        ) ** 2

    );

}


function blankClimate() {

    const output =
        {};


    for (
        const type
        of TYPES
    ) {

        output[type] =
            0;

    }


    return output;

}


function add(
    object,
    type,
    amount
) {

    object[type] =
        (
            object[type] ||
            0
        ) +
        amount;

}


function reduce(
    object,
    type,
    amount
) {

    object[type] =
        Math.max(

            0,

            (
                object[type] ||
                0
            ) -
            amount

        );

}


function normalize(
    raw
) {

    let total =
        0;


    for (
        const type
        of TYPES
    ) {

        total +=
            Math.max(
                0,
                raw[type] ||
                0
            );

    }


    const output =
        {};


    if (
        total <=
        0
    ) {

        for (
            const type
            of TYPES
        ) {

            output[type] =
                0;

        }


        return output;

    }


    for (
        const type
        of TYPES
    ) {

        output[type] =

            100 *

            Math.max(
                0,
                raw[type] ||
                0
            ) /

            total;

    }


    return output;

}


/* ==========================================================
   LARGE SCALE EUROPEAN CLIMATE
========================================================== */

function geographicClimate(
    latitude,
    longitude
) {

    const climate =
        blankClimate();


    /* ======================================================
       ATLANTIC
    ====================================================== */

    const atlanticLongitudeDecay =

        Math.exp(

            -Math.max(
                0,
                longitude +
                10
            ) /

            20

        );


    add(

        climate,

        "Atlantic",

        75 *

        atlanticLongitudeDecay *

        (
            0.62 +

            0.38 *

            gaussian(
                latitude,
                longitude,
                52,
                -12,
                1900
            )
        )

    );


    /* ======================================================
       SUBPOLAR ATLANTIC
    ====================================================== */

    add(

        climate,

        "Polar Maritime",

        52 *

        gaussian(
            latitude,
            longitude,
            61,
            -7,
            1750
        )

    );


    /* ======================================================
       ARCTIC
    ====================================================== */

    add(

        climate,

        "Arctic Maritime",

        58 *

        gaussian(
            latitude,
            longitude,
            71,
            7,
            1550
        )

    );


    /* ======================================================
       GREENLAND
    ====================================================== */

    add(

        climate,

        "Greenland Ice-Sheet",

        82 *

        gaussian(
            latitude,
            longitude,
            70,
            -22,
            850
        )

    );


    /* ======================================================
       NORTH SEA
    ====================================================== */

    add(

        climate,

        "North Sea",

        78 *

        gaussian(
            latitude,
            longitude,
            56,
            4,
            620
        )

    );


    /* ======================================================
       BALTIC
    ====================================================== */

    add(

        climate,

        "Baltic Maritime",

        76 *

        gaussian(
            latitude,
            longitude,
            58,
            20,
            690
        )

    );


    /* ======================================================
       MEDITERRANEAN
    ====================================================== */

    const westernMediterranean =
        gaussian(
            latitude,
            longitude,
            39,
            8,
            1150
        );


    const centralMediterranean =
        gaussian(
            latitude,
            longitude,
            37,
            19,
            1250
        );


    const easternMediterranean =
        gaussian(
            latitude,
            longitude,
            35,
            30,
            1150
        );


    add(

        climate,

        "Mediterranean",

        82 *

        Math.max(
            westernMediterranean,
            centralMediterranean,
            easternMediterranean
        )

    );


    /* ======================================================
       BLACK SEA
    ====================================================== */

    add(

        climate,

        "Black Sea",

        78 *

        gaussian(
            latitude,
            longitude,
            43,
            34,
            650
        )

    );


    /* ======================================================
       CASPIAN
    ====================================================== */

    add(

        climate,

        "Caspian Maritime",

        72 *

        gaussian(
            latitude,
            longitude,
            42,
            50,
            620
        )

    );


    /* ======================================================
       EURASIAN CONTINENTAL
    ====================================================== */

    const easternFactor =
        smoothstep(
            10,
            46,
            longitude
        );


    const latitudeFactor =
        smoothstep(
            40,
            59,
            latitude
        );


    add(

        climate,

        "Eurasian Continental",

        90 *
        easternFactor *
        latitudeFactor

    );


    /* ======================================================
       BRITISH LANDMASS
    ====================================================== */

    add(

        climate,

        "British Landmass",

        74 *

        gaussian(
            latitude,
            longitude,
            54,
            -3,
            630
        )

    );


    /* ======================================================
       IBERIAN INTERIOR
    ====================================================== */

    add(

        climate,

        "Iberian Interior",

        82 *

        gaussian(
            latitude,
            longitude,
            40,
            -4,
            660
        )

    );


    /* ======================================================
       WEST CENTRAL EUROPE
    ====================================================== */

    add(

        climate,

        "West-Central European",

        82 *

        gaussian(
            latitude,
            longitude,
            49,
            7,
            1000
        )

    );


    /* ======================================================
       CENTRAL / EASTERN EUROPE
    ====================================================== */

    add(

        climate,

        "Central / Eastern European",

        84 *

        gaussian(
            latitude,
            longitude,
            50,
            22,
            1200
        )

    );


    /* ======================================================
       SCANDINAVIAN INTERIOR
    ====================================================== */

    add(

        climate,

        "Scandinavian Interior",

        86 *

        gaussian(
            latitude,
            longitude,
            64,
            16,
            980
        )

    );


    /* ======================================================
       BALKAN
    ====================================================== */

    add(

        climate,

        "Balkan Modified",

        83 *

        gaussian(
            latitude,
            longitude,
            43,
            21,
            820
        )

    );


    /* ======================================================
       ANATOLIA
    ====================================================== */

    add(

        climate,

        "Anatolian Interior",

        88 *

        gaussian(
            latitude,
            longitude,
            39,
            33,
            820
        )

    );


    /* ======================================================
       NORTH AFRICA
    ====================================================== */

    add(

        climate,

        "North African",

        92 *

        Math.max(

            gaussian(
                latitude,
                longitude,
                31,
                2,
                1150
            ),

            gaussian(
                latitude,
                longitude,
                31,
                18,
                1200
            )

        )

    );


    /*
     * Tiny background floor.
     *
     * Prevents exact mathematical disappearance
     * of an influence.
     */

    for (
        const type
        of TYPES
    ) {

        climate[type] +=
            0.10;

    }


    return climate;

}


/* ==========================================================
   LOCAL REGIONAL REFINEMENT

   This is what stops giant regional blobs.

   Examples:
   Pomerania != Greater Poland
   Slovenia != Dalmatia
   Dalmatia != Zagreb
   Transylvania != Wallachia
========================================================== */

function applyRegionalRefinements(
    latitude,
    longitude,
    original
) {

    const climate =
        {
            ...original
        };


    function bump(
        type,
        strength,
        centreLatitude,
        centreLongitude,
        radius
    ) {

        add(

            climate,

            type,

            strength *

            gaussian(
                latitude,
                longitude,
                centreLatitude,
                centreLongitude,
                radius
            )

        );

    }


    function trim(
        type,
        strength,
        centreLatitude,
        centreLongitude,
        radius
    ) {

        reduce(

            climate,

            type,

            strength *

            gaussian(
                latitude,
                longitude,
                centreLatitude,
                centreLongitude,
                radius
            )

        );

    }


    /* ======================================================
       POLAND
    ====================================================== */


    /*
     * Pomeranian / Baltic coast.
     */

    bump(
        "Baltic Maritime",
        34,
        54.20,
        16.25,
        230
    );


    bump(
        "Atlantic",
        14,
        54.20,
        16.25,
        270
    );


    trim(
        "Central / Eastern European",
        11,
        54.20,
        16.25,
        220
    );


    /*
     * Greater Poland / Poznań interior.
     */

    bump(
        "Central / Eastern European",
        30,
        52.35,
        16.75,
        230
    );


    bump(
        "West-Central European",
        13,
        52.35,
        16.75,
        260
    );


    trim(
        "Baltic Maritime",
        19,
        52.35,
        16.75,
        220
    );


    /*
     * Masovia.
     */

    bump(
        "Central / Eastern European",
        24,
        52.2,
        21.0,
        300
    );


    bump(
        "Eurasian Continental",
        8,
        52.2,
        21.0,
        360
    );


    /*
     * Southeastern Poland.
     */

    bump(
        "Central / Eastern European",
        20,
        50.3,
        22.3,
        300
    );


    bump(
        "Balkan Modified",
        5,
        50.3,
        22.3,
        300
    );


    /* ======================================================
       SLOVENIA / CROATIA / DALMATIA
    ====================================================== */


    /*
     * Slovenia.
     *
     * Alpine / west-central / Balkan transitional.
     */

    bump(
        "West-Central European",
        30,
        46.15,
        14.85,
        170
    );


    bump(
        "Balkan Modified",
        16,
        46.15,
        14.85,
        180
    );


    trim(
        "Mediterranean",
        13,
        46.15,
        14.85,
        160
    );


    /*
     * Zagreb / inland Croatia.
     */

    bump(
        "Central / Eastern European",
        28,
        45.80,
        16.00,
        170
    );


    bump(
        "Balkan Modified",
        22,
        45.80,
        16.00,
        190
    );


    trim(
        "Mediterranean",
        17,
        45.80,
        16.00,
        170
    );


    /*
     * Dalmatia.
     */

    bump(
        "Mediterranean",
        48,
        43.25,
        16.50,
        250
    );


    bump(
        "Balkan Modified",
        23,
        43.25,
        16.50,
        250
    );


    trim(
        "West-Central European",
        18,
        43.25,
        16.50,
        220
    );


    trim(
        "Central / Eastern European",
        13,
        43.25,
        16.50,
        220
    );


    /* ======================================================
       TRANSYLVANIA / ROMANIA
    ====================================================== */


    /*
     * Transylvania.
     */

    bump(
        "Central / Eastern European",
        34,
        46.60,
        24.50,
        290
    );


    bump(
        "Balkan Modified",
        8,
        46.60,
        24.50,
        270
    );


    trim(
        "Black Sea",
        13,
        46.60,
        24.50,
        250
    );


    /*
     * Wallachia.
     */

    bump(
        "Balkan Modified",
        20,
        44.5,
        26.0,
        260
    );


    bump(
        "Black Sea",
        8,
        44.5,
        26.0,
        300
    );


    /* ======================================================
       ITALY
    ====================================================== */


    /*
     * Po Valley.
     */

    bump(
        "West-Central European",
        32,
        45.1,
        9.7,
        250
    );


    bump(
        "Central / Eastern European",
        13,
        45.1,
        9.7,
        250
    );


    trim(
        "Mediterranean",
        16,
        45.1,
        9.7,
        220
    );


    /*
     * Southern Italy.
     */

    bump(
        "Mediterranean",
        38,
        40.4,
        15.5,
        430
    );


    /* ======================================================
       IBERIA
    ====================================================== */


    /*
     * Galicia.
     */

    bump(
        "Atlantic",
        32,
        42.8,
        -8.0,
        310
    );


    trim(
        "Iberian Interior",
        15,
        42.8,
        -8.0,
        270
    );


    /*
     * Castilian interior.
     */

    bump(
        "Iberian Interior",
        40,
        40.5,
        -4.2,
        480
    );


    trim(
        "Atlantic",
        13,
        40.5,
        -4.2,
        390
    );


    /*
     * Mediterranean Spanish coast.
     */

    bump(
        "Mediterranean",
        32,
        39.4,
        0.1,
        340
    );


    /* ======================================================
       NORWAY / SCANDINAVIA
    ====================================================== */


    /*
     * Western Norway.
     */

    bump(
        "Polar Maritime",
        37,
        62.5,
        5.5,
        490
    );


    bump(
        "Atlantic",
        26,
        62.5,
        5.5,
        530
    );


    trim(
        "Scandinavian Interior",
        18,
        62.5,
        5.5,
        410
    );


    /*
     * Scandinavian interior.
     */

    bump(
        "Scandinavian Interior",
        42,
        63.5,
        15.0,
        580
    );


    /* ======================================================
       BALTIC / FINLAND
    ====================================================== */


    bump(
        "Baltic Maritime",
        30,
        58.5,
        23.0,
        410
    );


    bump(
        "Scandinavian Interior",
        28,
        64.0,
        26.0,
        510
    );


    /* ======================================================
       FRANCE
    ====================================================== */


    /*
     * Brittany.
     */

    bump(
        "Atlantic",
        38,
        48.2,
        -3.2,
        320
    );


    /*
     * Central France.
     */

    bump(
        "West-Central European",
        20,
        46.5,
        3.0,
        580
    );


    /*
     * Provence / Mediterranean France.
     */

    bump(
        "Mediterranean",
        36,
        43.6,
        5.2,
        290
    );


    /* ======================================================
       BLACK SEA / UKRAINE
    ====================================================== */


    /*
     * Crimea / Black Sea coast.
     */

    bump(
        "Black Sea",
        42,
        44.5,
        34.0,
        320
    );


    /*
     * Ukrainian continental interior.
     */

    bump(
        "Eurasian Continental",
        32,
        50.0,
        35.0,
        540
    );


    /* ======================================================
       ANATOLIA
    ====================================================== */


    /*
     * Central Anatolian plateau.
     */

    bump(
        "Anatolian Interior",
        46,
        39.0,
        33.0,
        510
    );


    /*
     * Aegean Turkey.
     */

    bump(
        "Mediterranean",
        39,
        38.2,
        27.0,
        320
    );


    trim(
        "Anatolian Interior",
        18,
        38.2,
        27.0,
        280
    );


    /* ======================================================
       UNITED KINGDOM
    ====================================================== */


    /*
     * Western Britain / Ireland:
     * stronger Atlantic.
     */

    bump(
        "Atlantic",
        31,
        53.5,
        -6.0,
        500
    );


    /*
     * Eastern England:
     * North Sea influence.
     */

    bump(
        "North Sea",
        32,
        53.0,
        1.0,
        430
    );


    /*
     * Scotland:
     * stronger polar maritime.
     */

    bump(
        "Polar Maritime",
        24,
        57.0,
        -4.0,
        480
    );


    /* ======================================================
       RUSSIA
    ====================================================== */


    /*
     * Western Russia.
     */

    bump(
        "Eurasian Continental",
        42,
        55.0,
        40.0,
        700
    );


    /*
     * Northwest Russia retains more Baltic /
     * polar-maritime access.
     */

    bump(
        "Baltic Maritime",
        13,
        59.0,
        30.0,
        420
    );


    bump(
        "Polar Maritime",
        8,
        60.0,
        31.0,
        500
    );


    return climate;

}


/* ==========================================================
   LAND / SEA MODIFICATION
========================================================== */

function applySurface(
    climate,
    landFraction
) {

    const output =
        {
            ...climate
        };


    landFraction =
        clamp(
            landFraction,
            0,
            1
        );


    const waterFraction =
        1 -
        landFraction;


    /*
     * Water strengthens maritime families.
     */

    const maritimeMultiplier =
        0.76 +
        0.42 *
        waterFraction;


    /*
     * Land strengthens continental /
     * terrestrial modifiers.
     */

    const landMultiplier =
        0.76 +
        0.42 *
        landFraction;


    const maritimeTypes = [

        "Atlantic",

        "Polar Maritime",

        "Arctic Maritime",

        "North Sea",

        "Baltic Maritime",

        "Mediterranean",

        "Black Sea",

        "Caspian Maritime"

    ];


    const landTypes = [

        "Eurasian Continental",

        "British Landmass",

        "Iberian Interior",

        "West-Central European",

        "Central / Eastern European",

        "Scandinavian Interior",

        "Balkan Modified",

        "Anatolian Interior",

        "North African"

    ];


    for (
        const type
        of maritimeTypes
    ) {

        output[type] *=
            maritimeMultiplier;

    }


    for (
        const type
        of landTypes
    ) {

        output[type] *=
            landMultiplier;

    }


    return output;

}


/* ==========================================================
   MAIN CLIMATE FUNCTION
========================================================== */

function getClimate(
    latitude,
    longitude,
    options = {}
) {

    latitude =
        Number(latitude);


    longitude =
        Number(longitude);


    if (
        !Number.isFinite(
            latitude
        ) ||

        !Number.isFinite(
            longitude
        )
    ) {

        throw new Error(
            "Latitude and longitude must be numbers."
        );

    }


    const landFraction =
        Number.isFinite(
            options.landFraction
        )

            ? clamp(
                options.landFraction,
                0,
                1
            )

            : 0.5;


    let climate =
        geographicClimate(
            latitude,
            longitude
        );


    climate =
        applyRegionalRefinements(
            latitude,
            longitude,
            climate
        );


    climate =
        applySurface(
            climate,
            landFraction
        );


    const normalized =
        normalize(
            climate
        );


    const dominant =
        Object.entries(
            normalized
        )
        .sort(
            (
                a,
                b
            ) =>
            b[1] -
            a[1]
        )
        .slice(
            0,
            6
        );


    return {

        lat:
            latitude,

        lon:
            longitude,

        landFraction:
            landFraction,

        raw:
            climate,

        normalized:
            normalized,

        dominant:
            dominant,

        outsideBounds:

            longitude <
            BOUNDS.west ||

            longitude >
            BOUNDS.east ||

            latitude <
            BOUNDS.south ||

            latitude >
            BOUNDS.north

    };

}


/* ==========================================================
   DERIVED CLIMATE INDICES
========================================================== */

function getIndices(
    latitude,
    longitude,
    options = {}
) {

    const climate =
        getClimate(
            latitude,
            longitude,
            options
        );


    const n =
        climate.normalized;


    const maritime =
        clamp(

            (
                n["Atlantic"] +

                n["Polar Maritime"] +

                n["Arctic Maritime"] +

                n["North Sea"] +

                n["Baltic Maritime"] +

                n["Mediterranean"] +

                n["Black Sea"] +

                n["Caspian Maritime"]
            ) /
            100,

            0,
            1

        );


    const continental =
        clamp(

            (
                n["Eurasian Continental"] +

                n["Iberian Interior"] +

                n["West-Central European"] +

                n["Central / Eastern European"] +

                n["Scandinavian Interior"] +

                n["Balkan Modified"] +

                n["Anatolian Interior"]
            ) /
            100,

            0,
            1

        );


    const warmSource =
        clamp(

            (
                n["Mediterranean"] +

                n["North African"] +

                n["Anatolian Interior"]
            ) /
            100,

            0,
            1

        );


    const coldSource =
        clamp(

            (
                n["Arctic Maritime"] +

                n["Greenland Ice-Sheet"] +

                n["Scandinavian Interior"] +

                n["Eurasian Continental"] *
                0.55
            ) /
            100,

            0,
            1

        );


    return {

        ...climate,

        indices: {

            maritime:
                maritime,

            continental:
                continental,

            warmSource:
                warmSource,

            coldSource:
                coldSource

        }

    };

}


/* ==========================================================
   BASELINE TEMPERATURE

   This is NOT final weather.

   Weather engine modifies this using current atmospheric
   circulation.
========================================================== */

function getBaselineTemperature(
    latitude,
    longitude,
    date = new Date(),
    options = {}
) {

    const climate =
        getIndices(
            latitude,
            longitude,
            options
        );


    const d =
        date instanceof Date
            ? date
            : new Date(date);


    const year =
        d.getUTCFullYear();


    const start =
        Date.UTC(
            year,
            0,
            0
        );


    const now =
        Date.UTC(
            year,
            d.getUTCMonth(),
            d.getUTCDate()
        );


    const dayOfYear =
        Math.floor(
            (
                now -
                start
            ) /
            86400000
        );


    const altitude =
        Number.isFinite(
            options.altitudeM
        )

            ? Math.max(
                -50,
                options.altitudeM
            )

            : 0;


    const latitudeAbsolute =
        Math.abs(
            latitude
        );


    /*
     * Annual mean declines northward.
     */

    const annualMean =

        16.5 -

        0.34 *

        Math.max(
            0,
            latitudeAbsolute -
            35
        ) -

        0.012 *

        Math.max(
            0,
            longitude -
            10
        );


    /*
     * Continental areas have greater
     * seasonal amplitude.

     * Maritime areas have lower amplitude.
     */

    const amplitudeBase =

        8 +

        0.34 *

        Math.max(
            0,
            latitudeAbsolute -
            35
        );


    const amplitude =

        amplitudeBase *

        (
            1 -

            0.42 *
            climate.indices.maritime +

            0.34 *
            climate.indices.continental
        );


    /*
     * Northern Hemisphere temperature peak
     * around late July.
     */

    const seasonal =

        amplitude *

        Math.cos(

            2 *

            Math.PI *

            (
                dayOfYear -
                205
            ) /

            365.2422

        );


    const sourceAdjustment =

        3.0 *
        climate.indices.warmSource -

        3.2 *
        climate.indices.coldSource;


    /*
     * Environmental lapse rate.
     */

    const altitudeAdjustment =

        -0.0062 *

        altitude;


    const meanTemperature =

        annualMean +

        seasonal +

        sourceAdjustment +

        altitudeAdjustment;


    /*
     * Maritime climates:
     * smaller daily range.

     * Continental climates:
     * larger daily range.
     */

    const diurnalRange =
        clamp(

            6.5 +

            6 *
            climate.indices.continental -

            4.5 *
            climate.indices.maritime,

            3,
            15

        );


    return {

        climate:
            climate,

        date:
            d.toISOString(),

        meanC:
            meanTemperature,

        highC:

            meanTemperature +

            diurnalRange /
            2,

        lowC:

            meanTemperature -

            diurnalRange /
            2,

        diurnalRangeC:
            diurnalRange

    };

}


/* ==========================================================
   PUBLIC API
========================================================== */

global.EuropaClimate =
    Object.freeze({

        version:
            "3.1-geographic",

        bounds:
            BOUNDS,

        types:
            TYPES.slice(),

        getClimate:
            getClimate,

        getIndices:
            getIndices,

        getBaselineTemperature:
            getBaselineTemperature,

        normalize:
            normalize

    });


})(window);
