/*
 * EuropaCraft Atmospheric Simulation
 * Climate Field V3
 *
 * V10-compatible regional climate foundation.
 *
 * Responsibilities:
 *
 * - Supply smooth regional climate-source weights.
 * - Supply maritime / continental / warm / cold source indices.
 * - Supply seasonal climatological temperatures.
 * - Supply hourly climatology for anomaly diagnostics.
 * - Preserve EuropaCraft regional refinements.
 *
 * This module provides BOTH:
 *
 * V10 API:
 *   getClimate()
 *   getIndices()
 *   getBaselineTemperature()
 *   normalize()
 *
 * and useful legacy helpers:
 *   regionalIndices()
 *   baselineTemperature()
 *   hourlyClimatology()
 *   sourceWeights()
 */

(function (global) {
    "use strict";


    const U =
        global.EuropaUtils;


    const C =
        global.EuropaConfig;


    if (!U) {

        throw new Error(
            "EuropaCraft Climate V3 requires europacraft-utils.js"
        );
    }


    if (!C) {

        throw new Error(
            "EuropaCraft Climate V3 requires config.js"
        );
    }


    /* ================================================================
       DOMAIN
    ================================================================ */

    const BOUNDS =
        Object.freeze({

            west:
                -26,

            east:
                52,

            south:
                30,

            north:
                74
        });


    /* ================================================================
       CLIMATE / AIR-MASS TYPES
    ================================================================ */

    const TYPES =
        Object.freeze([

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
        ]);


    /* ================================================================
       BASIC HELPERS
    ================================================================ */

    function finite(
        value,
        fallback = 0
    ) {

        const number =
            Number(value);


        return Number.isFinite(number)
            ? number
            : fallback;
    }


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


    function clamp01(
        value
    ) {

        return clamp(
            value,
            0,
            1
        );
    }


    function validDate(
        value
    ) {

        if (
            value instanceof Date &&
            Number.isFinite(
                value.getTime()
            )
        ) {

            return value;
        }


        const date =
            new Date(value);


        if (
            Number.isFinite(
                date.getTime()
            )
        ) {

            return date;
        }


        return new Date();
    }


    function blankWeights() {

        const result =
            Object.create(
                null
            );


        for (
            const type of TYPES
        ) {

            result[type] =
                0;
        }


        return result;
    }


    function addWeight(
        weights,
        type,
        value
    ) {

        weights[type] =
            (
                weights[type] ||
                0
            ) +
            Math.max(
                0,
                finite(
                    value,
                    0
                )
            );
    }


    /* ================================================================
       NORMALISATION
    ================================================================ */

    function normalize(
        raw
    ) {

        const result =
            Object.create(
                null
            );


        let total =
            0;


        for (
            const type of TYPES
        ) {

            total +=
                Math.max(
                    0,
                    finite(
                        raw &&
                        raw[type],
                        0
                    )
                );
        }


        if (
            total <=
            1e-12
        ) {

            const equal =
                100 /
                TYPES.length;


            for (
                const type of TYPES
            ) {

                result[type] =
                    equal;
            }


            return result;
        }


        for (
            const type of TYPES
        ) {

            result[type] =
                100 *
                Math.max(
                    0,
                    finite(
                        raw[type],
                        0
                    )
                ) /
                total;
        }


        return result;
    }


    const normalise =
        normalize;


    /* ================================================================
       SPATIAL SHAPES
    ================================================================ */

    function gaussian2D(
        lat,
        lon,
        centreLat,
        centreLon,
        sigmaLat,
        sigmaLon
    ) {

        const dy =
            (
                lat -
                centreLat
            ) /
            Math.max(
                0.001,
                sigmaLat
            );


        /*
         * Longitude degrees become geographically narrower with
         * latitude. Applying a modest cosine correction keeps regional
         * source shapes geographically reasonable.
         */

        const latitudeScale =
            Math.max(
                0.40,
                Math.cos(
                    centreLat *
                    Math.PI /
                    180
                )
            );


        const dx =
            (
                lon -
                centreLon
            ) *
            latitudeScale /
            Math.max(
                0.001,
                sigmaLon *
                latitudeScale
            );


        return Math.exp(
            -0.5 *
            (
                dx * dx +
                dy * dy
            )
        );
    }


    function maxGaussian(
        lat,
        lon,
        centres
    ) {

        let maximum =
            0;


        for (
            const centre of centres
        ) {

            maximum =
                Math.max(

                    maximum,

                    gaussian2D(
                        lat,
                        lon,
                        centre.lat,
                        centre.lon,
                        centre.sigmaLat,
                        centre.sigmaLon
                    )
                );
        }


        return maximum;
    }


    /* ================================================================
       FALLBACK LAND FRACTION
    ================================================================ */

    /*
     * Normally V10 supplies terrain.land directly through options.
     *
     * This approximation exists only for direct climate API calls that
     * do not provide a land fraction.
     */

    function estimateLandFraction(
        lat,
        lon
    ) {

        const landInfluence =
            Math.max(

                gaussian2D(
                    lat,
                    lon,
                    54,
                    -3,
                    5,
                    5
                ),

                gaussian2D(
                    lat,
                    lon,
                    40,
                    -4,
                    5,
                    7
                ),

                gaussian2D(
                    lat,
                    lon,
                    49,
                    7,
                    7,
                    11
                ),

                gaussian2D(
                    lat,
                    lon,
                    51,
                    21,
                    9,
                    15
                ),

                gaussian2D(
                    lat,
                    lon,
                    63,
                    17,
                    8,
                    10
                ),

                gaussian2D(
                    lat,
                    lon,
                    43,
                    22,
                    6,
                    10
                ),

                gaussian2D(
                    lat,
                    lon,
                    39,
                    34,
                    5,
                    11
                ),

                gaussian2D(
                    lat,
                    lon,
                    32,
                    10,
                    5,
                    28
                )
            );


        const seaInfluence =
            Math.max(

                gaussian2D(
                    lat,
                    lon,
                    54,
                    -16,
                    13,
                    15
                ),

                gaussian2D(
                    lat,
                    lon,
                    56,
                    4,
                    5,
                    7
                ),

                gaussian2D(
                    lat,
                    lon,
                    58,
                    20,
                    5,
                    9
                ),

                gaussian2D(
                    lat,
                    lon,
                    38,
                    15,
                    5,
                    18
                ),

                gaussian2D(
                    lat,
                    lon,
                    43,
                    34,
                    4,
                    8
                )
            );


        return clamp01(
            landInfluence /
            Math.max(
                0.001,
                landInfluence +
                seaInfluence
            )
        );
    }


    /* ================================================================
       SEASON
    ================================================================ */

    function dayOfYear(
        date
    ) {

        if (
            typeof U.dayOfYearUTC ===
            "function"
        ) {

            return U.dayOfYearUTC(
                date
            );
        }


        const d =
            validDate(
                date
            );


        const beginning =
            Date.UTC(
                d.getUTCFullYear(),
                0,
                0
            );


        const current =
            Date.UTC(
                d.getUTCFullYear(),
                d.getUTCMonth(),
                d.getUTCDate()
            );


        return Math.floor(
            (
                current -
                beginning
            ) /
            86400000
        );
    }


    function seasonalPhase(
        date,
        peakDay = 205
    ) {

        return Math.cos(
            2 *
            Math.PI *
            (
                dayOfYear(
                    validDate(
                        date
                    )
                ) -
                peakDay
            ) /
            365.2422
        );
    }


    /* ================================================================
       REGIONAL CLIMATE INDICES
    ================================================================ */

    function regionalIndices(
        latitude,
        longitude,
        options = {}
    ) {

        const lat =
            finite(
                latitude,
                50
            );


        const lon =
            finite(
                longitude,
                10
            );


        const landFraction =
            Number.isFinite(
                Number(
                    options.landFraction
                )
            )
                ? clamp01(
                    Number(
                        options.landFraction
                    )
                )
                : estimateLandFraction(
                    lat,
                    lon
                );


        /*
         * ============================================================
         * ATLANTIC
         * ============================================================
         *
         * Strong western source with penetration into western and
         * central Europe. It deliberately remains possible over land:
         * maritime air does not cease being maritime the instant it
         * crosses a coastline.
         */

        const westness =
            clamp01(
                1 -
                Math.max(
                    0,
                    lon +
                    2
                ) /
                38
            );


        const northAtlantic =
            gaussian2D(
                lat,
                lon,
                54,
                -13,
                15,
                17
            );


        const atlantic =
            clamp01(
                westness *
                (
                    0.60 +
                    0.40 *
                    northAtlantic
                ) *
                (
                    1 -
                    0.28 *
                    landFraction *
                    clamp01(
                        (
                            lon -
                            4
                        ) /
                        30
                    )
                )
            );


        /* ============================================================
           ARCTIC AND POLAR
        ============================================================ */

        const arctic =
            clamp01(
                (
                    lat -
                    57
                ) /
                17
            );


        const polarMaritime =
            clamp01(
                gaussian2D(
                    lat,
                    lon,
                    62,
                    -5,
                    10,
                    17
                ) *
                (
                    0.50 +
                    0.50 *
                    arctic
                )
            );


        /* ============================================================
           REGIONAL SEAS
        ============================================================ */

        const northSea =
            gaussian2D(
                lat,
                lon,
                56,
                4,
                5.5,
                8.0
            );


        const baltic =
            gaussian2D(
                lat,
                lon,
                58,
                20,
                6.0,
                11.0
            );


        const mediterranean =
            maxGaussian(
                lat,
                lon,
                [

                    {
                        lat:
                            39,

                        lon:
                            7,

                        sigmaLat:
                            5.2,

                        sigmaLon:
                            13
                    },

                    {
                        lat:
                            38,

                        lon:
                            20,

                        sigmaLat:
                            5.5,

                        sigmaLon:
                            14
                    },

                    {
                        lat:
                            35,

                        lon:
                            30,

                        sigmaLat:
                            5.0,

                        sigmaLon:
                            12
                    }
                ]
            );


        const blackSea =
            gaussian2D(
                lat,
                lon,
                43,
                34,
                4.3,
                9
            );


        const caspian =
            gaussian2D(
                lat,
                lon,
                42,
                50,
                5,
                7
            );


        /* ============================================================
           CONTINENTALITY
        ============================================================ */

        const eastness =
            clamp01(
                (
                    lon +
                    3
                ) /
                48
            );


        const centralInterior =
            Math.max(

                gaussian2D(
                    lat,
                    lon,
                    50,
                    20,
                    10,
                    16
                ),

                gaussian2D(
                    lat,
                    lon,
                    56,
                    37,
                    12,
                    17
                )
            );


        const nearbySea =
            Math.max(
                northSea,
                baltic,
                mediterranean,
                blackSea,
                caspian
            );


        const continental =
            clamp01(
                landFraction *
                (
                    0.25 +
                    0.75 *
                    eastness
                ) *
                (
                    0.40 +
                    0.60 *
                    centralInterior
                ) *
                (
                    1 -
                    0.42 *
                    nearbySea
                )
            );


        /* ============================================================
           NORTH AFRICA
        ============================================================ */

        const northAfrican =
            clamp01(
                (
                    38 -
                    lat
                ) /
                8
            ) *
            Math.max(

                gaussian2D(
                    lat,
                    lon,
                    31,
                    2,
                    7,
                    18
                ),

                gaussian2D(
                    lat,
                    lon,
                    31,
                    20,
                    7,
                    20
                )
            );


        /*
         * Approximate maritime exposure diagnostic.
         */

        const maritimeExposure =
            clamp01(
                Math.max(
                    atlantic,
                    polarMaritime,
                    northSea,
                    baltic,
                    mediterranean,
                    blackSea,
                    caspian
                )
            );


        const coastKm =
            1100 *
            (
                1 -
                maritimeExposure
            ) *
            landFraction;


        return {

            atlantic,

            polarMaritime,

            continental,

            mediterranean,

            arctic,

            northSea,

            baltic,

            blackSea,

            caspian,

            northAfrican,

            maritimeExposure,

            coastKm,

            land:
                landFraction,

            landFraction
        };
    }


    /* ================================================================
       SOURCE WEIGHTS
    ================================================================ */

    function sourceWeights(
        latitude,
        longitude,
        options = {}
    ) {

        const lat =
            finite(
                latitude,
                50
            );


        const lon =
            finite(
                longitude,
                10
            );


        const i =
            regionalIndices(
                lat,
                lon,
                options
            );


        const land =
            i.landFraction;


        const raw =
            blankWeights();


        /* ------------------------------------------------------------
           OCEANIC SOURCE FAMILIES
        ------------------------------------------------------------ */

        raw["Atlantic"] =
            0.05 +
            i.atlantic *
            1.15;


        raw["Polar Maritime"] =
            0.02 +
            i.polarMaritime *
            1.15 +
            i.atlantic *
            clamp01(
                (
                    lat -
                    48
                ) /
                20
            ) *
            0.45;


        raw["Arctic Maritime"] =
            0.01 +
            i.arctic *
            (
                0.45 +
                i.atlantic *
                0.55
            );


        raw["Greenland Ice-Sheet"] =
            0.005 +
            gaussian2D(
                lat,
                lon,
                70,
                -24,
                5,
                8
            ) *
            1.20;


        raw["North Sea"] =
            0.01 +
            i.northSea *
            1.20;


        raw["Baltic Maritime"] =
            0.01 +
            i.baltic *
            1.15;


        raw["Mediterranean"] =
            0.01 +
            i.mediterranean *
            1.25;


        raw["Black Sea"] =
            0.005 +
            i.blackSea *
            1.25;


        raw["Caspian Maritime"] =
            0.005 +
            i.caspian *
            1.20;


        raw["North African"] =
            0.005 +
            i.northAfrican *
            1.30;


        /* ------------------------------------------------------------
           CONTINENTAL / REGIONAL LAND FAMILIES
        ------------------------------------------------------------ */

        raw["Eurasian Continental"] =
            0.005 +
            i.continental *
            clamp01(
                (
                    lon -
                    12
                ) /
                32
            ) *
            1.35;


        raw["British Landmass"] =
            0.005 +
            gaussian2D(
                lat,
                lon,
                54,
                -3,
                4.5,
                5
            ) *
            land *
            1.30;


        raw["Iberian Interior"] =
            0.005 +
            gaussian2D(
                lat,
                lon,
                40,
                -4,
                4.2,
                6
            ) *
            land *
            1.35;


        raw["West-Central European"] =
            0.005 +
            gaussian2D(
                lat,
                lon,
                49,
                6,
                6.2,
                10
            ) *
            land *
            1.25;


        raw["Central / Eastern European"] =
            0.005 +
            gaussian2D(
                lat,
                lon,
                51,
                21,
                7.5,
                13
            ) *
            land *
            1.30;


        raw["Scandinavian Interior"] =
            0.005 +
            gaussian2D(
                lat,
                lon,
                63,
                17,
                6.5,
                9
            ) *
            land *
            1.40;


        raw["Balkan Modified"] =
            0.005 +
            gaussian2D(
                lat,
                lon,
                43,
                22,
                5.3,
                9.5
            ) *
            land *
            1.35;


        raw["Anatolian Interior"] =
            0.005 +
            gaussian2D(
                lat,
                lon,
                39,
                34,
                4.5,
                10
            ) *
            land *
            1.40;


        /*
         * ============================================================
         * REGIONAL REFINEMENT
         * ============================================================
         *
         * These modifiers preserve important subregional distinctions
         * instead of reducing the continent to simple longitude bands.
         */


        /*
         * Western Norway remains strongly Atlantic despite its latitude.
         */

        addWeight(
            raw,
            "Atlantic",
            0.40 *
            gaussian2D(
                lat,
                lon,
                61,
                6,
                4,
                4
            )
        );


        addWeight(
            raw,
            "Polar Maritime",
            0.25 *
            gaussian2D(
                lat,
                lon,
                64,
                6,
                5,
                5
            )
        );


        /*
         * Pomerania and northern Poland receive meaningful Baltic
         * modification while retaining continental influence.
         */

        addWeight(
            raw,
            "Baltic Maritime",
            0.48 *
            gaussian2D(
                lat,
                lon,
                53.5,
                17.5,
                2.8,
                6
            ) *
            land
        );


        addWeight(
            raw,
            "Central / Eastern European",
            0.30 *
            gaussian2D(
                lat,
                lon,
                52,
                20,
                4,
                8
            ) *
            land
        );


        /*
         * Dalmatia / Adriatic transition.
         */

        addWeight(
            raw,
            "Mediterranean",
            0.40 *
            gaussian2D(
                lat,
                lon,
                43.5,
                16,
                2.6,
                4
            )
        );


        addWeight(
            raw,
            "Balkan Modified",
            0.45 *
            gaussian2D(
                lat,
                lon,
                44,
                18,
                3.5,
                5
            ) *
            land
        );


        /*
         * Romania / Carpathian continental transition.
         */

        addWeight(
            raw,
            "Central / Eastern European",
            0.42 *
            gaussian2D(
                lat,
                lon,
                46,
                25,
                3.5,
                5
            ) *
            land
        );


        addWeight(
            raw,
            "Black Sea",
            0.27 *
            gaussian2D(
                lat,
                lon,
                45,
                29,
                4,
                6
            )
        );


        /*
         * British Isles retain a distinct landmass identity while still
         * being strongly maritime.
         */

        addWeight(
            raw,
            "British Landmass",
            0.45 *
            gaussian2D(
                lat,
                lon,
                53,
                -2,
                5,
                5
            ) *
            land
        );


        addWeight(
            raw,
            "Atlantic",
            0.25 *
            gaussian2D(
                lat,
                lon,
                54,
                -5,
                6,
                7
            )
        );


        return raw;
    }


    /* ================================================================
       PUBLIC CLIMATE FIELD
    ================================================================ */

    function getClimate(
        latitude,
        longitude,
        options = {}
    ) {

        const lat =
            Number(
                latitude
            );


        const lon =
            Number(
                longitude
            );


        if (
            !Number.isFinite(
                lat
            ) ||
            !Number.isFinite(
                lon
            )
        ) {

            throw new Error(
                "EuropaClimate.getClimate: latitude and longitude must be finite numbers."
            );
        }


        const indices =
            regionalIndices(
                lat,
                lon,
                options
            );


        const raw =
            sourceWeights(
                lat,
                lon,
                {

                    ...options,

                    landFraction:
                        indices.landFraction
                }
            );


        const normalized =
            normalize(
                raw
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

            lat,

            lon,


            landFraction:
                indices.landFraction,


            raw,

            normalized,

            dominant,


            regional:
                indices,


            outsideBounds:
                lon <
                    BOUNDS.west ||
                lon >
                    BOUNDS.east ||
                lat <
                    BOUNDS.south ||
                lat >
                    BOUNDS.north
        };
    }


    /* ================================================================
       GENERIC CLIMATE INDICES
    ================================================================ */

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
            clamp01(
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
                100
            );


        const continental =
            clamp01(
                (
                    n["Eurasian Continental"] +
                    n["Iberian Interior"] +
                    n["West-Central European"] +
                    n["Central / Eastern European"] +
                    n["Scandinavian Interior"] +
                    n["Balkan Modified"] +
                    n["Anatolian Interior"]
                ) /
                100
            );


        const warmSource =
            clamp01(
                (
                    n["Mediterranean"] +
                    n["North African"] +
                    n["Anatolian Interior"] *
                    0.65 +
                    n["Black Sea"] *
                    0.25
                ) /
                100
            );


        const coldSource =
            clamp01(
                (
                    n["Arctic Maritime"] +
                    n["Greenland Ice-Sheet"] +
                    n["Scandinavian Interior"] +
                    n["Eurasian Continental"] *
                    0.55 +
                    n["Polar Maritime"] *
                    0.35
                ) /
                100
            );


        return {

            ...climate,


            indices: {

                maritime,

                continental,

                warmSource,

                coldSource
            }
        };
    }


    /* ================================================================
       SEASONAL TEMPERATURE FOUNDATION
    ================================================================ */

    function calculateBaselineMean(
        latitude,
        longitude,
        date,
        options = {}
    ) {

        const lat =
            finite(
                latitude,
                50
            );


        const lon =
            finite(
                longitude,
                10
            );


        const d =
            validDate(
                date
            );


        const elevationM =
            Math.max(
                -50,
                finite(
                    options.altitudeM,
                    finite(
                        options.elevationM,
                        0
                    )
                )
            );


        const climate =
            getIndices(
                lat,
                lon,
                options
            );


        const regional =
            climate.regional;


        const season =
            seasonalPhase(
                d
            );


        /*
         * Broad latitude-controlled annual mean.
         */

        let annualMean =
            15.2 -
            0.52 *
            (
                lat -
                40
            );


        annualMean +=
            regional.atlantic *
            1.4;


        annualMean +=
            regional.mediterranean *
            2.6;


        annualMean -=
            regional.arctic *
            4.0;


        annualMean -=
            regional.continental *
            0.6;


        annualMean +=
            regional.northAfrican *
            4.0;


        /*
         * Annual amplitude.
         *
         * Maritime regions have smaller seasonal range.
         * Continental and Baltic regions have larger range.
         */

        let annualAmplitude =
            8.0 +
            regional.continental *
            8.0 +
            regional.baltic *
            2.0 -
            regional.atlantic *
            4.3 -
            regional.mediterranean *
            1.6;


        annualAmplitude =
            clamp(
                annualAmplitude,
                4.5,
                18
            );


        let temperature =
            annualMean +
            annualAmplitude *
            season;


        /*
         * Elevation foundation.
         */

        temperature -=
            0.0062 *
            elevationM;


        /*
         * ============================================================
         * REGIONAL REFINEMENTS
         * ============================================================
         */


        /*
         * Dalmatian / coastal Adriatic moderation.
         */

        temperature +=
            0.8 *
            gaussian2D(
                lat,
                lon,
                43.2,
                16.5,
                2.0,
                4.0
            );


        /*
         * Romania / Carpathian continental cooling.
         */

        temperature -=
            0.8 *
            gaussian2D(
                lat,
                lon,
                46.3,
                24.5,
                2.5,
                4.5
            );


        /*
         * Western Norway North Atlantic moderation.
         */

        temperature +=
            0.6 *
            gaussian2D(
                lat,
                lon,
                58.0,
                6.0,
                5.0,
                4.0
            );


        /*
         * Scandinavian interior cooling.
         */

        temperature -=
            0.7 *
            gaussian2D(
                lat,
                lon,
                60.5,
                16.0,
                5.0,
                6.0
            );


        /*
         * Polish / east-central interior refinement.
         */

        temperature -=
            0.5 *
            gaussian2D(
                lat,
                lon,
                52.5,
                18.0,
                3.5,
                7.0
            );


        /*
         * Iberian interior summer amplification.
         */

        temperature +=
            Math.max(
                0,
                season
            ) *
            1.2 *
            gaussian2D(
                lat,
                lon,
                40.0,
                -4.0,
                3.5,
                5.0
            );


        /*
         * Iberian interior winter cooling.
         */

        temperature -=
            Math.max(
                0,
                -season
            ) *
            1.0 *
            gaussian2D(
                lat,
                lon,
                40.0,
                -4.0,
                3.5,
                5.0
            );


        /*
         * Anatolian plateau continental adjustment.
         */

        temperature -=
            Math.max(
                0,
                -season
            ) *
            1.5 *
            gaussian2D(
                lat,
                lon,
                39.0,
                34.0,
                4.0,
                8.0
            );


        return {

            meanC:
                temperature,

            annualMeanC:
                annualMean,

            annualAmplitudeC:
                annualAmplitude,

            climate,

            date:
                d
        };
    }


    /* ================================================================
       DIURNAL TEMPERATURE RANGE
    ================================================================ */

    function calculateDiurnalAmplitude(
        latitude,
        longitude,
        date,
        options = {}
    ) {

        const lat =
            finite(
                latitude,
                50
            );


        const lon =
            finite(
                longitude,
                10
            );


        const climate =
            getIndices(
                lat,
                lon,
                options
            );


        const groundMoisture =
            clamp01(
                finite(
                    options.groundMoisture,
                    0.5
                )
            );


        const cloud =
            clamp01(
                finite(
                    options.cloudFraction,
                    finite(
                        options.cloud,
                        0
                    )
                )
            );


        const seasonalSolar =
            clamp01(
                (
                    Math.sin(
                        (
                            lat -
                            25
                        ) *
                        Math.PI /
                        180
                    ) +
                    1.2
                ) /
                2.2
            );


        let amplitude =
            4.0 +
            4.5 *
            climate.indices.continental +
            1.6 *
            seasonalSolar -
            2.0 *
            climate.indices.maritime;


        amplitude *=
            1 -
            0.40 *
            groundMoisture;


        amplitude *=
            1 -
            0.72 *
            cloud;


        return clamp(
            amplitude,
            0.8,
            10.5
        );
    }


    /* ================================================================
       V10 BASELINE TEMPERATURE API
    ================================================================ */

    function getBaselineTemperature(
        latitude,
        longitude,
        date = new Date(),
        options = {}
    ) {

        const d =
            validDate(
                date
            );


        const base =
            calculateBaselineMean(
                latitude,
                longitude,
                d,
                options
            );


        const diurnalAmplitude =
            calculateDiurnalAmplitude(
                latitude,
                longitude,
                d,
                options
            );


        const localSolarHour =
            (
                d.getUTCHours() +
                d.getUTCMinutes() /
                60 +
                longitude /
                15 +
                24
            ) %
            24;


        /*
         * Approximate maximum around mid-afternoon and minimum near dawn.
         */

        const diurnalPhase =
            Math.sin(
                2 *
                Math.PI *
                (
                    localSolarHour -
                    9
                ) /
                24
            );


        const hourlyC =
            base.meanC +
            diurnalAmplitude *
            diurnalPhase;


        return {

            climate:
                base.climate,


            date:
                d.toISOString(),


            meanC:
                base.meanC,


            hourlyC,


            highC:
                base.meanC +
                diurnalAmplitude,


            lowC:
                base.meanC -
                diurnalAmplitude,


            diurnalRangeC:
                diurnalAmplitude *
                2,


            annualMeanC:
                base.annualMeanC,


            annualAmplitudeC:
                base.annualAmplitudeC
        };
    }


    /* ================================================================
       LEGACY-COMPATIBLE NUMBER HELPERS
    ================================================================ */

    function baselineTemperature(
        latitude,
        longitude,
        date = new Date(),
        geographyOrOptions = {},
        elevationM = 0
    ) {

        let options = {};


        if (
            geographyOrOptions &&
            Number.isFinite(
                Number(
                    geographyOrOptions.landFraction
                )
            )
        ) {

            options = {
                ...geographyOrOptions
            };
        }


        options.altitudeM =
            Number.isFinite(
                Number(
                    options.altitudeM
                )
            )
                ? Number(
                    options.altitudeM
                )
                : finite(
                    elevationM,
                    0
                );


        return getBaselineTemperature(
            latitude,
            longitude,
            date,
            options
        ).meanC;
    }


    function hourlyClimatology(
        latitude,
        longitude,
        date = new Date(),
        geographyOrOptions = {},
        elevationM = 0,
        groundMoisture = 0.5,
        cloud = 0
    ) {

        let options = {};


        if (
            geographyOrOptions &&
            Number.isFinite(
                Number(
                    geographyOrOptions.landFraction
                )
            )
        ) {

            options = {
                ...geographyOrOptions
            };
        }


        options.altitudeM =
            Number.isFinite(
                Number(
                    options.altitudeM
                )
            )
                ? Number(
                    options.altitudeM
                )
                : finite(
                    elevationM,
                    0
                );


        options.groundMoisture =
            Number.isFinite(
                Number(
                    options.groundMoisture
                )
            )
                ? Number(
                    options.groundMoisture
                )
                : finite(
                    groundMoisture,
                    0.5
                );


        options.cloudFraction =
            Number.isFinite(
                Number(
                    options.cloudFraction
                )
            )
                ? Number(
                    options.cloudFraction
                )
                : finite(
                    cloud,
                    0
                );


        return getBaselineTemperature(
            latitude,
            longitude,
            date,
            options
        ).hourlyC;
    }


    /* ================================================================
       EXPORT
    ================================================================ */

    global.EuropaClimate =
        Object.freeze({

            version:
                "3.0-regional-refinement",


            bounds:
                BOUNDS,


            types:
                TYPES.slice(),


            /*
             * Also expose the old upper-case name because some earlier
             * diagnostic code used it.
             */

            TYPES,


            getClimate,

            getIndices,

            getBaselineTemperature,

            normalize,

            normalise,


            regionalIndices,

            sourceWeights,

            baselineTemperature,

            hourlyClimatology
        });


})(window);
